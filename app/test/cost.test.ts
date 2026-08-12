// Endpoint-level behavior for GET /api/v1/:tenant/cost (docs/specs/cost.md,
// "HTTP surface"). The handler reads the written snapshot only - it never
// scans, and every degraded read collapses to one 200 state so the page can
// tell the learner what command to run.
import { test, after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import { costSnapshotPath, writeCostSnapshot } from '../../lib/cost-io.ts';
import type { CostSnapshot } from '../../lib/cost.ts';

function fixtureSnapshot(tenant: string): CostSnapshot {
  return {
    schema_version: 1,
    type: 'cost',
    tenant,
    generated_at: '2026-08-12T09:00:00+10:00',
    prices_as_of: '2026-08-12',
    source: 'claude-code',
    source_label: 'Claude Code transcripts',
    totals: {
      attributed_usd: 11.5,
      shared_orchestration_usd: 4.2,
      courses_with_data: 1,
      courses_without_data: 1,
      transcripts_scanned: 2,
      requests: 30,
    },
    courses: [
      { course: 'hosting-and-deployment', dir: 'infrastructure/hosting-and-deployment', cost_usd: 11.5, transcripts: 1, requests: 20, scope: 'full' },
    ],
    no_data: [{ course: 'git-fundamentals', dir: 'foundations/git-fundamentals' }],
    shared_orchestration: {
      cost_usd: 4.2,
      transcripts: 1,
      requests: 10,
      courses: ['hosting-and-deployment'],
      transcript_ids: ['some-session.jsonl'],
    },
    limits: [
      'These are API-list-equivalent dollars over subscription usage, not a bill: nothing here was charged to you. Use them as relative weight between courses, never as an amount.',
      'Every figure is a floor. Only records still on this machine are counted, and any spend the cost source cannot see is missing from these numbers.',
    ],
  };
}

let app: TestApp;
before(async () => {
  app = await withTenant();
});
after(async () => app.close());

beforeEach(() => {
  const dir = join(app.tenantDir, 'cost');
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
});

test('a valid snapshot is returned intact with reason "ok"', async () => {
  const snapshot = fixtureSnapshot('example-learner');
  writeCostSnapshot(app.tenantDir, snapshot);

  const { status, json } = await api(app, 'GET', '/api/v1/example-learner/cost');
  assert.equal(status, 200);
  assert.equal(json.reason, 'ok');
  assert.equal(json.tenant, 'example-learner');
  assert.deepEqual(json.snapshot, snapshot);
  assert.equal(typeof json.how_to_generate, 'string');
  assert.ok((json.how_to_generate as string).includes('example-learner'));
});

test('no snapshot file yet is a normal 200, not an error', async () => {
  const { status, json } = await api(app, 'GET', '/api/v1/example-learner/cost');
  assert.equal(status, 200);
  assert.equal(json.reason, 'no-snapshot');
  assert.equal(json.snapshot, null);
  assert.ok((json.how_to_generate as string).includes('example-learner'));
});

test('invalid JSON in the snapshot file collapses to no-snapshot, never a 500', async () => {
  const path = costSnapshotPath(app.tenantDir);
  mkdirSync(join(app.tenantDir, 'cost'), { recursive: true });
  writeFileSync(path, '{ this is not json');

  const { status, json } = await api(app, 'GET', '/api/v1/example-learner/cost');
  assert.equal(status, 200);
  assert.equal(json.reason, 'no-snapshot');
  assert.equal(json.snapshot, null);
});

test('an unrecognised schema_version collapses to no-snapshot, never a 500', async () => {
  const snapshot = fixtureSnapshot('example-learner');
  writeCostSnapshot(app.tenantDir, { ...snapshot, schema_version: 2 as unknown as 1 });

  const { status, json } = await api(app, 'GET', '/api/v1/example-learner/cost');
  assert.equal(status, 200);
  assert.equal(json.reason, 'no-snapshot');
  assert.equal(json.snapshot, null);
});

test('an unknown tenant behaves like every other tenant route: 200, empty state', async () => {
  // No tenant directory named "no-such-tenant" exists under app.root. tree,
  // insights, and progress all answer 200 with an empty result for this case
  // (walkTenant / readLedgerEvents treat a missing directory as "nothing here"
  // rather than raising); cost follows the same convention, since
  // readCostSnapshot(tenantDir) returns null for a missing file exactly as it
  // would for any tenant with no snapshot yet.
  const { status, json } = await api(app, 'GET', '/api/v1/no-such-tenant/cost');
  assert.equal(status, 200);
  assert.equal(json.reason, 'no-snapshot');
  assert.equal(json.snapshot, null);
});

test('there is no POST sibling, and a GET never writes to progress/', async () => {
  const ledgerPath = join(app.tenantDir, 'progress', 'ledger.jsonl');
  const masteryPath = join(app.tenantDir, 'progress', 'mastery.yml');
  const ledgerBefore = readFileSync(ledgerPath);
  const masteryBefore = readFileSync(masteryPath);

  const post = await api(app, 'POST', '/api/v1/example-learner/cost', {});
  assert.equal(post.status, 404);

  await api(app, 'GET', '/api/v1/example-learner/cost');

  assert.ok(readFileSync(ledgerPath).equals(ledgerBefore), 'GET /cost must never touch the ledger');
  assert.ok(readFileSync(masteryPath).equals(masteryBefore), 'GET /cost must never touch mastery.yml');
});

test('the handler never scans: an empty CLAUDE_CONFIG_DIR does not change the answer', async () => {
  const snapshot = fixtureSnapshot('example-learner');
  writeCostSnapshot(app.tenantDir, snapshot);

  const emptyConfigDir = mkdtempSync(join(tmpdir(), 'meno-cost-empty-config-'));
  const prev = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = emptyConfigDir;
  try {
    const { status, json } = await api(app, 'GET', '/api/v1/example-learner/cost');
    assert.equal(status, 200);
    assert.equal(json.reason, 'ok');
    assert.deepEqual(json.snapshot, snapshot);
  } finally {
    if (prev === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prev;
    rmSync(emptyConfigDir, { recursive: true, force: true });
  }
});

test('the response never leaks a filesystem path outside the repo', async () => {
  writeCostSnapshot(app.tenantDir, fixtureSnapshot('example-learner'));
  const { json } = await api(app, 'GET', '/api/v1/example-learner/cost');
  const text = JSON.stringify(json);
  assert.ok(!text.includes(app.root), 'response leaked the temp content root path');
  assert.ok(!text.includes(tmpdir()), 'response leaked an absolute temp directory path');
});
