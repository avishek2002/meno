// The grammar of the meno:connects block (docs/specs/graph.md, invariant 11).
// lib/graph.ts and tools/validate.ts both parse through parseConnects; this
// file is the one place the grammar itself is exercised.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseConnects, CONNECTS_START, CONNECTS_END } from '../../lib/connects.ts';

function block(...lines: string[]): string {
  return ['# Some hub', '', CONNECTS_START, ...lines, CONNECTS_END, ''].join('\n');
}

test('an absent block is silent', () => {
  const got = parseConnects('# Some hub\n\nNo connects marker anywhere in this note.\n');
  assert.deepEqual(got, { present: false, entries: [], diagnostics: [] });
});

test('the canonical bullet round-trips', () => {
  const md = block('- [[rust-for-backend-hub|Rust for backend]] - merging to main triggers a redeploy');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.diagnostics, []);
  assert.equal(got.entries.length, 1);
  assert.deepEqual(got.entries[0], {
    target: 'rust-for-backend-hub',
    display: 'Rust for backend',
    reason: 'merging to main triggers a redeploy',
    line: 4,
  });
});

test('a bullet with no display text round-trips', () => {
  const md = block('- [[rust-for-backend-hub]] - merging to main triggers a redeploy');
  const got = parseConnects(md);
  assert.equal(got.entries.length, 1);
  assert.equal(got.entries[0].target, 'rust-for-backend-hub');
  assert.equal(got.entries[0].display, null);
  assert.equal(got.entries[0].reason, 'merging to main triggers a redeploy');
});

test('every malformed line is reported with its line number and yields no entry', () => {
  const md = [
    '# Some hub',
    '',
    CONNECTS_START,
    '- [[fine-target]] - a good reason',
    '## a heading inside the block',
    '- prose with no wikilink at all',
    '- [[no-reason-here]]',
    '- [[|empty-target]] - reason but empty target',
    CONNECTS_END,
    '',
  ].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.equal(got.entries.length, 1, 'only the one well-formed bullet contributes an entry');
  assert.equal(got.entries[0].target, 'fine-target');

  const malformedLines = got.diagnostics.filter((d) => d.level === 'error').map((d) => d.line);
  assert.deepEqual(malformedLines, [5, 6, 7, 8]);
  for (const d of got.diagnostics) {
    assert.ok(d.line > 0, 'a line-level diagnostic always carries its 1-based line number');
    assert.ok(d.text.length > 0, 'a line-level diagnostic keeps the offending text');
  }
});

test('unbalanced markers yield no entries and one error', () => {
  const md = ['# Some hub', '', CONNECTS_START, '- [[a-target]] - a reason', ''].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.entries, []);
  assert.equal(got.diagnostics.length, 1);
  assert.equal(got.diagnostics[0].level, 'error');
  assert.equal(got.diagnostics[0].line, 0, 'a block-level diagnostic carries no line number');
  assert.equal(got.diagnostics[0].text, '');
});

test('two start markers with no end also yield one block-level error', () => {
  const md = [CONNECTS_START, '- [[a-target]] - a reason', CONNECTS_START, ''].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.entries, []);
  assert.equal(got.diagnostics.length, 1);
  assert.equal(got.diagnostics[0].level, 'error');
});

test('an end marker above its start is also malformed', () => {
  const md = [CONNECTS_END, '- [[a-target]] - a reason', CONNECTS_START, ''].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.entries, []);
  assert.equal(got.diagnostics.length, 1);
});

test('a duplicate target is a warning that keeps the first bullet', () => {
  const md = block(
    '- [[rust-for-backend-hub|Rust]] - first reason',
    '- [[rust-for-backend-hub|Rust again]] - second reason',
  );
  const got = parseConnects(md);
  assert.equal(got.entries.length, 1);
  assert.equal(got.entries[0].reason, 'first reason');
  assert.equal(got.diagnostics.length, 1);
  assert.equal(got.diagnostics[0].level, 'warning');
  assert.equal(got.diagnostics[0].line, 5);
});

test('a target containing "#" is malformed', () => {
  const md = block('- [[rust-for-backend-hub#some-section]] - a reason');
  const got = parseConnects(md);
  assert.deepEqual(got.entries, []);
  assert.equal(got.diagnostics.length, 1);
  assert.equal(got.diagnostics[0].level, 'error');
});

test('blank lines and comment-only lines inside the block are silently ignored', () => {
  const md = [
    '# Some hub',
    '',
    CONNECTS_START,
    '',
    '<!-- a plain comment, not content -->',
    '- [[a-target]] - a reason',
    CONNECTS_END,
    '',
  ].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.diagnostics, []);
  assert.equal(got.entries.length, 1);
});

test('parseConnects never throws on any input', () => {
  const hostile = ['', '\n\n\n', CONNECTS_START, CONNECTS_START, CONNECTS_END, CONNECTS_END, '[[[[broken', '- [[]] -'];
  for (const md of hostile) {
    assert.doesNotThrow(() => parseConnects(md));
  }
});

// --- CRLF: a hub saved with Windows line endings must parse like Unix ---

test('a genuine CRLF line ending still parses a canonical bullet', () => {
  const md = [
    '# Some hub',
    '',
    CONNECTS_START,
    '- [[rust-for-backend-hub|Rust for backend]] - merging to main triggers a redeploy',
    CONNECTS_END,
    '',
  ].join('\r\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.diagnostics, [], 'a stray \\r must not make a well-formed bullet look malformed');
  assert.equal(got.entries.length, 1);
  assert.deepEqual(got.entries[0], {
    target: 'rust-for-backend-hub',
    display: 'Rust for backend',
    reason: 'merging to main triggers a redeploy',
    line: 4,
  });
});

// --- fenced code samples: a connects block shown as an example must not wire a real edge ---

test('a meno:connects block inside a fenced code sample is not parsed as real', () => {
  const md = [
    '# Some hub',
    '',
    'Here is the connects syntax:',
    '',
    '```',
    CONNECTS_START,
    '- [[rust-for-backend-hub|Rust for backend]] - a documentation example, not a real edge',
    CONNECTS_END,
    '```',
    '',
  ].join('\n');
  const got = parseConnects(md);
  assert.deepEqual(got, { present: false, entries: [], diagnostics: [] }, 'markers inside a fence are not markers at all');
});

test('a real connects block after a fenced example still parses, with unshifted line numbers', () => {
  const md = [
    '# Some hub',
    '',
    'Example syntax:',
    '',
    '```',
    CONNECTS_START,
    '- [[example-only]] - not real',
    CONNECTS_END,
    '```',
    '',
    CONNECTS_START,
    '- [[rust-for-backend-hub|Rust for backend]] - the real edge',
    CONNECTS_END,
    '',
  ].join('\n');
  const got = parseConnects(md);
  assert.equal(got.present, true);
  assert.deepEqual(got.diagnostics, []);
  assert.equal(got.entries.length, 1);
  assert.equal(got.entries[0].target, 'rust-for-backend-hub');
  assert.equal(got.entries[0].line, 12, 'line numbers still count the blanked-out fenced lines');
});
