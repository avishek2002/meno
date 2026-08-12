import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCost, type CostCourseRef, type CostMeta, type CostNoDataEntry, type CostSource, type CostTranscript } from '../../lib/cost.ts';
import { selectCostSource } from '../../lib/cost-sources.ts';
import { claudeCodeSource, costOfUsage } from '../../lib/cost-source-claude-code.ts';
import { buildCostSnapshot, readCostSnapshot, writeCostSnapshot, costSnapshotPath } from '../../lib/cost-io.ts';
import { checkCost } from '../validate.ts';

const META = (tenant: string): CostMeta => ({
  tenant,
  source: 'claude-code',
  source_label: 'Claude Code transcripts',
  prices_as_of: '2026-08-12',
  generated_at: '2026-08-12T09:00:00+10:00',
  skipped: 0,
});

function tenantVault(courses: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-cost-vault-'));
  for (const c of courses) {
    const courseDir = join(dir, 'domain', c);
    mkdirSync(courseDir, { recursive: true });
    writeFileSync(join(courseDir, 'course.yml'), 'slug: ' + c + '\n');
  }
  return dir;
}

function courseDirsFor(courses: string[]): string[] {
  return courses.map((c) => `domain/${c}`);
}

function tr(partial: Partial<CostTranscript> & Pick<CostTranscript, 'id'>): CostTranscript {
  return { parent_id: null, cost_usd: 0, requests: 0, wrote: [], ...partial };
}

/** A CostCourseRef, defaulting dir to "domain/<course>" - the shape courseDirsFor() also uses. */
function ref(tenant: string, course: string, dir = `domain/${course}`): CostCourseRef {
  return { tenant, course, dir };
}

/** A CostNoDataEntry, matching ref()'s default dir convention. */
function nd(course: string, dir = `domain/${course}`): CostNoDataEntry {
  return { course, dir };
}

// --- computeCost: determinism and JSON stability ----------------------------

test('computeCost is deterministic and JSON-stable over a fixed fixture', () => {
  const dirs = courseDirsFor(['alpha', 'beta']);
  const transcripts: CostTranscript[] = [tr({ id: 't1', cost_usd: 1.2345, requests: 3, wrote: [ref('demo', 'alpha')] })];
  const a = computeCost(transcripts, dirs, META('demo'));
  const b = computeCost(transcripts, dirs, META('demo'));
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('purity: lib/cost.ts reads no clock, no filesystem, no environment', () => {
  const src = readFileSync(fileURLToPath(new URL('../../lib/cost.ts', import.meta.url)), 'utf8');
  const code = src.replace(/\/\/.*$/gm, '');
  assert.ok(!code.includes('Date.now('), 'lib/cost.ts must not call Date.now()');
  assert.ok(!/new Date\(\s*\)/.test(code), 'lib/cost.ts must not call new Date() with no argument');
  assert.ok(!/from ['"]node:fs['"]/.test(code), 'lib/cost.ts must not import node:fs');
  assert.ok(!code.includes('process.env'), 'lib/cost.ts must not read process.env');
});

// --- the oracle fixture: seven single-course transcripts, one shared parent -

test('the oracle shape: six generation-only + one full, shared line covers six courses, no_data holds the rest', () => {
  const tenant = 'demo';
  const courses = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'no-data-1', 'no-data-2'];
  const dirs = courseDirsFor(courses);

  const parent = tr({ id: 'proj/session.jsonl', cost_usd: 4.0, requests: 10, wrote: [] });
  const subagents: CostTranscript[] = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((c, i) =>
    tr({
      id: `proj/session/subagents/agent-${i + 1}.jsonl`,
      parent_id: 'proj/session.jsonl',
      cost_usd: 1.0 + i,
      requests: 2,
      wrote: [ref(tenant, c)],
    }),
  );
  const fullSession = tr({ id: 'proj/session-full.jsonl', cost_usd: 5.71, requests: 4, wrote: [ref(tenant, 'c7')] });

  const snapshot = computeCost([parent, ...subagents, fullSession], dirs, META(tenant));

  assert.equal(snapshot.courses.length, 7);
  const bySlug = Object.fromEntries(snapshot.courses.map((c) => [c.course, c]));
  for (const c of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) assert.equal(bySlug[c].scope, 'generation-only');
  assert.equal(bySlug.c7.scope, 'full');

  const sumCourses = Math.round(snapshot.courses.reduce((a, c) => a + c.cost_usd, 0) * 100) / 100;
  assert.equal(snapshot.totals.attributed_usd, sumCourses);

  assert.deepEqual(snapshot.shared_orchestration.courses, ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']);
  assert.equal(snapshot.shared_orchestration.cost_usd, 4.0); // the parent's cost, once
  assert.deepEqual(snapshot.shared_orchestration.transcript_ids, ['proj/session.jsonl']);

  assert.deepEqual(snapshot.no_data, [nd('no-data-1'), nd('no-data-2')]);

  // every collection is sorted; nothing depends on Map/Set iteration order
  const costs = snapshot.courses.map((c) => c.cost_usd);
  for (let i = 1; i < costs.length; i++) assert.ok(costs[i - 1] >= costs[i]);

  // totals are tenant-scoped, not machine-wide (finding 4): exactly the credited transcripts
  // plus the one shared parent, never a count that includes transcripts collect() never saw here
  assert.equal(snapshot.totals.transcripts_scanned, 8); // 6 sub-agents + 1 full session + 1 parent
  assert.equal(snapshot.totals.requests, 10 + 2 * 6 + 4);

  // no double-counting anywhere: this shape has no demoted transcript, so no such limits entry
  assert.ok(!snapshot.limits.some((l) => l.includes('moved to the shared orchestration line')));
});

// --- dedupe at computeCost (invariant 4: a transcript's money is never counted twice) ---------

test('computeCost dedupes by transcript id: a duplicate id in the input list never doubles the cost (last one wins)', () => {
  const dirs = courseDirsFor(['alpha']);
  const first = tr({ id: 't1', cost_usd: 1.0, requests: 1, wrote: [ref('demo', 'alpha')] });
  // same id as `first` but a distinct object - if byId's "last one wins" dedupe were deleted and
  // transcripts were summed by array position instead, this would double the course's cost
  const duplicateId = tr({ id: 't1', cost_usd: 1.0, requests: 1, wrote: [ref('demo', 'alpha')] });

  const singleInput = computeCost([first], dirs, META('demo'));
  const withDuplicateId = computeCost([first, duplicateId], dirs, META('demo'));

  assert.equal(withDuplicateId.courses[0].cost_usd, singleInput.courses[0].cost_usd);
  assert.equal(withDuplicateId.courses[0].transcripts, 1);
  assert.equal(withDuplicateId.totals.transcripts_scanned, singleInput.totals.transcripts_scanned);
});

// --- empty and degraded (invariant 6) ---------------------------------------

test('selectCostSource([]) is null', () => {
  assert.equal(selectCostSource([]), null);
});

test('a source whose available() throws is treated as unavailable, not propagated', () => {
  const throwing: CostSource = {
    name: 'throwing-source',
    label: 'Throws',
    prices_as_of: '2026-08-12',
    available: () => {
      throw new Error('boom');
    },
    collect: () => ({ transcripts: [], skipped: 0 }),
  };
  assert.equal(selectCostSource([throwing]), null);
});

test('a source whose collect() throws produces an empty, well-formed snapshot via buildCostSnapshot', () => {
  const dir = tenantVault(['alpha']);
  const throwing: CostSource = {
    name: 'throwing-source',
    label: 'Throws',
    prices_as_of: '2026-08-12',
    available: () => true,
    collect: () => {
      throw new Error('boom');
    },
  };
  const snapshot = buildCostSnapshot(dir, 'demo', '2026-08-12T09:00:00+10:00', throwing);
  assert.deepEqual(snapshot.courses, []);
  assert.deepEqual(snapshot.no_data, [nd('alpha')]);
});

test('computeCost([], dirs, {source: null}) yields zero totals, every directory in no_data, no course row', () => {
  const dirs = courseDirsFor(['alpha', 'beta']);
  const meta: CostMeta = {
    tenant: 'demo',
    source: null,
    source_label: null,
    prices_as_of: '',
    generated_at: '2026-08-12T09:00:00+10:00',
    skipped: 0,
  };
  const snapshot = computeCost([], dirs, meta);
  assert.deepEqual(snapshot.courses, []);
  assert.deepEqual(snapshot.no_data, [nd('alpha'), nd('beta')]);
  assert.equal(snapshot.totals.attributed_usd, 0);
  assert.equal(snapshot.totals.shared_orchestration_usd, 0);
  assert.equal(snapshot.totals.transcripts_scanned, 0);
  assert.equal(snapshot.source, null);
  assert.ok(snapshot.limits.length >= 2);
});

// --- multi-course and cross-tenant (invariant 4) ----------------------------

test('a transcript that wrote two courses lands on the shared line; neither course gets a row', () => {
  const dirs = courseDirsFor(['alpha', 'beta']);
  const t = tr({ id: 't1', cost_usd: 2.5, requests: 5, wrote: [ref('demo', 'alpha'), ref('demo', 'beta')] });
  const snapshot = computeCost([t], dirs, META('demo'));
  assert.deepEqual(snapshot.courses, []);
  assert.deepEqual(snapshot.no_data, [nd('alpha'), nd('beta')]);
  assert.deepEqual(snapshot.shared_orchestration.courses, ['alpha', 'beta']);
  assert.equal(snapshot.shared_orchestration.cost_usd, 2.5);
});

test('cross-tenant: a transcript writing one course in each of two tenants is shared in both, never credited', () => {
  const dirs = courseDirsFor(['alpha']);
  const t = tr({
    id: 't1',
    cost_usd: 1.0,
    requests: 2,
    wrote: [ref('tenant-a', 'alpha'), ref('tenant-b', 'alpha')],
  });
  const a = computeCost([t], dirs, META('tenant-a'));
  const b = computeCost([t], dirs, META('tenant-b'));
  for (const snapshot of [a, b]) {
    assert.deepEqual(snapshot.courses, []);
    assert.deepEqual(snapshot.shared_orchestration.courses, ['alpha']);
    assert.equal(snapshot.shared_orchestration.cost_usd, 1.0);
  }
});

test('the shared line dedupes by transcript id: qualifying under both multi-course and parent contributes cost once', () => {
  const dirs = courseDirsFor(['alpha', 'beta']);
  // the "parent" here also wrote two courses directly (case 4), and is also the structural
  // parent of a sub-agent transcript that wrote a third course (case 5) - its cost must land on
  // the shared line exactly once, not twice.
  const parent = tr({ id: 'p.jsonl', cost_usd: 3.0, requests: 4, wrote: [ref('demo', 'alpha'), ref('demo', 'beta')] });
  const child = tr({ id: 'p/subagents/agent-1.jsonl', parent_id: 'p.jsonl', cost_usd: 1.0, requests: 1, wrote: [ref('demo', 'gamma')] });
  const dirsWithGamma = [...dirs, 'domain/gamma'];
  const snapshot = computeCost([parent, child], dirsWithGamma, META('demo'));
  assert.equal(snapshot.shared_orchestration.transcripts, 1);
  assert.equal(snapshot.shared_orchestration.cost_usd, 3.0);
  assert.deepEqual(snapshot.shared_orchestration.courses, ['alpha', 'beta', 'gamma']);
  assert.equal(snapshot.courses.find((c) => c.course === 'gamma')?.scope, 'generation-only');
});

// --- finding 1: a transcript that is BOTH a course writer AND an orchestrating parent ---------

test('a transcript that both wrote a course and is the structural parent of another credited transcript is never double-counted', () => {
  // p wrote "alpha" directly (would be a case-3 credit on its own) AND is the parent of a
  // sub-agent that wrote "beta". Crediting p to alpha AND putting its cost on the shared line
  // would report p's $100 twice. The shared line must win: p is not credited, "alpha" has lost
  // its only evidence and reports as no-data, and "beta" is generation-only.
  const dirs = [...courseDirsFor(['alpha']), 'domain/beta'];
  const p = tr({ id: 'p.jsonl', cost_usd: 100.0, requests: 20, wrote: [ref('demo', 'alpha')] });
  const child = tr({ id: 'p/subagents/agent-1.jsonl', parent_id: 'p.jsonl', cost_usd: 5.0, requests: 3, wrote: [ref('demo', 'beta')] });

  const snapshot = computeCost([p, child], dirs, META('demo'));

  // exactly p.cost_usd + child.cost_usd of money is reported anywhere in the snapshot - never
  // p.cost_usd twice
  const totalReported = snapshot.totals.attributed_usd + snapshot.totals.shared_orchestration_usd;
  assert.ok(Math.abs(totalReported - 105.0) < 1e-9, `expected 105.0 total, got ${totalReported}`);

  assert.deepEqual(snapshot.courses.map((c) => c.course), ['beta']);
  assert.equal(snapshot.courses[0].scope, 'generation-only');
  assert.equal(snapshot.courses[0].cost_usd, 5.0);

  assert.equal(snapshot.shared_orchestration.cost_usd, 100.0);
  assert.equal(snapshot.shared_orchestration.transcripts, 1);
  assert.deepEqual(snapshot.shared_orchestration.transcript_ids, ['p.jsonl']);

  assert.deepEqual(snapshot.no_data, [nd('alpha')]); // alpha lost its only evidence
});

// --- finding NEW-3: a demoted course gets an honest limits entry, not silence -----------------

test('a demoted course (finding 1) gets an explicit limits entry naming the reassignment, not silence', () => {
  const dirs = [...courseDirsFor(['alpha']), 'domain/beta'];
  const p = tr({ id: 'p.jsonl', cost_usd: 100.0, requests: 20, wrote: [ref('demo', 'alpha')] });
  const child = tr({ id: 'p/subagents/agent-1.jsonl', parent_id: 'p.jsonl', cost_usd: 5.0, requests: 3, wrote: [ref('demo', 'beta')] });
  const snapshot = computeCost([p, child], dirs, META('demo'));
  assert.ok(
    snapshot.limits.some(
      (l) => l.startsWith('1 course directory in no_data') && l.includes('moved to the shared orchestration line'),
    ),
    `expected a demoted-course limits entry, got: ${JSON.stringify(snapshot.limits)}`,
  );
});

// finding NEW-4-followup: the demotion disclosure above must point at a shared line that actually
// names the demoted course, not just the child whose credit triggered the demotion
test('a demoted candidate\'s OWN course joins shared_orchestration.courses, not only the child that triggered its demotion', () => {
  const dirs = [...courseDirsFor(['alpha']), 'domain/beta'];
  const p = tr({ id: 'p.jsonl', cost_usd: 100.0, requests: 20, wrote: [ref('demo', 'alpha')] });
  const child = tr({ id: 'p/subagents/agent-1.jsonl', parent_id: 'p.jsonl', cost_usd: 5.0, requests: 3, wrote: [ref('demo', 'beta')] });
  const snapshot = computeCost([p, child], dirs, META('demo'));
  // the $100 sitting on the shared line is alpha's authoring cost - a reader following the
  // demotion disclosure above to this list must find "alpha" here, not only "beta"
  assert.deepEqual(snapshot.shared_orchestration.courses, ['alpha', 'beta']);
});

// --- finding NEW-5: demotion resolves bottom-up over a chain of any depth ---------------------

test('a 3-deep orchestration chain (A<-B<-C) demotes only the true double-count risk, not every ancestor', () => {
  const dirs = ['domain/course-a', 'domain/course-b', 'domain/course-c'];
  const A = tr({ id: 'a.jsonl', cost_usd: 100.0, requests: 10, wrote: [ref('demo', 'course-a', 'domain/course-a')] });
  const B = tr({ id: 'a/subagents/b.jsonl', parent_id: 'a.jsonl', cost_usd: 10.0, requests: 5, wrote: [ref('demo', 'course-b', 'domain/course-b')] });
  const C = tr({
    id: 'a/subagents/b/subagents/c.jsonl',
    parent_id: 'a/subagents/b.jsonl',
    cost_usd: 1.0,
    requests: 2,
    wrote: [ref('demo', 'course-c', 'domain/course-c')],
  });

  const snapshot = computeCost([A, B, C], dirs, META('demo'));

  // A is not the direct parent of any FINALLY credited transcript - its only child B gets
  // demoted, so A never qualifies as "the parent of a credited child" and stays normally
  // credited. The bug this guards against demoted every ancestor unconditionally, moving $110 of
  // $111 to shared and dropping both course-a and course-b to no_data.
  const byCourse = Object.fromEntries(snapshot.courses.map((c) => [c.course, c]));
  assert.equal(byCourse['course-a']?.cost_usd, 100.0);
  assert.equal(byCourse['course-a']?.scope, 'full');
  assert.equal(byCourse['course-c']?.cost_usd, 1.0);
  assert.equal(byCourse['course-c']?.scope, 'generation-only');
  assert.equal(byCourse['course-b'], undefined); // B is the one actually demoted

  assert.deepEqual(snapshot.no_data, [nd('course-b', 'domain/course-b')]);
  assert.equal(snapshot.shared_orchestration.cost_usd, 10.0); // only B's cost, never A's too
  assert.deepEqual(snapshot.shared_orchestration.transcript_ids, ['a/subagents/b.jsonl']);

  const totalReported = snapshot.totals.attributed_usd + snapshot.totals.shared_orchestration_usd;
  assert.ok(Math.abs(totalReported - 111.0) < 1e-9, `expected 111.0 total, got ${totalReported}`);
});

// --- finding 2: a sub-cent course cost floors to $0.01, never renders as $0.00 ----------------

test('a course with real but sub-cent unrounded cost floors to $0.01, never $0.00', () => {
  const dirs = courseDirsFor(['alpha']);
  const t = tr({ id: 't1', cost_usd: 0.0004, requests: 1, wrote: [ref('demo', 'alpha')] });
  const snapshot = computeCost([t], dirs, META('demo'));
  assert.equal(snapshot.courses[0].cost_usd, 0.01);
  assert.equal(snapshot.totals.attributed_usd, 0.01);
});

// --- finding 3: two course directories sharing a basename never collapse into one row ---------

test('two course directories with the same basename in different domains never collapse or lose evidence', () => {
  const dirs = ['domain-a/git-fundamentals', 'domain-b/git-fundamentals'];
  const t = tr({
    id: 't1',
    cost_usd: 3.0,
    requests: 2,
    wrote: [ref('demo', 'git-fundamentals', 'domain-a/git-fundamentals')],
  });
  const snapshot = computeCost([t], dirs, META('demo'));

  // the credited one gets its own row, with the RIGHT dir, not last-writer-wins ambiguity
  assert.equal(snapshot.courses.length, 1);
  assert.equal(snapshot.courses[0].dir, 'domain-a/git-fundamentals');
  assert.equal(snapshot.courses[0].cost_usd, 3.0);

  // the sibling with no evidence of its own is never silently dropped
  assert.deepEqual(snapshot.no_data, [nd('git-fundamentals', 'domain-b/git-fundamentals')]);
});

test('two course directories sharing a basename with neither credited both report as no-data (deterministic, not lost)', () => {
  const dirs = ['domain-a/git-fundamentals', 'domain-b/git-fundamentals'];
  const snapshot = computeCost([], dirs, META('demo'));
  assert.deepEqual(snapshot.no_data, [nd('git-fundamentals', 'domain-a/git-fundamentals'), nd('git-fundamentals', 'domain-b/git-fundamentals')]);
  assert.equal(snapshot.totals.courses_without_data, 2);
});

test('a transcript writing into two same-basename directories in different domains is shared multi-course, not silently collapsed to one', () => {
  const dirs = ['domain-a/git-fundamentals', 'domain-b/git-fundamentals'];
  const t = tr({
    id: 't1',
    cost_usd: 4.0,
    requests: 2,
    wrote: [ref('demo', 'git-fundamentals', 'domain-a/git-fundamentals'), ref('demo', 'git-fundamentals', 'domain-b/git-fundamentals')],
  });
  const snapshot = computeCost([t], dirs, META('demo'));
  assert.deepEqual(snapshot.courses, []); // two distinct dirs written -> shared, never credited
  assert.equal(snapshot.shared_orchestration.cost_usd, 4.0);
  // shared-only coverage never earns a course row (decision 4: shown whole, never divided), so
  // both dirs still report as no-data - consistent with the plain two-course case above. What
  // finding 3 forbids is losing one of the two silently; both must still be present, as two
  // distinct dir-keyed entries.
  assert.deepEqual(snapshot.no_data, [nd('git-fundamentals', 'domain-a/git-fundamentals'), nd('git-fundamentals', 'domain-b/git-fundamentals')]);
});

// --- no_data comes from findCourseDirs, never a second walk -----------------

test('no_data is derived from findCourseDirs: adding a course directory to the vault surfaces it with no other change', () => {
  const dir = tenantVault(['alpha']);
  const before = computeCost([], courseDirsFor(['alpha']), META('demo'));
  assert.deepEqual(before.no_data, [nd('alpha')]);

  mkdirSync(join(dir, 'domain', 'beta'), { recursive: true });
  writeFileSync(join(dir, 'domain', 'beta', 'course.yml'), 'slug: beta\n');
  const after = computeCost([], courseDirsFor(['alpha', 'beta']), META('demo'));
  assert.deepEqual(after.no_data, [nd('alpha'), nd('beta')]);
});

// --- finding 4: totals are tenant-scoped, never the whole-machine collect() count -------------

test('totals.transcripts_scanned and totals.requests exclude transcripts with no evidence for this tenant', () => {
  const dirs = courseDirsFor(['alpha']);
  const credited = tr({ id: 't1', cost_usd: 1.0, requests: 2, wrote: [ref('demo', 'alpha')] });
  // this transcript is real (collect() would have returned it) but touches a different tenant
  // entirely - it must never inflate "cost for demo"'s scanned/requests totals
  const unrelated = tr({ id: 't2', cost_usd: 999.0, requests: 5000, wrote: [ref('other-tenant', 'zzz')] });
  const snapshot = computeCost([credited, unrelated], dirs, META('demo'));
  assert.equal(snapshot.totals.transcripts_scanned, 1);
  assert.equal(snapshot.totals.requests, 2);
});

// --- finding NEW-6: a skipped count is a real channel, not silently swallowed -----------------

test('meta.skipped > 0 surfaces a limits entry naming the count as locations, not transcripts', () => {
  const dirs = courseDirsFor(['alpha']);
  const snapshot = computeCost([], dirs, { ...META('demo'), skipped: 3 });
  // "3 locations", not "3 transcripts" (finding NEW-6-followup): an unreadable directory is one
  // skip event regardless of how many transcripts it held, which is unknowable, so the leading
  // count must never claim a transcript figure - though the word "transcript" may still appear
  // later in the sentence explaining what a location can be.
  assert.ok(
    snapshot.limits.some((l) => l.startsWith('3 locations') && l.includes('skipped')),
    `expected a skipped-count limits entry, got: ${JSON.stringify(snapshot.limits)}`,
  );
  assert.ok(!snapshot.limits.some((l) => /^3 transcripts?\b/.test(l)));
});

test('meta.skipped === 1 uses the singular ("location"), and meta.skipped === 0 emits no such line', () => {
  const dirs = courseDirsFor(['alpha']);
  const one = computeCost([], dirs, { ...META('demo'), skipped: 1 });
  assert.ok(one.limits.some((l) => l.startsWith('1 location ') && l.includes('skipped')));
  const zero = computeCost([], dirs, { ...META('demo'), skipped: 0 });
  assert.ok(!zero.limits.some((l) => l.includes('skipped')));
});

// --- Claude Code source: requestId dedupe and course-write extraction -------

function writeLine(path: string, obj: unknown): void {
  writeFileSync(path, JSON.stringify(obj) + '\n', { flag: 'a' });
}

test('claude-code source: requestId dedupe, no-requestId rows contribute nothing, and Write tool_use attributes a course', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'meno-cost-claude-'));
  const projectsRoot = join(configDir, 'projects'); // resolveRoot() appends "projects" itself
  const sessionDir = join(projectsRoot, 'proj', 'session');
  mkdirSync(join(sessionDir, 'subagents'), { recursive: true });

  const parentFile = join(projectsRoot, 'proj', 'session.jsonl');
  const agentFile = join(sessionDir, 'subagents', 'agent-1.jsonl');

  // parent: no course write, one usage row (its own interview/planning cost)
  writeLine(parentFile, {
    requestId: 'req-parent',
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 100000, output_tokens: 50000 } },
  });

  // sub-agent: five rows repeating one requestId (streaming states) must dedupe to one charge,
  // a second distinct requestId charges again, and a usage row with no requestId adds nothing.
  for (let i = 0; i < 5; i++) {
    writeLine(agentFile, {
      requestId: 'req-1',
      message: { model: 'claude-sonnet-5', usage: { input_tokens: 100000, output_tokens: 50000 } },
    });
  }
  writeLine(agentFile, {
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 100000, output_tokens: 50000 } },
  }); // no requestId - skipped entirely
  writeLine(agentFile, {
    requestId: 'req-2',
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 10000, output_tokens: 5000 } },
  });
  writeLine(agentFile, {
    message: {
      model: 'claude-sonnet-5',
      content: [
        {
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/abs/content/tenants/demo/domain/course-1/modules/01-x/lesson.md' },
        },
      ],
    },
  });
  // Edit into a reserved non-course directory must not be read as a course write
  writeLine(agentFile, {
    message: {
      model: 'claude-sonnet-5',
      content: [
        {
          type: 'tool_use',
          name: 'Edit',
          input: { file_path: '/abs/content/tenants/demo/progress/ledger.jsonl' },
        },
      ],
    },
  });

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    assert.equal(claudeCodeSource.available(), true);
    const { transcripts, skipped } = claudeCodeSource.collect();
    assert.equal(skipped, 0);
    const byId = new Map(transcripts.map((t) => [t.id, t]));

    const parent = byId.get('proj/session.jsonl');
    assert.ok(parent);
    assert.equal(parent!.parent_id, null);

    const agent = byId.get('proj/session/subagents/agent-1.jsonl');
    assert.ok(agent);
    assert.equal(agent!.parent_id, 'proj/session.jsonl');
    assert.equal(agent!.requests, 2); // req-1 (deduped x5) and req-2, the no-requestId row skipped
    const expected = costOfUsage('claude-sonnet-5', { input_tokens: 100000, output_tokens: 50000 })
      + costOfUsage('claude-sonnet-5', { input_tokens: 10000, output_tokens: 5000 });
    assert.ok(Math.abs(agent!.cost_usd - expected) < 1e-9, `expected ~${expected}, got ${agent!.cost_usd}`);
    // progress/ is reserved, filtered out; the surviving write carries both the basename and the
    // disambiguating full directory (finding 3)
    assert.deepEqual(agent!.wrote, [{ tenant: 'demo', course: 'course-1', dir: 'domain/course-1' }]);
  } finally {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  }
});

// finding NEW-6-followup (item 2): a transcript that could not be PARSED, not just not read, must
// also count toward skipped - the first build silently returned it as an ordinary empty transcript
test('claude-code source: a wholly-unparseable transcript counts as skipped, not a silent cost: 0 row', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'meno-cost-claude-garbage-'));
  const projectsRoot = join(configDir, 'projects');
  const project = join(projectsRoot, 'proj');
  mkdirSync(project, { recursive: true });

  // every line looks candidate-shaped (matches the "usage"/"tool_use" performance filter) but is
  // not valid JSON - simulating a truncated write or bit-corrupted file, not a merely-empty one
  writeFileSync(
    join(project, 'garbage.jsonl'),
    '{"usage": this is not valid json\n{"tool_use": also not valid json, still garbage\n',
  );

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    const { transcripts, skipped } = claudeCodeSource.collect();
    assert.ok(
      !transcripts.some((t) => t.id === 'proj/garbage.jsonl'),
      'an unparseable transcript must never appear as an ordinary (empty) transcript',
    );
    assert.equal(skipped, 1);
  } finally {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('claude-code source: a genuinely empty (no candidate lines) transcript is NOT counted as skipped', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'meno-cost-claude-empty-'));
  const projectsRoot = join(configDir, 'projects');
  const project = join(projectsRoot, 'proj');
  mkdirSync(project, { recursive: true });
  // no line contains "usage" or "tool_use" - this is a legitimate zero-evidence transcript
  // (a session that made no API call yet), not a parse failure, and must not be flagged as one
  writeFileSync(join(project, 'empty.jsonl'), '{"type":"summary","other":"stuff"}\n');

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  try {
    const { transcripts, skipped } = claudeCodeSource.collect();
    const t = transcripts.find((x) => x.id === 'proj/empty.jsonl');
    assert.ok(t, 'a genuinely empty transcript must still be returned, not skipped');
    assert.equal(t!.cost_usd, 0);
    assert.equal(skipped, 0);
  } finally {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('claude-code source: unavailable when CLAUDE_CONFIG_DIR points nowhere, and never throws', () => {
  const nowhere = join(tmpdir(), 'meno-cost-nowhere-does-not-exist-' + Math.random().toString(36).slice(2));
  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = nowhere;
  try {
    assert.equal(claudeCodeSource.available(), false);
    assert.deepEqual(claudeCodeSource.collect(), { transcripts: [], skipped: 0 });
  } finally {
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
  }
});

test('claude-code source: an unreadable subdirectory is skipped and counted, not a whole-machine zero (partial scan over silent failure)', () => {
  const configDir = mkdtempSync(join(tmpdir(), 'meno-cost-claude-partial-'));
  const projectsRoot = join(configDir, 'projects');
  const goodProject = join(projectsRoot, 'good-project');
  const badProject = join(projectsRoot, 'bad-project');
  mkdirSync(goodProject, { recursive: true });
  mkdirSync(badProject, { recursive: true });
  writeLine(join(goodProject, 'session.jsonl'), {
    requestId: 'req-1',
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 1000, output_tokens: 500 } },
  });
  writeLine(join(badProject, 'session.jsonl'), {
    requestId: 'req-2',
    message: { model: 'claude-sonnet-5', usage: { input_tokens: 1000, output_tokens: 500 } },
  });

  const prevConfigDir = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
  try {
    if (!isRoot) chmodSync(badProject, 0o000); // root bypasses permission bits; skip locking it out then

    // With the old single readdirSync(root, { recursive: true }) call, one unreadable
    // subdirectory throws and the outer try/catch in collect() turns the WHOLE scan into [] -
    // a partial failure reading as a whole-machine zero. The per-directory walk must instead
    // skip only the unreadable subtree, count it, and still return every transcript it could read.
    const { transcripts, skipped } = claudeCodeSource.collect();
    assert.ok(
      transcripts.some((t) => t.id === 'good-project/session.jsonl'),
      'a readable project must still be collected even when a sibling project is unreadable',
    );
    if (!isRoot) assert.ok(skipped >= 1, 'the unreadable directory must be counted, not silently swallowed');
  } finally {
    if (!isRoot) chmodSync(badProject, 0o755); // restore so cleanup below can remove it
    if (prevConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfigDir;
    rmSync(configDir, { recursive: true, force: true });
  }
});

test('unrecognised model falls back to the opus tier', () => {
  const unknown = costOfUsage('some-future-model', { input_tokens: 1000000, output_tokens: 0 });
  const opus = costOfUsage('claude-opus-9', { input_tokens: 1000000, output_tokens: 0 });
  assert.equal(unknown, opus);
});

// --- cost-io: round-trip and degraded reads ---------------------------------

test('a snapshot round-trips through readCostSnapshot byte for byte (JSON-equal)', () => {
  const dir = tenantVault(['alpha']);
  const snapshot = buildCostSnapshot(dir, 'demo', '2026-08-12T09:00:00+10:00', null);
  writeCostSnapshot(dir, snapshot);
  const read = readCostSnapshot(dir);
  assert.deepEqual(read, snapshot);
});

test('readCostSnapshot returns null, never throws, for missing/corrupt/unrecognised snapshots', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-cost-io-'));
  assert.equal(readCostSnapshot(dir), null); // missing file

  mkdirSync(join(dir, 'cost'), { recursive: true });
  writeFileSync(costSnapshotPath(dir), '{ not valid json');
  assert.equal(readCostSnapshot(dir), null); // invalid JSON

  writeFileSync(costSnapshotPath(dir), JSON.stringify({ schema_version: 2, type: 'cost' }));
  assert.equal(readCostSnapshot(dir), null); // unrecognised schema_version

  writeFileSync(costSnapshotPath(dir), JSON.stringify({ schema_version: 1, type: 'insights' }));
  assert.equal(readCostSnapshot(dir), null); // wrong type

  writeFileSync(costSnapshotPath(dir), JSON.stringify([1, 2, 3]));
  assert.equal(readCostSnapshot(dir), null); // not an object
});

// --- npm run cost with no source: well-formed empty snapshot, never a crash -

test('buildCostSnapshot with no source produces a well-formed empty snapshot, not a crash', () => {
  const dir = tenantVault(['alpha', 'beta']);
  const snapshot = buildCostSnapshot(dir, 'demo', '2026-08-12T09:00:00+10:00', null);
  assert.equal(snapshot.source, null);
  assert.equal(snapshot.source_label, null);
  assert.equal(snapshot.prices_as_of, '');
  assert.deepEqual(snapshot.courses, []);
  assert.deepEqual(snapshot.no_data, [nd('alpha'), nd('beta')]);
  assert.equal(snapshot.totals.attributed_usd, 0);
});

// --- the cost validate check --------------------------------------------------

function writeSnapshotFixture(snapshot: unknown): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-cost-validate-'));
  mkdirSync(join(dir, 'cost'), { recursive: true });
  const file = join(dir, 'cost', 'snapshot.json');
  writeFileSync(file, JSON.stringify(snapshot));
  return { dir, file };
}

test('a well-formed cost snapshot with NO course rows produces no findings', () => {
  const vault = tenantVault(['alpha']);
  const snapshot = buildCostSnapshot(vault, 'demo', '2026-08-12T09:00:00+10:00', null);
  const { dir, file } = writeSnapshotFixture(snapshot);
  assert.deepEqual(checkCost(dir, [file]), []);
});

// finding 6: a passing case that actually exercises courses[]'s per-item schema rules, so a
// producer regression like finding 2 (a $0.00 course row) cannot ship undetected again
test('a well-formed cost snapshot WITH real credited course rows, including a floored sub-cent one, produces no findings', () => {
  const dirs = courseDirsFor(['alpha', 'beta']);
  const snapshot = computeCost(
    [
      tr({ id: 't1', cost_usd: 5.004, requests: 3, wrote: [ref('demo', 'alpha')] }),
      tr({ id: 't2', cost_usd: 0.0004, requests: 1, wrote: [ref('demo', 'beta')] }), // sub-cent: floors to $0.01
    ],
    dirs,
    META('demo'),
  );
  assert.equal(snapshot.courses.length, 2);
  assert.equal(snapshot.courses.find((c) => c.course === 'beta')?.cost_usd, 0.01);
  const { dir, file } = writeSnapshotFixture(snapshot);
  assert.deepEqual(checkCost(dir, [file]), []);
});

// finding NEW-1 regression guard: this is EXACTLY the shape that broke the gate - a credited
// course and a same-basename no-data course in a different domain. It must validate clean.
test('checkCost accepts a valid snapshot with two same-basename course directories, one credited and one no-data', () => {
  const dirs = ['domain-a/git-fundamentals', 'domain-b/git-fundamentals'];
  const snapshot = computeCost(
    [tr({ id: 't1', cost_usd: 3, requests: 1, wrote: [ref('demo', 'git-fundamentals', 'domain-a/git-fundamentals')] })],
    dirs,
    META('demo'),
  );
  assert.equal(snapshot.courses.length, 1);
  assert.equal(snapshot.no_data.length, 1);
  const { dir, file } = writeSnapshotFixture(snapshot);
  assert.deepEqual(checkCost(dir, [file]), []);
});

test('a mismatched totals.attributed_usd is an error', () => {
  const dirs = courseDirsFor(['alpha']);
  const snapshot = computeCost([tr({ id: 't1', cost_usd: 5, requests: 1, wrote: [ref('demo', 'alpha')] })], dirs, META('demo'));
  const broken = { ...snapshot, totals: { ...snapshot.totals, attributed_usd: 999 } };
  const { dir, file } = writeSnapshotFixture(broken);
  const findings = checkCost(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'cost' && f.message.includes('attributed_usd')));
});

test('a dir in both courses and no_data is an error', () => {
  const dirs = courseDirsFor(['alpha']);
  const snapshot = computeCost([tr({ id: 't1', cost_usd: 5, requests: 1, wrote: [ref('demo', 'alpha')] })], dirs, META('demo'));
  const broken = { ...snapshot, no_data: [nd('alpha')] };
  const { dir, file } = writeSnapshotFixture(broken);
  const findings = checkCost(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'cost' && f.message.includes('both courses and no_data')));
});

test('a totals.courses_with_data mismatch is an error', () => {
  const dirs = courseDirsFor(['alpha']);
  const snapshot = computeCost([tr({ id: 't1', cost_usd: 5, requests: 1, wrote: [ref('demo', 'alpha')] })], dirs, META('demo'));
  const broken = { ...snapshot, totals: { ...snapshot.totals, courses_with_data: 999 } };
  const { dir, file } = writeSnapshotFixture(broken);
  const findings = checkCost(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'cost' && f.message.includes('courses_with_data')));
});

test('schema violation (missing a required field) is reported', () => {
  const broken = { schema_version: 1, type: 'cost' }; // missing everything else
  const { dir, file } = writeSnapshotFixture(broken);
  const findings = checkCost(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'cost'));
});

test('invalid JSON is reported without throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-cost-validate-'));
  mkdirSync(join(dir, 'cost'), { recursive: true });
  const file = join(dir, 'cost', 'snapshot.json');
  writeFileSync(file, '{ this is not json');
  const findings = checkCost(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'cost' && f.message.includes('invalid JSON')));
});
