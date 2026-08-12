// The filesystem edges of the cost subsystem, kept out of the pure computeCost
// (docs/specs/cost.md). tools/cost.ts is the only writer; GET /api/v1/:tenant/cost
// reads through readCostSnapshot and never scans.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeFileAtomic } from '../app/server/atomic.ts';
import { findCourseDirs } from './course-dirs.ts';
import { computeCost, type CostSnapshot, type CostSource, type CostTranscript } from './cost.ts';
import { selectCostSource } from './cost-sources.ts';

/** Vault-relative path of the snapshot. */
export const COST_SNAPSHOT_REL = 'cost/snapshot.json';

/** Absolute path of a tenant's snapshot. */
export function costSnapshotPath(tenantDir: string): string {
  return join(tenantDir, ...COST_SNAPSHOT_REL.split('/'));
}

/**
 * Read and shallow-validate a tenant's snapshot. Returns null for a missing file, unreadable
 * file, invalid JSON, a non-object, a missing or unrecognised schema_version, or a type other
 * than "cost". Never throws.
 */
export function readCostSnapshot(tenantDir: string): CostSnapshot | null {
  const path = costSnapshotPath(tenantDir);
  if (!existsSync(path)) return null;
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;
  if (obj.type !== 'cost') return null;
  return obj as unknown as CostSnapshot;
}

/** Write a snapshot atomically, creating cost/ if needed. */
export function writeCostSnapshot(tenantDir: string, snapshot: CostSnapshot): void {
  const path = costSnapshotPath(tenantDir);
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify(snapshot, null, 2) + '\n');
}

/** Scan the selected source and compute a snapshot for one tenant. The CLI's whole body. */
export function buildCostSnapshot(
  tenantDir: string,
  tenant: string,
  generatedAt: string,
  source: CostSource | null = selectCostSource(),
): CostSnapshot {
  const courseDirs = findCourseDirs(tenantDir);
  let transcripts: CostTranscript[] = [];
  let skipped = 0;
  if (source) {
    try {
      const result = source.collect();
      transcripts = result.transcripts;
      skipped = result.skipped;
    } catch {
      transcripts = [];
      skipped = 0;
    }
  }
  return computeCost(transcripts, courseDirs, {
    tenant,
    source: source?.name ?? null,
    source_label: source?.label ?? null,
    prices_as_of: source?.prices_as_of ?? '',
    generated_at: generatedAt,
    skipped,
  });
}
