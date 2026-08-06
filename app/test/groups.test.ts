// The group write surface. Groups are the second file the app may write, so
// they get the same treatment the first one got: every hostile input the todos
// and traversal suites already cover, plus the two hazards a structured file
// adds that a markdown checklist does not - a title that could inject YAML, and
// an id that could be used as an object key.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import type { GroupsResponse } from '../shared/types.ts';

const T = 'example-learner';
const groupsUrl = `/api/v1/${T}/groups`;

async function read(app: TestApp): Promise<GroupsResponse> {
  const res = await api(app, 'GET', groupsUrl);
  assert.equal(res.status, 200);
  return res.json as unknown as GroupsResponse;
}

async function ifMatch(app: TestApp): Promise<Record<string, string>> {
  return { 'if-match': (await read(app)).raw_sha256 };
}

/** The committed fixture ships a groups.yml; most cases here start from none. */
async function bareTenant(): Promise<TestApp> {
  const app = await withTenant();
  rmSync(join(app.tenantDir, 'groups.yml'), { force: true });
  return app;
}

test('the committed example tenant ships a group, and it is read as written', async () => {
  const app = await withTenant();
  try {
    const got = await read(app);
    assert.deepEqual(got.groups, [
      { id: 'systems-programming', title: 'Systems Programming', courses: ['rust-for-backend'], source: 'explicit' },
    ]);
    assert.deepEqual(got.ungrouped, [], 'the explicit group wins over the software-engineering domain');
    assert.deepEqual(got.warnings, []);
  } finally {
    await app.close();
  }
});

test('a tenant with no groups.yml still gets a grouped list, from the domain directories', async () => {
  const app = await bareTenant();
  try {
    const got = await read(app);
    assert.deepEqual(got.groups, [
      { id: 'domain:software-engineering', title: 'Software engineering', courses: ['rust-for-backend'], source: 'domain' },
    ]);
    assert.deepEqual(got.ungrouped, [], 'a course with a domain is never Ungrouped');
    assert.deepEqual(got.warnings, []);
    assert.equal(typeof got.raw_sha256, 'string');
  } finally {
    await app.close();
  }
});

test('create, move, rename: a course ends up in exactly one named group', async () => {
  const app = await bareTenant();
  try {
    assert.equal((await api(app, 'POST', groupsUrl, { title: 'Systems Programming' }, await ifMatch(app))).status, 200);
    let got = await read(app);
    assert.deepEqual(
      got.groups.map((g) => [g.id, g.courses]),
      [['systems-programming', []], ['domain:software-engineering', ['rust-for-backend']]],
      'the new group starts empty beside the domain section the course still falls back to',
    );

    assert.equal(
      (await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'systems-programming' }, await ifMatch(app))).status,
      200,
    );
    got = await read(app);
    assert.deepEqual(got.groups[0].courses, ['rust-for-backend']);
    assert.deepEqual(got.groups.length, 1, 'the domain section empties out once the course is filed');

    assert.equal((await api(app, 'PATCH', `${groupsUrl}/systems-programming`, { title: 'Systems' }, await ifMatch(app))).status, 200);
    got = await read(app);
    assert.equal(got.groups[0].title, 'Systems', 'a rename changes the title');
    assert.equal(got.groups[0].id, 'systems-programming', 'and never the id');
  } finally {
    await app.close();
  }
});

test('deleting a group returns its courses to ungrouped and leaves the course files alone', async () => {
  const app = await bareTenant();
  try {
    const courseYml = join(app.tenantDir, 'software-engineering', 'rust-for-backend', 'course.yml');
    const before = readFileSync(courseYml, 'utf8');

    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'ai' }, await ifMatch(app));
    assert.equal((await api(app, 'DELETE', `${groupsUrl}/ai`, undefined, await ifMatch(app))).status, 200);

    const got = await read(app);
    assert.deepEqual(got.groups.map((g) => [g.id, g.source]), [['domain:software-engineering', 'domain']]);
    assert.deepEqual(got.groups[0].courses, ['rust-for-backend'], 'the course survives its group');
    assert.equal(readFileSync(courseYml, 'utf8'), before, 'no course file is touched by any group operation');
  } finally {
    await app.close();
  }
});

test('moving a course out of every group is allowed and leaves it ungrouped', async () => {
  const app = await bareTenant();
  try {
    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'ai' }, await ifMatch(app));
    assert.equal(
      (await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: null }, await ifMatch(app))).status,
      200,
    );
    const got = await read(app);
    assert.deepEqual(got.groups[0].courses, []);
    assert.deepEqual(got.groups[1].id, 'domain:software-engineering', 'it falls back to its domain');
  } finally {
    await app.close();
  }
});

test('a course cannot be listed by two groups', async () => {
  const app = await bareTenant();
  try {
    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    await api(app, 'POST', groupsUrl, { title: 'Systems' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'ai' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'systems' }, await ifMatch(app));
    const got = await read(app);
    assert.deepEqual(got.groups.map((g) => g.courses), [[], ['rust-for-backend']]);
    assert.deepEqual(got.groups.map((g) => g.source), ['explicit', 'explicit']);
  } finally {
    await app.close();
  }
});

test('moving a course the walk does not know is refused with 404, never written', async () => {
  const app = await bareTenant();
  try {
    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    const res = await api(app, 'PATCH', `/api/v1/${T}/course/no-such-course/group`, { group: 'ai' }, await ifMatch(app));
    assert.equal(res.status, 404);
    assert.deepEqual((await read(app)).groups[0].courses, [], 'nothing was written');
  } finally {
    await app.close();
  }
});

test('renaming or deleting a group that does not exist is a 404', async () => {
  const app = await bareTenant();
  try {
    assert.equal((await api(app, 'PATCH', `${groupsUrl}/ghost`, { title: 'x' }, await ifMatch(app))).status, 404);
    assert.equal((await api(app, 'DELETE', `${groupsUrl}/ghost`, undefined, await ifMatch(app))).status, 404);
  } finally {
    await app.close();
  }
});

// --- concurrency, exactly as todos.md does it ---

test('a group write without If-Match is refused with 428', async () => {
  const app = await bareTenant();
  try {
    assert.equal((await api(app, 'POST', groupsUrl, { title: 'AI' })).status, 428);
    assert.equal((await api(app, 'DELETE', `${groupsUrl}/ai`)).status, 428);
  } finally {
    await app.close();
  }
});

test('a stale If-Match returns 409 instead of clobbering an edit made in Obsidian', async () => {
  const app = await bareTenant();
  try {
    const stale = await ifMatch(app);
    writeFileSync(join(app.tenantDir, 'groups.yml'), 'schema_version: 1\ngroups:\n  - id: hand-made\n    title: Hand made\n    courses: []\n');
    const res = await api(app, 'POST', groupsUrl, { title: 'AI' }, stale);
    assert.equal(res.status, 409);
    assert.deepEqual(
      (await read(app)).groups.filter((g) => g.source === 'explicit').map((g) => g.id),
      ['hand-made'],
      'the hand edit survives',
    );
  } finally {
    await app.close();
  }
});

// --- degraded paths: a bad file renders inert, never breaks the page ---

test('malformed groups.yml reports a warning and still lists every course', async () => {
  const app = await bareTenant();
  try {
    writeFileSync(join(app.tenantDir, 'groups.yml'), 'groups: [broken\n  : :\n');
    const got = await read(app);
    assert.deepEqual(got.groups.map((g) => g.source), ['domain'], 'the domain fallback still renders every course');
    assert.deepEqual(got.groups[0].courses, ['rust-for-backend']);
    assert.equal(got.warnings.length, 1);
  } finally {
    await app.close();
  }
});

test('a course deleted on disk drops out of its group with a warning, never a 500', async () => {
  const app = await bareTenant();
  try {
    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'ai' }, await ifMatch(app));
    rmSync(join(app.tenantDir, 'software-engineering', 'rust-for-backend'), { recursive: true, force: true });
    const got = await read(app);
    assert.deepEqual(got.groups[0].courses, []);
    assert.deepEqual(got.ungrouped, []);
    assert.equal(got.groups.length, 1, 'nothing is left to fall back to either');
    assert.equal(got.warnings.length, 1);
  } finally {
    await app.close();
  }
});

// --- hostile input ---

test('a group title cannot inject structure into groups.yml', async () => {
  const app = await bareTenant();
  try {
    const nasty = 'AI: yes\nid: injected\ncourses: [rust-for-backend]';
    assert.equal((await api(app, 'POST', groupsUrl, { title: nasty }, await ifMatch(app))).status, 200);
    const got = await read(app);
    assert.equal(got.groups.filter((g) => g.source === 'explicit').length, 1, 'one title in, one group out');
    assert.deepEqual(got.groups[0].courses, [], 'the title could not smuggle a course into the group');
    assert.match(got.groups[0].title, /^AI: yes id: injected/);
    assert.deepEqual(got.groups[1].courses, ['rust-for-backend'], 'the course stays where the tree put it');
  } finally {
    await app.close();
  }
});

test('prototype-shaped ids and body keys neither pollute Object.prototype nor create a group', async () => {
  const app = await bareTenant();
  try {
    await api(app, 'POST', groupsUrl, { title: '__proto__' }, await ifMatch(app));
    await api(app, 'PATCH', `${groupsUrl}/__proto__`, { title: 'x' }, await ifMatch(app));
    await api(app, 'DELETE', `${groupsUrl}/constructor`, undefined, await ifMatch(app));
    await api(app, 'POST', groupsUrl, { title: 'ok', __proto__: { polluted: true } }, await ifMatch(app));

    assert.equal(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype is untouched');
    const got = await read(app);
    assert.ok(
      got.groups.every((g) => !['__proto__', 'constructor', 'prototype'].includes(g.id)),
      'no group is keyed by a prototype name',
    );
  } finally {
    await app.close();
  }
});

test('an empty, oversized, or non-string group title is refused with 400', async () => {
  const app = await bareTenant();
  try {
    for (const title of ['', '   ', 'x'.repeat(201), 42, null]) {
      const res = await api(app, 'POST', groupsUrl, { title }, await ifMatch(app));
      assert.equal(res.status, 400, `title ${JSON.stringify(title)} must be refused`);
    }
    assert.deepEqual((await read(app)).groups.filter((g) => g.source === 'explicit'), []);
  } finally {
    await app.close();
  }
});

test('a group id is never used to build a filesystem path', async () => {
  const app = await bareTenant();
  try {
    for (const id of ['..', '../../etc/passwd', '%2e%2e', 'a/../../b']) {
      const res = await api(app, 'DELETE', `${groupsUrl}/${encodeURIComponent(id)}`, undefined, await ifMatch(app));
      assert.ok(res.status === 404 || res.status === 400, `id ${id} must not resolve to anything (got ${res.status})`);
    }
    // the only file the group routes ever name is the tenant's own groups.yml
    assert.equal((await api(app, 'GET', `/api/v1/..%2F..%2Fetc/groups`)).status >= 400, true);
  } finally {
    await app.close();
  }
});

test('the group routes never append to the ledger', async () => {
  const app = await bareTenant();
  try {
    const ledger = join(app.tenantDir, 'progress', 'ledger.jsonl');
    const before = readFileSync(ledger, 'utf8');
    await api(app, 'POST', groupsUrl, { title: 'AI' }, await ifMatch(app));
    await api(app, 'PATCH', `/api/v1/${T}/course/rust-for-backend/group`, { group: 'ai' }, await ifMatch(app));
    await api(app, 'DELETE', `${groupsUrl}/ai`, undefined, await ifMatch(app));
    assert.equal(readFileSync(ledger, 'utf8'), before, 'organization is not evidence');
  } finally {
    await app.close();
  }
});
