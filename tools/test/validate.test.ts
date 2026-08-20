import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  checkProfiles,
  checkConnects,
  checkCourses,
  checkSubjects,
  checkWorkspaceScan,
  checkWorkspaceFixture,
  absolutePathHits,
  checkSpecTableText,
  checkSpecVersions,
  checkTerms,
  runValidation,
} from '../validate.ts';

const VALID_PROFILE = `---
schema_version: 1
tenant: example-learner
course: rust-for-backend
created: 2026-08-05
status: confirmed
goal_category: build
outcome_statement: "Ship a small backend service in Rust"
prior_level: vocabulary
probe_result: confirmed-at-level
depth: build
bloom_ceiling: apply
hours_per_week: 4
total_weeks: 6
budget_hours: 24
format_prefs: text-first
user_sources: false
questions_asked: 6
---
# Learning contract: Rust for backend

## Goal
Ship a service.

## Starting point
Knows the words.

## Scope contract
IN: basics. OUT: async internals - budget.

## Adjustment log
- 2026-08-05 - contract confirmed at interview.
`;

function tenantWith(profile: string): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-validate-'));
  const courseDir = join(dir, 'course-x');
  mkdirSync(courseDir);
  const p = join(courseDir, 'profile.md');
  writeFileSync(p, profile);
  return { dir, files: [p] };
}

test('valid profile produces no findings', () => {
  const { dir, files } = tenantWith(VALID_PROFILE);
  assert.deepEqual(checkProfiles(dir, files), []);
});

test('missing required field is named in the error', () => {
  const { dir, files } = tenantWith(VALID_PROFILE.replace('goal_category: build\n', ''));
  const findings = checkProfiles(dir, files);
  assert.ok(findings.some((f) => f.level === 'error' && f.message.includes('goal_category')));
});

test('wrong bloom_ceiling for depth fails the mapping rule', () => {
  const { dir, files } = tenantWith(VALID_PROFILE.replace('bloom_ceiling: apply', 'bloom_ceiling: create'));
  const findings = checkProfiles(dir, files);
  assert.ok(findings.some((f) => f.check === 'profile-consistency' && f.message.includes('bloom_ceiling')));
});

test('budget arithmetic mismatch fails', () => {
  const { dir, files } = tenantWith(VALID_PROFILE.replace('budget_hours: 24', 'budget_hours: 30'));
  const findings = checkProfiles(dir, files);
  assert.ok(findings.some((f) => f.message.includes('budget_hours')));
});

test('missing body section fails naming the section', () => {
  const { dir, files } = tenantWith(VALID_PROFILE.replace('## Scope contract\nIN: basics. OUT: async internals - budget.\n\n', ''));
  const findings = checkProfiles(dir, files);
  assert.ok(findings.some((f) => f.check === 'profile-body' && f.message.includes('Scope contract')));
});

test('invalid frontmatter YAML reports, never throws', () => {
  const { dir, files } = tenantWith('---\n: not yaml: [\n---\nbody');
  const findings = checkProfiles(dir, files);
  assert.ok(findings.some((f) => f.level === 'error'));
});

test('runValidation on the committed examples tree is clean', () => {
  const findings = runValidation([fileURLToPath(new URL('../../examples', import.meta.url))]);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), []);
});

// --- find-subjects: checkSubjects, checkWorkspaceScan, checkWorkspaceFixture ---
//
// The default gate targets (examples/, content/community/, optional content/org/) never
// contain subjects/ or workspace/ artifacts, so nothing above this line ever exercised
// these three checks - they were dead in the test suite. Fixtures below construct the
// artifacts directly rather than relying on a real tenant scan.

const VALID_SCAN = {
  schema_version: 1,
  type: 'workspace-scan',
  generated_at: '2026-08-12T00:00:00.000Z',
  as_of: '2026-08-12',
  scanner_version: 1,
  budgets: {
    max_roots: 8,
    max_repos_per_root: 100,
    max_depth: 6,
    max_dir_entries: 2000,
    max_files: 50000,
    max_commits_per_repo: 200,
    max_doc_files: 40,
    max_doc_files_per_repo: 3,
    max_dependency_names: 200,
  },
  roots: [{ root_id: '0123456789ab', label: 'primary-projects', repos_found: 1, pending_approval: [] }],
  repos: [],
  aggregate: { total_roots: 1, total_repos: 0, dependency_frequency: {}, manifest_coverage: {}, marker_coverage: {} },
  truncation: { events: [] },
  limits: ['no caps were hit this run'],
};

const SUBJECTS_BODY = `
## What your workspace shows

One approved root was scanned.

## Where you are not getting full value

Nothing notable observed.

## Worth a look

No alternatives this run.

## Courses worth taking

No candidates this run.

## Limits of this report

No caps were hit this run.
`;

function subjectsReport(body: string = SUBJECTS_BODY, fmOverrides: Record<string, unknown> = {}): string {
  const fm = {
    schema_version: 1,
    type: 'subjects',
    as_of: '2026-08-12',
    generated_at: '2026-08-12',
    roots: ['primary-projects'],
    agent: 'claude-sonnet-5',
    basis: { roots_scanned: 1, scan_sha256: '0'.repeat(64) },
    workspace_scan: VALID_SCAN,
    ...fmOverrides,
  };
  return `---\n${stringify(fm)}---\n${body}`;
}

function tenantSubjectsDir(): { dir: string; subjectsDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-validate-subjects-'));
  const subjectsDir = join(dir, 'subjects');
  mkdirSync(subjectsDir);
  return { dir, subjectsDir };
}

test('checkSubjects: a clean report produces no findings', () => {
  const { dir, subjectsDir } = tenantSubjectsDir();
  const file = join(subjectsDir, '2026-08-12-subjects.md');
  writeFileSync(file, subjectsReport());
  assert.deepEqual(checkSubjects(dir, [file]), []);
});

test('checkSubjects: a raw filesystem path in the report body fails', () => {
  const { dir, subjectsDir } = tenantSubjectsDir();
  const file = join(subjectsDir, '2026-08-12-subjects.md');
  const body = SUBJECTS_BODY.replace(
    'One approved root was scanned.',
    'One approved root was scanned, cloned at /Users/avishek/dev.',
  );
  writeFileSync(file, subjectsReport(body));
  const findings = checkSubjects(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'subjects' && f.message.includes('raw filesystem path')));
});

test('checkSubjects: a missing required section fails naming it', () => {
  const { dir, subjectsDir } = tenantSubjectsDir();
  const file = join(subjectsDir, '2026-08-12-subjects.md');
  const body = SUBJECTS_BODY.replace('\n## Limits of this report\n\nNo caps were hit this run.\n', '');
  writeFileSync(file, subjectsReport(body));
  const findings = checkSubjects(dir, [file]);
  assert.ok(findings.some((f) => f.check === 'subjects' && f.message.includes('Limits of this report')));
});

test('checkSubjects: a raw path in the evidence packet fails too, not only the report', () => {
  const { dir, subjectsDir } = tenantSubjectsDir();
  const file = join(subjectsDir, 'evidence-packet.json');
  writeFileSync(
    file,
    JSON.stringify([{ field: 'prior_level', anchor: 'seen committed under /Users/avishek/dev', evidence: 'roots[0]' }]),
  );
  const findings = checkSubjects(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'subjects' && f.message.includes('raw filesystem path')));
});

test('checkSubjects: malformed frontmatter still runs the path scan', () => {
  const { dir, subjectsDir } = tenantSubjectsDir();
  const file = join(subjectsDir, '2026-08-12-subjects.md');
  writeFileSync(file, '---\n: not yaml: [\n---\nSee /Users/avishek/dev for the raw clone.\n');
  const findings = checkSubjects(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.message.includes('invalid frontmatter YAML')));
  assert.ok(findings.some((f) => f.level === 'error' && f.message.includes('raw filesystem path')));
});

function tenantWorkspaceDir(): { dir: string; workspaceDir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-validate-workspace-'));
  const workspaceDir = join(dir, 'workspace');
  mkdirSync(workspaceDir);
  return { dir, workspaceDir };
}

test('checkWorkspaceScan: a clean snapshot produces no findings', () => {
  const { dir, workspaceDir } = tenantWorkspaceDir();
  const file = join(workspaceDir, '2026-08-12-scan.json');
  writeFileSync(file, JSON.stringify(VALID_SCAN));
  assert.deepEqual(checkWorkspaceScan(dir, [file]), []);
});

test('checkWorkspaceScan: a snapshot failing its schema fails', () => {
  const { dir, workspaceDir } = tenantWorkspaceDir();
  const file = join(workspaceDir, '2026-08-12-scan.json');
  const { budgets: _omit, ...bad } = VALID_SCAN;
  writeFileSync(file, JSON.stringify(bad));
  const findings = checkWorkspaceScan(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'workspace-scan'));
});

test('checkWorkspaceScan: a raw path in the snapshot fails', () => {
  const { dir, workspaceDir } = tenantWorkspaceDir();
  const file = join(workspaceDir, '2026-08-12-scan.json');
  writeFileSync(file, JSON.stringify({ ...VALID_SCAN, limits: ['scanned /Users/avishek/dev directly'] }));
  const findings = checkWorkspaceScan(dir, [file]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'workspace-scan' && f.message.includes('raw filesystem path')));
});

test('checkWorkspaceFixture: a nested .git under a fabricated fixture path fails', () => {
  // checkWorkspaceFixture only inspects path segments for files under the real
  // examples/workspace-fixture root - it never reads these files - so fabricated
  // paths exercise the check without touching the committed fixture tree.
  const fixtureRoot = fileURLToPath(new URL('../../examples/workspace-fixture', import.meta.url));
  const badFile = join(fixtureRoot, 'fx-example', '.git', 'config');
  const findings = checkWorkspaceFixture('', [badFile]);
  assert.ok(findings.some((f) => f.check === 'workspace-fixture' && f.message.includes('nested .git')));
});

// --- ABSOLUTE_PATH_RE, via absolutePathHits: a dozen misses the old prefix-gated,
// short root list let through, plus negative cases pinning what must not fire ---

const ABSOLUTE_PATH_POSITIVES: [string, string][] = [
  ['Volumes root', '/Volumes/ClientWork/acme'],
  ['tmp root', '/tmp/meno-scan-bundle-x/docs.json'],
  ['data root', '/data/exports/report.csv'],
  ['usr root', '/usr/local/clients/acme'],
  ['root root', '/root/.ssh/config'],
  ['media root', '/media/backup/acme'],
  ['windows UNC share', '\\\\fileserver\\share\\acme'],
  ['prefixed by = (not a listed prefix char)', 'path=/Users/avishek/dev'],
  ['wrapped in markdown bold', '**/Users/avishek/dev**'],
  ['file:// URL', 'file:///Users/avishek/dev'],
  ['home-relative with an underscore', '~/_work/acme'],
  ['windows drive letter', 'C:\\clients\\acme'],
  ['plain macOS home path', '/Users/avishek/dev'],
];

const ABSOLUTE_PATH_NEGATIVES: [string, string][] = [
  ['no leading slash', 'Users/example/AvisheksIntelligence'],
  ['ordinary repo-relative doc path', 'docs/architecture.md'],
  ['snapshot field-path syntax', 'roots[0].repos[2].languages'],
  ['$HOME word-boundary guard', '$HOMEPAGE redesign shipped this week'],
  ['Users not preceded by a path separator', 'python-Users-guide.md'],
  ['root name without a leading slash', 'myVolumes/README.md'],
];

for (const [name, line] of ABSOLUTE_PATH_POSITIVES) {
  test(`absolutePathHits: fires on ${name}`, () => {
    assert.ok(absolutePathHits(line).length > 0, `expected a hit for: ${line}`);
  });
}

for (const [name, line] of ABSOLUTE_PATH_NEGATIVES) {
  test(`absolutePathHits: does not fire on ${name}`, () => {
    assert.deepEqual(absolutePathHits(line), []);
  });
}

// --- connects: docs/specs/graph.md invariant 12 ---

test('connects: an unresolvable target is an error and a one-sided pair is a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-connects-'));
  writeFileSync(join(dir, 'home.md'), '# Home\n');
  mkdirSync(join(dir, 'domain', 'c1'), { recursive: true });
  mkdirSync(join(dir, 'domain', 'c2'), { recursive: true });
  const c1Hub = join(dir, 'domain', 'c1', 'c1-hub.md');
  writeFileSync(
    c1Hub,
    ['# C1', '', '<!-- meno:connects:start -->', '- [[missing-hub]] - does not exist', '- [[c2-hub|C2]] - one-sided', '<!-- meno:connects:end -->', ''].join('\n'),
  );
  const c2Hub = join(dir, 'domain', 'c2', 'c2-hub.md');
  writeFileSync(c2Hub, '# C2\n'); // no meno:connects block at all - never names c1-hub back

  const findings = checkConnects(dir, [join(dir, 'home.md'), c1Hub, c2Hub]);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');
  assert.ok(errors.some((f) => f.check === 'connects' && f.message.includes('missing-hub')), 'an unresolvable target is an error');
  assert.ok(
    warnings.some((f) => f.check === 'connects' && f.message.includes('c1-hub') && f.message.includes('c2-hub')),
    'a one-sided pair is a warning naming both hubs',
  );
});

test('connects: a malformed line is an error finding and a duplicate target is a warning finding, each mapped from its own parser diagnostic level', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-connects-diag-'));
  writeFileSync(join(dir, 'home.md'), '# Home\n');
  const hub = join(dir, 'x-hub.md');
  writeFileSync(
    hub,
    ['# X', '', '<!-- meno:connects:start -->', '- not a bullet at all', '- [[x-hub|dup]] - first', '- [[x-hub|dup again]] - second', '<!-- meno:connects:end -->', ''].join(
      '\n',
    ),
  );
  const findings = checkConnects(dir, [join(dir, 'home.md'), hub]);
  assert.ok(findings.some((f) => f.level === 'error' && f.check === 'connects'), 'the malformed bullet is an error');
  assert.ok(findings.some((f) => f.level === 'warning' && f.check === 'connects'), 'the duplicate target is a warning');
});

test('connects: a self-targeting bullet is a warning, not an error, and is excluded from the reciprocity pass', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-connects-self-'));
  writeFileSync(join(dir, 'home.md'), '# Home\n');
  mkdirSync(join(dir, 'domain', 'c1'), { recursive: true });
  const hub = join(dir, 'domain', 'c1', 'c1-hub.md');
  writeFileSync(
    hub,
    ['# C1', '', '<!-- meno:connects:start -->', '- [[c1-hub|Itself]] - a typo, points at itself', '<!-- meno:connects:end -->', ''].join('\n'),
  );

  const findings = checkConnects(dir, [join(dir, 'home.md'), hub]);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), [], 'a self-link resolves fine; it is not an unresolvable-target error');
  assert.ok(
    findings.some((f) => f.level === 'warning' && f.check === 'connects' && f.message.toLowerCase().includes('self')),
    'a self-targeting bullet is a warning',
  );
});

test('connects: a hub with no vault root above it skips target resolution entirely', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-connects-bare-'));
  const hub = join(dir, 'bare-hub.md');
  writeFileSync(
    hub,
    ['# Bare', '', '<!-- meno:connects:start -->', '- [[nowhere]] - unresolved but never checked (no vault root)', '<!-- meno:connects:end -->', ''].join('\n'),
  );
  // no home.md anywhere - a bare course fixture, exactly like content/community packs
  assert.deepEqual(checkConnects(dir, [hub]), []);
});

// --- duplicate lesson file within one module.yml: lessonById in lib/graph.ts silently
// overwrites, so this is the only signal a course author gets ---

function walkTree(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walkTree(p, out);
    else out.push(p);
  }
  return out;
}

const DUP_LESSON_COURSE = `schema_version: 1
slug: demo-course
title: Demo course
created: 2026-08-05
status: active
hub: ./demo-course-hub.md
objectives:
  - id: O1
    text: Apply the demo topic in a small project
    bloom: apply
    assessed_by: transfer prompt in module 1
modules:
  - n: 1
    slug: 01-first
    title: First module
    status: skeleton
    est_hours: 4
    serves: [O1]
`;

const DUP_LESSON_MODULE = `schema_version: 1
module: 01-first
title: First module
status: skeleton
serves: [O1]
prerequisites: []
est_hours: 4
concepts: [alpha, beta]
objectives:
  - id: M1-1
    text: Apply alpha to a small case
    bloom: apply
sources:
  - title: Anchor one
    url: sources/anchor-one.md
    archived_url: ''
    accessed: 2026-08-05
    source_type: user
    why: anchors alpha
  - title: Anchor two
    url: sources/anchor-two.md
    archived_url: ''
    accessed: 2026-08-05
    source_type: user
    why: anchors beta
lessons:
  - file: 01-alpha.md
    title: Alpha
    concept: alpha
    status: planned
  - file: 01-alpha.md
    title: Alpha again
    concept: beta
    status: planned
`;

const DUP_LESSON_HUB = `# Demo course hub

<!-- meno:derived:start -->
\`\`\`mermaid
graph TD
    m1[01-first]
\`\`\`
- 01 First module (planned)
<!-- meno:derived:end -->
`;

test('duplicate lesson file within a module.yml is a warning', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-dup-lesson-'));
  const c = join(dir, 'demo-course');
  mkdirSync(join(c, 'modules', '01-first'), { recursive: true });
  writeFileSync(join(c, 'course.yml'), DUP_LESSON_COURSE);
  writeFileSync(join(c, 'modules', '01-first', 'module.yml'), DUP_LESSON_MODULE);
  writeFileSync(join(c, 'demo-course-hub.md'), DUP_LESSON_HUB);

  const findings = checkCourses(dir, walkTree(dir));
  assert.ok(
    findings.some(
      (f) => f.level === 'warning' && f.check === 'refs' && f.message.includes('duplicate lesson file') && f.message.includes('01-alpha.md'),
    ),
    'a duplicate lesson file within one module is a warning naming the file',
  );
});

// --- terms: the glossary sidecar (.claude/CONTRACT-glossary.md's 12 findings) ---

// A clean two-sentence definition, reused as the baseline everywhere a test
// is not itself pinning the sentence/word-count findings, so those findings
// never fire as noise on a fixture built to isolate a different one.
const CLEAN_DEF = 'A borrow is a reference that lets code read a value without taking ownership of it. Without borrowing every call would have to copy the value instead.';

function termsCourseFixture(modules: {
  slug: string;
  lessons: { file: string; title?: string }[];
  termsYml?: string;
  writeLessonBodies?: string[];
}[]): { dir: string; files: string[] } {
  const dir = mkdtempSync(join(tmpdir(), 'meno-terms-'));
  const courseDir = join(dir, 'demo-course');
  mkdirSync(courseDir, { recursive: true });
  writeFileSync(join(courseDir, 'course.yml'), 'schema_version: 1\nslug: demo-course\ntitle: Demo course\n');

  for (const mod of modules) {
    const modDir = join(courseDir, 'modules', mod.slug);
    mkdirSync(modDir, { recursive: true });
    const lessonLines = mod.lessons
      .map((l) => `  - file: ${l.file}\n    title: ${l.title ?? l.file}\n    concept: alpha\n    status: generated`)
      .join('\n');
    writeFileSync(join(modDir, 'module.yml'), `schema_version: 1\nmodule: ${mod.slug}\nlessons:\n${lessonLines}\n`);
    if (mod.termsYml !== undefined) writeFileSync(join(modDir, 'terms.yml'), mod.termsYml);
    for (const file of mod.writeLessonBodies ?? []) writeFileSync(join(modDir, file), '# lesson body\n');
  }
  return { dir, files: walkTree(dir) };
}

test('terms finding 1: a malformed entry parseTerms drops is an error naming the drop', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('dropped')),
    'a term entry missing "term" is dropped by parseTerms and reported as an error',
  );
});

test('terms finding 2: a document failing terms.schema.json is an error naming the ajv path', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n    see_also: ownership\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('see_also')),
    'see_also as a bare string, not an array, fails the schema even though parseTerms tolerates it',
  );
});

test('terms finding 3: a lesson not in this module\'s own module.yml is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 02-other.md\n    definition: "${CLEAN_DEF}"\n`,
      writeLessonBodies: ['01-first.md', '02-other.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('02-other.md') && f.message.includes('not in')),
    'a term naming a lesson this module.yml does not list is an error, even though the file exists on disk',
  );
});

test('terms finding 4: a lesson that does not exist on disk is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n`,
      writeLessonBodies: [], // 01-first.md is listed but never written
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('01-first.md') && f.message.includes('not exist on disk')),
    'a term introduced by an unwritten lesson is an error',
  );
});

test('terms finding 5: two entries sharing a term key in one file is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }, { file: '02-second.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n  - term: borrow\n    lesson: 02-second.md\n    definition: "${CLEAN_DEF}"\n`,
      writeLessonBodies: ['01-first.md', '02-second.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('duplicate')),
    'two entries in one terms.yml sharing a term key is an error',
  );
});

test('terms finding 6: a definition that is not exactly two sentences is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "A borrow is a reference. It lets code read a value. Without it the code cannot compile."\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('sentence')),
    'a three-sentence definition is an error naming the sentence count',
  );
});

test('terms finding 7: a definition over the word cap is a warning, not an error', () => {
  const words1 = Array.from({ length: 30 }, (_, i) => `word${i}`).join(' ');
  const words2 = Array.from({ length: 20 }, (_, i) => `term${i}`).join(' ');
  const longDef = `${words1}. ${words2}.`;
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${longDef}"\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'warning' && f.check === 'terms' && f.message.includes('word')),
    'a definition past the 45-word guideline is a warning naming the word count',
  );
  assert.ok(
    !findings.some((f) => f.level === 'error' && f.message.includes('sentence')),
    'the word cap alone must never produce a sentence-count error',
  );
});

test('terms finding 8: a written lesson body with no term entry and no no_terms row is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }, { file: '02-second.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n`,
      writeLessonBodies: ['01-first.md', '02-second.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('02-second.md')),
    '02-second.md has a written body, no term entry, and no no_terms row - that is an error',
  );
});

test('terms finding 9: no_terms naming an unlisted lesson, or one with its own term entry, is an error', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n\nno_terms:\n  - 01-first.md\n  - 09-ghost.md\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('09-ghost.md')),
    'no_terms naming a lesson module.yml does not list is an error',
  );
  assert.ok(
    findings.some((f) => f.level === 'error' && f.check === 'terms' && f.message.includes('01-first.md') && f.message.includes('no_terms')),
    'no_terms naming a lesson that also has a term entry is a contradiction, not a preference',
  );
});

test('terms finding 10: a module with a written lesson and no terms.yml at all is a warning', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      // termsYml intentionally omitted - the module never opted in
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'warning' && f.check === 'terms'),
    'a module with a generated lesson and no terms.yml at all is a warning, not an error (decision 5)',
  );
  assert.ok(
    !findings.some((f) => f.level === 'error'),
    'no terms.yml at all must never itself produce an error',
  );
});

test('terms finding 11: two entries anywhere in one course sharing a key with diverging definitions is a warning', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: lifetime\n    lesson: 01-first.md\n    definition: "A lifetime is the span of the program for which a reference stays valid. Without it the compiler cannot rule out a dangling pointer."\n`,
      writeLessonBodies: ['01-first.md'],
    },
    {
      slug: '02-second',
      lessons: [{ file: '02-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: lifetime\n    lesson: 02-first.md\n    definition: "A gift note is a short message a shopper attaches at checkout. Without it the recipient has no context for the parcel."\n`,
      writeLessonBodies: ['02-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'warning' && f.check === 'terms' && f.message.includes('lifetime') && f.message.includes('differently')),
    'the same term key defined unrelatedly in two modules of one course is a warning',
  );
});

test('terms finding 12: a see_also that resolves to no term key in the same course is a warning', () => {
  const { dir, files } = termsCourseFixture([
    {
      slug: '01-first',
      lessons: [{ file: '01-first.md' }],
      termsYml: `schema_version: 1\nterms:\n  - term: borrow\n    lesson: 01-first.md\n    definition: "${CLEAN_DEF}"\n    see_also: [nonexistent-term]\n`,
      writeLessonBodies: ['01-first.md'],
    },
  ]);
  const findings = checkTerms(dir, files);
  assert.ok(
    findings.some((f) => f.level === 'warning' && f.check === 'terms' && f.message.includes('nonexistent-term')),
    'a see_also value naming no term in the same course is a warning, never an error (a forward reference is normal)',
  );
});

// --- spec-versions: docs/architecture.md's phase-to-spec table, duplicate
// "Lands" version detection (see checkSpecTableText's own doc comment for why
// phases and the "Amended by" column are deliberately out of scope).

const SPEC_TABLE_HEADER_LINE = '| Spec | Subsystem | Lands | Amended by |';
const SPEC_TABLE_SEPARATOR = '|---|---|---|---|';

const DUP_VERSION_TABLE = `# Fixture doc

## Phase-to-spec table

${SPEC_TABLE_HEADER_LINE}
${SPEC_TABLE_SEPARATOR}
| [a.md](a.md) | thing one | Phase 0 | - |
| [b.md](b.md) | thing two | v1.8 | - |
| [c.md](c.md) | thing three | v1.8 | - |
`;

const CLEAN_VERSION_TABLE = `# Fixture doc

## Phase-to-spec table

${SPEC_TABLE_HEADER_LINE}
${SPEC_TABLE_SEPARATOR}
| [a.md](a.md) | thing one | Phase 0 | - |
| [a.md](a.md) | thing one, amended | Phase 0 | v1.1, v1.1 |
| [b.md](b.md) | thing two | v1.8 | - |
| [c.md](c.md) | thing three | v1.9 | - |
`;

const NO_TABLE_DOC = `# Fixture doc

There is no spec table in this document at all.
`;

test('checkSpecTableText: two rows claiming the same Lands version is an error', () => {
  const findings = checkSpecTableText(DUP_VERSION_TABLE, 'docs/architecture.md');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'error');
  assert.equal(findings[0].check, 'spec-versions');
  assert.ok(findings[0].message.includes('v1.8'), 'names the clashing version');
});

test('checkSpecTableText: a repeated version inside Amended by is not an error (amendments legitimately repeat)', () => {
  assert.deepEqual(checkSpecTableText(CLEAN_VERSION_TABLE, 'docs/architecture.md'), []);
});

test('checkSpecTableText: two rows sharing a Phase entry is not an error (phases are not picked ad hoc)', () => {
  const table = `${SPEC_TABLE_HEADER_LINE}\n${SPEC_TABLE_SEPARATOR}\n| [a.md](a.md) | one | Phase 2 | - |\n| [b.md](b.md) | two | Phase 2 | - |\n`;
  assert.deepEqual(checkSpecTableText(table, 'docs/architecture.md'), []);
});

test('checkSpecTableText: a missing table is an error rather than a silent pass', () => {
  const findings = checkSpecTableText(NO_TABLE_DOC, 'docs/architecture.md');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'error');
  assert.equal(findings[0].check, 'spec-versions');
  assert.ok(findings[0].message.includes('not found'));
});

test('checkSpecVersions: the real docs/architecture.md has no duplicate Lands version', () => {
  assert.deepEqual(checkSpecVersions('', []), []);
});
