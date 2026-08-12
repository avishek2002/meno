// CLI over the cost subsystem: scans the selected cost source, computes the pure snapshot
// (lib/cost.ts), and prints it or writes it to the tenant vault. This is the ONLY writer of
// content/tenants/<tenant>/cost/snapshot.json - GET /api/v1/:tenant/cost only reads what this
// produced (docs/specs/cost.md).
// Usage: node tools/cost.ts <tenant-dir> [--json] [--write]
import { basename, resolve } from 'node:path';
import { buildCostSnapshot, writeCostSnapshot } from '../lib/cost-io.ts';
import type { CostSnapshot } from '../lib/cost.ts';

function localNow(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const offsetMin = -d.getTimezoneOffset();
  const sign = offsetMin >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMin);
  const offset = `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`
  );
}

function summarize(s: CostSnapshot): string {
  const lines: string[] = [];
  lines.push(`cost for ${s.tenant}, generated ${s.generated_at}`);
  lines.push(
    s.source ? `source: ${s.source_label} (prices as of ${s.prices_as_of})` : 'source: none available on this machine',
  );
  lines.push(
    `transcripts with evidence for this tenant: ${s.totals.transcripts_scanned} (${s.totals.requests} requests)`,
  );
  lines.push('');
  lines.push(`${'course'.padEnd(38)}${'cost'.padStart(9)}  ${'transcripts'.padStart(11)}  scope`);
  for (const c of s.courses) {
    lines.push(`${c.course.padEnd(38)}${c.cost_usd.toFixed(2).padStart(9)}  ${String(c.transcripts).padStart(11)}  ${c.scope}`);
  }
  lines.push('', `${'TOTAL'.padEnd(38)}${s.totals.attributed_usd.toFixed(2).padStart(9)}`);
  lines.push('');
  lines.push(`shared orchestration: ${s.shared_orchestration.cost_usd.toFixed(2)} covering ${s.shared_orchestration.courses.length} course(s)`);
  for (const id of s.shared_orchestration.transcript_ids) lines.push(`    ${id}`);
  if (s.no_data.length) {
    // dir, not just course, so two directories that happen to share a basename read as two
    // distinct entries rather than an unexplained repeat
    lines.push('', `no data (evidence-free courses): ${s.no_data.map((n) => n.dir).join(', ')}`);
  }
  lines.push('', 'Limits of this page');
  for (const l of s.limits) lines.push(`  - ${l}`);
  return lines.join('\n');
}

// Printed to stderr, before the scan, in every mode (including --json, so the JSON on stdout
// stays parseable) - a stranger who clones this public repo and runs this command deserves to
// know what it reads before it reads it, not after, and not only from a 700-line internal spec.
const SCAN_NOTICE =
  'cost scans every *.jsonl session transcript under $CLAUDE_CONFIG_DIR/projects/ (or ' +
  '~/.claude/projects/ by default) - your whole session history across every project on this ' +
  'machine, not only this tenant. Nothing leaves this machine or gets uploaded; only aggregate ' +
  'dollar figures, counts, and transcript ids are ever written to the snapshot.';

const args = process.argv.slice(2);
const tenantDir = args.find((a) => !a.startsWith('--'));
const wantJson = args.includes('--json');
const wantWrite = args.includes('--write');

if (!tenantDir) {
  console.error('usage: node tools/cost.ts <tenant-dir> [--json] [--write]');
  process.exit(1);
}

console.error(SCAN_NOTICE);

const tenant = basename(resolve(tenantDir));
const snapshot = buildCostSnapshot(tenantDir, tenant, localNow());

if (wantWrite) writeCostSnapshot(tenantDir, snapshot);
console.log(wantJson ? JSON.stringify(snapshot, null, 2) : summarize(snapshot));
