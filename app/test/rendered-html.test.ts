// Source-grep coverage for the one thing about RenderedHtml that silently
// broke the app's core feature: `dangerouslySetInnerHTML` must receive a
// memoized object, never a fresh literal.
//
// React decides whether to re-apply that prop by comparing it by object
// identity, not by comparing the HTML string inside it. A `{__html: html}`
// literal is a new object on every render, so React re-assigns innerHTML on
// every render even when the markup is byte-identical - and re-assigning
// innerHTML destroys every child of the element. The interactive check
// widgets are exactly those children (useCheckMounts gives each
// `div.meno-check` placeholder its own react-dom root), so a single redundant
// re-assignment deleted every check on the page. They mounted at 470ms and
// were gone at 473ms, with no console error, in development and in the
// production bundle alike.
//
// A DOM test would catch this properly, but `node --test` has no DOM and this
// repository does not carry jsdom, so a source assertion is what can actually
// run in the gate. It is narrow on purpose: it does not prove the widgets
// render, only that the specific mistake that deleted them cannot come back
// by an innocent-looking edit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const source = readFileSync(fileURLToPath(new URL('../client/src/components/RenderedHtml.tsx', import.meta.url)), 'utf8');

test('RenderedHtml never passes a fresh object literal to dangerouslySetInnerHTML', () => {
  // The literal form, with any whitespace: dangerouslySetInnerHTML={{ ... }}
  const literalForm = /dangerouslySetInnerHTML=\{\{/.test(source);
  assert.equal(
    literalForm,
    false,
    'dangerouslySetInnerHTML={{ __html: ... }} re-assigns innerHTML on every render, which deletes every mounted check widget. Pass a useMemo-ed object instead.',
  );
});

test('RenderedHtml memoizes the innerHTML object on `html`', () => {
  assert.match(
    source,
    /useMemo\(\(\) => \(\{ __html: html \}\), \[html\]\)/,
    'the object handed to dangerouslySetInnerHTML must be memoized on `html` so React re-applies it only when the markup actually changes',
  );
});

test('useCheckMounts receives `html`, so a genuine markup change remounts the checks', () => {
  assert.match(
    source,
    /useCheckMounts\(ref, checks, ctx, html\)/,
    'when `html` changes every div.meno-check is replaced by a fresh empty one, so the mounting effect has to re-run',
  );
});
