// Rendered heading markup and key mapping (docs/specs/notes.md, "Heading ids
// in rendered lesson HTML"). Pure renderMarkdown tests, no HTTP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdown } from '../server/markdown.ts';
import { lessonSections, parseLesson } from '../../lib/lesson.ts';

// getLesson's own derivation (app/server/routes.ts): sections computed once
// from the mdast tree and threaded into renderMarkdown, never recomputed.
function sectionsFor(md: string) {
  return lessonSections(parseLesson(md).h2Headings);
}

const LESSON_MD = `# A lesson

**You'll be able to:** do the thing.

## Before you start

prereqs

### A sub-heading inside the section

not a section boundary

## Worked example

worked

## A heading matching no anatomy row

whatever

## Worked example

a second worked-example heading, falls through to a slug key
`;

test('every depth-2 heading carries id="sec-<key>" and data-meno-section="<key>", matching lessonSections; other depths are untouched', () => {
  const h2Headings = ['Before you start', 'Worked example', 'A heading matching no anatomy row', 'Worked example'];
  const { html } = renderMarkdown(LESSON_MD, new Map(), { sectionIds: true, sections: sectionsFor(LESSON_MD) });
  const sections = lessonSections(h2Headings).filter((s) => s.key !== 'whole-lesson');
  assert.equal(sections.length, h2Headings.length);
  for (const s of sections) {
    assert.match(html, new RegExp(`<h2 id="sec-${escapeRe(s.key)}" data-meno-section="${escapeRe(s.key)}">`), `missing id/data attr for ${s.key}`);
  }
  // the second "Worked example" heading falls through to an h-<slug> key (the
  // first claims 4-worked-example)
  assert.equal(sections[1].key, '4-worked-example');
  assert.equal(sections[3].key, 'h-worked-example');
  // no user-content- clobber prefix anywhere
  assert.ok(!html.includes('user-content-'), 'rehype-sanitize clobbered the id - the pass must run after sanitize');
  // depth 1 and depth 3 headings carry no id and no data-meno-section
  assert.ok(!/<h1[^>]*\bid=/.test(html), 'h1 must not get an id');
  assert.ok(!/<h3[^>]*\bid=/.test(html), 'h3 must not get an id');
  assert.ok(!/<h3[^>]*data-meno-section/.test(html));
});

test('a heading containing a wikilink gets the same section key in the rendered id as in LessonResponse.sections - the two must not be independently re-derived', () => {
  const md = `# A lesson

## Before you start

## Some heading with a [[target-note|Nice name]]
`;
  const sections = sectionsFor(md).filter((s) => s.key !== 'whole-lesson');
  const wikiKey = sections[1].key;
  const index = new Map([['target-note', 'some/target-note.md']]);
  const { html } = renderMarkdown(md, index, { sectionIds: true, sections: sectionsFor(md) });
  assert.match(
    html,
    new RegExp(`data-meno-section="${escapeRe(wikiKey)}"`),
    'the rendered heading id must key off the same section list the server returns, not a text re-derived from the post-sanitize (wikilink-resolved) hast tree',
  );
});

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('without the sectionIds option, no heading gets an id or data-meno-section - hub rendering and GET :tenant/note stay unchanged', () => {
  const { html } = renderMarkdown(LESSON_MD, new Map());
  assert.ok(!/<h2[^>]*\bid=/.test(html));
  assert.ok(!html.includes('data-meno-section'));
});

test('rewording a heading keeps its anatomy key (the section-key mapping is a prefix match, never an equality test on stored text)', () => {
  const before = renderMarkdown(LESSON_MD, new Map(), { sectionIds: true, sections: sectionsFor(LESSON_MD) }).html;
  const reworded = LESSON_MD.replace('## Worked example\n\nworked', '## Worked example: two moves\n\nworked');
  const after = renderMarkdown(reworded, new Map(), { sectionIds: true, sections: sectionsFor(reworded) }).html;
  assert.match(before, /data-meno-section="4-worked-example"/);
  assert.match(after, /data-meno-section="4-worked-example"/);
  assert.match(after, /<h2 id="sec-4-worked-example" data-meno-section="4-worked-example">Worked example: two moves<\/h2>/);
});
