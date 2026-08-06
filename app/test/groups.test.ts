// The group HTTP surface: v1.6 read-only (GET :tenant/groups only). Coverage
// here is the read-side degraded paths - a malformed file, a course deleted on
// disk, a traversal-shaped tenant - plus a structural guard that the write
// surface (four routes, five lib/groups.ts mutations) stays gone. The parse-
// and resolve-level coverage this file used to duplicate through write routes
// lives in tools/test/groups.test.ts.
import { fileURLToPath } from 'node:url';
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
    writeFileSync(
      join(app.tenantDir, 'groups.yml'),
      'schema_version: 1\ngroups:\n  - id: ai\n    title: AI\n    courses: [rust-for-backend]\n',
    );
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

test('a group id is never used to build a filesystem path', async () => {
  const app = await bareTenant();
  try {
    // the only file the group route ever names is the tenant's own groups.yml
    assert.equal((await api(app, 'GET', `/api/v1/..%2F..%2Fetc/groups`)).status >= 400, true);
  } finally {
    await app.close();
  }
});

// --- the write surface stays gone ---

test('the group HTTP surface is exactly one GET, and lib/groups.ts exports no mutation', () => {
  const routes = readFileSync(fileURLToPath(new URL('../server/routes.ts', import.meta.url)), 'utf8');
  const groupRows = routes.split('\n').filter((l) => /^\s*\[['"]\w+['"],.*(groups|\/group\$)/.test(l));
  assert.equal(groupRows.length, 1, 'exactly one route mentions groups');
  assert.match(groupRows[0], /^\s*\['GET'/, 'the surviving group route is a GET');

  const lib = readFileSync(fileURLToPath(new URL('../../lib/groups.ts', import.meta.url)), 'utf8');
  assert.ok(
    !/export (function|const) (addGroup|renameGroup|removeGroup|setCourseGroup|serializeGroups)\b/.test(lib),
    'lib/groups.ts must export no group mutation',
  );
});
