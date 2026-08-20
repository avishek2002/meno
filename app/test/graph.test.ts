// GET /api/v1/:tenant/graph over the real committed example tenant - the
// endpoint-level invariants a synthetic unit test cannot see: the exact wire
// shape of a node (invariant 9), a malformed meno:connects block still
// answering 200 (invariant 10), and that the subsystem writes nothing
// (invariant 15). Invariants 1-8 are unit-tested in tools/test/graph.test.ts.
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import type { GraphResponse } from '../shared/types.ts';

const T = 'example-learner';
const graphUrl = `/api/v1/${T}/graph`;

async function readGraph(app: TestApp): Promise<{ status: number; body: GraphResponse }> {
  const res = await api(app, 'GET', graphUrl);
  return { status: res.status, body: res.json as unknown as GraphResponse };
}

test('a graph node carries structure only, with no lesson body, answer, or explanation', async () => {
  const app = await withTenant();
  try {
    const { status, body } = await readGraph(app);
    assert.equal(status, 200);
    assert.ok(body.nodes.length > 0);
    const expectedKeys = ['id', 'title', 'kind', 'group', 'course', 'state', 'in_degree', 'route'].sort();
    for (const node of body.nodes) {
      assert.deepEqual(Object.keys(node).sort(), expectedKeys);
    }
    const text = JSON.stringify(body);
    for (const forbidden of ['"answer"', '"explain"', '"checks"', '"html"', '"frontmatter"']) {
      assert.ok(!text.includes(forbidden), `graph response leaked "${forbidden}"`);
    }
  } finally {
    await app.close();
  }
});

test('a malformed connects block still answers 200 and keeps its hub node', async () => {
  const app = await withTenant();
  try {
    const hubPath = join(app.tenantDir, 'software-engineering', 'git-fundamentals', 'git-fundamentals-hub.md');
    const original = readFileSync(hubPath, 'utf8');
    // duplicate the start marker: unbalanced, per parseConnects's own rule
    const broken = original.replace('<!-- meno:connects:start -->', '<!-- meno:connects:start -->\n<!-- meno:connects:start -->');
    writeFileSync(hubPath, broken);

    const { status, body } = await readGraph(app);
    assert.equal(status, 200);
    const hubId = 'software-engineering/git-fundamentals/git-fundamentals-hub.md';
    const hub = body.nodes.find((n) => n.id === hubId);
    assert.ok(hub, 'the hub node survives a malformed connects block');
    assert.ok(body.warnings.length > 0, 'the malformed block is reported in warnings, never thrown');
  } finally {
    await app.close();
  }
});

test('the graph HTTP surface is exactly one GET and the subsystem writes nothing', async () => {
  const routes = readFileSync(fileURLToPath(new URL('../server/routes.ts', import.meta.url)), 'utf8');
  // widened from \/graph\$ to also match the node-card route's own regex
  // literal (…\/graph\/node$/) now that the subsystem has two GETs, not one
  const graphRows = routes.split('\n').filter((l) => /^\s*\[['"]\w+['"],.*\/graph(\\\/node)?\$/.test(l));
  assert.equal(graphRows.length, 2, 'exactly two routes mention the graph endpoint');
  assert.ok(graphRows.every((r) => /^\s*\['GET'/.test(r)), 'both graph routes are GETs');

  const app = await withTenant();
  try {
    const ledgerPath = join(app.tenantDir, 'progress', 'ledger.jsonl');
    const masteryPath = join(app.tenantDir, 'progress', 'mastery.yml');
    const todosPath = join(app.tenantDir, 'todos.md');
    const groupsPath = join(app.tenantDir, 'groups.yml');
    const before = {
      ledger: readFileSync(ledgerPath),
      mastery: readFileSync(masteryPath),
      todos: readFileSync(todosPath),
      groups: readFileSync(groupsPath),
    };

    const post = await api(app, 'POST', graphUrl, {});
    assert.equal(post.status, 404, 'there is no POST counterpart');

    const { status } = await readGraph(app);
    assert.equal(status, 200);

    assert.ok(readFileSync(ledgerPath).equals(before.ledger), 'GET /graph must never touch the ledger');
    assert.ok(readFileSync(masteryPath).equals(before.mastery), 'GET /graph must never touch mastery.yml');
    assert.ok(readFileSync(todosPath).equals(before.todos), 'GET /graph must never touch todos.md');
    assert.ok(readFileSync(groupsPath).equals(before.groups), 'GET /graph must never touch groups.yml');
  } finally {
    await app.close();
  }
});
