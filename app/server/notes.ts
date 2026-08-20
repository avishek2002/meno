// Personal notes file: parse, serialize, and upsert (docs/specs/notes.md).
// A note block is an HTML-comment-delimited region inside otherwise ordinary
// markdown a learner edits by hand in Obsidian. Parse is a single scan
// producing an ordered list of regions - text (raw bytes, preserved
// verbatim) or block (marker attributes plus body) - and serialize is just
// their concatenation, so round-trip is exact by construction and an edit
// changes only the bytes between one block's markers.
import type { CourseNoteBlock, NotePage } from '../shared/types.ts';
import { ANATOMY_HEADINGS } from '../../lib/lesson.ts';

const OPEN_ATTR = /^([a-z]+)=([A-Za-z0-9._/-]+)$/;
const OPEN_LINE = /^<!-- meno:note((?: [a-zA-Z]+=[A-Za-z0-9._/-]+)+) -->$/;
const CLOSE_LINE = '<!-- /meno:note -->';
const KNOWN_KEYS = ['page', 'lesson', 'section'] as const;

interface TextRegion {
  kind: 'text';
  raw: string;
}

interface BlockRegion {
  kind: 'block';
  open: string; // raw open marker line, own line ending included
  bodyLines: string[]; // raw body lines, each with its own line ending
  close: string; // raw close marker line, own line ending included
  page: NotePage;
  module: string | null;
  lesson: string | null;
  section: string;
}

type Region = TextRegion | BlockRegion;

export interface ParsedNotes {
  regions: Region[];
  warnings: string[];
}

// The address a block is written to and read back by: page, the
// module/lesson pair (present iff page === 'lesson'), and section. Two
// blocks share an address when every one of these matches.
export interface NoteAddress {
  page: NotePage;
  module: string | null;
  lesson: string | null;
  section: string;
}

const sameAddress = (a: NoteAddress, b: NoteAddress): boolean =>
  a.page === b.page && a.module === b.module && a.lesson === b.lesson && a.section === b.section;

function parseOpenAttrs(content: string): NoteAddress | null {
  const m = content.match(OPEN_LINE);
  if (!m) return null;
  const tokens = m[1].trim().split(' ');
  const attrs: Record<string, string> = {};
  for (const t of tokens) {
    const am = t.match(OPEN_ATTR);
    if (!am) return null; // malformed attribute list
    const [, key, value] = am;
    if (!(KNOWN_KEYS as readonly string[]).includes(key) || key in attrs) return null;
    attrs[key] = value;
  }
  if (attrs.page !== 'course' && attrs.page !== 'lesson') return null;
  if (attrs.section === undefined) return null;
  if (attrs.page === 'lesson') {
    const lm = attrs.lesson?.match(/^([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/);
    if (!lm) return null; // lesson required iff page=lesson, and must be <module>/<lesson>
    return { page: 'lesson', module: lm[1], lesson: lm[2], section: attrs.section };
  }
  if (attrs.lesson !== undefined) return null; // lesson must be absent when page=course
  return { page: 'course', module: null, lesson: null, section: attrs.section };
}

// Fence detection so the scan is fence-aware (docs/specs/notes.md): a marker
// inside a fenced code block - triple backtick or tilde, indented up to
// three spaces same as CommonMark - is inert text, never a live block. Once
// inside a fence, nothing (including a different fence character, a shorter
// same-character run, or another note marker) closes it except a line whose
// fence run matches the opening character and is at least as long; an
// unclosed fence runs to end of file, same as an unterminated note marker.
const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;

interface OpenFence {
  char: string;
  len: number;
}

function matchFenceOpen(line: string): OpenFence | null {
  const m = line.match(FENCE_OPEN);
  if (!m) return null;
  return { char: m[1][0], len: m[1].length };
}

function matchesFenceClose(line: string, fence: OpenFence): boolean {
  const m = line.match(/^ {0,3}(`+|~+)\s*$/);
  if (!m) return false;
  return m[1][0] === fence.char && m[1].length >= fence.len;
}

export function parseNotes(raw: string): ParsedNotes {
  const lines = raw.split(/(?<=\n)/);
  const regions: Region[] = [];
  const warnings: string[] = [];
  let textBuf: string[] = [];
  let fence: OpenFence | null = null;
  const flushText = (): void => {
    if (textBuf.length) {
      regions.push({ kind: 'text', raw: textBuf.join('') });
      textBuf = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const content = line.trim();
    if (fence) {
      textBuf.push(line);
      if (matchesFenceClose(line, fence)) fence = null;
      continue;
    }
    const openFence = matchFenceOpen(line);
    if (openFence) {
      fence = openFence;
      textBuf.push(line);
      continue;
    }
    if (content === CLOSE_LINE) {
      warnings.push(`stray closing marker with no opening (near byte offset of line ${i + 1})`);
      textBuf.push(line);
      continue;
    }
    const address = parseOpenAttrs(content);
    if (!address) {
      textBuf.push(line);
      continue;
    }
    const bodyLines: string[] = [];
    let j = i + 1;
    let closeLine: string | null = null;
    for (; j < lines.length; j++) {
      if (lines[j].trim() === CLOSE_LINE) {
        closeLine = lines[j];
        break;
      }
      bodyLines.push(lines[j]);
    }
    if (closeLine === null) {
      // unterminated: everything from the open marker to end of file is one
      // unrecognized text region - scanning stops here.
      warnings.push(`unterminated note marker at line ${i + 1}: rest of file kept as unrecognized text`);
      textBuf.push(line, ...bodyLines);
      flushText();
      return { regions, warnings };
    }
    flushText();
    regions.push({ kind: 'block', open: line, bodyLines, close: closeLine, ...address });
    i = j;
  }
  flushText();

  // duplicate-address detection: first is authoritative, later ones are
  // preserved untouched and reported (docs/specs/notes.md).
  const seen: NoteAddress[] = [];
  for (const r of regions) {
    if (r.kind !== 'block') continue;
    if (seen.some((a) => sameAddress(a, r))) {
      warnings.push(`duplicate note address ${addressKey(r)}: only the first is used for read and write`);
    } else {
      seen.push(r);
    }
  }

  return { regions, warnings };
}

function addressKey(a: NoteAddress): string {
  return a.page === 'course' ? 'page=course' : `page=lesson lesson=${a.module}/${a.lesson}`;
}

const bodyText = (bodyLines: string[]): string => bodyLines.map((l) => l.replace(/\r?\n$/, '')).join('\n');

function blockToPublic(b: BlockRegion): CourseNoteBlock {
  return { page: b.page, module: b.module, lesson: b.lesson, section: b.section, text: bodyText(b.bodyLines) };
}

export function notesBlocks(parsed: ParsedNotes): CourseNoteBlock[] {
  return parsed.regions.filter((r): r is BlockRegion => r.kind === 'block').map(blockToPublic);
}

function regionRaw(r: Region): string {
  return r.kind === 'text' ? r.raw : r.open + r.bodyLines.join('') + r.close;
}

export function serializeNotes(parsed: ParsedNotes): string {
  return parsed.regions.map(regionRaw).join('');
}

// docs/specs/notes.md, "Creating a block": the section title is always
// derived server-side, never taken from the request. For an anatomy key this
// is the actual heading text from ANATOMY_HEADINGS (e.g. `7-retrieval-check`
// -> "Recall"), not a prettified slug of the key - a learner reading the
// notes file in Obsidian must see a label that also appears in the lesson.
// h-<slug> keys have no lesson heading to match, so those still fall back to
// a prettified form of the key itself.
export function sectionTitle(section: string): string {
  if (section === 'whole-course') return 'Course';
  if (section === 'whole-lesson') return 'Whole lesson';
  const anatomyRow = ANATOMY_HEADINGS.find(([, key]) => key === section);
  if (anatomyRow) return anatomyRow[0];
  const body = section.startsWith('h-')
    ? section.slice(2)
    : section.replace(/^\d+-/, '');
  const spaced = body.replace(/-/g, ' ');
  return spaced.length === 0 ? spaced : spaced[0].toUpperCase() + spaced.slice(1);
}

// One exported function so the read route (a blocks-empty response for a
// missing file) and the write route (the file actually created) compute
// identical bytes (docs/specs/notes.md, "Creating a block").
export function noteSeed(courseSlug: string, courseTitle: string): string {
  return `# ${courseTitle} - notes\n\nPersonal notes for [[${courseSlug}-hub|${courseTitle}]].\n`;
}

function buildBlock(address: NoteAddress, text: string): string {
  const bodyLines = text === '' ? [] : text.split('\n').map((l) => `${l}\n`);
  const attrs =
    address.page === 'course'
      ? `page=course section=${address.section}`
      : `page=lesson lesson=${address.module}/${address.lesson} section=${address.section}`;
  return `<!-- meno:note ${attrs} -->\n${bodyLines.join('')}${CLOSE_LINE}\n`;
}

export interface UpsertResult {
  raw: string;
  block: CourseNoteBlock;
  warnings: string[];
}

// Writes text to the block at `address`, mutating an existing block's body
// in place, or inserting a new heading-plus-block region when no block at
// that address exists yet (docs/specs/notes.md, "Creating a block").
export function upsertNoteBlock(raw: string, address: NoteAddress, text: string): UpsertResult {
  const parsed = parseNotes(raw);
  const blockRegions = parsed.regions.filter((r): r is BlockRegion => r.kind === 'block');
  const existing = blockRegions.find((b) => sameAddress(b, address));
  if (existing) {
    existing.bodyLines = text === '' ? [] : text.split('\n').map((l) => `${l}\n`);
    return { raw: serializeNotes(parsed), block: blockToPublic(existing), warnings: parsed.warnings };
  }

  const lessonKey = address.page === 'lesson' ? `${address.module}/${address.lesson}` : null;
  const isFirstForLesson = lessonKey !== null && !blockRegions.some((b) => b.page === 'lesson' && `${b.module}/${b.lesson}` === lessonKey);

  const headingLines: string[] =
    address.page === 'course'
      ? ['## Course']
      : isFirstForLesson
        ? [`## ${address.module} / ${address.lesson}`, `### ${sectionTitle(address.section)}`]
        : [`### ${sectionTitle(address.section)}`];

  const block = buildBlock(address, text);
  const insertion = `\n${headingLines.map((h) => `${h}\n\n`).join('')}${block}`;

  let offset = raw.length; // course-page blocks, and a lesson with no existing sibling block, go at EOF
  if (lessonKey !== null) {
    let cumulative = 0;
    let lastEnd: number | null = null;
    for (const r of parsed.regions) {
      const len = regionRaw(r).length;
      cumulative += len;
      if (r.kind === 'block' && r.page === 'lesson' && `${r.module}/${r.lesson}` === lessonKey) lastEnd = cumulative;
    }
    if (lastEnd !== null) offset = lastEnd;
  }

  const nextRaw = raw.slice(0, offset) + insertion + raw.slice(offset);
  const newBlock: CourseNoteBlock = { page: address.page, module: address.module, lesson: address.lesson, section: address.section, text };
  return { raw: nextRaw, block: newBlock, warnings: parsed.warnings };
}
