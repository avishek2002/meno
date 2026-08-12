// The Claude Code CostSource implementation (docs/specs/cost.md, "The Claude Code source").
// The only part of the cost subsystem that knows about a specific coding agent, and the only
// part that touches anything outside the repository. available() and collect() never throw.
import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { COURSE_PATH, NON_GROUP, type CostCollectResult, type CostCourseRef, type CostSource, type CostTranscript, type TokenPrices } from './cost.ts';

// USD per 1,000,000 tokens. Cache writes bill at 2x base input on a one-hour time to live and
// 1.25x on five minutes; cache reads at 0.1x. Re-check this table against the claude-api skill
// whenever a new model ships - PRICES_AS_OF is the date it was last checked.
export const PRICES_AS_OF = '2026-08-12';

const TIER_ORDER = ['fable', 'mythos', 'opus', 'sonnet', 'haiku'] as const;
type Tier = (typeof TIER_ORDER)[number];

const PRICES: Record<Tier, TokenPrices> = {
  fable: { input: 10.0, cache_write_1h: 20.0, cache_write_5m: 12.5, cache_read: 1.0, output: 50.0 },
  mythos: { input: 10.0, cache_write_1h: 20.0, cache_write_5m: 12.5, cache_read: 1.0, output: 50.0 },
  opus: { input: 5.0, cache_write_1h: 10.0, cache_write_5m: 6.25, cache_read: 0.5, output: 25.0 },
  sonnet: { input: 3.0, cache_write_1h: 6.0, cache_write_5m: 3.75, cache_read: 0.3, output: 15.0 },
  haiku: { input: 1.0, cache_write_1h: 2.0, cache_write_5m: 1.25, cache_read: 0.1, output: 5.0 },
};
const UNKNOWN_TIER: TokenPrices = PRICES.opus; // a new model reads as expensive, not free

function priceFor(model: string | undefined | null): TokenPrices {
  const name = (model ?? '').toLowerCase();
  for (const tier of TIER_ORDER) {
    if (name.includes(tier)) return PRICES[tier];
  }
  return UNKNOWN_TIER;
}

/** Exported for testing; not part of the CostSource contract. */
export function costOfUsage(model: string | undefined | null, usage: Record<string, unknown>): number {
  const creation = usage.cache_creation as Record<string, unknown> | null | undefined;
  const write1h = (creation?.ephemeral_1h_input_tokens as number | undefined) ?? 0;
  const write5m =
    creation != null
      ? ((creation.ephemeral_5m_input_tokens as number | undefined) ?? 0)
      : ((usage.cache_creation_input_tokens as number | undefined) ?? 0);
  const p = priceFor(model);
  const inputTokens = (usage.input_tokens as number | undefined) ?? 0;
  const cacheRead = (usage.cache_read_input_tokens as number | undefined) ?? 0;
  const outputTokens = (usage.output_tokens as number | undefined) ?? 0;
  return (
    (inputTokens * p.input +
      write1h * p.cache_write_1h +
      write5m * p.cache_write_5m +
      cacheRead * p.cache_read +
      outputTokens * p.output) /
    1e6
  );
}

const WRITE_TOOLS = new Set(['Write', 'Edit', 'NotebookEdit']);

function resolveRoot(): string {
  const raw = process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude');
  const expanded = raw === '~' || raw.startsWith('~/') ? join(homedir(), raw.slice(1)) : raw;
  return join(expanded, 'projects');
}

interface WalkStats {
  /** Directories that could not be listed, or entries whose type could not be determined. */
  skipped: number;
}

/**
 * Recursive *.jsonl walk written by hand rather than `readdirSync(root, { recursive: true })`:
 * that single call either returns everything or throws nothing at all, so one unreadable
 * subdirectory (a permissions error, a broken symlink) would turn a partial scan into a silent
 * whole-machine zero. Walking one directory at a time means an unreadable subtree is skipped, its
 * failure counted rather than swallowed (stats.skipped), and every readable sibling still
 * collected.
 */
function walkJsonl(root: string, stats: WalkStats, dir: string = root, out: string[] = []): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    stats.skipped++; // this directory could not be listed; keep whatever was already found
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let isDir: boolean;
    try {
      isDir = entry.isDirectory();
    } catch {
      stats.skipped++; // a Dirent whose type cannot be determined (a race, a broken symlink)
      continue;
    }
    if (isDir) {
      walkJsonl(root, stats, full, out);
    } else if (entry.name.endsWith('.jsonl')) {
      out.push(relative(root, full).split(sep).join('/'));
    }
  }
  return out;
}

/** <project>/<session>/subagents/agent-x.jsonl -> <project>/<session>.jsonl; else null. */
function parentIdOf(id: string): string | null {
  for (const marker of ['/subagents/', '/workflows/']) {
    const idx = id.indexOf(marker);
    if (idx !== -1) return id.slice(0, idx) + '.jsonl';
  }
  return null;
}

function scanTranscript(root: string, id: string): CostTranscript {
  const text = readFileSync(join(root, ...id.split('/')), 'utf8');
  const seen = new Set<string>();
  let cost = 0;
  const wroteByKey = new Map<string, CostCourseRef>();

  // candidateLines / parseFailures let a wholly-corrupt transcript be told apart from a genuinely
  // empty one: a line is only a "candidate" once it passes the usage/tool_use performance filter
  // below, so a file with no such lines at all (no evidence, legitimately) never counts as
  // unparseable, but a file where every candidate line fails JSON.parse (binary garbage, a
  // truncated write) does - and is reported as a skip, not a silent cost: 0 transcript.
  let candidateLines = 0;
  let parseFailures = 0;

  for (const line of text.split('\n')) {
    if (!line.includes('"usage"') && !line.includes('"tool_use"')) continue;
    candidateLines++;
    let row: unknown;
    try {
      row = JSON.parse(line);
    } catch {
      parseFailures++;
      continue;
    }
    if (!row || typeof row !== 'object') continue;
    const r = row as { message?: { usage?: Record<string, unknown>; model?: string; content?: unknown[] }; requestId?: string };
    const message = r.message ?? {};
    const usage = message.usage;
    const requestId = r.requestId;
    if (usage && requestId && !seen.has(requestId)) {
      seen.add(requestId);
      cost += costOfUsage(message.model, usage);
    }

    const content = Array.isArray(message.content) ? message.content : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as { type?: string; name?: string; input?: { file_path?: string } };
      if (b.type !== 'tool_use' || !b.name || !WRITE_TOOLS.has(b.name)) continue;
      const target = String(b.input?.file_path ?? '');
      const found = (target + '/').match(COURSE_PATH);
      if (found && !NON_GROUP.has(found[2])) {
        const dir = `${found[2]}/${found[3]}`;
        const ref: CostCourseRef = { tenant: found[1], course: found[3], dir };
        // keyed by (tenant, dir), not (tenant, course): two directories in different domains
        // can share a basename, and collapsing them here would silently drop one write
        wroteByKey.set(`${ref.tenant}/${ref.dir}`, ref);
      }
    }
  }

  // every candidate line failed to parse: this file could not be read as a transcript at all,
  // not a legitimately empty one - the caller (collect()) must count it as skipped, never as a
  // silent cost: 0, requests: 0 row
  if (candidateLines > 0 && parseFailures === candidateLines) {
    throw new Error(`transcript ${id} has ${candidateLines} candidate line(s), none of them parseable`);
  }

  const wrote = [...wroteByKey.values()].sort(
    (a, b) => a.tenant.localeCompare(b.tenant) || a.dir.localeCompare(b.dir),
  );
  return { id, parent_id: parentIdOf(id), cost_usd: cost, requests: seen.size, wrote };
}

export const claudeCodeSource: CostSource = {
  name: 'claude-code',
  label: 'Claude Code transcripts',
  prices_as_of: PRICES_AS_OF,

  available(): boolean {
    try {
      return existsSync(resolveRoot());
    } catch {
      return false;
    }
  },

  collect(): CostCollectResult {
    try {
      const root = resolveRoot();
      if (!existsSync(root)) return { transcripts: [], skipped: 0 };
      const stats: WalkStats = { skipped: 0 };
      const out: CostTranscript[] = [];
      for (const id of walkJsonl(root, stats)) {
        try {
          out.push(scanTranscript(root, id));
        } catch {
          stats.skipped++; // a malformed or unreadable transcript is skipped, not raised
        }
      }
      out.sort((a, b) => a.id.localeCompare(b.id));
      return { transcripts: out, skipped: stats.skipped };
    } catch {
      return { transcripts: [], skipped: 0 };
    }
  },
};
