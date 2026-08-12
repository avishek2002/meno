import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeInsights, type TodoCounts } from '../../lib/insights.ts';
import { buildVaultGraph } from '../../lib/vault.ts';
import { loadInsightsInputs } from '../../lib/insights-io.ts';
import { checkInsights } from '../validate.ts';

const EXAMPLE = fileURLToPath(new URL('../../examples/example-learner', import.meta.url));
const AS_OF = '2026-08-09';

const EMPTY_TODOS: TodoCounts = {
  byKind: { course: 0, 'content-fix': 0, vault: 0, feature: 0, bug: 0, study: 0, admin: 0 },
  byAudience: { 'for-agent': 0, 'for-me': 0 },
  done: 0,
  open: 0,
};

test('computeInsights over the committed example tenant is deterministic', () => {
  const inputs = loadInsightsInputs(EXAMPLE);
  const a = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, AS_OF);
  const b = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, AS_OF);
  assert.deepEqual(a, b);
  // JSON-stable, not just deep-equal - guards against any hidden Map/Set
  // iteration-order or key-order nondeterminism sneaking into the output
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('min_n: the example tenant has one session, so median_gap_days is null (below the 4-session floor)', () => {
  const inputs = loadInsightsInputs(EXAMPLE);
  const report = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, AS_OF);
  assert.equal(report.sessions.n, 1);
  assert.equal(report.sessions.median_gap_days, null);
});

test('a Rate with zero denominator is insufficient_data, never a fabricated number', () => {
  const report = computeInsights([], buildVaultGraph([]), EMPTY_TODOS, [], AS_OF);
  assert.deepEqual(report.reviews.due_coverage, { value: null, n: 0, of: 0, reason: 'insufficient_data' });
  assert.deepEqual(report.gates.override_rate, { value: null, n: 0, of: 0, reason: 'insufficient_data' });
  assert.deepEqual(report.evidence.transfer_coverage, { value: null, n: 0, of: 0, reason: 'insufficient_data' });
  assert.deepEqual(report.usage.check_usage, { value: null, n: 0, of: 0, reason: 'insufficient_data' });
});

test('the committed example tenant has exactly one unrepaid override, for ownership', () => {
  const inputs = loadInsightsInputs(EXAMPLE);
  const report = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, AS_OF);
  assert.deepEqual(report.gates.unrepaid_overrides, [
    { course: 'rust-for-backend', concept: 'ownership', gate_ts: '2026-08-07T09:35:00+10:00', reinject_after: '2026-08-09' },
  ]);
});

test('purity: lib/insights.ts and lib/vault.ts never read the clock', () => {
  for (const f of ['insights.ts', 'vault.ts']) {
    const src = readFileSync(fileURLToPath(new URL(`../../lib/${f}`, import.meta.url)), 'utf8');
    // strip //-comments first: lib/insights.ts's file-header comment names
    // Date.now() in prose (explaining that it never calls it), which a plain
    // substring search would misread as the call itself
    const code = src.replace(/\/\/.*$/gm, '');
    assert.ok(!code.includes('Date.now('), `${f} calls Date.now() - insights must stay a pure function of its asOf parameter`);
    assert.ok(!/new Date\(\s*\)/.test(code), `${f} calls new Date() with no argument (reads the system clock)`);
  }
});

test('vanity denylist: a computed report carries none of PLAN.md\'s excluded-from-v1 gamification vocabulary', () => {
  const inputs = loadInsightsInputs(EXAMPLE);
  const report = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, AS_OF);
  assert.doesNotMatch(JSON.stringify(report), /streak|badge|points|overall_score/);
});

test('mastery never imports insights: the dependency runs one way only', () => {
  const src = readFileSync(fileURLToPath(new URL('../../lib/mastery.ts', import.meta.url)), 'utf8');
  assert.ok(!/from ['"]\.\/insights/.test(src), 'lib/mastery.ts must not import lib/insights.ts');
});

// --- validate's insights check -------------------------------------------------

const SNAPSHOT = { sessions: { n: 3, active_days: 2 }, reviews: { overdue: [] } };
const SHA = 'a'.repeat(64);

function note(overrides: { body?: string; frontmatter?: string } = {}): string {
  const frontmatter =
    overrides.frontmatter ??
    `schema_version: 1
type: insights
as_of: 2026-08-09
generated_at: 2026-08-09
courses: [rust-for-backend]
agent: claude-sonnet-5
basis:
  ledger_lines: 12
  ledger_sha256: ${SHA}
metrics_snapshot: ${JSON.stringify(SNAPSHOT)}`;
  const body =
    overrides.body ??
    `## What the numbers say
3 sessions logged so far, across 2 active days.

## How you are using Meno
Mostly recognition checks.

## Where you are stuck
Nothing overdue right now.

## Suggestions
None yet.

## Limits of this report
This is a synthetic fixture, not a real report.
`;
  return `---\n${frontmatter}\n---\n\n${body}`;
}

function fixtureWith(content: string): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-insights-validate-'));
  const insightsDir = join(dir, 'insights');
  mkdirSync(insightsDir);
  const p = join(insightsDir, '2026-08-09-insights.md');
  writeFileSync(p, content);
  return { dir, files: [p] };
}

test('a well-formed insights note produces no findings', () => {
  const { dir, files } = fixtureWith(note());
  assert.deepEqual(checkInsights(dir, files), []);
});

test('a missing required section is named in the error', () => {
  const bodyWithoutSuggestions = `## What the numbers say
3 sessions logged so far.

## How you are using Meno
Mostly recognition checks.

## Where you are stuck
Nothing overdue right now.

## Limits of this report
This is a synthetic fixture.
`;
  const { dir, files } = fixtureWith(note({ body: bodyWithoutSuggestions }));
  const findings = checkInsights(dir, files);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'insights' && f.message.includes('Suggestions')));
});

test('invalid frontmatter (missing a required field) fails schema validation', () => {
  const frontmatterWithoutAgent = `schema_version: 1
type: insights
as_of: 2026-08-09
generated_at: 2026-08-09
courses: [rust-for-backend]
basis:
  ledger_lines: 12
  ledger_sha256: ${SHA}
metrics_snapshot: ${JSON.stringify(SNAPSHOT)}`;
  const { dir, files } = fixtureWith(note({ frontmatter: frontmatterWithoutAgent }));
  const findings = checkInsights(dir, files);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'insights' && f.message.includes('agent')));
});

test('cite-your-numbers: a body number absent from metrics_snapshot is a warning, not an error', () => {
  const bodyWithUncitedNumber = `## What the numbers say
42 sessions logged (a number nowhere in the snapshot).

## How you are using Meno
Mostly recognition checks.

## Where you are stuck
Nothing overdue right now.

## Suggestions
None yet.

## Limits of this report
This is a synthetic fixture.
`;
  const { dir, files } = fixtureWith(note({ body: bodyWithUncitedNumber }));
  const findings = checkInsights(dir, files);
  const warning = findings.find((f) => f.check === 'insights' && f.message.includes('42'));
  assert.ok(warning, 'expected a cite-your-numbers finding for the uncited "42"');
  assert.equal(warning?.level, 'warning');
});

test('cite-your-numbers exempts dates, ids, and numbers inside code or quotes', () => {
  const bodyWithExemptTokens = `## What the numbers say
As of 2026-08-09, see \`rust-for-backend/ownership\` and the item \`03-ownership#transfer\`.
The CLI reported "9999 unrelated digits inside a quoted string".

## How you are using Meno
See \`5000\` in a code span.

## Where you are stuck
Nothing overdue right now.

## Suggestions
None yet.

## Limits of this report
This is a synthetic fixture.
`;
  const { dir, files } = fixtureWith(note({ body: bodyWithExemptTokens }));
  const findings = checkInsights(dir, files);
  assert.deepEqual(
    findings.filter((f) => f.message.includes('cite-your-numbers')),
    [],
  );
});

test('path-style wikilinks resolve like Obsidian; they are never broken or untaught noise', () => {
  const files = [
    { path: 'home.md', text: '[[modules/01-first/01-alpha]] and [[01-alpha|by basename]]' },
    { path: 'modules/01-first/01-alpha.md', text: 'a lesson' },
  ];
  const g = buildVaultGraph(files);
  assert.deepEqual(g.broken.get('home.md'), undefined);
  assert.deepEqual(g.resolved.get('home.md'), ['modules/01-first/01-alpha.md', 'modules/01-first/01-alpha.md']);
  assert.deepEqual(g.orphans, []);
});
