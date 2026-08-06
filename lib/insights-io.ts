// Wiring: build computeInsights' four inputs (events, vault, todos, manifests)
// from a tenant directory on disk. One loader shared by the insights endpoint,
// the CLI, and validate's manifest walk - so "read a tenant tree for insights"
// exists exactly once, same rule as lib/vault.ts and lib/mastery.ts.
//
// Two dependency notes, since this file's imports look unusual for lib/:
//
// - Ledger reading is reimplemented here over lib/mastery.ts's parseLedger
//   rather than importing app/server/ledger.ts's readLedgerEvents. That file
//   also owns the UI write path (appendUiEvent, ajv validation, atomic writes)
//   - weight and risk a read-only loader has no reason to pull in. The read
//   side is three lines; duplicating those three lines is cheaper than adding
//   an app-server dependency for them.
// - parseTodos IS imported from app/server/todos.ts (a value import, not a
//   reimplementation of its line regexes - one implementation per AGENTS.md).
//   This is safe only because todos.ts has zero runtime imports of its own
//   (its one import of app/shared/types.ts is `import type`, erased before
//   Node ever sees it), so lib -> app/server/todos.ts is a one-way leaf edge:
//   nothing todos.ts pulls in imports anything back from lib/. No cycle.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { findCourseDirs } from './course-dirs.ts';
import { parseLedger, type LedgerEvent } from './mastery.ts';
import { loadVaultFiles, buildVaultGraph, type VaultGraph } from './vault.ts';
import { parseLesson } from './lesson.ts';
import type { ManifestInfo, TodoCounts } from './insights.ts';
import { parseTodos, TODO_KINDS, TODO_AUDIENCES } from '../app/server/todos.ts';

export function readInsightsLedger(tenantDir: string): LedgerEvent[] {
  const ledgerPath = join(tenantDir, 'progress', 'ledger.jsonl');
  if (!existsSync(ledgerPath)) return [];
  return parseLedger(readFileSync(ledgerPath, 'utf8')).events;
}

export function loadInsightsVault(tenantDir: string): VaultGraph {
  return buildVaultGraph(loadVaultFiles(tenantDir));
}

// Per-kind and per-audience open counts, done total, open total - open total
// counts every unfinished line regardless of tags (including the untyped ones
// TODO_LINE still parses), so it is not guaranteed to equal the sum of either
// record.
export function loadTodoCounts(tenantDir: string): TodoCounts {
  const file = join(tenantDir, 'todos.md');
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const all = parseTodos(raw).sections.flatMap((s) => s.todos);
  const byKind = Object.fromEntries(
    TODO_KINDS.map((k) => [k, all.filter((td) => td.type === k && !td.done).length]),
  ) as TodoCounts['byKind'];
  const byAudience = Object.fromEntries(
    TODO_AUDIENCES.map((a) => [a, all.filter((td) => td.audience === a && !td.done).length]),
  ) as TodoCounts['byAudience'];
  return {
    byKind,
    byAudience,
    done: all.filter((td) => td.done).length,
    open: all.filter((td) => !td.done).length,
  };
}

function tryYaml(file: string): Record<string, unknown> | null {
  try {
    const v = parseYaml(readFileSync(file, 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

// Walk course.yml / modules/*/module.yml like app/server/tree.ts does, but for
// each non-planned lesson also parse the lesson body (lib/lesson.ts) to collect
// its authored check ids, fully qualified as "<lesson frontmatter id>#<check
// id>" - the shape usage.check_usage in lib/insights.ts needs to compare
// against ledger `item` values, which are qualified the same way.
export function loadManifests(tenantDir: string): ManifestInfo[] {
  const out: ManifestInfo[] = [];
  if (!existsSync(tenantDir)) return out;

  for (const entry of findCourseDirs(tenantDir)) {
    const courseDir = join(tenantDir, entry);
    const courseFile = join(courseDir, 'course.yml');
    const course = tryYaml(courseFile);
    if (!course) continue;
    const courseSlug = String(course.slug ?? entry.split('/').at(-1));

    const modulesDir = join(courseDir, 'modules');
    if (!existsSync(modulesDir)) continue;
    for (const modEntry of readdirSync(modulesDir).sort()) {
      const modFile = join(modulesDir, modEntry, 'module.yml');
      if (!existsSync(modFile)) continue;
      const mod = tryYaml(modFile);
      if (!mod) continue;
      const moduleSlug = String(mod.module ?? modEntry);

      const lessons = ((mod.lessons as { file?: string; status?: string }[]) ?? []).map((l) => ({
        file: String(l.file ?? ''),
        status: String(l.status ?? 'planned'),
      }));

      const checkIds: string[] = [];
      for (const l of lessons) {
        if (l.status === 'planned' || !l.file) continue;
        const lessonPath = join(modulesDir, modEntry, l.file);
        if (!existsSync(lessonPath)) continue; // refs check reports missing files; insights just skips
        const parsed = parseLesson(readFileSync(lessonPath, 'utf8'));
        const lessonId = parsed.frontmatter?.id as string | undefined;
        if (!lessonId) continue;
        for (const c of parsed.checks) {
          if (c.id) checkIds.push(`${lessonId}#${c.id}`);
        }
      }

      out.push({
        course: courseSlug,
        moduleSlug,
        lessons,
        checkIds,
        concepts: ((mod.concepts as string[]) ?? []).map(String),
      });
    }
  }
  return out;
}

export interface InsightsInputs {
  events: LedgerEvent[];
  vault: VaultGraph;
  todos: TodoCounts;
  manifests: ManifestInfo[];
}

// The one-stop loader the endpoint and the CLI both call: everything
// computeInsights needs from a tenant dir, except `asOf` (a parameter on
// purpose - lib/insights.ts is pure and never reads the clock).
export function loadInsightsInputs(tenantDir: string): InsightsInputs {
  return {
    events: readInsightsLedger(tenantDir),
    vault: loadInsightsVault(tenantDir),
    todos: loadTodoCounts(tenantDir),
    manifests: loadManifests(tenantDir),
  };
}
