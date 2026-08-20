// The single lesson-parsing implementation: extraction of checks, callouts,
// headings, and wikilinks from a lesson body, plus the nine-part anatomy
// detectors. The app server, validate, and eval all import this - meno-check
// blocks and Transfer callouts are never parsed anywhere else.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import { parseFrontmatter } from './frontmatter.ts';
import type { LessonSection } from '../app/shared/types.ts';

export interface CheckBlock {
  id?: string;
  type?: string;
  concept?: string;
  prompt?: string;
  options?: string[];
  answer?: unknown;
  explain?: string;
  raw: string;
  line: number;
}

export interface Callout {
  type: string;
  title: string;
}

export interface ParsedLesson {
  frontmatter: Record<string, unknown> | null;
  body: string;
  headings: string[];
  /**
   * Depth-2 (`##`) headings only, in document order - the ones that are
   * anatomy-part or note-section candidates (docs/specs/notes.md). `headings`
   * above stays every depth, unchanged, because anatomyOf's `has()` predicate
   * reads it and that behavior must not change.
   */
  h2Headings: string[];
  checks: CheckBlock[];
  callouts: Callout[];
  transfers: Callout[];
  wikilinks: string[];
  warnings: string[];
}

const processor = unified().use(remarkParse).use(remarkFrontmatter).use(remarkGfm);

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
const CALLOUT_TITLE = /^\[!(\w+)\]\s*(.*)$/;

interface MdNode {
  type: string;
  depth?: number;
  lang?: string | null;
  value?: string;
  children?: MdNode[];
  position?: { start?: { line?: number } };
}

function textOf(node: MdNode): string {
  if (node.type === 'text' || node.type === 'inlineCode') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

export function parseLesson(text: string): ParsedLesson {
  const { frontmatter, body, warnings } = parseFrontmatter(text);
  const tree = processor.parse(text) as unknown as MdNode;
  const headings: string[] = [];
  const h2Headings: string[] = [];
  const checks: CheckBlock[] = [];
  const callouts: Callout[] = [];
  const wikilinks: string[] = [];

  visit(tree as never, (node: unknown) => {
    const n = node as MdNode;
    if (n.type === 'heading') {
      const text = textOf(n).trim();
      headings.push(text);
      if (n.depth === 2) h2Headings.push(text);
    } else if (n.type === 'code' && n.lang === 'meno-check') {
      const raw = n.value ?? '';
      const line = n.position?.start?.line ?? 0;
      try {
        const payload = parseYaml(raw);
        if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
          checks.push({ ...(payload as Record<string, unknown>), raw, line } as CheckBlock);
        } else {
          warnings.push(`meno-check at line ${line}: payload is not a YAML mapping`);
          checks.push({ raw, line });
        }
      } catch (e) {
        warnings.push(`meno-check at line ${line}: invalid YAML (${(e as Error).message})`);
        checks.push({ raw, line });
      }
    } else if (n.type === 'blockquote') {
      const first = textOf(n).trim().split('\n')[0] ?? '';
      const m = first.match(CALLOUT_TITLE);
      if (m) callouts.push({ type: m[1].toLowerCase(), title: m[2].trim() });
    } else if (n.type === 'text') {
      for (const m of (n.value ?? '').matchAll(WIKILINK)) wikilinks.push(m[1].trim());
    }
  });

  const transfers = callouts.filter((c) => /\bTransfer\b/.test(c.title));
  return { frontmatter, body, headings, h2Headings, checks, callouts, transfers, wikilinks, warnings };
}

export interface Anatomy {
  parts: Record<string, boolean>;
  score: number; // of 9
}

// docs/specs/notes.md, "Anchoring: anatomy part keys, never heading text" - the
// one place heading text and anatomy part key meet. Matched case-insensitively
// against the start of a heading's text, same predicate anatomyOf's has() uses
// below. Order is the order the table in that spec lists.
export const ANATOMY_HEADINGS: readonly (readonly [prefix: string, key: string])[] = [
  ['Before you start', '2-prerequisite-check'],
  ['The idea', '3-explanation'],
  ['Worked example', '4-worked-example'],
  ['Your turn', '5-faded-practice'],
  ['Recall', '7-retrieval-check'],
  ['Apply it somewhere new', '9-transfer-prompt'],
];

const startsWithCI = (text: string, prefix: string): boolean => text.toLowerCase().startsWith(prefix.toLowerCase());

// The first row whose prefix matches wins; a heading matching no row gets
// null and falls through to sectionKeyForHeading's slug form.
export function anatomyPartForHeading(text: string): string | null {
  const row = ANATOMY_HEADINGS.find(([prefix]) => startsWithCI(text, prefix));
  return row ? row[1] : null;
}

const MAX_SLUG_LENGTH = 48;

function slugify(text: string): string {
  const slug = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '') // strip combining marks left by NFKD
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, ''); // truncation can leave a trailing hyphen
  return slug === '' ? 'untitled' : slug;
}

// docs/specs/notes.md, the section-key derivation rules. The first heading
// matching an ANATOMY_HEADINGS row claims that key; a second heading matching
// the same row, and any heading matching no row, falls through to the
// h-<slug> form, deduplicated against `taken` (and against every key already
// assigned earlier in the same document, via the same set) with -2, -3, ...
export function sectionKeyForHeading(text: string, taken: ReadonlySet<string>): string {
  const part = anatomyPartForHeading(text);
  if (part && !taken.has(part)) return part;
  const base = `h-${slugify(text)}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

// whole-lesson first, then one section per heading in document order,
// deduplicating against ANATOMY_HEADINGS collisions and slug collisions alike
// (docs/specs/notes.md). 'whole-lesson' and 'whole-course' are reserved and
// never derived from a heading.
export function lessonSections(headings: string[]): LessonSection[] {
  const sections: LessonSection[] = [{ key: 'whole-lesson', title: 'Whole lesson', anatomy_part: null }];
  const taken = new Set<string>(['whole-lesson', 'whole-course']);
  for (const heading of headings) {
    const key = sectionKeyForHeading(heading, taken);
    taken.add(key);
    sections.push({ key, title: heading, anatomy_part: anatomyPartForHeading(heading) });
  }
  return sections;
}

// The nine-part anatomy, detected structurally (docs/specs/lessons.md owns the
// behavioral spec; lesson-format.md owns the section names). Parts 2, 3, 4, 5
// and 7's heading predicates read their prefixes out of ANATOMY_HEADINGS
// rather than repeating the literals; part 9 keeps its callout-based detector
// even though ANATOMY_HEADINGS also carries a 9-transfer-prompt row (that row
// is for section keys only, docs/specs/notes.md).
export function anatomyOf(lesson: ParsedLesson): Anatomy {
  const fm = lesson.frontmatter ?? {};
  const has = (h: string): boolean => lesson.headings.some((x) => x.toLowerCase().startsWith(h.toLowerCase()));
  const prefixFor = (key: string): string => {
    const row = ANATOMY_HEADINGS.find(([, k]) => k === key);
    if (!row) throw new Error(`no ANATOMY_HEADINGS row for "${key}"`);
    return row[0];
  };
  const parts: Record<string, boolean> = {
    '1-objective': /\*\*You'll be able to:\*\*/.test(lesson.body),
    '2-prerequisite-check': has(prefixFor('2-prerequisite-check')),
    '3-explanation': has(prefixFor('3-explanation')),
    '4-worked-example': has(prefixFor('4-worked-example')),
    '5-faded-practice': has(prefixFor('5-faded-practice')),
    '6-misconception-trap': lesson.callouts.some((c) => c.type === 'warning' && /common wrong model/i.test(c.title)),
    '7-retrieval-check': has(prefixFor('7-retrieval-check')) && lesson.checks.length > 0,
    '8-spaced-review-hook': Array.isArray(fm.review_offsets) && typeof fm.review_after === 'string',
    '9-transfer-prompt': lesson.transfers.length === 1,
  };
  return { parts, score: Object.values(parts).filter(Boolean).length };
}
