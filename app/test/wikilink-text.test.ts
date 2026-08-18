// Pure unit coverage for wikilinkTextToHtml (UI-13), which lives in
// wikilinkText.ts rather than wikilinks.tsx precisely so node --test can
// import it directly - the same split courseContext.ts documents. The
// DOM-touching half, useWikilinkNav, needs a real container and click
// events, so it stays covered by manual verification (this project has no
// DOM test harness).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveWikilinkPath, wikilinkTextToHtml } from '../client/src/wikilinkText.ts';

test('wikilinkTextToHtml renders a piped wikilink as an anchor with its display text', () => {
  const html = wikilinkTextToHtml(
    'Generate module 1 lessons for [[software-engineering/rust-for-backend/rust-for-backend-hub|Rust for backend]]',
  );
  assert.equal(
    html,
    'Generate module 1 lessons for <a class="wikilink" href="#wiki:software-engineering/rust-for-backend/rust-for-backend-hub">Rust for backend</a>',
  );
});

test('wikilinkTextToHtml falls back to the target as display text with no pipe', () => {
  const html = wikilinkTextToHtml('See [[some/note]] for context');
  assert.equal(html, 'See <a class="wikilink" href="#wiki:some/note">some/note</a> for context');
});

test('wikilinkTextToHtml escapes plain text but leaves text with no wikilink untouched', () => {
  assert.equal(wikilinkTextToHtml('Redo the borrowing exercises'), 'Redo the borrowing exercises');
  assert.equal(wikilinkTextToHtml('a < b & c > d'), 'a &lt; b &amp; c &gt; d');
});

test('wikilinkTextToHtml handles more than one wikilink in the same line', () => {
  const html = wikilinkTextToHtml('Compare [[a|A]] and [[b|B]]');
  assert.equal(
    html,
    'Compare <a class="wikilink" href="#wiki:a">A</a> and <a class="wikilink" href="#wiki:b">B</a>',
  );
});

test('resolveWikilinkPath routes a lesson path to the lesson route', () => {
  const href = resolveWikilinkPath(
    'sam',
    'software-engineering/rust-for-backend/modules/m1-ownership/what-is-ownership.md',
  );
  assert.equal(href, '#/t/sam/c/rust-for-backend/m/m1-ownership/l/what-is-ownership');
});

test('resolveWikilinkPath falls back to the note route for anything else', () => {
  const href = resolveWikilinkPath('sam', 'software-engineering/rust-for-backend/rust-for-backend-hub.md');
  assert.equal(
    href,
    '#/t/sam/n/software-engineering%2Frust-for-backend%2Frust-for-backend-hub.md',
  );
});
