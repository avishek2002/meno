import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkProfiles, runValidation } from '../validate.ts';

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
  const findings = runValidation([new URL('../../examples', import.meta.url).pathname]);
  assert.deepEqual(findings.filter((f) => f.level === 'error'), []);
});
