// CLI over the workspace-scan subsystem (docs/specs/subject-finder.md) - the only caller that
// reads the clock, and the only writer of content/tenants/<tenant>/workspace/YYYY-MM-DD-scan.json
// and the ephemeral doc-body bundle. Two modes, matching the consent flow the find-subjects
// skill drives:
//
//   node tools/scan.ts <tenant-dir> --enumerate [path...] [--json]
//     lists candidate roots (the immediate child directories of each given path, defaulting to
//     $HOME) with recursive file counts, and opens no file content at all.
//
//   node tools/scan.ts <tenant-dir> --read [label-or-path...] [--as-of YYYY-MM-DD] [--json] [--no-write]
//     scans the roots recorded in workspace/roots.yml (or just the given subset, each of which
//     must already be approved), refusing outright - zero files opened - when a requested root
//     is absent from roots.yml, and skipping (pending_approval, not scanned) any approved root
//     whose immediate children drifted since approval. Writes
//     content/tenants/<tenant>/workspace/YYYY-MM-DD-scan.json by default - a scan whose result
//     is never persisted has nothing for basis.scan_sha256 to hash and nothing for find-subjects
//     to embed. Pass --no-write to inspect a scan without persisting it.
//
// Usage: node tools/scan.ts <tenant-dir> [--enumerate|--read] [--as-of YYYY-MM-DD] [--json] [--no-write] [selector...]
import { homedir } from 'node:os';
import { checkRootDrift, cleanupStaleDocBundles, collectWorkspace, enumerateRoots, gitCli, loadApprovedRoots, writeDocBundle, writeScanSnapshot, type ApprovedRoot } from '../lib/workspace-scan-io.ts';
import { buildDocBundle, computeWorkspaceScan, DEFAULT_BUDGETS, type WorkspaceScanSnapshot } from '../lib/workspace-scan.ts';

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

function localToday(): string {
  return localNow().slice(0, 10);
}

// Printed before any read, in every mode, mirroring tools/cost.ts's SCAN_NOTICE - a stranger
// who clones this public repo deserves to know what a command reads before it runs it.
const ENUMERATE_NOTICE = 'enumerate lists directory names and file counts only. No file content is opened.';
const READ_NOTICE =
  'read scans only roots recorded in workspace/roots.yml. A root absent from that file, or ' +
  'whose immediate children changed since approval, is refused rather than scanned.';

function summarizeEnumerate(candidates: { name: string; file_count: number; truncated: boolean }[]): string {
  if (candidates.length === 0) return '(no candidate directories found)';
  const lines = candidates.map((c) => `  ${c.name.padEnd(40)}${String(c.file_count).padStart(8)} files${c.truncated ? '  (truncated)' : ''}`);
  return lines.join('\n');
}

function summarizeSnapshot(s: WorkspaceScanSnapshot): string {
  const lines: string[] = [];
  lines.push(`workspace scan as of ${s.as_of} (generated ${s.generated_at})`);
  lines.push(`${s.aggregate.total_roots} root(s), ${s.aggregate.total_repos} repo(s)`);
  lines.push('');
  for (const root of s.roots) {
    const statusSuffix = root.status === 'ok' ? '' : `  [${root.status}]`;
    lines.push(`root ${root.label}: ${root.repos_found} repo(s)${statusSuffix}`);
    if (root.pending_approval.length) lines.push(`  pending approval: ${root.pending_approval.join(', ')}`);
  }
  lines.push('');
  for (const repo of s.repos) {
    lines.push(`  ${repo.root_label}/${repo.name} (depth ${repo.depth}): ${repo.commits_90d} commits in 90d, ${repo.files_walked} files, ${repo.docs.length} doc(s)`);
  }
  if (s.truncation.events.length) {
    lines.push('', 'truncation:');
    for (const ev of s.truncation.events) lines.push(`  ${ev.cap} at ${ev.scope}: at least ${ev.at_least} (limit ${ev.limit})`);
  }
  lines.push('', 'Limits of this scan');
  for (const l of s.limits) lines.push(`  - ${l}`);
  return lines.join('\n');
}

const args = process.argv.slice(2);
const asOfIdx = args.indexOf('--as-of');
const asOf = asOfIdx !== -1 ? args[asOfIdx + 1] : localToday();

// Manual positional scan rather than a plain filter: --as-of consumes the argument after it, so
// a filter alone would misread its value ("2026-08-12") as a positional selector.
const positional: string[] = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a.startsWith('--')) {
    if (a === '--as-of') i++; // skip its value
    continue;
  }
  positional.push(a);
}
const tenantDir = positional[0];
const selectors = positional.slice(1);
const wantJson = args.includes('--json');
const wantWrite = !args.includes('--no-write');
const mode: 'enumerate' | 'read' | null = args.includes('--enumerate') ? 'enumerate' : args.includes('--read') ? 'read' : null;

if (!tenantDir || !mode) {
  console.error('usage: node tools/scan.ts <tenant-dir> [--enumerate|--read] [--as-of YYYY-MM-DD] [--json] [--no-write] [selector...]');
  process.exit(1);
}

if (mode === 'enumerate') {
  console.error(ENUMERATE_NOTICE);
  const bases = selectors.length ? selectors : [homedir()];
  const candidates = enumerateRoots(bases, DEFAULT_BUDGETS);
  console.log(wantJson ? JSON.stringify(candidates, null, 2) : summarizeEnumerate(candidates));
  process.exit(0);
}

// --read
console.error(READ_NOTICE);

// Self-heals a bundle an earlier run left behind on abort (docs/specs/subject-finder.md,
// Limits): a bundle is only ever deleted by the find-subjects skill's own cleanup step, so a run
// that aborted between writing one and that step runs never got it removed. Done before
// anything else in --read, not only right before this run writes its own bundle, so the cleanup
// still happens even if this run itself refuses to scan (an unapproved root, for instance).
const removedBundles = cleanupStaleDocBundles();
if (removedBundles.length > 0) console.error(`cleaned up ${removedBundles.length} stale doc bundle(s) left by a previous run`);

const { roots: approved, errors } = loadApprovedRoots(tenantDir);
if (errors.length > 0) {
  // Every consent-record problem is reported, not just a total failure to load.
  // A malformed or duplicate-label entry means a root the user believed they had
  // approved is silently absent from the scan - and on a subsystem whose entire
  // design rests on the consent record being what was consented to, quietly
  // dropping part of it is the worst available behaviour. Refuse instead: the
  // user fixes roots.yml and reruns, having had zero workspace files opened.
  console.error(errors.join('\n'));
  console.error(
    approved.length === 0
      ? 'no usable roots in workspace/roots.yml - nothing scanned'
      : `refusing to scan a partially-loaded consent record (${approved.length} root(s) would have been scanned, and at least one entry was dropped)`,
  );
  process.exit(1);
}

let targets: ApprovedRoot[] = approved;
if (selectors.length > 0) {
  const matched: ApprovedRoot[] = [];
  const missing: string[] = [];
  for (const sel of selectors) {
    const found = approved.find((r) => r.label === sel || r.path === sel);
    if (found) matched.push(found);
    else missing.push(sel);
  }
  if (missing.length > 0) {
    // absent from roots.yml (spec invariant 5): refuse the whole invocation before any
    // workspace directory is even listed, let alone a file opened
    console.error(`root(s) not found in workspace/roots.yml: ${missing.join(', ')}`);
    process.exit(1);
  }
  targets = matched;
}

const obs = collectWorkspace(targets, DEFAULT_BUDGETS, gitCli);
const snapshot = computeWorkspaceScan(obs, { generated_at: localNow(), as_of: asOf as string, budgets: DEFAULT_BUDGETS, scanner_version: 1 });

// Writes by default: --write was never documented anywhere find-subjects tells an agent to run
// this command, so the default has to be the useful one. --no-write is the escape for inspecting
// a scan without persisting it.
if (wantWrite) {
  const snapshotPath = writeScanSnapshot(tenantDir, snapshot);
  console.error(`wrote ${snapshotPath}`);
}

const bundle = buildDocBundle(obs);
if (bundle.length > 0) {
  const bundlePath = writeDocBundle(bundle);
  console.error(`doc bundle (ephemeral, delete when done): ${bundlePath}`);
}

console.log(wantJson ? JSON.stringify(snapshot, null, 2) : summarizeSnapshot(snapshot));

const drifted = targets.filter((r) => checkRootDrift(r).pending_approval.length > 0);
if (drifted.length > 0) {
  console.error(`${drifted.length} root(s) have children pending approval; re-approve them in workspace/roots.yml to scan the new directories.`);
  process.exit(1);
}
