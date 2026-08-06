// Pure unit coverage for app/client/src/courseList.ts - no server, no helpers.ts,
// no DOM. This is the one piece of client logic in this repo unit-tested rather
// than smoke-tested; see docs/specs/app.md item 9 and invariant 13.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  UNGROUPED_ID,
  UNGROUPED_TITLE,
  OPEN_STATE_PREFIX,
  openStateKey,
  foldForSearch,
  isSectionOpen,
  withSectionOpen,
  withAllOpen,
  readOpenState,
  writeOpenState,
  buildCourseListView,
  type ListSection,
  type FilterableCourse,
  type OpenState,
  type SectionStore,
} from '../client/src/courseList.ts';

const SECTIONS: ListSection[] = [
  { id: 'version-control', title: 'Version Control', courses: ['git', 'gh-flow'], source: 'explicit' },
  { id: 'domain:backend', title: 'Backend', courses: ['rust-for-backend'], source: 'domain' },
];

const COURSES: FilterableCourse[] = [
  { slug: 'git', title: 'Git Fundamentals' },
  { slug: 'gh-flow', title: 'GitHub Flow' },
  { slug: 'rust-for-backend', title: 'Rust for Backend' },
  { slug: 'unfiled-one', title: 'Café Culture' },
];

function memoryStore(initial?: Record<string, string>): SectionStore {
  const data = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    getItem: (key) => (data.has(key) ? data.get(key)! : null),
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

// --- case 4: prototype-shaped stored keys never pollute Object.prototype ---

test('a stored object carrying __proto__, constructor and toString keys neither changes open state nor pollutes Object.prototype', () => {
  // A section id that merely shares a name with an Object.prototype member,
  // but has no *own* entry in state, must still resolve to the open default -
  // proof that isSectionOpen reads with Object.hasOwn rather than a bare
  // index (which would read Function.prototype.toString off the chain).
  const sparse: OpenState = { 'version-control': false };
  assert.equal(isSectionOpen(sparse, 'constructor'), true);
  assert.equal(isSectionOpen(sparse, 'toString'), true);
  assert.equal(isSectionOpen(sparse, 'hasOwnProperty'), true);

  // JSON.parse itself never triggers the __proto__ setter (it defines own data
  // properties via CreateDataProperty), so this is a hostile-*looking* value
  // that must still round-trip without ever touching Object.prototype.
  const hostile = JSON.parse(
    '{"__proto__": {"polluted": true}, "constructor": false, "toString": false, "version-control": false}',
  ) as OpenState;
  assert.equal(isSectionOpen(hostile, 'constructor'), false, 'an explicit own false entry is honored regardless of its name');
  assert.equal(isSectionOpen(hostile, 'toString'), false);
  assert.equal(isSectionOpen(hostile, 'version-control'), false);
  assert.equal(isSectionOpen(hostile, '__proto__'), true, 'the __proto__ entry is a non-boolean object value, so it defaults open');

  const store = memoryStore({
    'meno.courseList.open.v1:tenant': JSON.stringify({
      __proto__: { polluted: true },
      constructor: false,
      toString: false,
      'version-control': false,
    }),
  });
  const read = readOpenState(store, 'tenant');
  assert.equal(read['version-control'], false);
  assert.equal(read['constructor'], false);
  assert.equal(read['toString'], false);
  assert.equal(Object.hasOwn(read, '__proto__'), false, 'a non-boolean value is dropped, even under this key');
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'Object.prototype must stay clean');
});

// --- case 10: allSectionIds preserves stale/hidden state across a write ---

test('allSectionIds includes sections the filter hid, and writeOpenState against it preserves their stored state', () => {
  const openState: OpenState = { 'version-control': false, 'domain:backend': false };
  const view = buildCourseListView({
    sections: SECTIONS,
    ungrouped: ['unfiled-one'],
    courses: COURSES,
    query: 'git',
    openState,
  });

  // "git" only matches the Version Control section - Backend and Ungrouped are hidden
  assert.deepEqual(
    view.sections.map((s) => s.id),
    ['version-control'],
  );
  assert.deepEqual(view.allSectionIds, ['version-control', 'domain:backend', UNGROUPED_ID]);

  const persisted = writeOpenState(memoryStore(), 'tenant', openState, view.allSectionIds);
  assert.equal(persisted['domain:backend'], false, 'a section the filter hid must not be pruned away');
  assert.equal(persisted['version-control'], false);
});

// --- case 13: source grep for the DOM-free / localStorage-fenced boundary ---

test('localStorage appears in exactly one client file, and courseList.ts names no browser global', () => {
  const clientSrcDir = fileURLToPath(new URL('../client/src', import.meta.url));

  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  })(clientSrcDir);

  const usingLocalStorage = files.filter((f) => readFileSync(f, 'utf8').includes('localStorage'));
  assert.equal(usingLocalStorage.length, 1, `expected exactly one file naming localStorage, got: ${usingLocalStorage.join(', ')}`);
  assert.ok(usingLocalStorage[0].endsWith(join('pages', 'TenantCoursesPage.tsx')));

  const courseListSrc = readFileSync(fileURLToPath(new URL('../client/src/courseList.ts', import.meta.url)), 'utf8');
  assert.equal(courseListSrc.includes("from 'react'"), false);
  assert.equal(courseListSrc.includes('localStorage'), false);
  assert.equal(courseListSrc.includes('window.'), false);
  assert.equal(courseListSrc.includes('document.'), false);
});

// --- case 1 ---

test('no query: sections render in server order, Ungrouped last and only when non-empty, all open by default', () => {
  const view = buildCourseListView({
    sections: SECTIONS,
    ungrouped: ['unfiled-one'],
    courses: COURSES,
    query: '',
    openState: {},
  });
  assert.deepEqual(
    view.sections.map((s) => s.id),
    ['version-control', 'domain:backend', UNGROUPED_ID],
  );
  assert.ok(view.sections.every((s) => s.open === true));
  const last = view.sections.at(-1)!;
  assert.equal(last.title, UNGROUPED_TITLE);
  assert.equal(view.filtering, false);
});

test('no query, empty ungrouped: Ungrouped section is absent entirely', () => {
  const view = buildCourseListView({
    sections: SECTIONS,
    ungrouped: [],
    courses: COURSES,
    query: '',
    openState: {},
  });
  assert.ok(!view.sections.some((s) => s.id === UNGROUPED_ID));
});

// --- case 2 ---

test('a stored false for one section id collapses that section and no other', () => {
  const view = buildCourseListView({
    sections: SECTIONS,
    ungrouped: [],
    courses: COURSES,
    query: '',
    openState: { 'domain:backend': false },
  });
  const vc = view.sections.find((s) => s.id === 'version-control')!;
  const backend = view.sections.find((s) => s.id === 'domain:backend')!;
  assert.equal(vc.open, true);
  assert.equal(backend.open, false);
});

// --- case 3 ---

test('a stored entry for a section id that no longer exists is ignored on read and pruned on the next write', () => {
  const store = memoryStore({
    'meno.courseList.open.v1:tenant': JSON.stringify({ 'stale-id': false, 'version-control': false }),
  });
  const state = readOpenState(store, 'tenant');
  assert.equal(state['stale-id'], false, 'read does not itself know which ids are stale');

  const persisted = writeOpenState(store, 'tenant', state, ['version-control', 'domain:backend']);
  assert.equal(Object.hasOwn(persisted, 'stale-id'), false);
  assert.equal(persisted['version-control'], false);
});

// --- case 5 & 6 ---

test('filtering matches on title and on slug, case-insensitively, as a substring', () => {
  const byTitle = buildCourseListView({ sections: SECTIONS, ungrouped: [], courses: COURSES, query: 'FUNDA', openState: {} });
  assert.deepEqual(byTitle.sections.flatMap((s) => s.courses), ['git']);

  const bySlug = buildCourseListView({ sections: SECTIONS, ungrouped: [], courses: COURSES, query: 'gh-fl', openState: {} });
  assert.deepEqual(bySlug.sections.flatMap((s) => s.courses), ['gh-flow']);
});

test('filtering is diacritic-insensitive both directions', () => {
  const asciiQuery = buildCourseListView({
    sections: [],
    ungrouped: ['unfiled-one'],
    courses: COURSES,
    query: 'cafe',
    openState: {},
  });
  assert.deepEqual(asciiQuery.sections.flatMap((s) => s.courses), ['unfiled-one']);

  const accentedQuery = buildCourseListView({
    sections: [],
    ungrouped: ['unfiled-one', 'git'],
    courses: [...COURSES, { slug: 'cafe-basics', title: 'cafe basics' }],
    query: 'Café',
    openState: {},
  });
  const matched = accentedQuery.sections.flatMap((s) => s.courses);
  assert.ok(matched.includes('unfiled-one'));
});

// --- case 7 ---

test('while filtering, non-matching sections vanish, matching sections force-open, and openState is untouched', () => {
  const openState: OpenState = { 'version-control': false };
  const frozen = structuredClone(openState);
  const view = buildCourseListView({ sections: SECTIONS, ungrouped: [], courses: COURSES, query: 'git', openState });

  assert.deepEqual(
    view.sections.map((s) => s.id),
    ['version-control'],
  );
  assert.equal(view.sections[0].open, true, 'a matching section forces open even though stored state says closed');
  assert.deepEqual(openState, frozen, 'buildCourseListView must never mutate its input');
});

// --- case 8 ---

test('a query matching nothing anywhere yields noResults, zero matches, and no sections', () => {
  const view = buildCourseListView({
    sections: SECTIONS,
    ungrouped: ['unfiled-one'],
    courses: COURSES,
    query: 'zzz-nope',
    openState: {},
  });
  assert.equal(view.noResults, true);
  assert.equal(view.matches, 0);
  assert.deepEqual(view.sections, []);
});

test('whitespace-only query is not filtering', () => {
  const view = buildCourseListView({ sections: SECTIONS, ungrouped: [], courses: COURSES, query: '   ', openState: {} });
  assert.equal(view.filtering, false);
  assert.equal(view.noResults, false);
});

// --- case 9 ---

test('a slug present in a section but absent from courses is dropped, and section.courses.length matches rendered rows', () => {
  const sections: ListSection[] = [
    { id: 'version-control', title: 'Version Control', courses: ['git', 'ghost-course'], source: 'explicit' },
  ];
  const view = buildCourseListView({ sections, ungrouped: [], courses: COURSES, query: '', openState: {} });
  const section = view.sections.find((s) => s.id === 'version-control')!;
  assert.deepEqual(section.courses, ['git']);
  assert.equal(section.courses.length, 1);
});

// --- case 11 ---

test('readOpenState/writeOpenState degrade gracefully for null, garbage, and throwing stores', () => {
  assert.deepEqual(readOpenState(null, 'tenant'), {});

  for (const garbage of ['not json', '[]', 'null', '{"a":"maybe"}']) {
    const store = memoryStore({ 'meno.courseList.open.v1:tenant': garbage });
    assert.deepEqual(readOpenState(store, 'tenant'), {}, `garbage input: ${garbage}`);
  }

  const throwingStore: SectionStore = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {
      throw new Error('blocked');
    },
  };
  assert.deepEqual(readOpenState(throwingStore, 'tenant'), {});
  const result = writeOpenState(throwingStore, 'tenant', { a: false }, ['a', 'b']);
  assert.deepEqual(result, { a: false }, 'writeOpenState still returns the normalized state even when persistence throws');

  assert.equal(writeOpenState(null, 'tenant', { a: false }, ['a']).a, false);
});

// --- case 12 ---

test('openStateKey starts with OPEN_STATE_PREFIX and encodes the tenant', () => {
  const keyA = openStateKey('a/b');
  const keyB = openStateKey('a%2Fb');
  assert.ok(keyA.startsWith(OPEN_STATE_PREFIX));
  assert.notEqual(keyA, keyB);
});

// --- withSectionOpen / withAllOpen purity ---

test('withSectionOpen returns a new object and never mutates its input', () => {
  const original: OpenState = { a: false };
  const next = withSectionOpen(original, 'b', false);
  assert.deepEqual(original, { a: false });
  assert.deepEqual(next, { a: false, b: false });
  assert.notEqual(next, original);
});

test('withAllOpen sets every id at once', () => {
  const closed = withAllOpen(['a', 'b', 'c'], false);
  assert.deepEqual(closed, { a: false, b: false, c: false });
  const opened = withAllOpen(['a', 'b'], true);
  assert.deepEqual(opened, { a: true, b: true });
});

// --- foldForSearch ---

test('foldForSearch strips combining marks and lowercases', () => {
  assert.equal(foldForSearch('Café'), 'cafe');
  assert.equal(foldForSearch('CAFE'), 'cafe');
});

// --- byDomain flag ---

test('byDomain is true only for a derived domain section, never for Ungrouped', () => {
  const view = buildCourseListView({ sections: SECTIONS, ungrouped: ['unfiled-one'], courses: COURSES, query: '', openState: {} });
  const explicit = view.sections.find((s) => s.id === 'version-control')!;
  const domain = view.sections.find((s) => s.id === 'domain:backend')!;
  const ungrouped = view.sections.find((s) => s.id === UNGROUPED_ID)!;
  assert.equal(explicit.byDomain, false);
  assert.equal(domain.byDomain, true);
  assert.equal(ungrouped.byDomain, false);
});
