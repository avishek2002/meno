import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCourses } from '../validate.ts';

const PROFILE = `---
schema_version: 1
tenant: t
course: demo-course
created: 2026-08-05
status: confirmed
goal_category: build
outcome_statement: "demo"
prior_level: vocabulary
probe_result: confirmed-at-level
depth: build
bloom_ceiling: apply
hours_per_week: 4
total_weeks: 2
budget_hours: 8
format_prefs: text-first
user_sources: false
questions_asked: 5
---
# Learning contract: demo

## Goal
g

## Starting point
s

## Scope contract
c

## Adjustment log
- 2026-08-05 - confirmed.
`;

const MODULE = `schema_version: 1
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
    url: https://example.org/docs
    archived_url: https://web.archive.org/web/20260805000000/https://example.org/docs
    accessed: 2026-08-05
    source_type: web
    why: anchors alpha
  - title: Anchor two
    url: https://example.org/guide
    archived_url: https://web.archive.org/web/20260805000000/https://example.org/guide
    accessed: 2026-08-05
    source_type: web
    why: anchors beta
lessons:
  - file: 01-alpha.md
    title: Alpha
    concept: alpha
    status: planned
`;

const COURSE = `schema_version: 1
slug: demo-course
title: Demo course
created: 2026-08-05
status: active
profile: ./profile.md
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

const HUB = `# Demo course hub

<!-- meno:derived:start -->
\`\`\`mermaid
graph TD
    m1[01-first]
\`\`\`
- 01 First module (planned)
<!-- meno:derived:end -->
`;

function makeCourse(overrides: { course?: string; module?: string; hub?: string | null; profile?: string } = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-course-'));
  const c = join(dir, 'demo-course');
  mkdirSync(join(c, 'modules', '01-first'), { recursive: true });
  writeFileSync(join(c, 'profile.md'), overrides.profile ?? PROFILE);
  writeFileSync(join(c, 'course.yml'), overrides.course ?? COURSE);
  writeFileSync(join(c, 'modules', '01-first', 'module.yml'), overrides.module ?? MODULE);
  if (overrides.hub !== null) writeFileSync(join(c, 'demo-course-hub.md'), overrides.hub ?? HUB);
  return dir;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function run(dir: string) {
  return checkCourses(dir, walk(dir));
}

test('valid skeleton course tree produces no errors', () => {
  const findings = run(makeCourse());
  assert.deepEqual(findings.filter((f) => f.level === 'error'), []);
});

test('course.yml status drift from module.yml is an error', () => {
  const findings = run(makeCourse({ course: COURSE.replace('    status: skeleton', '    status: generated') }));
  assert.ok(findings.some((f) => f.check === 'refs' && f.message.includes('drifted')));
});

test('objective bloom above the profile ceiling is an error', () => {
  const findings = run(makeCourse({ module: MODULE.replace('bloom: apply', 'bloom: create') }));
  assert.ok(findings.some((f) => f.message.includes('exceeds the profile ceiling')));
});

test('module hours above budget plus 10 percent is an error', () => {
  const findings = run(makeCourse({ module: MODULE.replace('est_hours: 4', 'est_hours: 9'), course: COURSE.replace('    est_hours: 4', '    est_hours: 9') }));
  assert.ok(findings.some((f) => f.message.includes('over the 8-hour budget')));
});

test('web source with a non-wayback archived_url is an error', () => {
  const findings = run(makeCourse({ module: MODULE.replace('https://web.archive.org/web/20260805000000/https://example.org/docs', 'https://example.org/cached') }));
  assert.ok(findings.some((f) => f.check === 'citations' && f.message.includes('web.archive.org')));
});

test('generated lesson whose file is missing is an error', () => {
  const findings = run(makeCourse({ module: MODULE.replace('status: planned', 'status: generated') }));
  assert.ok(findings.some((f) => f.message.includes('does not exist')));
});

test('missing mermaid map in the hub is an error', () => {
  const findings = run(makeCourse({ hub: HUB.replace('```mermaid', '```text').replace('```\n', '```\n') }));
  assert.ok(findings.some((f) => f.check === 'hub' && f.message.includes('mermaid')));
});

test('serves naming an unknown objective is an error', () => {
  const findings = run(makeCourse({ module: MODULE.replace('serves: [O1]', 'serves: [O9]'), course: COURSE.replace('    serves: [O1]', '    serves: [O9]') }));
  assert.ok(findings.some((f) => f.message.includes('unknown objective')));
});

test('pack checks: layout, safety, notes, and overlap enforcement', async () => {
  const { checkPacks } = await import('../validate.ts');
  // pack trees live under the REPO's content/community/, so checkPacks findings are
  // exercised against synthetic file lists rooted there via direct calls
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
  const real = `${repoRoot}content/community/software-engineering/git-fundamentals/course.yml`;
  const findings = checkPacks('', [real, real.replace('course.yml', 'PACK.md'), real.replace('course.yml', 'git-fundamentals-hub.md')]);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), []);
});
