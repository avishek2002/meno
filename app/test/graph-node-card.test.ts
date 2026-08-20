// GET /api/v1/:tenant/graph/node over the real committed example tenant -
// invariants 18 and 19 of docs/specs/graph.md, which need a real HTTP round
// trip the way tools/test/node-card.test.ts's synthetic inputs cannot: the
// exact wire shape at every level of the payload, the leak grep over EVERY
// node in the fixture graph (not just one), a ghost id answering 200 with a
// disabled action, an unknown id and a path-traversal id both answering 404
// without touching the filesystem, a missing id answering 400, and the
// structural assertion that the route table now carries two graph GETs.
// Invariant 20 (parseDerivedBullets totality) is unit-tested in
// tools/test/node-card.test.ts instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, cpSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import { makeHandler, type Ctx } from '../server/routes.ts';
import type { GraphResponse, NodeCardResponse } from '../shared/types.ts';

const T = 'example-learner';
const graphUrl = `/api/v1/${T}/graph`;
const nodeUrl = (id: string): string => `/api/v1/${T}/graph/node?id=${encodeURIComponent(id)}`;

const EXAMPLE = fileURLToPath(new URL('../../examples/example-learner', import.meta.url));

/**
 * The same server-boot shape `helpers.ts`'s `withTenant` uses, kept as a
 * private duplicate here rather than a shared export: `mutate` needs to run
 * against the scratch copy of the tenant AFTER it is written but BEFORE the
 * server boots, which `withTenant` has no hook for, and this file is the only
 * caller that needs one. Used only for invariant 18's leak class - a stray
 * lesson file that outlives its module.yml entry, whether from one file being
 * dropped (removeLessonEntry) or a whole module.yml failing to parse
 * (corruptModuleYml) - never for content under content/tenants/, and the
 * scratch root is removed in every test's `finally`.
 */
async function withMutatedTenant(mutate: (tenantDir: string) => void): Promise<TestApp> {
  const root = mkdtempSync(join(tmpdir(), 'meno-node-card-leak-'));
  const tenantDir = join(root, T);
  mkdirSync(tenantDir, { recursive: true });
  cpSync(EXAMPLE, tenantDir, { recursive: true });
  mutate(tenantDir);
  const ctx: Ctx = { root, clientDist: null, version: 1 };
  const server: Server = createServer(makeHandler(ctx));
  await new Promise<void>((res) => server.listen(0, '127.0.0.1', res));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return {
    root,
    tenantDir,
    base: `http://127.0.0.1:${port}`,
    server,
    close: () =>
      new Promise((res) =>
        server.close(() => {
          rmSync(root, { recursive: true, force: true });
          res();
        }),
      ),
  };
}

/** Deletes one `lessons[]` entry from a module.yml, by filename, leaving the
 * lesson file itself on disk - the orphaned-file half of invariant 18's leak
 * class (module.yml no longer lists it, so it resolves to kind:'note'). */
function removeLessonEntry(tenantDir: string, moduleYmlRelPath: string, file: string): void {
  const p = join(tenantDir, moduleYmlRelPath);
  const before = readFileSync(p, 'utf8');
  const lines = before.split('\n');
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^\s*-\s+file:\s*/.test(line)) {
      skipping = line.includes(file);
      if (skipping) continue;
    } else if (skipping && /^\s{4,}\S/.test(line)) {
      continue; // a continuation line of the entry being dropped (concept:, status:, etc.)
    } else {
      skipping = false;
    }
    out.push(line);
  }
  const after = out.join('\n');
  assert.ok(!after.includes(`file: ${file}`), 'removeLessonEntry must actually drop the entry');
  writeFileSync(p, after);
}

/** Overwrites a module.yml with invalid YAML, the whole-module half of
 * invariant 18's leak class: tryYaml (app/server/tree.ts) tolerates this by
 * dropping the entire module, reclassifying every lesson file beneath it as
 * kind:'note' in one stroke. */
function corruptModuleYml(tenantDir: string, moduleYmlRelPath: string): void {
  writeFileSync(join(tenantDir, moduleYmlRelPath), 'this: [is not, valid: yaml\n');
}

async function readGraph(app: TestApp): Promise<GraphResponse> {
  const res = await api(app, 'GET', graphUrl);
  assert.equal(res.status, 200);
  return res.json as unknown as GraphResponse;
}

async function readCard(app: TestApp, id: string): Promise<{ status: number; body: NodeCardResponse }> {
  const res = await api(app, 'GET', nodeUrl(id));
  return { status: res.status, body: res.json as unknown as NodeCardResponse };
}

const RESPONSE_KEYS = ['tenant', 'id', 'title', 'kind', 'state', 'course', 'summary', 'summary_source', 'objectives', 'progress', 'action', 'warnings'].sort();
const OBJECTIVE_KEYS = ['id', 'text'].sort();
const PROGRESS_KEYS = ['lessons_total', 'lessons_generated', 'lessons_mastered', 'courses'].sort();
const ACTION_KEYS = ['href', 'label', 'enabled', 'disabled_reason'].sort();

test('invariant 18: a card for every node in the fixture graph carries exactly the guarded keys and leaks no lesson body', async () => {
  const app = await withTenant();
  try {
    const graph = await readGraph(app);
    assert.ok(graph.nodes.length > 0);

    for (const node of graph.nodes) {
      const { status, body } = await readCard(app, node.id);
      assert.equal(status, 200, `card for ${node.id} should answer 200`);

      assert.deepEqual(Object.keys(body).sort(), RESPONSE_KEYS, `unexpected key set for ${node.id}`);
      for (const o of body.objectives) assert.deepEqual(Object.keys(o).sort(), OBJECTIVE_KEYS);
      if (body.progress !== null) assert.deepEqual(Object.keys(body.progress).sort(), PROGRESS_KEYS);
      assert.deepEqual(Object.keys(body.action).sort(), ACTION_KEYS);

      const text = JSON.stringify(body);
      for (const forbidden of ['"answer"', '"explain"', '"checks"', '"html"', '"frontmatter"']) {
        assert.ok(!text.includes(forbidden), `card for ${node.id} leaked ${forbidden}`);
      }
    }
  } finally {
    await app.close();
  }
});

test('invariant 18: a hub card carries objectives and course-scoped progress, sourced from meno:derived, never the lesson body', async () => {
  const app = await withTenant();
  try {
    const id = 'software-engineering/rust-for-backend/rust-for-backend-hub.md';
    const { status, body } = await readCard(app, id);
    assert.equal(status, 200);
    assert.equal(body.kind, 'hub');
    assert.equal(body.course, 'rust-for-backend');
    assert.equal(body.summary_source, 'home-derived');
    assert.equal(body.summary, 'module 2 of 7, next review 2026-08-09');
    assert.ok(body.objectives.length > 0);
    assert.ok(body.progress);
    assert.equal(body.progress.courses, 1);
    assert.ok(body.progress.lessons_mastered <= body.progress.lessons_generated);
    assert.ok(body.progress.lessons_generated <= body.progress.lessons_total);
    assert.equal(body.action.enabled, true);
    assert.equal(body.action.href, '#/t/example-learner/c/rust-for-backend');
    assert.equal(body.action.label, 'Open course');
  } finally {
    await app.close();
  }
});

test('invariant 18: a generated lesson card reads its summary from the course hub note, not from the lesson file', async () => {
  const app = await withTenant();
  try {
    const id = 'software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md';
    const { status, body } = await readCard(app, id);
    assert.equal(status, 200);
    assert.equal(body.kind, 'lesson');
    assert.equal(body.course, 'rust-for-backend');
    assert.equal(body.summary_source, 'hub-derived');
    assert.ok(body.summary && body.summary.length > 0);
    assert.deepEqual(body.objectives, []);
    assert.equal(body.progress, null);
    assert.equal(body.action.enabled, true);
    assert.equal(body.action.href, '#/t/example-learner/c/rust-for-backend/m/01-syntax-and-ownership-basics/l/03-ownership');
  } finally {
    await app.close();
  }
});

test('invariant 18: a home card sums progress across every course and reads its summary from its own note-intro', async () => {
  const app = await withTenant();
  try {
    const { status, body } = await readCard(app, 'home.md');
    assert.equal(status, 200);
    assert.equal(body.kind, 'home');
    assert.equal(body.course, null);
    assert.equal(body.summary_source, 'note-intro');
    assert.ok(body.progress);
    assert.equal(body.progress.courses, 2); // rust-for-backend and git-fundamentals
    assert.equal(body.action.href, '#/t/example-learner/n/home.md');
    assert.equal(body.action.label, 'Open note');
  } finally {
    await app.close();
  }
});

test('invariant 18: a plain note card carries no course scope and reads its summary from its own note-intro', async () => {
  const app = await withTenant();
  try {
    const { status, body } = await readCard(app, 'insights/2026-08-08-insights.md');
    assert.equal(status, 200);
    assert.equal(body.kind, 'note');
    assert.equal(body.course, null);
    assert.equal(body.progress, null);
    assert.deepEqual(body.objectives, []);
    assert.equal(body.summary_source, 'note-intro');
    assert.ok(body.summary && body.summary.length > 0);
    assert.equal(body.action.href, '#/t/example-learner/n/insights/2026-08-08-insights.md');
  } finally {
    await app.close();
  }
});

test('invariant 19: a ghost lesson answers 200, never 404, with a disabled action and no href', async () => {
  const app = await withTenant();
  try {
    const graph = await readGraph(app);
    const ghost = graph.nodes.find((n) => n.state === 'ghost' && n.kind === 'lesson');
    assert.ok(ghost, 'the fixture has at least one ghost lesson');

    const { status, body } = await readCard(app, ghost!.id);
    assert.equal(status, 200);
    assert.equal(body.state, 'ghost');
    assert.equal(body.summary, null);
    assert.equal(body.summary_source, 'none');
    assert.equal(body.action.enabled, false);
    assert.equal(body.action.href, null);
    assert.ok(body.action.disabled_reason && body.action.disabled_reason.length > 0);
  } finally {
    await app.close();
  }
});

test('invariant 19: action.href is null if and only if action.enabled is false, over every node', async () => {
  const app = await withTenant();
  try {
    const graph = await readGraph(app);
    for (const node of graph.nodes) {
      const { body } = await readCard(app, node.id);
      assert.equal(body.action.href === null, body.action.enabled === false, `href/enabled disagree for ${node.id}`);
      assert.equal(body.action.disabled_reason === null, body.action.enabled === true, `disabled_reason present iff disabled for ${node.id}`);
    }
  } finally {
    await app.close();
  }
});

test('invariant 19: an id the current graph does not contain answers 404 without touching the filesystem', async () => {
  const app = await withTenant();
  try {
    const { status, body } = await readCard(app, 'no-such-note-in-this-vault.md');
    assert.equal(status, 404);
    assert.ok((body as unknown as { error?: string }).error);
  } finally {
    await app.close();
  }
});

test('invariant 19: a path-traversal id 404s because it is not a node, not because of a filesystem check', async () => {
  const app = await withTenant();
  try {
    const { status } = await readCard(app, '../../etc/passwd');
    assert.equal(status, 404);
  } finally {
    await app.close();
  }
});

test('invariant 19: a missing or empty id answers 400', async () => {
  const app = await withTenant();
  try {
    const missing = await api(app, 'GET', `/api/v1/${T}/graph/node`);
    assert.equal(missing.status, 400);
    const empty = await api(app, 'GET', `/api/v1/${T}/graph/node?id=`);
    assert.equal(empty.status, 400);
  } finally {
    await app.close();
  }
});

test('the id is echoed back verbatim, so a late response for a swapped card is discardable', async () => {
  const app = await withTenant();
  try {
    const id = 'todos.md';
    const { body } = await readCard(app, id);
    assert.equal(body.id, id);
    assert.equal(body.tenant, T);
  } finally {
    await app.close();
  }
});

test('the graph subsystem now exposes exactly two GET routes and writes nothing new', async () => {
  const app = await withTenant();
  try {
    const post = await api(app, 'POST', nodeUrl('home.md'), {});
    assert.equal(post.status, 404, 'there is no POST counterpart for the node-card endpoint either');
  } finally {
    await app.close();
  }
});

// --- invariant 18 regression: an orphaned lesson file must never leak its
// body through `title`, the way it already could not through `summary` ---

const ORPHAN_MODULE_YML = 'software-engineering/rust-for-backend/modules/02-borrowing-in-practice/module.yml';
const ORPHAN_ID = 'software-engineering/rust-for-backend/modules/02-borrowing-in-practice/01-borrowing.md';
const ORPHAN_LESSON_H1 = 'Borrowing and references'; // the lesson file's own "# " heading - must never surface

test('invariant 18: a lesson file dropped from its module.yml (still on disk) is reclassified kind:note and its title never leaks the file\'s own H1', async () => {
  const app = await withMutatedTenant((tenantDir) => removeLessonEntry(tenantDir, ORPHAN_MODULE_YML, '01-borrowing.md'));
  try {
    const { status, body } = await readCard(app, ORPHAN_ID);
    assert.equal(status, 200);
    assert.equal(body.kind, 'note'); // no longer a listed lesson - exactly the confirmed-leak repro
    assert.equal(body.summary, null);
    assert.equal(body.summary_source, 'none');
    assert.notEqual(body.title, ORPHAN_LESSON_H1);
    assert.equal(body.title, '01-borrowing'); // falls back to the id's own basename
  } finally {
    await app.close();
  }
});

test('invariant 18: a malformed module.yml orphans every lesson beneath it at once, and none of their titles leak their file\'s own H1', async () => {
  const app = await withMutatedTenant((tenantDir) => corruptModuleYml(tenantDir, ORPHAN_MODULE_YML));
  try {
    // 02-borrowing-in-practice carries two lessons; both must have lost their
    // 'lesson' kind and neither may surface its own H1 as a title.
    const first = await readCard(app, ORPHAN_ID);
    assert.equal(first.status, 200);
    assert.equal(first.body.kind, 'note');
    assert.notEqual(first.body.title, ORPHAN_LESSON_H1);

    const second = await readCard(app, 'software-engineering/rust-for-backend/modules/02-borrowing-in-practice/02-lifetimes.md');
    assert.equal(second.status, 200);
    assert.equal(second.body.kind, 'note');
    assert.notEqual(second.body.title, 'Lifetimes');
  } finally {
    await app.close();
  }
});
