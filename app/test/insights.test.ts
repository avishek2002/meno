// Endpoint-level behavior for GET /api/v1/:tenant/insights: read-only, no write
// counterpart, and honest about the committed example tenant's one unrepaid
// override (docs/specs/insights.md).
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';

let app: TestApp;
before(async () => {
  app = await withTenant();
});
after(async () => app.close());

test('GET insights returns a report and leaves the ledger and mastery.yml byte-unchanged', async () => {
  const ledgerPath = join(app.tenantDir, 'progress', 'ledger.jsonl');
  const masteryPath = join(app.tenantDir, 'progress', 'mastery.yml');
  const ledgerBefore = readFileSync(ledgerPath);
  const masteryBefore = readFileSync(masteryPath);

  const { status, json } = await api(app, 'GET', '/api/v1/example-learner/insights');
  assert.equal(status, 200);
  assert.equal(typeof json.as_of, 'string');
  assert.ok(Array.isArray(json.notes), 'expected a notes: string[] field');
  assert.equal((json.basis as { ledger_lines: number }).ledger_lines, 12);

  const ledgerAfter = readFileSync(ledgerPath);
  const masteryAfter = readFileSync(masteryPath);
  assert.ok(ledgerBefore.equals(ledgerAfter), 'GET /insights must never touch the ledger');
  assert.ok(masteryBefore.equals(masteryAfter), 'GET /insights must never touch mastery.yml');
});

test('the example tenant\'s unrepaid override surfaces through the live endpoint', async () => {
  const { json } = await api(app, 'GET', '/api/v1/example-learner/insights');
  const gates = json.gates as { unrepaid_overrides: { course: string; concept: string; gate_ts: string; reinject_after: string }[] };
  assert.deepEqual(gates.unrepaid_overrides, [
    { course: 'rust-for-backend', concept: 'ownership', gate_ts: '2026-08-07T09:35:00+10:00', reinject_after: '2026-08-09' },
  ]);
});

test('there is no POST sibling for insights', async () => {
  const res = await api(app, 'POST', '/api/v1/example-learner/insights', {});
  assert.equal(res.status, 404);
});
