import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import {
  parseGroups,
  serializeGroups,
  addGroup,
  renameGroup,
  removeGroup,
  setCourseGroup,
  resolveGroups,
  EMPTY_GROUPS,
  MAX_GROUPS,
} from '../../lib/groups.ts';
import { checkGroups } from '../validate.ts';

// --- parsing (permissive: a malformed file must never throw) ---

test('an absent or empty groups file parses to an empty document', () => {
  assert.deepEqual(parseGroups('').doc, EMPTY_GROUPS);
  assert.equal(parseGroups('').warnings.length, 0);
});

test('malformed YAML parses to an empty document with a warning, never a throw', () => {
  const { doc, warnings } = parseGroups('groups: [oops\n  - : :\n');
  assert.deepEqual(doc, EMPTY_GROUPS);
  assert.equal(warnings.length, 1);
});

test('entries that do not match the shape are dropped with a warning', () => {
  const { doc, warnings } = parseGroups(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [a]\n  - title: no id\n',
  );
  assert.deepEqual(doc.groups.map((g) => g.id), ['ai']);
  assert.equal(warnings.length, 1);
});

test('a duplicate group id keeps the first and warns', () => {
  const { doc, warnings } = parseGroups(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: []\n  - id: ai\n    title: Also AI\n    courses: []\n',
  );
  assert.equal(doc.groups.length, 1);
  assert.equal(doc.groups[0].title, 'AI');
  assert.match(warnings[0], /duplicate/i);
});

test('a course claimed by two groups stays in the first one and warns', () => {
  const { doc, warnings } = parseGroups(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [shared]\n  - id: vcs\n    title: VCS\n    courses: [shared]\n',
  );
  assert.deepEqual(doc.groups[0].courses, ['shared']);
  assert.deepEqual(doc.groups[1].courses, []);
  assert.match(warnings[0], /more than one group/i);
});

test('a dangerous id from a hand-edited file is dropped, never used as a key', () => {
  const { doc, warnings } = parseGroups(
    'schema_version: 1\ngroups:\n  - id: __proto__\n    title: Bad\n    courses: []\n',
  );
  assert.equal(doc.groups.length, 0);
  assert.equal(warnings.length, 1);
});

// --- serialization (never string concatenation: a title must not be able to inject YAML) ---

test('a title containing YAML metacharacters round-trips unchanged', () => {
  const nasty = 'AI: the "real" stuff\nid: injected\n- *alias &anchor #tag';
  const doc = addGroup(EMPTY_GROUPS, nasty);
  const reparsed = parseGroups(serializeGroups(doc));
  assert.equal(reparsed.warnings.length, 0);
  assert.equal(reparsed.doc.groups[0].title, nasty.replace(/\s+/g, ' ').trim());
});

test('the serialized file is valid YAML with the documented top-level shape', () => {
  const doc = addGroup(EMPTY_GROUPS, 'Version Control');
  const raw = serializeGroups(doc);
  const parsed = parseYaml(raw) as { schema_version: number; groups: unknown[] };
  assert.equal(parsed.schema_version, 1);
  assert.equal(parsed.groups.length, 1);
});

// --- mutations ---

test('a group id is derived from its title and stays unique', () => {
  let doc = addGroup(EMPTY_GROUPS, 'Software Fundamentals');
  assert.equal(doc.groups[0].id, 'software-fundamentals');
  doc = addGroup(doc, 'Software fundamentals');
  assert.deepEqual(doc.groups.map((g) => g.id), ['software-fundamentals', 'software-fundamentals-2']);
});

test('a title that slugifies to nothing still yields a usable id', () => {
  const doc = addGroup(EMPTY_GROUPS, '???');
  assert.match(doc.groups[0].id, /^group(-\d+)?$/);
  assert.equal(doc.groups[0].title, '???');
});

test('an empty or oversized title is refused with a 400', () => {
  assert.throws(() => addGroup(EMPTY_GROUPS, '   '), (e: { status?: number }) => e.status === 400);
  assert.throws(() => addGroup(EMPTY_GROUPS, 'x'.repeat(201)), (e: { status?: number }) => e.status === 400);
});

test('the group count is capped', () => {
  let doc = EMPTY_GROUPS;
  for (let i = 0; i < MAX_GROUPS; i++) doc = addGroup(doc, `Group ${i}`);
  assert.throws(() => addGroup(doc, 'One too many'), (e: { status?: number }) => e.status === 400);
});

test('renaming changes the title and never the id', () => {
  const doc = renameGroup(addGroup(EMPTY_GROUPS, 'AI'), 'ai', 'Artificial Intelligence');
  assert.equal(doc.groups[0].id, 'ai');
  assert.equal(doc.groups[0].title, 'Artificial Intelligence');
});

test('renaming or deleting an unknown group is a 404', () => {
  assert.throws(() => renameGroup(EMPTY_GROUPS, 'nope', 'x'), (e: { status?: number }) => e.status === 404);
  assert.throws(() => removeGroup(EMPTY_GROUPS, 'nope'), (e: { status?: number }) => e.status === 404);
});

test('deleting a group drops the group and never the courses', () => {
  let doc = addGroup(EMPTY_GROUPS, 'AI');
  doc = setCourseGroup(doc, 'llm-agents', 'ai');
  doc = removeGroup(doc, 'ai');
  assert.deepEqual(doc.groups, []);
  const resolved = resolveGroups(doc, ['llm-agents']);
  assert.deepEqual(resolved.ungrouped, ['llm-agents'], 'the course falls back to Ungrouped');
});

test('moving a course puts it in exactly one group', () => {
  let doc = addGroup(addGroup(EMPTY_GROUPS, 'AI'), 'Version Control');
  doc = setCourseGroup(doc, 'git-fundamentals', 'ai');
  doc = setCourseGroup(doc, 'git-fundamentals', 'version-control');
  assert.deepEqual(doc.groups[0].courses, []);
  assert.deepEqual(doc.groups[1].courses, ['git-fundamentals']);
});

test('moving a course to no group removes it from every group', () => {
  let doc = setCourseGroup(addGroup(EMPTY_GROUPS, 'AI'), 'llm-agents', 'ai');
  doc = setCourseGroup(doc, 'llm-agents', null);
  assert.deepEqual(doc.groups[0].courses, []);
});

test('moving a course to an unknown group is a 404', () => {
  assert.throws(
    () => setCourseGroup(EMPTY_GROUPS, 'llm-agents', 'nope'),
    (e: { status?: number }) => e.status === 404,
  );
});

// --- resolution against the tree walk ---

test('a slug that no longer exists on disk drops out with a warning, never an error', () => {
  const doc = setCourseGroup(addGroup(EMPTY_GROUPS, 'AI'), 'deleted-course', 'ai');
  const resolved = resolveGroups(doc, ['still-here']);
  assert.deepEqual(resolved.groups[0].courses, []);
  assert.deepEqual(resolved.ungrouped, ['still-here']);
  assert.equal(resolved.warnings.length, 1);
});

test('ungrouped preserves the order the walk returned', () => {
  const resolved = resolveGroups(EMPTY_GROUPS, ['a-course', 'b-course', 'c-course']);
  assert.deepEqual(resolved.ungrouped, ['a-course', 'b-course', 'c-course']);
});

// --- the validate check ---

function tenantWithCourses(groupsYml: string | null, slugs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-groups-'));
  for (const slug of slugs) {
    mkdirSync(join(dir, slug), { recursive: true });
    writeFileSync(
      join(dir, slug, 'course.yml'),
      `schema_version: 1\nslug: ${slug}\ntitle: ${slug}\ncreated: 2026-08-05\nstatus: active\nhub: ./${slug}-hub.md\n`,
    );
  }
  if (groupsYml !== null) writeFileSync(join(dir, 'groups.yml'), groupsYml);
  return dir;
}

function findingsFor(dir: string): ReturnType<typeof checkGroups> {
  const files: string[] = [];
  const walk = (d: string): void => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else files.push(p);
    }
  };
  walk(dir);
  return checkGroups(dir, files);
}

test('a tenant with no groups.yml produces no group findings', () => {
  assert.deepEqual(findingsFor(tenantWithCourses(null, ['a-course'])), []);
});

test('a well-formed groups.yml validates clean', () => {
  const dir = tenantWithCourses(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [a-course]\n',
    ['a-course'],
  );
  assert.deepEqual(findingsFor(dir), []);
});

test('a group listing a course that does not exist is an error', () => {
  const dir = tenantWithCourses(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [ghost-course]\n',
    ['a-course'],
  );
  const findings = findingsFor(dir);
  assert.equal(findings.filter((f) => f.level === 'error').length, 1);
  assert.match(findings[0].message, /ghost-course/);
});

test('a course in no group is a warning, not an error', () => {
  const dir = tenantWithCourses('schema_version: 1\ngroups: []\n', ['a-course']);
  const findings = findingsFor(dir);
  assert.equal(findings.filter((f) => f.level === 'error').length, 0);
  assert.equal(findings.filter((f) => f.level === 'warning').length, 1);
});

test('a duplicate group id is an error at validate time', () => {
  const dir = tenantWithCourses(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [a-course]\n  - id: ai\n    title: Again\n    courses: []\n',
    ['a-course'],
  );
  assert.equal(findingsFor(dir).filter((f) => f.level === 'error').length, 1);
});

test('one course in two groups is an error at validate time', () => {
  const dir = tenantWithCourses(
    'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [a-course]\n  - id: vcs\n    title: VCS\n    courses: [a-course]\n',
    ['a-course'],
  );
  const findings = findingsFor(dir).filter((f) => f.level === 'error');
  assert.equal(findings.length, 1);
  assert.match(findings[0].message, /more than one group/i);
});
