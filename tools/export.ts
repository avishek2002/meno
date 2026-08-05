// Export a tenant's progress data for an in-house system to build against
// (docs/integration-surface.md) - the learner runs this by hand; nothing here
// pushes anywhere on its own. Three files land in --out: the ledger (as-is
// JSONL, or a flat CSV), mastery.csv (derived live via deriveMastery - never
// read from mastery.yml on disk, same "derive, don't trust the cache" rule
// lib/mastery.ts and the app both follow), and insights.json (a computeInsights
// snapshot, same loader tools/insights.ts uses).
//
// --redact strips `rubric` and `reason` - the only two ledger fields anywhere
// that carry a learner's own words - and nothing else. This is the honest
// alternative to progress telemetry named in docs/org-deployment.md's
// load-bearing refusal: an org gets a stable format, the learner decides what
// leaves their machine and when.
//
// Usage: node tools/export.ts <tenant-dir> [--format jsonl|csv] [--redact] [--out <dir>]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseLedger, deriveMastery, type LedgerEvent, type Mastery } from '../lib/mastery.ts';
import { loadInsightsInputs } from '../lib/insights-io.ts';
import { computeInsights } from '../lib/insights.ts';

function localToday(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function csvField(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function redactEvent(e: LedgerEvent): LedgerEvent {
  const { rubric: _rubric, reason: _reason, ...rest } = e as LedgerEvent & { rubric?: string; reason?: string };
  return rest as LedgerEvent;
}

const LEDGER_CSV_COLUMNS = ['v', 'ts', 'event', 'source', 'course', 'module', 'lesson', 'concepts', 'item', 'level', 'correct', 'score'];

function ledgerToCsv(events: LedgerEvent[]): string {
  const lines = [LEDGER_CSV_COLUMNS.join(',')];
  for (const e of events) {
    const concepts = Array.isArray(e.concepts) ? (e.concepts as string[]).join('|') : '';
    lines.push(
      [e.v, e.ts, e.event, e.source, e.course, e.module ?? '', e.lesson ?? '', concepts, e.item ?? '', e.level ?? '', e.correct ?? '', e.score ?? '']
        .map(csvField)
        .join(','),
    );
  }
  return lines.join('\n') + '\n';
}

function ledgerToJsonl(events: LedgerEvent[]): string {
  return events.map((e) => JSON.stringify(e)).join('\n') + '\n';
}

function masteryToCsv(mastery: Mastery): string {
  const lines = ['course,concept,level,transfer_score,recognition_rate,n_transfer,next_review'];
  for (const [course, c] of Object.entries(mastery.courses)) {
    for (const [concept, st] of Object.entries(c.concepts)) {
      lines.push(
        [course, concept, st.level, st.transfer_score ?? '', st.recognition_rate ?? '', st.n_transfer, st.next_review ?? '']
          .map(csvField)
          .join(','),
      );
    }
  }
  return lines.join('\n') + '\n';
}

const args = process.argv.slice(2);
const tenantDir = args.find((a) => !a.startsWith('--'));
const formatIdx = args.indexOf('--format');
const format = formatIdx !== -1 ? args[formatIdx + 1] : 'jsonl';
const redact = args.includes('--redact');
const outIdx = args.indexOf('--out');

if (!tenantDir || (format !== 'jsonl' && format !== 'csv')) {
  console.error('usage: node tools/export.ts <tenant-dir> [--format jsonl|csv] [--redact] [--out <dir>]');
  process.exit(1);
}

const ledgerPath = join(tenantDir, 'progress', 'ledger.jsonl');
if (!existsSync(ledgerPath)) {
  console.error(`no ledger at ${ledgerPath}`);
  process.exit(1);
}
const outDir = outIdx !== -1 ? args[outIdx + 1] : join(tenantDir, 'export');
mkdirSync(outDir, { recursive: true });

const { events, warnings } = parseLedger(readFileSync(ledgerPath, 'utf8'));
for (const w of warnings) console.error(`warning: ${w}`);
const exportedEvents = redact ? events.map(redactEvent) : events;

const ledgerOut = join(outDir, format === 'csv' ? 'ledger.csv' : 'ledger.jsonl');
writeFileSync(ledgerOut, format === 'csv' ? ledgerToCsv(exportedEvents) : ledgerToJsonl(exportedEvents));

const masteryOut = join(outDir, 'mastery.csv');
writeFileSync(masteryOut, masteryToCsv(deriveMastery(events)));

const inputs = loadInsightsInputs(tenantDir);
const insights = computeInsights(inputs.events, inputs.vault, inputs.todos, inputs.manifests, localToday());
const insightsOut = join(outDir, 'insights.json');
writeFileSync(insightsOut, JSON.stringify(insights, null, 2));

console.log(`exported ${events.length} event(s) to ${outDir} (${ledgerOut}, ${masteryOut}, ${insightsOut})${redact ? ' [redacted]' : ''}`);
