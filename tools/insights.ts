// CLI over the same read path the app's GET /api/v1/:tenant/insights endpoint
// uses (lib/insights-io.ts's loader + lib/insights.ts's pure computeInsights) -
// one implementation, two callers. This is the command the study-insights
// skill runs to get its numbers (`npm run insights -- <tenant-dir> --json`);
// the skill quotes this output, it never computes a metric itself.
// Usage: node tools/insights.ts <tenant-dir> [--as-of YYYY-MM-DD] [--json]
import { loadInsightsInputs } from '../lib/insights-io.ts';
import { computeInsights, type InsightsReport, type Rate } from '../lib/insights.ts';

function localToday(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fmtRate(r: Rate): string {
  return r.value === null ? `not enough data (${r.n}/${r.of})` : `${Math.round(r.value * 100)}% (${r.n}/${r.of})`;
}

function summarize(r: InsightsReport): string {
  const lines: string[] = [];
  lines.push(`Insights as of ${r.as_of} (${r.basis.ledger_lines} ledger lines)`, '');

  lines.push('Sessions');
  lines.push(`  n=${r.sessions.n}, active days=${r.sessions.active_days}`);
  lines.push(`  last=${r.sessions.last ?? '-'} (${r.sessions.days_since_last ?? '-'} days ago)`);
  lines.push(`  median gap: ${r.sessions.median_gap_days ?? 'not enough data'}`, '');

  lines.push('Reviews');
  lines.push(`  overdue: ${r.reviews.overdue.length}`);
  lines.push(`  due coverage: ${fmtRate(r.reviews.due_coverage)}`);
  for (const o of r.reviews.overdue) lines.push(`    - ${o.course}/${o.concept}: due ${o.next_review} (${o.days_overdue}d overdue)`);
  lines.push('');

  lines.push('Gates');
  lines.push(`  outcomes: pass=${r.gates.outcomes.pass} fail=${r.gates.outcomes.fail} insufficient-evidence=${r.gates.outcomes['insufficient-evidence']}`);
  lines.push(`  override rate: ${fmtRate(r.gates.override_rate)}`);
  if (r.gates.unrepaid_overrides.length) {
    lines.push('  unrepaid overrides (weak concepts never re-proved after an override):');
    for (const u of r.gates.unrepaid_overrides) lines.push(`    - ${u.course}/${u.concept}: gated ${u.gate_ts}, reinject after ${u.reinject_after}`);
  }
  lines.push('');

  lines.push('Evidence');
  lines.push(`  transfer coverage: ${fmtRate(r.evidence.transfer_coverage)}`);
  if (r.evidence.recognition_only_concepts.length) lines.push(`  recognition-only concepts: ${r.evidence.recognition_only_concepts.join(', ')}`);
  for (const m of r.evidence.mastered_on_old_evidence) lines.push(`    - ${m.course}/${m.concept}: mastered on evidence ${m.days_since_transfer}d old`);
  for (const w of r.evidence.weak_concepts) lines.push(`    - ${w.course}/${w.concept}: shaky, first=${w.first_score} latest=${w.latest_score} n_transfer=${w.n_transfer}`);
  lines.push('');

  lines.push('Usage');
  lines.push(`  authored check usage: ${fmtRate(r.usage.check_usage)}`);
  lines.push(`  lessons never opened: ${r.usage.lessons_never_opened.length}`);
  const plannedTotal = r.usage.planned_debt.reduce((a, p) => a + p.planned, 0);
  lines.push(`  planned debt: ${plannedTotal} lesson(s) across ${r.usage.planned_debt.length} module(s)`);
  const s = r.usage.surface_mix;
  lines.push(`  surface mix: ui_recognition=${s.ui_recognition} agent_recognition=${s.agent_recognition} agent_transfer=${s.agent_transfer} reads=${s.reads}`);
  const t = r.usage.todos;
  const byKind = Object.entries(t.byKind).map(([k, n]) => `${k}=${n}`).join(' ');
  const byAudience = Object.entries(t.byAudience).map(([a, n]) => `${a}=${n}`).join(' ');
  lines.push(`  todos: ${byAudience} | ${byKind} | open=${t.open} done=${t.done}`, '');

  lines.push('Vault health');
  lines.push(`  orphaned notes: ${r.vault.orphaned_notes.length}`);
  const brokenTotal = r.vault.broken_links.reduce((a, b) => a + b.targets.length, 0);
  lines.push(`  broken links: ${brokenTotal} across ${r.vault.broken_links.length} file(s)`);
  lines.push(`  ambiguous basenames: ${r.vault.ambiguous_basenames.length}`);
  lines.push(`  referenced but untaught: ${r.vault.referenced_but_untaught.length}`, '');

  lines.push('Limits of this report');
  for (const l of r.limits) lines.push(`  - ${l}`);

  return lines.join('\n');
}

const args = process.argv.slice(2);
const tenantDir = args.find((a) => !a.startsWith('--'));
const asOfFlagIdx = args.indexOf('--as-of');
const asOf = asOfFlagIdx !== -1 ? args[asOfFlagIdx + 1] : localToday();
const wantJson = args.includes('--json');

if (!tenantDir) {
  console.error('usage: node tools/insights.ts <tenant-dir> [--as-of YYYY-MM-DD] [--json]');
  process.exit(1);
}

const { events, vault, todos, manifests } = loadInsightsInputs(tenantDir);
const report = computeInsights(events, vault, todos, manifests, asOf as string);

console.log(wantJson ? JSON.stringify(report, null, 2) : summarize(report));
