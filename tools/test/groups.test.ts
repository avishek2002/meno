import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseGroups, resolveGroups, EMPTY_GROUPS, MAX_GROUPS, domainTitle, type GroupsDoc } from '../../lib/groups.ts';
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

// --- the group count is capped at parse time (the only enforcement point left) ---

test('the group count is capped', () => {
  const entries = Array.from(
    { length: MAX_GROUPS + 1 },
    (_, i) => `  - id: group-${i}\n    title: Group ${i}\n    courses: []\n`,
  ).join('');
  const { doc, warnings } = parseGroups(`schema_version: 1\ngroups:\n${entries}`);
  assert.equal(doc.groups.length, MAX_GROUPS);
  assert.ok(warnings.some((w) => /more than \d+ groups/i.test(w)));
});

// --- a hand-edited file is the only remaining author, so hostility must still be parsed safely ---

test('a properly quoted hostile title parses back as one plain string, nothing extra claimed', () => {
  const nasty = 'AI: the "real" stuff\nid: injected\n- *alias &anchor #tag';
  const yaml = `schema_version: 1\ngroups:\n  - id: ai\n    title: ${JSON.stringify(nasty)}\n    courses: [rust]\n`;
  const { doc, warnings } = parseGroups(yaml);
  assert.equal(warnings.length, 0);
  assert.equal(doc.groups.length, 1, 'the quoted metacharacters mint no extra group');
  assert.equal(doc.groups[0].title, nasty.replace(/\s+/g, ' ').trim());
  assert.deepEqual(doc.groups[0].courses, ['rust'], 'no extra course is claimed');
});

// --- resolution against the tree walk ---

test('deleting a group drops the group and never the courses', () => {
  // the state a delete leaves behind: no group left claiming the course
  const doc: GroupsDoc = { schema_version: 1, groups: [] };
  const resolved = resolveGroups(doc, [{ slug: 'llm-agents', dir: 'ai-and-agents/llm-agents' }]);
  assert.deepEqual(resolved.ungrouped, [], 'the course is not orphaned');
  assert.deepEqual(
    resolved.groups.map((g) => [g.id, g.courses]),
    [['domain:ai-and-agents', ['llm-agents']]],
    'it falls back to its domain, not to a pile',
  );
});

test('a slug that no longer exists on disk drops out with a warning, never an error', () => {
  const doc: GroupsDoc = { schema_version: 1, groups: [{ id: 'ai', title: 'AI', courses: ['deleted-course'] }] };
  const resolved = resolveGroups(doc, [{ slug: 'still-here', dir: 'data/still-here' }]);
  assert.deepEqual(resolved.groups[0].courses, []);
  assert.deepEqual(resolved.ungrouped, []);
  assert.equal(resolved.warnings.length, 1);
});

// --- the domain fallback: a learner who never opens the manage panel still
// --- gets a grouped list, because the tree already groups their courses

test('with no groups at all, courses group by their domain directory in walk order', () => {
  const resolved = resolveGroups(EMPTY_GROUPS, [
    { slug: 'llm-agents', dir: 'ai-and-agents/llm-agents' },
    { slug: 'evals', dir: 'ai-and-agents/evals' },
    { slug: 'rust', dir: 'software-engineering/rust' },
  ]);
  assert.deepEqual(
    resolved.groups.map((g) => [g.id, g.title, g.source, g.courses]),
    [
      ['domain:ai-and-agents', 'AI and agents', 'domain', ['llm-agents', 'evals']],
      ['domain:software-engineering', 'Software engineering', 'domain', ['rust']],
    ],
  );
  assert.deepEqual(resolved.ungrouped, []);
});

test('an explicit group always wins over the domain it came from', () => {
  const doc: GroupsDoc = { schema_version: 1, groups: [{ id: 'version-control', title: 'Version Control', courses: ['git'] }] };
  const resolved = resolveGroups(doc, [
    { slug: 'git', dir: 'software-engineering/git' },
    { slug: 'rust', dir: 'software-engineering/rust' },
  ]);
  assert.deepEqual(
    resolved.groups.map((g) => [g.id, g.courses]),
    [
      ['version-control', ['git']],
      ['domain:software-engineering', ['rust']],
    ],
    'the learner name comes first, the leftover domain section after it',
  );
});

test('explicit groups always sort ahead of derived ones', () => {
  const doc: GroupsDoc = { schema_version: 1, groups: [{ id: 'zebra', title: 'Zebra', courses: ['rust'] }] };
  const resolved = resolveGroups(doc, [
    { slug: 'llm-agents', dir: 'ai-and-agents/llm-agents' },
    { slug: 'rust', dir: 'software-engineering/rust' },
  ]);
  assert.deepEqual(resolved.groups.map((g) => g.source), ['explicit', 'domain']);
});

test('a derived section id can never collide with a group id', () => {
  const doc: GroupsDoc = { schema_version: 1, groups: [{ id: 'software-engineering', title: 'Software engineering', courses: ['git'] }] };
  const resolved = resolveGroups(doc, [
    { slug: 'git', dir: 'software-engineering/git' },
    { slug: 'rust', dir: 'software-engineering/rust' },
  ]);
  const ids = resolved.groups.map((g) => g.id);
  assert.deepEqual(ids, ['software-engineering', 'domain:software-engineering']);
  assert.equal(new Set(ids).size, ids.length, 'ids stay unique even when the names match exactly');
});

test('only a course with no domain to fall back to is Ungrouped', () => {
  const resolved = resolveGroups(EMPTY_GROUPS, [
    { slug: 'pre-migration', dir: 'pre-migration' },
    { slug: 'rust', dir: 'software-engineering/rust' },
  ]);
  assert.deepEqual(resolved.ungrouped, ['pre-migration']);
  assert.deepEqual(resolved.groups.map((g) => g.id), ['domain:software-engineering']);
});

test('domain titles read as words, with the one acronym that matters', () => {
  assert.equal(domainTitle('ai-and-agents'), 'AI and agents');
  assert.equal(domainTitle('software-engineering'), 'Software engineering');
  assert.equal(domainTitle('data'), 'Data');
});

// --- the validate check ---

function tenantWithCourses(groupsYml: string | null, slugs: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-groups-'));
  for (const slug of slugs) {
    // the real layout: <vault>/<domain>/<course-slug>/
    mkdirSync(join(dir, 'software-engineering', slug), { recursive: true });
    writeFileSync(
      join(dir, 'software-engineering', slug, 'course.yml'),
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

test('a course in no group is a warning, not an error - it renders under its domain', () => {
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
