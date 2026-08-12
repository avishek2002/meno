import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProfiles, checkConnects, checkCourses, runValidation } from '../validate.ts';

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
