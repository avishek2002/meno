// tools/export.ts acceptance: redaction touches exactly rubric/reason and
// nothing else, output is deterministic for fixed input, and mastery.csv
// matches the shared deriveMastery implementation - never a second one.
// Runs against a throwaway copy of the example tenant; examples/ is never
// mutated (docs/integration-surface.md's export is read-only by contract).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLedger, deriveMastery } from '../../lib/mastery.ts';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const EXAMPLE = join(repoRoot, 'examples', 'example-learner');

function makeTenantCopy(work: string): string {
  const tenant = join(work, 'tenant');
  cpSync(EXAMPLE, tenant, { recursive: true });
  return tenant;
}

function runExport(tenant: string, extraArgs: string[]): string {
  return execFileSync('node', [join(repoRoot, 'tools', 'export.ts'), tenant, ...extraArgs], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function readJsonl(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => JSON.parse(l) as Record<string, unknown>);
}

test('--redact strips rubric and reason and nothing else (byte-diff of events minus those fields)', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-export-redact-'));
  const tenant = makeTenantCopy(work);

  const plainOut = join(work, 'plain');
  const redactedOut = join(work, 'redacted');
  runExport(tenant, ['--out', plainOut]);
  runExport(tenant, ['--redact', '--out', redactedOut]);

  const plain = readJsonl(join(plainOut, 'ledger.jsonl'));
  const redacted = readJsonl(join(redactedOut, 'ledger.jsonl'));
  assert.equal(plain.length, redacted.length);

  // sanity: the fixture actually carries both fields, or this test proves nothing
  assert.ok(plain.some((e) => 'rubric' in e), 'fixture has no rubric field to redact');
  assert.ok(plain.some((e) => 'reason' in e), 'fixture has no reason field to redact');

  for (let i = 0; i < plain.length; i++) {
    const stripped = { ...plain[i] };
    delete stripped.rubric;
    delete stripped.reason;
    assert.deepEqual(stripped, redacted[i], `event ${i} diverged beyond rubric/reason`);
    assert.equal('rubric' in redacted[i], false, `event ${i} still carries rubric`);
    assert.equal('reason' in redacted[i], false, `event ${i} still carries reason`);
  }

  rmSync(work, { recursive: true, force: true });
});

test('export is deterministic across two runs (order preserved)', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-export-determinism-'));
  const tenant = makeTenantCopy(work);

  const out1 = join(work, 'run1');
  const out2 = join(work, 'run2');
  runExport(tenant, ['--out', out1]);
  runExport(tenant, ['--out', out2]);

  for (const file of ['ledger.jsonl', 'mastery.csv', 'insights.json']) {
    const a = readFileSync(join(out1, file), 'utf8');
    const b = readFileSync(join(out2, file), 'utf8');
    assert.equal(a, b, `${file} differs across two runs of the same input`);
  }

  rmSync(work, { recursive: true, force: true });
});

test('CSV format writes ledger.csv with the documented flat columns', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-export-csv-'));
  const tenant = makeTenantCopy(work);
  const out = join(work, 'out');
  runExport(tenant, ['--format', 'csv', '--out', out]);

  assert.ok(existsSync(join(out, 'ledger.csv')));
  assert.ok(!existsSync(join(out, 'ledger.jsonl')));
  const csv = readFileSync(join(out, 'ledger.csv'), 'utf8');
  const [header, ...rows] = csv.trim().split('\n');
  assert.equal(header, 'v,ts,event,source,course,module,lesson,concepts,item,level,correct,score');
  assert.ok(rows.length > 0);

  rmSync(work, { recursive: true, force: true });
});

test('mastery.csv rows match deriveMastery output for the example tenant', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-export-mastery-'));
  const tenant = makeTenantCopy(work);
  const out = join(work, 'out');
  runExport(tenant, ['--out', out]);

  const { events } = parseLedger(readFileSync(join(tenant, 'progress', 'ledger.jsonl'), 'utf8'));
  const expected = deriveMastery(events);

  const csv = readFileSync(join(out, 'mastery.csv'), 'utf8');
  const [header, ...rows] = csv.trim().split('\n');
  assert.equal(header, 'course,concept,level,transfer_score,recognition_rate,n_transfer,next_review');

  let expectedRowCount = 0;
  for (const [course, c] of Object.entries(expected.courses)) {
    for (const [concept, st] of Object.entries(c.concepts)) {
      expectedRowCount++;
      const row = rows.find((r) => r.startsWith(`${course},${concept},`));
      assert.ok(row, `no mastery.csv row for ${course}/${concept}`);
      const fields = row!.split(',');
      assert.equal(fields[2], st.level);
      assert.equal(fields[3], st.transfer_score === null ? '' : String(st.transfer_score));
      assert.equal(fields[4], st.recognition_rate === null ? '' : String(st.recognition_rate));
      assert.equal(fields[5], String(st.n_transfer));
      assert.equal(fields[6], st.next_review === null ? '' : String(st.next_review));
    }
  }
  assert.equal(rows.length, expectedRowCount);

  rmSync(work, { recursive: true, force: true });
});

test('never mutates examples/ - the fixture ledger is untouched after export runs', () => {
  const before = readFileSync(join(EXAMPLE, 'progress', 'ledger.jsonl'), 'utf8');
  const work = mkdtempSync(join(tmpdir(), 'meno-export-purity-'));
  const tenant = makeTenantCopy(work);
  runExport(tenant, ['--redact', '--out', join(work, 'out')]);
  const after = readFileSync(join(EXAMPLE, 'progress', 'ledger.jsonl'), 'utf8');
  assert.equal(before, after);
  rmSync(work, { recursive: true, force: true });
});
