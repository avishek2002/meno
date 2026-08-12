// The one parser for a course hub's `meno:connects` block - the authored
// cross-course edges of the knowledge graph. `lib/graph.ts` builds connection
// edges from it and `tools/validate.ts` checks it; neither re-implements the
// grammar. Pure over a markdown string so it unit-tests with no disk, matching
// lib/vault.ts's design.
//
// Why prose bullets and not a YAML field: the vault is the truth, and a
// wikilink also renders in Obsidian's own graph, where a typed manifest field
// would fork Meno's graph from Obsidian's. The cost is that this is a parser
// over hand-written prose, which is why every failure below is reported rather
// than silently dropped - the validate gate is the mitigation.
//
// The convention itself (where the block sits in a hub, who writes it, when it
// is refreshed) is owned by
// .agents/skills/second-brain/references/vault-conventions.md. This file owns
// only the machine-checkable grammar.

/** The marker pair, exported so the skill, validate, and the tests share one literal. */
export const CONNECTS_START = '<!-- meno:connects:start -->';
export const CONNECTS_END = '<!-- meno:connects:end -->';

/**
 * The bullet grammar, exact and total. A line inside the block is well formed
 * when it matches, in order:
 *
 *   1. optional leading whitespace (an indented bullet in Obsidian is still a
 *      bullet), then `-` then at least one space;
 *   2. a wikilink `[[target]]` or `[[target|display]]`, where `target` is
 *      non-empty after trimming and contains none of `[`, `]`, `|`, `#` (a
 *      heading anchor is not a note, so `[[hub#section]]` is malformed);
 *   3. a separator of at least one space, a single `-`, at least one space;
 *   4. a reason of at least one non-whitespace character, taken verbatim to end
 *      of line and then trimmed.
 *
 * Canonical form, and what `second-brain` writes:
 *
 *   - [[git-fundamentals-hub|Git fundamentals]] - merging to the default branch is what triggers a redeploy
 *
 * Further wikilinks inside the reason are allowed and are not parsed here;
 * `buildVaultGraph` already sees them as ordinary reference links.
 */
export const CONNECT_BULLET = /^\s*-\s+\[\[([^\[\]|#]+)(?:\|([^\[\]]*))?\]\]\s+-\s+(\S.*)$/;

export interface ConnectsEntry {
  /** The raw wikilink target, trimmed and unresolved - resolution is the caller's job. */
  target: string;
  /** The `|display text` half, trimmed, or null when the link had none. */
  display: string | null;
  /** The one-line why, trimmed. Never empty (an empty reason is malformed). */
  reason: string;
  /** 1-based line number of the bullet within the markdown that was parsed. */
  line: number;
}

/**
 * One problem with the block. `level` is carried here rather than decided by
 * the caller so `tools/validate.ts` can map a diagnostic straight onto a
 * `Finding` without re-deciding severity.
 *
 * - error   a malformed line, or unbalanced/duplicated markers - the block does
 *           not say what it appears to say, and an edge is silently missing
 * - warning a duplicate target - the block is readable, one bullet is redundant
 */
export interface ConnectsDiagnostic {
  level: 'error' | 'warning';
  /** 1-based line number, or 0 for a diagnostic about the block as a whole. */
  line: number;
  /** The offending line verbatim (trailing whitespace stripped); '' for a block-level diagnostic. */
  text: string;
  message: string;
}

export interface ConnectsBlock {
  /** True when at least one marker was seen, even if the block turned out malformed. */
  present: boolean;
  /** Well-formed bullets, in document order. A malformed line contributes nothing. */
  entries: ConnectsEntry[];
  diagnostics: ConnectsDiagnostic[];
}

/**
 * Parse a hub note's `meno:connects` block.
 *
 * Block-level rules, applied before any line is read:
 *
 * - No marker at all is the normal state for a hub with no cross-course edges:
 *   `{ present: false, entries: [], diagnostics: [] }`. Never a diagnostic.
 * - The markers must appear exactly once each, start before end. Anything else
 *   (a start with no end, two starts, an end above its start) yields
 *   `present: true`, no entries, and one error diagnostic naming the counts.
 *   Refusing to guess is deliberate: a half-written block whose edges were read
 *   anyway is worse than one that is loudly ignored.
 * - Marker lines themselves are not content and are never diagnosed.
 *
 * Line rules, inside the block:
 *
 * - A blank line, or a line that is only an HTML comment, is ignored silently.
 * - Any other non-blank line must match `CONNECT_BULLET`. Anything else - a
 *   heading, prose, a bullet with no wikilink, a bullet with no ` - reason`
 *   separator, an empty reason, a target containing `#` - is one error
 *   diagnostic and contributes no entry. The `## Connects to` heading belongs
 *   ABOVE the start marker, exactly as a hub's `# Title` sits above
 *   `meno:derived:start`; a heading found inside the block is therefore
 *   malformed rather than tolerated.
 * - A target already seen in this block is one warning diagnostic; the first
 *   bullet keeps its entry and the repeat contributes none.
 *
 * Never throws. Line endings are normalized (`\r\n` and lone `\r` both become
 * `\n`) before splitting, so a hub saved with Windows line endings parses
 * exactly like one saved with Unix line endings - `CONNECT_BULLET`'s trailing
 * `(\S.*)$` cannot itself consume a stray `\r`, since JS `.` excludes it.
 *
 * Fenced code blocks ARE stripped before parsing, exactly like
 * `buildVaultGraph` strips them before wikilink extraction (lib/vault.ts): a
 * hub that documents the connects syntax with a live example inside a
 * ```` ``` ```` fence must not wire a phantom edge into the graph. Stripping
 * blanks the fenced content in place (each non-newline character becomes a
 * space) rather than deleting it, so line numbers reported in diagnostics
 * still point at the original source line.
 */
const COMMENT_ONLY_LINE = /^<!--.*-->$/;
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;

/** Blank fenced code blocks in place, preserving every line break so 1-based line numbers stay accurate. */
function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(FENCED_CODE_BLOCK, (m) => m.replace(/[^\n]/g, ' '));
}

export function parseConnects(markdown: string): ConnectsBlock {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = stripFencedCodeBlocks(normalized).split('\n');

  let startIdx = -1;
  let startCount = 0;
  let endIdx = -1;
  let endCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(CONNECTS_START)) {
      startCount++;
      if (startIdx === -1) startIdx = i;
    }
    if (lines[i].includes(CONNECTS_END)) {
      endCount++;
      if (endIdx === -1) endIdx = i;
    }
  }

  if (startCount === 0 && endCount === 0) {
    return { present: false, entries: [], diagnostics: [] };
  }
  if (startCount !== 1 || endCount !== 1 || startIdx >= endIdx) {
    return {
      present: true,
      entries: [],
      diagnostics: [
        {
          level: 'error',
          line: 0,
          text: '',
          message: `meno:connects markers malformed: ${startCount} start marker(s), ${endCount} end marker(s) found` +
            (startCount === 1 && endCount === 1 ? ' (end marker sits above the start marker)' : ''),
        },
      ],
    };
  }

  const entries: ConnectsEntry[] = [];
  const diagnostics: ConnectsDiagnostic[] = [];
  const seenTargets = new Set<string>();

  for (let i = startIdx + 1; i < endIdx; i++) {
    const raw = lines[i];
    const lineNo = i + 1;
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (COMMENT_ONLY_LINE.test(trimmed)) continue;

    const m = CONNECT_BULLET.exec(raw);
    const target = m ? m[1].trim() : '';
    if (!m || target === '') {
      diagnostics.push({
        level: 'error',
        line: lineNo,
        text: raw.replace(/\s+$/, ''),
        message: 'malformed connects bullet: expected "- [[target]] - reason" or "- [[target|display]] - reason"',
      });
      continue;
    }

    if (seenTargets.has(target)) {
      diagnostics.push({
        level: 'warning',
        line: lineNo,
        text: raw.replace(/\s+$/, ''),
        message: `duplicate connects target "${target}" - the first bullet was kept`,
      });
      continue;
    }
    seenTargets.add(target);

    entries.push({
      target,
      display: m[2] !== undefined ? m[2].trim() : null,
      reason: m[3].trim(),
      line: lineNo,
    });
  }

  return { present: true, entries, diagnostics };
}
