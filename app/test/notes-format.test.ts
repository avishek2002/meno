// Round-trip and preservation properties for the personal-notes file format
// (docs/specs/notes.md). Pure parser/serializer tests, no HTTP server.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseNotes, serializeNotes, notesBlocks, upsertNoteBlock, sectionTitle, noteSeed } from '../server/notes.ts';

// The committed fixture WORKED_EXAMPLE below is a hand-copied literal of -
// read from disk so a future edit to the fixture cannot silently diverge
// from what these format tests believe it says.
const FIXTURE_PATH = fileURLToPath(
  new URL('../../examples/example-learner/software-engineering/rust-for-backend/rust-for-backend-notes.md', import.meta.url),
);

const WORKED_EXAMPLE = [
  '# Rust for backend - notes',
  '',
  'Personal notes for [[rust-for-backend-hub|Rust for backend]].',
  '',
  'Anything I type out here by hand stays exactly as I typed it.',
  '',
  '## Course',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'The link-shortener is the thing I actually want at the end of this.',
  '<!-- /meno:note -->',
  '',
  '## 01-syntax-and-ownership-basics / 03-ownership',
  '',
  '### Whole lesson',
  '',
  '<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=whole-lesson -->',
  'Read it twice. The second pass was the one that stuck.',
  '<!-- /meno:note -->',
  '',
  '### Worked example',
  '',
  '<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=4-worked-example -->',
  'The move happens at the call, not at the closing brace.',
  '',
  'Worth re-deriving from scratch next review.',
  '<!-- /meno:note -->',
  '',
  '### Recall',
  '',
  '<!-- meno:note page=lesson lesson=01-syntax-and-ownership-basics/03-ownership section=7-retrieval-check -->',
  '<!-- /meno:note -->',
  '',
].join('\n');

test('fixture honesty: WORKED_EXAMPLE matches the committed fixture on disk byte for byte', () => {
  const onDisk = readFileSync(FIXTURE_PATH, 'utf8');
  assert.equal(onDisk, WORKED_EXAMPLE, 'examples/.../rust-for-backend-notes.md has diverged from this file\'s hand-copied WORKED_EXAMPLE literal');
});

const NO_BLOCKS = '# Course notes\n\nJust a plain markdown file, no markers at all.\n';

const UNTERMINATED = [
  '# Notes',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'this note never closes',
  'more text after it',
].join('\n') + '\n';

const DUPLICATE_ADDRESSES = [
  '# Notes',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'first',
  '<!-- /meno:note -->',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'second, same address',
  '<!-- /meno:note -->',
  '',
].join('\n');

const CRLF = WORKED_EXAMPLE.split('\n').join('\r\n');

const NO_TRAILING_NEWLINE = '# Notes\n\n<!-- meno:note page=course section=whole-course -->\nhello\n<!-- /meno:note -->';

const FENCED_MARKER_PAIR = [
  '# Notes',
  '',
  '```',
  '<!-- meno:note page=course section=whole-course -->',
  'fenced example text',
  '<!-- /meno:note -->',
  '```',
  '',
].join('\n');

const FENCE_WITH_ONLY_OPEN_MARKER = [
  '# Notes',
  '',
  '```',
  'example showing the syntax:',
  '<!-- meno:note page=course section=whole-course -->',
  '```',
  '',
  'more text after the fence',
  '',
].join('\n');

const FENCED_MARKER_PLUS_REAL_BLOCK = [
  '# Notes',
  '',
  '```',
  '<!-- meno:note page=course section=whole-course -->',
  'fenced example, not a real block',
  '<!-- /meno:note -->',
  '```',
  '',
  '## Course',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'a real note',
  '<!-- /meno:note -->',
  '',
].join('\n');

const NESTED_FENCE = [
  '# Notes',
  '',
  '````',
  'outer fence',
  '```',
  '<!-- meno:note page=course section=whole-course -->',
  'inner-looking fence, still inert',
  '<!-- /meno:note -->',
  '```',
  'still inside outer fence',
  '````',
  '',
  '## Course',
  '',
  '<!-- meno:note page=course section=whole-course -->',
  'the real note',
  '<!-- /meno:note -->',
  '',
].join('\n');

const UNCLOSED_FENCE = [
  '# Notes',
  '',
  '```',
  '<!-- meno:note page=course section=whole-course -->',
  'this fence never closes',
  '<!-- /meno:note -->',
].join('\n') + '\n';

const INDENTED_FENCE = [
  '# Notes',
  '',
  '- a list item',
  '  ```',
  '  <!-- meno:note page=course section=whole-course -->',
  '  indented fence, still inert',
  '  <!-- /meno:note -->',
  '  ```',
  '',
].join('\n');

test('round-trip: parse then serialize with no edit is byte-identical', () => {
  for (const [name, fixture] of Object.entries({
    WORKED_EXAMPLE,
    NO_BLOCKS,
    UNTERMINATED,
    DUPLICATE_ADDRESSES,
    CRLF,
    NO_TRAILING_NEWLINE,
    FENCED_MARKER_PAIR,
    FENCE_WITH_ONLY_OPEN_MARKER,
    FENCED_MARKER_PLUS_REAL_BLOCK,
    NESTED_FENCE,
    UNCLOSED_FENCE,
    INDENTED_FENCE,
  })) {
    const parsed = parseNotes(fixture);
    assert.equal(serializeNotes(parsed), fixture, `round-trip failed for ${name}`);
  }
});

test('fence-blindness: a marker pair inside a fenced code block is inert text, never a block', () => {
  const parsed = parseNotes(FENCED_MARKER_PAIR);
  assert.equal(notesBlocks(parsed).length, 0, 'a marker pair fenced in ``` must not be recognized as a block');
  assert.equal(serializeNotes(parsed), FENCED_MARKER_PAIR, 'fenced content must round-trip byte for byte');
});

test('fence-blindness: a fence containing only an opening marker is inert, and content after the fence is still scanned', () => {
  const parsed = parseNotes(FENCE_WITH_ONLY_OPEN_MARKER);
  assert.equal(notesBlocks(parsed).length, 0, 'an opening marker inside a fence must not start a block');
  assert.ok(!parsed.warnings.some((w) => /unterminated/.test(w)), 'a fenced open marker must not be treated as an unterminated real marker');
  assert.equal(serializeNotes(parsed), FENCE_WITH_ONLY_OPEN_MARKER);
});

test('fence-blindness: a fenced marker plus a real block elsewhere - a write hits the real block, the fenced example is untouched', () => {
  const parsed = parseNotes(FENCED_MARKER_PLUS_REAL_BLOCK);
  assert.equal(notesBlocks(parsed).length, 1, 'only the real block outside the fence is a recognized block');
  assert.ok(!parsed.warnings.some((w) => /duplicate note address/.test(w)), 'the fenced pair must not collide with the real block as a duplicate address');

  const { raw: next } = upsertNoteBlock(
    FENCED_MARKER_PLUS_REAL_BLOCK,
    { page: 'course', module: null, lesson: null, section: 'whole-course' },
    'edited via the real block',
  );
  assert.ok(next.includes('fenced example, not a real block'), 'the fenced example must survive byte for byte');
  assert.ok(next.includes('edited via the real block'), 'the write must land in the real block');
  const afterBlocks = notesBlocks(parseNotes(next));
  assert.equal(afterBlocks.length, 1);
  assert.equal(afterBlocks[0].text, 'edited via the real block');
});

test('fence-blindness: nested/unclosed fences keep note markers inert', () => {
  const nestedParsed = parseNotes(NESTED_FENCE);
  assert.equal(notesBlocks(nestedParsed).length, 1, 'only the block outside every fence is recognized');
  assert.equal(notesBlocks(nestedParsed)[0].text, 'the real note');
  assert.equal(serializeNotes(nestedParsed), NESTED_FENCE);

  const unclosedParsed = parseNotes(UNCLOSED_FENCE);
  assert.equal(notesBlocks(unclosedParsed).length, 0, 'a marker inside a fence that never closes stays inert to EOF');
  assert.equal(serializeNotes(unclosedParsed), UNCLOSED_FENCE);

  const indentedParsed = parseNotes(INDENTED_FENCE);
  assert.equal(notesBlocks(indentedParsed).length, 0, 'an indented fence is still fence-aware');
  assert.equal(serializeNotes(indentedParsed), INDENTED_FENCE);
});

test('preservation under edit: editing one block changes only that block\'s body bytes', () => {
  const parsed = parseNotes(WORKED_EXAMPLE);
  const before = notesBlocks(parsed);
  const { raw: next } = upsertNoteBlock(
    WORKED_EXAMPLE,
    { page: 'lesson', module: '01-syntax-and-ownership-basics', lesson: '03-ownership', section: '4-worked-example' },
    'A totally different thought.',
  );
  // diff region by region, not by eye: every region except the edited block's
  // body must be byte-identical to the original
  const beforeParsed = parseNotes(WORKED_EXAMPLE);
  const afterParsed = parseNotes(next);
  assert.equal(beforeParsed.regions.length, afterParsed.regions.length);
  for (let i = 0; i < beforeParsed.regions.length; i++) {
    const a = beforeParsed.regions[i];
    const b = afterParsed.regions[i];
    if (a.kind === 'text') {
      assert.deepEqual(b, a, `text region ${i} changed`);
      continue;
    }
    assert.equal(b.kind, 'block');
    if (b.kind !== 'block') continue;
    assert.equal(b.open, a.open, `block ${i} open marker changed`);
    assert.equal(b.close, a.close, `block ${i} close marker changed`);
    if (a.section === '4-worked-example') {
      assert.notEqual(b.bodyLines.join(''), a.bodyLines.join(''), 'the edited block\'s body did not change');
    } else {
      assert.deepEqual(b.bodyLines, a.bodyLines, `block ${i} (section ${a.section}) body changed but was not the edit target`);
    }
  }
  // and every other block's text, read back through the public shape, is untouched
  const after = notesBlocks(afterParsed);
  for (const b of before) {
    if (b.section === '4-worked-example') continue;
    const match = after.find((x) => x.page === b.page && x.lesson === b.lesson && x.section === b.section);
    assert.deepEqual(match, b, `block ${b.section} changed when it was not the edit target`);
  }
});

test('unrecognized content survives: unterminated marker and a stray closing marker', () => {
  const fixture = [
    '# Notes',
    '',
    '<!-- meno:note page=course section=whole-course -->',
    'a real block',
    '<!-- /meno:note -->',
    '',
    '<!-- /meno:note -->',
    'stray closer above with no opener',
  ].join('\n') + '\n';
  const parsed = parseNotes(fixture);
  assert.ok(parsed.warnings.some((w) => /stray closing marker/.test(w)), 'expected a stray-closing-marker warning');
  // a write to a different address still succeeds
  const { raw: next, block } = upsertNoteBlock(
    fixture,
    { page: 'lesson', module: '01-syntax-and-ownership-basics', lesson: '03-ownership', section: 'whole-lesson' },
    'new lesson note',
  );
  assert.equal(block.text, 'new lesson note');
  // both malformed regions are still present verbatim afterwards
  assert.ok(next.includes('<!-- /meno:note -->\nstray closer above with no opener'), 'stray closer text lost');
  assert.ok(next.includes('a real block'), 'the real block was lost');
});

test('unterminated opening marker: everything to EOF is one unrecognized region, a write to another block still works', () => {
  const parsed = parseNotes(UNTERMINATED);
  assert.ok(parsed.warnings.some((w) => /unterminated/.test(w)));
  assert.equal(notesBlocks(parsed).length, 0, 'the unterminated block is not a recognized block');
  // a write addressed to that key appends a new block at the end
  const { raw: next, block } = upsertNoteBlock(UNTERMINATED, { page: 'course', module: null, lesson: null, section: 'whole-course' }, 'appended');
  assert.equal(block.text, 'appended');
  assert.ok(next.includes('this note never closes'), 'unterminated region must be preserved verbatim');
  assert.ok(next.endsWith('<!-- /meno:note -->\n'), 'the appended block must actually close');
});

test('empty notes: writing text \'\' leaves the block present with a zero-line body', () => {
  const { raw: next, block } = upsertNoteBlock(
    WORKED_EXAMPLE,
    { page: 'course', module: null, lesson: null, section: 'whole-course' },
    '',
  );
  assert.equal(block.text, '');
  const parsed = parseNotes(next);
  const blocks = notesBlocks(parsed);
  assert.equal(blocks.length, notesBlocks(parseNotes(WORKED_EXAMPLE)).length, 'block count must not change');
  const courseBlock = blocks.find((b) => b.page === 'course');
  assert.equal(courseBlock?.text, '');
  assert.ok(next.includes('<!-- meno:note page=course section=whole-course -->\n<!-- /meno:note -->'), 'the cleared block must still be present, zero body lines');
});

test('duplicate addresses: first is authoritative, later ones are preserved and reported', () => {
  const parsed = parseNotes(DUPLICATE_ADDRESSES);
  assert.ok(parsed.warnings.some((w) => /duplicate note address/.test(w)));
  const blocks = notesBlocks(parsed);
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].text, 'first');
  assert.equal(blocks[1].text, 'second, same address');
  // writing to that address only mutates the first
  const { raw: next } = upsertNoteBlock(DUPLICATE_ADDRESSES, { page: 'course', module: null, lesson: null, section: 'whole-course' }, 'edited');
  const after = notesBlocks(parseNotes(next));
  assert.equal(after[0].text, 'edited');
  assert.equal(after[1].text, 'second, same address', 'the second, duplicate-address block must be untouched');
});

test('creating a block: first write for a course creates the module heading and section title, second write for the same lesson does not repeat the module heading', () => {
  const seed = noteSeed('rust-for-backend', 'Rust for backend developers');
  const first = upsertNoteBlock(
    seed,
    { page: 'lesson', module: '01-syntax-and-ownership-basics', lesson: '03-ownership', section: 'whole-lesson' },
    'first note',
  );
  assert.ok(first.raw.includes('## 01-syntax-and-ownership-basics / 03-ownership'));
  assert.ok(first.raw.includes('### Whole lesson'));
  const second = upsertNoteBlock(
    first.raw,
    { page: 'lesson', module: '01-syntax-and-ownership-basics', lesson: '03-ownership', section: '4-worked-example' },
    'second note',
  );
  assert.ok(second.raw.includes('### Worked example'));
  // the module heading appears exactly once - not repeated for the second section
  const occurrences = second.raw.split('## 01-syntax-and-ownership-basics / 03-ownership').length - 1;
  assert.equal(occurrences, 1);
  // round-trips
  assert.equal(serializeNotes(parseNotes(second.raw)), second.raw);
});

test('section title derivation', () => {
  assert.equal(sectionTitle('whole-course'), 'Course');
  assert.equal(sectionTitle('whole-lesson'), 'Whole lesson');
  assert.equal(sectionTitle('h-my-thought'), 'My thought');
});

test('section title derivation for an anatomy key matches the lesson heading it anchors to, not a prettified slug', () => {
  // ANATOMY_HEADINGS (lib/lesson.ts): the written heading must be the text
  // that actually appears in the lesson, so a learner reading the notes file
  // in Obsidian sees a label that also appears in the lesson.
  assert.equal(sectionTitle('2-prerequisite-check'), 'Before you start');
  assert.equal(sectionTitle('3-explanation'), 'The idea');
  assert.equal(sectionTitle('4-worked-example'), 'Worked example');
  assert.equal(sectionTitle('5-faded-practice'), 'Your turn');
  assert.equal(sectionTitle('7-retrieval-check'), 'Recall');
  assert.equal(sectionTitle('9-transfer-prompt'), 'Apply it somewhere new');
});

test('the seed is exact: title, blank line, backlink, trailing newline', () => {
  const seed = noteSeed('rust-for-backend', 'Rust for backend');
  assert.equal(seed, '# Rust for backend - notes\n\nPersonal notes for [[rust-for-backend-hub|Rust for backend]].\n');
});
