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
  const checks: CheckBlock[] = [];
  const callouts: Callout[] = [];
  const wikilinks: string[] = [];

  visit(tree as never, (node: unknown) => {
    const n = node as MdNode;
    if (n.type === 'heading') {
      headings.push(textOf(n).trim());
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
  return { frontmatter, body, headings, checks, callouts, transfers, wikilinks, warnings };
}

export interface Anatomy {
  parts: Record<string, boolean>;
  score: number; // of 9
}

// The nine-part anatomy, detected structurally (docs/specs/lessons.md owns the
// behavioral spec; lesson-format.md owns the section names).
export function anatomyOf(lesson: ParsedLesson): Anatomy {
  const fm = lesson.frontmatter ?? {};
  const has = (h: string): boolean => lesson.headings.some((x) => x.toLowerCase().startsWith(h.toLowerCase()));
  const parts: Record<string, boolean> = {
    '1-objective': /\*\*You'll be able to:\*\*/.test(lesson.body),
    '2-prerequisite-check': has('Before you start'),
    '3-explanation': has('The idea'),
    '4-worked-example': has('Worked example'),
    '5-faded-practice': has('Your turn'),
    '6-misconception-trap': lesson.callouts.some((c) => c.type === 'warning' && /common wrong model/i.test(c.title)),
    '7-retrieval-check': has('Recall') && lesson.checks.length > 0,
    '8-spaced-review-hook': Array.isArray(fm.review_offsets) && typeof fm.review_after === 'string',
    '9-transfer-prompt': lesson.transfers.length === 1,
  };
  return { parts, score: Object.values(parts).filter(Boolean).length };
}
