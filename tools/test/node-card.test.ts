// Invariant 20 of docs/specs/graph.md (parseDerivedBullets totality), plus the
// rest of the pure seam under lib/node-card.ts, over synthetic in-memory
// inputs - no fixture, no disk. Invariants 18 and 19, which need a real HTTP
// round trip to guard the way a synthetic input cannot, live in
// app/test/graph-node-card.test.ts instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDerivedBullets, derivedDescriptionFor, DERIVED_START, DERIVED_END } from '../../lib/hub-derived.ts';
import { CONNECTS_START, CONNECTS_END } from '../../lib/connects.ts';
import { buildNodeCard, courseLessonProgress, noteIntro, nodeCardAction } from '../../lib/node-card.ts';
import type { NodeCardInput } from '../../lib/node-card.ts';
import { buildVaultGraph, type VaultFile } from '../../lib/vault.ts';
import type { CourseNode } from '../../app/shared/types.ts';
import type { Mastery } from '../../lib/mastery.ts';

function block(...lines: string[]): string {
  return ['# Some hub', '', DERIVED_START, ...lines, DERIVED_END, ''].join('\n');
}

// --- parseDerivedBullets: total over every input shape (invariant 20) ---

test('an absent derived block yields no bullets', () => {
  assert.deepEqual(parseDerivedBullets('# Some hub\n\nNo derived marker anywhere.\n'), []);
});

test('an empty file yields no bullets', () => {
  assert.deepEqual(parseDerivedBullets(''), []);
});

test('the canonical bullet round-trips, with and without display text', () => {
  const md = block(
    '- [[01-cargo-and-toolchain|Cargo and the Rust toolchain]] - one command replaces pip/npm setup',
    '- [[02-lifetimes]] - ties a returned reference to the input it borrowed from',
  );
  const got = parseDerivedBullets(md);
  assert.equal(got.length, 2);
  assert.deepEqual(got[0], {
    target: '01-cargo-and-toolchain',
    display: 'Cargo and the Rust toolchain',
    description: 'one command replaces pip/npm setup',
    line: 4,
  });
  assert.deepEqual(got[1], {
    target: '02-lifetimes',
    display: null,
    description: 'ties a returned reference to the input it borrowed from',
    line: 5,
  });
});

test('a module heading line between bullet groups is not a bullet', () => {
  const md = block(
    '**01 syntax and ownership basics** (generated)',
    '- [[03-ownership|Ownership]] - the one idea with no Python/TypeScript analogue',
    '**02 borrowing in practice** (planned)',
  );
  const got = parseDerivedBullets(md);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, '03-ownership');
});

test('an empty block (markers with nothing between) yields no bullets', () => {
  assert.deepEqual(parseDerivedBullets(block()), []);
});

test('an unterminated block (start with no end) yields no bullets, never throws', () => {
  const md = ['# Some hub', '', DERIVED_START, '- [[x]] - y', ''].join('\n');
  assert.deepEqual(parseDerivedBullets(md), []);
});

test('a duplicated start marker (unbalanced) yields no bullets, never throws', () => {
  const md = ['# Some hub', '', DERIVED_START, DERIVED_START, '- [[x]] - y', DERIVED_END, ''].join('\n');
  assert.deepEqual(parseDerivedBullets(md), []);
});

test('every malformed bullet shape is silently skipped, never throws', () => {
  const md = block(
    '- prose with no wikilink at all',
    '- [[no-separator-here]]',
    '- [[empty-description]] - ',
    '- [[fine-one]] - this one is well formed',
  );
  const got = parseDerivedBullets(md);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, 'fine-one');
});

test('a fenced code sample of the syntax is not parsed as a real bullet', () => {
  const md = block('```markdown', '- [[not-real]] - this is documentation, not a bullet', '```', '- [[real-one]] - this one counts');
  const got = parseDerivedBullets(md);
  assert.equal(got.length, 1);
  assert.equal(got[0].target, 'real-one');
});

// --- derivedDescriptionFor: basename match, one level for lessons, one for courses ---

test('derivedDescriptionFor matches a bare-basename target (hub level)', () => {
  const md = block('- [[01-cargo-and-toolchain|Cargo and the Rust toolchain]] - one command replaces pip/npm setup');
  assert.equal(derivedDescriptionFor(md, '01-cargo-and-toolchain'), 'one command replaces pip/npm setup');
});

test('derivedDescriptionFor matches a full-path target by its basename (home level)', () => {
  const md = block('- [[software-engineering/rust-for-backend/rust-for-backend-hub|Rust for backend]] - module 2 of 7');
  assert.equal(derivedDescriptionFor(md, 'rust-for-backend-hub'), 'module 2 of 7');
});

test('derivedDescriptionFor returns null for no match, an absent block, and a malformed block', () => {
  const md = block('- [[some-other-lesson]] - not the one we want');
  assert.equal(derivedDescriptionFor(md, 'not-in-the-block'), null);
  assert.equal(derivedDescriptionFor('# No markers here\n', 'anything'), null);
  const broken = ['# hub', DERIVED_START, DERIVED_START, '- [[x]] - y', DERIVED_END].join('\n');
  assert.equal(derivedDescriptionFor(broken, 'x'), null);
});

// --- noteIntro ---

test('noteIntro returns the first ordinary paragraph, skipping the heading', () => {
  const md = '# A note\n\nThis is the first real paragraph, said plainly.\n\nA second paragraph nobody reads.\n';
  assert.equal(noteIntro(md, 240), 'This is the first real paragraph, said plainly.');
});

test('noteIntro skips a derived block and a connects block, in that order', () => {
  const md = [
    '# Some hub',
    '',
    DERIVED_START,
    '- [[a-lesson]] - a description that must not surface as the intro',
    DERIVED_END,
    '',
    '## Connects to',
    CONNECTS_START,
    '- [[other-hub]] - a connects reason that must not surface either',
    CONNECTS_END,
    '',
    '## My notes',
    'Actually written by hand, this line is the real intro.',
    '',
  ].join('\n');
  assert.equal(noteIntro(md, 240), 'Actually written by hand, this line is the real intro.');
});

test('noteIntro skips a wikilink-only line and returns null when nothing else qualifies', () => {
  const md = '# A note\n\n[[some-other-note]]\n';
  assert.equal(noteIntro(md, 240), null);
});

test('noteIntro strips YAML frontmatter through the one shared parser before scanning for prose', () => {
  const md = ['---', 'schema_version: 1', 'type: insights', '---', '', '## Heading', '', 'The real first paragraph lives after the frontmatter.', ''].join('\n');
  assert.equal(noteIntro(md, 240), 'The real first paragraph lives after the frontmatter.');
});

test('noteIntro returns null for an empty note and for a heading-only note', () => {
  assert.equal(noteIntro('', 240), null);
  assert.equal(noteIntro('# Just a title\n', 240), null);
});

test('noteIntro truncates a long paragraph at a word boundary and marks the cut', () => {
  const long = 'word '.repeat(100).trim();
  const got = noteIntro(`# T\n\n${long}\n`, 40);
  assert.ok(got !== null);
  assert.ok(got.length <= 43, `expected a short truncated string, got ${got.length} chars`);
  assert.ok(got.endsWith('...'));
});

// --- courseLessonProgress ---

function course(overrides: Partial<CourseNode>): CourseNode {
  return {
    dir: 'domain/c1',
    slug: 'c1',
    title: 'C1',
    status: 'active',
    hub: './c1-hub.md',
    objectives: [],
    modules: [],
    ...overrides,
  };
}

test('courseLessonProgress counts over manifest entries, not files on disk', () => {
  const c = course({
    dir: 'domain/c1',
    slug: 'c1',
    modules: [
      {
        slug: 'm1',
        title: 'M1',
        status: 'generated',
        est_hours: 1,
        serves: [],
        prerequisites: [],
        concepts: ['a', 'b'],
        lessons: [
          { file: '01-a.md', title: 'A', concept: 'a', status: 'generated' },
          { file: '02-b.md', title: 'B', concept: 'b', status: 'planned' },
        ],
      },
    ],
  });
  const fileIds = new Set(['domain/c1/modules/m1/01-a.md']); // 02-b.md is a ghost
  const mastery: Mastery = { schema_version: 1, courses: { c1: { concepts: { a: { level: 'mastered', module: 'm1', n_transfer: 1, transfer_score: 1, recognition_rate: null, next_review: null, stale: false, weak_until: null } }, modules: {} } } };
  const got = courseLessonProgress([c], fileIds, mastery);
  assert.deepEqual(got, { lessons_total: 2, lessons_generated: 1, lessons_mastered: 1, courses: 1 });
});

// --- nodeCardAction ---

test('nodeCardAction for a hub opens the course page, never the raw hub note', () => {
  const a = nodeCardAction({ tenant: 't', kind: 'hub', state: 'generated', id: 'domain/c1/c1-hub.md', course: 'c1', lesson: null });
  assert.deepEqual(a, { href: '#/t/t/c/c1', label: 'Open course', enabled: true, disabled_reason: null });
});

test('nodeCardAction for a generated lesson opens the lesson page', () => {
  const a = nodeCardAction({
    tenant: 't',
    kind: 'lesson',
    state: 'generated',
    id: 'domain/c1/modules/m1/01-a.md',
    course: 'c1',
    lesson: { course: 'c1', module: 'm1', file: '01-a.md' },
  });
  assert.equal(a.enabled, true);
  assert.equal(a.href, '#/t/t/c/c1/m/m1/l/01-a');
  assert.equal(a.disabled_reason, null);
});

test('nodeCardAction for a ghost lesson is disabled, with a null href and a stated reason', () => {
  const a = nodeCardAction({
    tenant: 't',
    kind: 'lesson',
    state: 'ghost',
    id: 'domain/c1/modules/m1/02-b.md',
    course: 'c1',
    lesson: { course: 'c1', module: 'm1', file: '02-b.md' },
  });
  assert.equal(a.enabled, false);
  assert.equal(a.href, null);
  assert.ok(a.disabled_reason && a.disabled_reason.length > 0);
});

test('nodeCardAction for home and a plain note both open the note view, labelled "Open note"', () => {
  const home = nodeCardAction({ tenant: 't', kind: 'home', state: 'generated', id: 'home.md', course: null, lesson: null });
  assert.deepEqual(home, { href: '#/t/t/n/home.md', label: 'Open note', enabled: true, disabled_reason: null });
  const note = nodeCardAction({ tenant: 't', kind: 'note', state: 'generated', id: 'todos.md', course: null, lesson: null });
  assert.deepEqual(note, { href: '#/t/t/n/todos.md', label: 'Open note', enabled: true, disabled_reason: null });
});

// --- buildNodeCard, over synthetic file maps, one per kind ---

function mkInput(opts: { files: VaultFile[]; courses?: CourseNode[]; mastery?: Mastery; id: string; tenant?: string }): NodeCardInput {
  const tenant = opts.tenant ?? 'test-tenant';
  return {
    tenant,
    id: opts.id,
    files: opts.files,
    vault: buildVaultGraph(opts.files),
    tree: { tenant, courses: opts.courses ?? [], warnings: [] },
    mastery: opts.mastery ?? { schema_version: 1, courses: {} },
  };
}

const RUST_COURSE = course({
  dir: 'software-engineering/rust-for-backend',
  slug: 'rust-for-backend',
  title: 'Rust for backend',
  hub: './rust-for-backend-hub.md',
  objectives: [
    { id: 'O1', text: 'Apply ownership and borrowing', bloom: 'apply', assessed_by: 'exercises' },
    { id: 'O2', text: 'Model the domain', bloom: 'apply' },
  ],
  modules: [
    {
      slug: '01-ownership',
      title: 'Ownership basics',
      status: 'generated',
      est_hours: 4,
      serves: ['O1'],
      prerequisites: [],
      concepts: ['ownership'],
      lessons: [{ file: '01-ownership.md', title: 'Ownership', concept: 'ownership', status: 'generated' }],
    },
    {
      slug: '02-planned',
      title: 'Not written yet',
      status: 'skeleton',
      est_hours: 3,
      serves: ['O2'],
      prerequisites: [],
      concepts: ['structs'],
      lessons: [{ file: '01-structs.md', title: 'Structs', concept: 'structs', status: 'planned' }],
    },
  ],
});

const HUB_TEXT = [
  '# Rust for backend - map',
  '',
  DERIVED_START,
  '**01 ownership basics** (generated)',
  '- [[01-ownership|Ownership]] - the one idea with no analogue',
  '**02 planned** (planned)',
  DERIVED_END,
].join('\n');

const HOME_TEXT = [
  '# Home',
  '',
  DERIVED_START,
  '- [[software-engineering/rust-for-backend/rust-for-backend-hub|Rust for backend]] - module 1 of 2',
  DERIVED_END,
  '',
  '## Notes to self',
  'Hands off during refreshes.',
].join('\n');

function baseFiles(): VaultFile[] {
  return [
    { path: 'home.md', text: HOME_TEXT },
    { path: 'todos.md', text: '# Todos\n\nA plain note with real prose right here.\n' },
    { path: 'software-engineering/rust-for-backend/rust-for-backend-hub.md', text: HUB_TEXT },
    { path: 'software-engineering/rust-for-backend/modules/01-ownership/01-ownership.md', text: '# Ownership\n\nfrontmatter-free lesson body, never read by the card' },
  ];
}

test('buildNodeCard for a hub: objectives, progress, and a home-derived summary', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'software-engineering/rust-for-backend/rust-for-backend-hub.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'hub');
  assert.equal(card.state, 'generated');
  assert.equal(card.course, 'rust-for-backend');
  assert.equal(card.summary, 'module 1 of 2');
  assert.equal(card.summary_source, 'home-derived');
  assert.deepEqual(card.objectives, [
    { id: 'O1', text: 'Apply ownership and borrowing' },
    { id: 'O2', text: 'Model the domain' },
  ]);
  assert.deepEqual(card.progress, { lessons_total: 2, lessons_generated: 1, lessons_mastered: 0, courses: 1 });
  assert.equal(card.action.enabled, true);
  assert.equal(card.action.href, '#/t/test-tenant/c/rust-for-backend');
});

test('buildNodeCard for a generated lesson: hub-derived summary, no objectives, no progress', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'software-engineering/rust-for-backend/modules/01-ownership/01-ownership.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'lesson');
  assert.equal(card.state, 'generated');
  assert.equal(card.summary, 'the one idea with no analogue');
  assert.equal(card.summary_source, 'hub-derived');
  assert.deepEqual(card.objectives, []);
  assert.equal(card.progress, null);
  assert.equal(card.action.enabled, true);
});

test('buildNodeCard for a ghost lesson: no summary, disabled action, still a card', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'software-engineering/rust-for-backend/modules/02-planned/01-structs.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'lesson');
  assert.equal(card.state, 'ghost');
  assert.equal(card.summary, null);
  assert.equal(card.summary_source, 'none');
  assert.equal(card.action.enabled, false);
  assert.equal(card.action.href, null);
  assert.ok(card.action.disabled_reason);
});

test('buildNodeCard for home: note-intro summary, progress across every course', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'home.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'home');
  assert.equal(card.course, null);
  assert.equal(card.summary, 'Hands off during refreshes.');
  assert.equal(card.summary_source, 'note-intro');
  assert.deepEqual(card.progress, { lessons_total: 2, lessons_generated: 1, lessons_mastered: 0, courses: 1 });
});

test('buildNodeCard for a plain note: note-intro summary, no course', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'todos.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'note');
  assert.equal(card.course, null);
  assert.equal(card.summary, 'A plain note with real prose right here.');
  assert.equal(card.summary_source, 'note-intro');
});

test('buildNodeCard returns null for an id outside the node set - the route\'s 404', () => {
  const input = mkInput({ files: baseFiles(), courses: [RUST_COURSE], id: 'no-such-note.md' });
  assert.equal(buildNodeCard(input), null);
});

test('buildNodeCard never reads note-intro OR the H1 heading out of a stray file sitting under a course modules/ directory', () => {
  // Regression for the confirmed leak: `title`'s fallback branch used to read
  // fileTextById.get(id) and regex-match its own "# " heading with no
  // modules/ guard at all, even though `summary` right below it already had
  // one. A file dropped next to a real lesson - not listed in any
  // module.yml, so it resolves to kind:'note' - must not leak its body
  // through EITHER field.
  const files = [...baseFiles(), { path: 'software-engineering/rust-for-backend/modules/01-ownership/scratch.md', text: '# Scratch\n\nThis text must never surface as a card summary or title.\n' }];
  const input = mkInput({ files, courses: [RUST_COURSE], id: 'software-engineering/rust-for-backend/modules/01-ownership/scratch.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'note'); // not listed in any module.yml lessons[], so it is a plain note
  assert.equal(card.summary, null);
  assert.equal(card.summary_source, 'none');
  assert.notEqual(card.title, 'Scratch'); // the file's own H1 - must never surface
  assert.equal(card.title, 'scratch'); // falls back to the id's own basename instead
});

test('buildNodeCard: a whole module orphaned by a malformed module.yml still refuses to leak its lessons\' bodies as titles', () => {
  // tryYaml (app/server/tree.ts) tolerates a malformed module.yml by dropping
  // the entire module - correct tolerate-and-200 behaviour - but that means
  // every lesson file under it loses its LessonRef and is reclassified
  // kind:'note' at once. Modelled here by handing buildNodeCard a `tree`
  // whose courses carry no modules at all, while the lesson files themselves
  // are still present in `files` - exactly what a real walkTenant() call
  // produces when a module.yml fails to parse.
  const files = baseFiles(); // includes .../modules/01-ownership/01-ownership.md, H1 "# Ownership"
  const courseWithNoModules = course({ ...RUST_COURSE, modules: [] });
  const input = mkInput({ files, courses: [courseWithNoModules], id: 'software-engineering/rust-for-backend/modules/01-ownership/01-ownership.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.kind, 'note'); // no module.yml entry survived, so this is no longer a 'lesson' node
  assert.notEqual(card.title, 'Ownership'); // the lesson body's own H1 - must never surface
  assert.equal(card.title, '01-ownership');
  assert.equal(card.summary, null);
  assert.equal(card.summary_source, 'none');
});

test('buildNodeCard reports a malformed derived block as a warning, not a thrown error', () => {
  const brokenHub = ['# Rust for backend - map', '', DERIVED_START, DERIVED_START, '- [[01-ownership]] - x', DERIVED_END].join('\n');
  const files = [
    baseFiles()[0],
    baseFiles()[1],
    { path: 'software-engineering/rust-for-backend/rust-for-backend-hub.md', text: brokenHub },
    baseFiles()[3],
  ];
  const input = mkInput({ files, courses: [RUST_COURSE], id: 'software-engineering/rust-for-backend/modules/01-ownership/01-ownership.md' });
  const card = buildNodeCard(input);
  assert.ok(card);
  assert.equal(card.summary, null);
  assert.equal(card.summary_source, 'none');
  assert.ok(card.warnings.length > 0, 'a malformed block is reported in warnings, never thrown');
});
