// Six invariants pinned straight from the glossary contract
// (.claude/CONTRACT-glossary.md, "Invariants worth pinning as tests"). Pure:
// no filesystem, no network - lib/terms.ts is a pure core and these tests hold
// it to that. checkTerms's own tests (tools/test/validate.test.ts) exercise
// the disk-reading half; these exercise the counters and merge only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { countSentences, countWords, termKey, definitionsDiverge, mergeTerms, parseTerms, type ModuleTerms } from '../../lib/terms.ts';

// --- 1: countSentences holds two sentences through every period that is not a terminator ---

test('countSentences returns 2 through e.g., i.e., a decimal, a dotted name, and a code span holding a period', () => {
  const definition =
    'A borrow is a reference, e.g. one taken via `foo.bar()`, that costs 3.14 units in node.js semantics, i.e. it never copies. Without borrowing every call would move the value instead.';
  assert.equal(countSentences(definition), 2);
});

// --- 2: a code span counts as one word regardless of what it contains ---

test('countWords counts a code span as one word', () => {
  // a `multi word code span` collapses to the single word "code" before
  // counting, however many tokens it holds inside the backticks
  const withCode = countWords('This is a `multi word code span` example.');
  assert.equal(withCode, 5); // This, is, a, code, example.
});

// --- 3: termKey is case-sensitive for one token, case-insensitive for a phrase ---

test('termKey: single-token case is load-bearing, prose-phrase case is not', () => {
  assert.notEqual(termKey('Copy'), termKey('copy'));
  assert.equal(termKey('Context Window'), termKey('context window'));
});

// --- 4: definitionsDiverge is false for identical/paraphrased text, true for unrelated text ---

test('definitionsDiverge: false for identical wording and a light paraphrase, true for an unrelated definition', () => {
  const a = 'A borrow is a reference that lets code read a value without taking ownership. Without it every call would have to copy the value.';
  const paraphrase = 'A borrow is a reference letting code read a value without taking ownership of it. Without it every function call would need to copy the value.';
  const unrelated = 'A lifetime is the span of the program for which a reference stays valid. Without it the compiler cannot rule out a dangling pointer.';

  assert.equal(definitionsDiverge(a, a), false);
  assert.equal(definitionsDiverge(a, paraphrase), false);
  assert.equal(definitionsDiverge(a, unrelated), true);
});

// --- 5: mergeTerms output order is curriculum order, and the first definition wins ---

test('mergeTerms: output order is module sequence then manifest lesson order, never alphabetical, and the first definition wins', () => {
  const modules: ModuleTerms[] = [
    {
      course: 'demo',
      course_title: 'Demo',
      domain: null,
      module: '02-second',
      module_title: 'Second',
      lessons: [{ file: '02-zeta.md', title: 'Zeta' }],
      doc: {
        schema_version: 1,
        terms: [{ term: 'alpha', lesson: '02-zeta.md', definition: 'Second-seen definition of alpha. It should lose to the first.' }],
        no_terms: [],
      },
    },
    {
      course: 'demo',
      course_title: 'Demo',
      domain: null,
      module: '01-first',
      module_title: 'First',
      lessons: [
        { file: '01-beta.md', title: 'Beta' },
        { file: '01-alpha.md', title: 'Alpha' },
      ],
      doc: {
        schema_version: 1,
        terms: [
          { term: 'zeta', lesson: '01-alpha.md', definition: 'Zeta defined out of alphabetical order on purpose. This checks curriculum order, not sort order.' },
          { term: 'alpha', lesson: '01-beta.md', definition: 'First-seen definition of alpha. This is the one that must win.' },
        ],
        no_terms: [],
      },
    },
  ];

  // caller supplies module sequence: the merge itself must not reorder it, so
  // feeding "02-second" before "01-first" and asserting entries still land in
  // the order the caller gave is the real test - a bug that silently sorted
  // by module slug would still pass an alphabetically-named fixture
  const { courses } = mergeTerms(modules);
  assert.equal(courses.length, 1);
  const keys = courses[0].entries.map((e) => e.key);
  // entries appear in the order the caller's modules/lessons implied: module
  // "02-second" first (alpha, from lesson 02-zeta.md), then module "01-first"
  // in lesson order (zeta from 01-alpha.md, alpha already merged into its slot)
  assert.deepEqual(keys, ['alpha', 'zeta']);

  const alpha = courses[0].entries.find((e) => e.key === 'alpha')!;
  assert.equal(alpha.definition, 'Second-seen definition of alpha. It should lose to the first.');
  assert.equal(alpha.introduced_by.module, '02-second');
  assert.equal(alpha.reused_by.length, 1);
  assert.equal(alpha.reused_by[0].module, '01-first');
});

// --- 6: terms are inert - mergeTerms never reads a ledger, output holds no mastery field ---

test('mergeTerms output holds no read, due, or mastery field anywhere', () => {
  const modules: ModuleTerms[] = [
    {
      course: 'demo',
      course_title: 'Demo',
      domain: null,
      module: '01-first',
      module_title: 'First',
      lessons: [{ file: '01-alpha.md', title: 'Alpha' }],
      doc: {
        schema_version: 1,
        terms: [{ term: 'alpha', lesson: '01-alpha.md', definition: 'Alpha is the first thing. It anchors everything after it.' }],
        no_terms: [],
      },
    },
  ];
  const result = mergeTerms(modules);
  const serialized = JSON.stringify(result);
  for (const forbidden of ['next_review', 'ledger', 'mastery', '"due"', '"read"']) {
    assert.ok(!serialized.includes(forbidden), `mergeTerms output must not mention ${forbidden}`);
  }
});

// --- 7: two courses sharing a slug in different domains stay separate -------

test('mergeTerms keys a course by domain plus slug, so a slug reused across two domains does not collapse', () => {
  // Nothing in validate forbids two domains carrying the same course slug.
  // Keyed on the slug alone this merged them into one glossary course, dropped
  // the second course's title and domain, and reported the second course's
  // definitions as divergent re-definitions of the first's.
  const mk = (domain: string, title: string, definition: string): ModuleTerms => ({
    course: 'intro',
    course_title: title,
    domain,
    module: '01-first',
    module_title: 'First',
    lessons: [{ file: '01-a.md', title: 'A' }],
    doc: { schema_version: 1, terms: [{ term: 'model', lesson: '01-a.md', definition }], no_terms: [] },
  });
  const { courses, warnings } = mergeTerms([
    mk('software-engineering', 'Intro to engineering', 'A model is a trained network you send tokens to. Without one there is nothing to call.'),
    mk('statistics', 'Intro to statistics', 'A model is an equation fitted to observed data. Without one you have only the raw sample.'),
  ]);

  assert.equal(courses.length, 2, 'two domains, two courses - never folded into one');
  assert.deepEqual(courses.map((c) => c.domain), ['software-engineering', 'statistics']);
  assert.deepEqual(courses.map((c) => c.title), ['Intro to engineering', 'Intro to statistics']);
  assert.equal(warnings.length, 0, 'two unrelated courses must not report each other as divergent definitions');
});

// --- 8: a dropped field always warns, including a scalar see_also ------------

test('parseTerms warns when see_also is a scalar rather than silently discarding it', () => {
  // The server calls parseTerms and never the schema, so a silent drop here
  // reached a served page with no trace in GlossaryResponse.warnings.
  const raw = [
    'schema_version: 1',
    'terms:',
    '  - term: borrow',
    '    lesson: 01-a.md',
    '    definition: A borrow is a reference that reads a value without owning it. Without it every call would copy.',
    '    see_also: mutable borrow',
  ].join('\n');
  const { doc, warnings } = parseTerms(raw);
  assert.equal(doc.terms.length, 1, 'the entry itself survives - only the malformed field is dropped');
  assert.deepEqual(doc.terms[0].see_also, []);
  assert.ok(
    warnings.some((w) => w.includes('see_also') && w.includes('not a list')),
    `expected a see_also warning, got ${JSON.stringify(warnings)}`,
  );
});

// --- 9: lesson is trimmed, so padding cannot reach a href --------------------

test('parseTerms trims the lesson filename, which .endsWith(".md") and the schema pattern both let through', () => {
  const raw = [
    'schema_version: 1',
    'terms:',
    '  - term: borrow',
    '    lesson: "  01-a.md"',
    '    definition: A borrow is a reference that reads a value without owning it. Without it every call would copy.',
  ].join('\n');
  const { doc } = parseTerms(raw);
  assert.equal(doc.terms[0].lesson, '01-a.md', 'untrimmed, this reaches the client as a dead lessonHref');
});

// --- 10: no literal control characters in the source ------------------------

test('lib/terms.ts contains no raw NUL byte - composite keys use the escape, not the character', () => {
  // A source file holding a literal NUL is classified as binary: grep goes
  // silent on it, diffs stop rendering, and editors mangle it. tools/validate.ts
  // uses the escape sequence for the very same separator; this file must too.
  // Built with fromCharCode so this test cannot reintroduce what it forbids.
  const NUL = String.fromCharCode(0);
  const source = readFileSync(new URL('../../lib/terms.ts', import.meta.url), 'utf8');
  assert.equal(source.includes(NUL), false, 'write the six-character escape sequence, never the character itself');
});
