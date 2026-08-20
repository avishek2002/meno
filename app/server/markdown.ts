// The render pipeline: markdown in, sanitized HTML out, with the three meno
// syntaxes handled structurally (wikilinks, callouts, meno-check blocks).
// Extraction semantics live in lib/lesson.ts; this module only renders.
// Answers never reach HTML: check payloads are replaced by empty mount divs.
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit, SKIP } from 'unist-util-visit';
import { parse as parseYaml } from 'yaml';
import type { LessonSection } from '../shared/types.ts';

interface MdNode {
  type: string;
  value?: string;
  lang?: string | null;
  url?: string;
  tagName?: string;
  children?: MdNode[];
  properties?: Record<string, unknown>;
  data?: { hName?: string; hProperties?: Record<string, unknown> };
}

export interface RenderResult {
  html: string;
  links: { resolved: Record<string, string>; broken: string[] };
}

const WIKILINK = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const CALLOUT_TITLE = /^\[!(\w+)\]\s*(.*)$/;

const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [...(defaultSchema.tagNames ?? []), 'details', 'summary', 'div', 'span', 'section'],
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className', 'data*'],
  },
};

function transformWikilinks(tree: MdNode, index: Map<string, string | null>, links: RenderResult['links']): void {
  visit(tree as never, 'text', (node: unknown, i: number | undefined, parent: unknown) => {
    const n = node as MdNode;
    const p = parent as MdNode;
    if (i === undefined || !p?.children || !n.value || !WIKILINK.test(n.value)) return;
    WIKILINK.lastIndex = 0;
    const parts: MdNode[] = [];
    let last = 0;
    for (const m of n.value.matchAll(WIKILINK)) {
      if (m.index! > last) parts.push({ type: 'text', value: n.value.slice(last, m.index) });
      const target = m[1].trim();
      const display = (m[2] ?? target).trim() || target;
      const resolved = index.get(target) ?? null;
      if (resolved) {
        links.resolved[target] = resolved;
        parts.push({
          type: 'link',
          url: `#wiki:${resolved}`,
          data: { hProperties: { className: ['wikilink'] } },
          children: [{ type: 'text', value: display }],
        });
      } else {
        if (!links.broken.includes(target)) links.broken.push(target);
        parts.push({
          type: 'link',
          url: '#',
          data: { hName: 'span', hProperties: { className: ['wikilink', 'broken'] } },
          children: [{ type: 'text', value: display }],
        });
      }
      last = m.index! + m[0].length;
    }
    if (last < n.value.length) parts.push({ type: 'text', value: n.value.slice(last) });
    p.children.splice(i, 1, ...parts);
    return [SKIP, i + parts.length] as never;
  });
}

function transformCallouts(tree: MdNode): void {
  visit(tree as never, 'blockquote', (node: unknown) => {
    const n = node as MdNode;
    const firstPara = n.children?.[0];
    const firstText = firstPara?.children?.[0];
    if (firstText?.type !== 'text' || !firstText.value) return;
    const m = firstText.value.split('\n')[0].match(CALLOUT_TITLE);
    if (!m) return;
    const type = m[1].toLowerCase();
    const title = m[2].trim();
    firstText.value = firstText.value.replace(/^\[!\w+\]\s*/, '');
    const isTransfer = /\bTransfer\b/.test(title);
    n.data = {
      hName: 'div',
      hProperties: {
        className: ['callout', `callout-${type}`],
        ...(isTransfer ? { 'data-meno-level': 'transfer' } : {}),
      },
    };
  });
}

// Replace every meno-check fence with an empty mount div - the payload (and its
// answer) never reaches the HTML. The client renders interactively from the
// stripped checks[] payload the lesson endpoint returns alongside.
function transformChecks(tree: MdNode): void {
  visit(tree as never, 'code', (node: unknown, i: number | undefined, parent: unknown) => {
    const n = node as MdNode;
    const p = parent as MdNode;
    if (n.lang !== 'meno-check' || i === undefined || !p?.children) return;
    let id = '';
    try {
      const payload = parseYaml(n.value ?? '');
      if (payload && typeof payload === 'object') id = String((payload as Record<string, unknown>).id ?? '');
    } catch {
      // malformed payload renders as an inert placeholder - permissive rendering
    }
    p.children[i] = {
      type: 'paragraph',
      data: { hName: 'div', hProperties: { className: ['meno-check'], 'data-check-id': id } },
      children: [],
    };
  });
}

// docs/specs/notes.md, "Heading ids in rendered lesson HTML". Runs on the hast
// tree AFTER pipeline.runSync (rehype-sanitize has already run), never
// before: rehype-sanitize's default schema clobbers a pre-existing id with a
// `user-content-` prefix, so setting it here is the only way the id reaches
// the browser unprefixed. Only depth-2 (`##`, tagName 'h2') headings are
// touched; depths 1 and 3-6 are left alone.
//
// Section keys are never re-derived here. `sections` is the exact array the
// caller already computed once from the mdast tree (`lessonSections` over
// `parseLesson(...).h2Headings`, the same derivation LessonResponse.sections
// uses) and is threaded straight through - matched to the h2 elements by
// document order, not by re-reading heading text off the post-sanitize hast
// tree. A second, independent derivation from hast text would disagree with
// the mdast one whenever a heading contains something the render pipeline
// transforms - a wikilink resolved to its display text, for instance - so
// there must be only one derivation, not two that are supposed to agree.
function addSectionIds(hast: MdNode, sections: LessonSection[]): void {
  const h2s: MdNode[] = [];
  visit(hast as never, 'element', (node: unknown) => {
    const n = node as MdNode;
    if (n.tagName === 'h2') h2s.push(n);
  });
  const nonWhole = sections.filter((s) => s.key !== 'whole-lesson');
  h2s.forEach((n, i) => {
    const key = nonWhole[i]?.key;
    if (!key) return;
    n.properties = { ...n.properties, id: `sec-${key}`, 'data-meno-section': key };
  });
}

const pipeline = unified()
  .use(remarkParse)
  .use(remarkFrontmatter)
  .use(remarkGfm)
  .use(remarkRehype, { allowDangerousHtml: true })
  .use(rehypeRaw)
  .use(rehypeSanitize, sanitizeSchema as never)
  .use(rehypeStringify);

export function renderMarkdown(
  text: string,
  index: Map<string, string | null>,
  opts?: { sectionIds?: boolean; sections?: LessonSection[] },
): RenderResult {
  const links: RenderResult['links'] = { resolved: {}, broken: [] };
  const tree = pipeline.parse(text) as unknown as MdNode;
  transformChecks(tree);
  transformCallouts(tree);
  transformWikilinks(tree, index, links);
  const hast = pipeline.runSync(tree as never);
  if (opts?.sectionIds) addSectionIds(hast as unknown as MdNode, opts.sections ?? []);
  const html = String(pipeline.stringify(hast as never));
  return { html, links };
}
