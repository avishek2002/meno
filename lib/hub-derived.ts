// The `meno:derived` bullet grammar - the sibling of `lib/connects.ts`, written
// to the same contract: pure over a markdown string, never throws, no
// filesystem, no clock. One grammar serves two levels of the vault: a course
// hub's derived block describes its lessons, and `home.md`'s own derived block
// describes its courses, in exactly the same bullet shape
// (vault-conventions.md, "Hub anatomy"). `lib/node-card.ts` is the only
// caller; nothing else needs this grammar.
//
// Unlike `parseConnects`, this file reports no diagnostics of its own. The
// architecture note in docs/specs/graph.md is explicit about why: an absent or
// unbalanced marker pair here is not a vault-content problem worth a line in
// `tools/validate.ts` the way a malformed `meno:connects` block is - a hub
// that has not been swept yet simply has no derived block, which is the
// ordinary state of a brand-new course, not damage. `lib/node-card.ts` is the
// one place close enough to a specific card to decide whether an EMPTY result
// deserves a warning (a present-but-malformed block does; an absent one does
// not), so it makes that call itself rather than this file guessing.
export const DERIVED_START = '<!-- meno:derived:start -->';
export const DERIVED_END = '<!-- meno:derived:end -->';

export interface DerivedBullet {
  /** Wikilink target, trimmed, unresolved - resolution is the caller's job. */
  target: string;
  /** The `|display text` half, trimmed, or null when the link had none. */
  display: string | null;
  /** The text after the " - " separator, trimmed. Never empty - an empty
   * description fails the bullet grammar and contributes no entry. */
  description: string;
  /** 1-based line number, within the markdown parsed. */
  line: number;
}

/**
 * The bullet grammar, exact and total - deliberately the same shape
 * `CONNECT_BULLET` (lib/connects.ts) uses, since both are "wikilink, then a
 * lone ` - `, then free text" and a second grammar for the same idea would be
 * a maintenance trap:
 *
 *   - [[target]] - description
 *   - [[target|display]] - description
 *
 * A module-heading line between groups - `**01 module title** (generated)` -
 * has no leading `-` and never matches; it is simply not a bullet, and is
 * skipped the same silent way prose or a blank line is.
 */
const DERIVED_BULLET = /^\s*-\s+\[\[([^\[\]|#]+)(?:\|([^\[\]]*))?\]\]\s+-\s+(\S.*)$/;

const COMMENT_ONLY_LINE = /^<!--.*-->$/;
const FENCED_CODE_BLOCK = /```[\s\S]*?```/g;

/** Blanks fenced code blocks in place, preserving every line break so 1-based
 * line numbers stay accurate - a hub's mermaid diagram must never be read as
 * bullet content, exactly as `lib/connects.ts` strips it before its own scan. */
function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(FENCED_CODE_BLOCK, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Parse a `meno:derived` block's bullets.
 *
 * - No marker at all, or markers that are not exactly one start before one
 *   end, yield `[]`. Never throws, and (unlike `parseConnects`) never reports
 *   why - see the file header for the reasoning.
 * - Inside a well-formed block: a blank line or an HTML-comment-only line is
 *   skipped silently; any other non-bullet line (a module heading, prose, a
 *   malformed bullet) is skipped silently too - this grammar has no error
 *   diagnostics to attach one to.
 * - Line endings are normalized first, matching `parseConnects`.
 */
export function parseDerivedBullets(markdown: string): DerivedBullet[] {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = stripFencedCodeBlocks(normalized).split('\n');

  let startIdx = -1;
  let startCount = 0;
  let endIdx = -1;
  let endCount = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(DERIVED_START)) {
      startCount++;
      if (startIdx === -1) startIdx = i;
    }
    if (lines[i].includes(DERIVED_END)) {
      endCount++;
      if (endIdx === -1) endIdx = i;
    }
  }
  if (startCount !== 1 || endCount !== 1 || startIdx >= endIdx) return [];

  const entries: DerivedBullet[] = [];
  for (let i = startIdx + 1; i < endIdx; i++) {
    const raw = lines[i];
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    if (COMMENT_ONLY_LINE.test(trimmed)) continue;

    const m = DERIVED_BULLET.exec(raw);
    if (!m) continue; // module heading, prose, or a malformed bullet - skip silently
    const target = m[1].trim();
    if (target === '') continue;

    entries.push({
      target,
      display: m[2] !== undefined ? m[2].trim() : null,
      description: m[3].trim(),
      line: i + 1,
    });
  }
  return entries;
}

/** The basename of a wikilink target or a vault path, with any `.md` suffix dropped. */
function basenameOf(pathOrTarget: string): string {
  const last = pathOrTarget.split('/').at(-1) ?? pathOrTarget;
  return last.endsWith('.md') ? last.slice(0, -3) : last;
}

/**
 * The description whose bullet target's basename (minus `.md`) equals
 * `targetBasename` - the first such bullet in document order, so a
 * duplicated target (not itself diagnosed, unlike `parseConnects`) resolves
 * deterministically. Basename comparison, not full-path or `vault.index`
 * resolution: every bullet this grammar ever writes already names its target
 * either as a bare basename (a hub's own lessons) or as a full vault path
 * whose basename is the file itself (`home.md`'s course bullets), so a
 * basename match is exact for every real bullet and never a false positive
 * within one course's own hub or within `home.md`.
 */
export function derivedDescriptionFor(markdown: string, targetBasename: string): string | null {
  for (const bullet of parseDerivedBullets(markdown)) {
    if (basenameOf(bullet.target) === targetBasename) return bullet.description;
  }
  return null;
}
