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
  RESUME_STATE_PREFIX,
  openStateKey,
  resumeStateKey,
  foldForSearch,
  isSectionOpen,
  withSectionOpen,
  withAllOpen,
  readOpenState,
  writeOpenState,
  readResumeState,
  writeResumeState,
  buildCourseListView,
  dueCountsByCourse,
  assembleSections,
  courseSlugFromFragment,
  sectionForCourse,
  decideToggle,
  type ListSection,
  type FilterableCourse,
  type OpenState,
  type SectionStore,
  type ResumeState,
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

test('localStorage appears only in the three named files, and courseList.ts/notesPanel.ts name no browser global', () => {
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

  // UI-16 added a second owner: the resume affordance is written from the
  // lesson page a learner leaves and read from the course list they return
  // to, so one file cannot own both ends the way open-state's single owner
  // does. v1.18 (docs/specs/notes.md) added a third: NotesPanel.tsx assigns
  // its own guarded `notesStore = localStorage` at module scope, the same
  // shape LessonPage.tsx's resumeStore uses. Every consumer still goes
  // through courseList.ts's SectionStore shape rather than reaching for the
  // global directly - that boundary, not a single-file count, is what this
  // test actually guards.
  const usingLocalStorage = files.filter((f) => readFileSync(f, 'utf8').includes('localStorage')).sort();
  const expected = [
    fileURLToPath(new URL('../client/src/pages/LessonPage.tsx', import.meta.url)),
    fileURLToPath(new URL('../client/src/pages/TenantCoursesPage.tsx', import.meta.url)),
    fileURLToPath(new URL('../client/src/components/NotesPanel.tsx', import.meta.url)),
  ].sort();
  assert.deepEqual(usingLocalStorage, expected, `expected exactly these files to name localStorage, got: ${usingLocalStorage.join(', ')}`);

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

// --- UI-08: due-first sort ---

test('dueCountsByCourse tallies entries per course, ignoring courses with none', () => {
  const counts = dueCountsByCourse([{ course: 'git' }, { course: 'git' }, { course: 'rust-for-backend' }]);
  assert.deepEqual(counts, { git: 2, 'rust-for-backend': 1 });
  assert.deepEqual(dueCountsByCourse([]), {});
});

test('sections with a due course sort it to the top, stable otherwise, and report dueCount', () => {
  const sections: ListSection[] = [
    { id: 'version-control', title: 'Version Control', courses: ['git', 'gh-flow'], source: 'explicit' },
  ];
  const view = buildCourseListView({
    sections,
    ungrouped: [],
    courses: COURSES,
    query: '',
    openState: {},
    dueCounts: { 'gh-flow': 3 },
  });
  const section = view.sections.find((s) => s.id === 'version-control')!;
  assert.deepEqual(section.courses, ['gh-flow', 'git'], 'the due course moves ahead of the non-due one');
  assert.equal(section.dueCount, 1);
});

test('no dueCounts given: order and dueCount are unchanged from before UI-08', () => {
  const view = buildCourseListView({ sections: SECTIONS, ungrouped: ['unfiled-one'], courses: COURSES, query: '', openState: {} });
  assert.deepEqual(
    view.sections.map((s) => s.courses),
    [['git', 'gh-flow'], ['rust-for-backend'], ['unfiled-one']],
  );
  assert.ok(view.sections.every((s) => s.dueCount === 0));
});

test('two due courses in one section keep their relative order, both ahead of the non-due one', () => {
  const sections: ListSection[] = [
    { id: 'mixed', title: 'Mixed', courses: ['git', 'gh-flow', 'rust-for-backend'], source: 'explicit' },
  ];
  const view = buildCourseListView({
    sections,
    ungrouped: [],
    courses: COURSES,
    query: '',
    openState: {},
    dueCounts: { git: 1, 'rust-for-backend': 2 },
  });
  const section = view.sections.find((s) => s.id === 'mixed')!;
  assert.deepEqual(section.courses, ['git', 'rust-for-backend', 'gh-flow']);
  assert.equal(section.dueCount, 2);
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

// --- UI-16: resume where you left off ---

test('resumeStateKey starts with RESUME_STATE_PREFIX, distinct from OPEN_STATE_PREFIX, and encodes the tenant', () => {
  const key = resumeStateKey('a/b');
  assert.ok(key.startsWith(RESUME_STATE_PREFIX));
  assert.notEqual(RESUME_STATE_PREFIX, OPEN_STATE_PREFIX);
  assert.notEqual(key, resumeStateKey('a%2Fb'));
});

test('writeResumeState then readResumeState round-trips exactly', () => {
  const resume: ResumeState = { course: 'git-fundamentals', module: 'm1-basics', file: 'staging', lessonTitle: 'Staging' };
  const s = memoryStore();
  writeResumeState(s, 'alice', resume);
  assert.deepEqual(readResumeState(s, 'alice'), resume);
});

test('a resume record written for one tenant is invisible to another', () => {
  const s = memoryStore();
  writeResumeState(s, 'alice', { course: 'git', module: 'm1', file: 'f', lessonTitle: 'F' });
  assert.equal(readResumeState(s, 'bob'), null);
});

test('readResumeState degrades to null for a null store, a throwing store, garbage JSON, and a record missing a field', () => {
  assert.equal(readResumeState(null, 'tenant'), null);

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
  assert.equal(readResumeState(throwingStore, 'tenant'), null);
  // writeResumeState must not throw even though the store does.
  writeResumeState(throwingStore, 'tenant', { course: 'c', module: 'm', file: 'f', lessonTitle: 'L' });

  for (const garbage of ['not json', '[]', 'null', '{"course":"c"}', '{"course":"c","module":"m","file":"f","lessonTitle":5}']) {
    const s = memoryStore({ [resumeStateKey('tenant')]: garbage });
    assert.equal(readResumeState(s, 'tenant'), null, `garbage input: ${garbage}`);
  }
});

// --- courseSlugFromFragment: the deep-link fragment -> course slug ---

test('courseSlugFromFragment maps a valid course fragment to its slug', () => {
  assert.equal(courseSlugFromFragment('course-llm-cost-and-token-engineering'), 'llm-cost-and-token-engineering');
});

test('courseSlugFromFragment returns null for an absent fragment', () => {
  assert.equal(courseSlugFromFragment(undefined), null);
});

test('courseSlugFromFragment returns null for the retired domain-<x> shape and other non-course fragments', () => {
  // the old scheme never shipped and carries no meaning now - it must not
  // resolve to anything, not even by accident
  assert.equal(courseSlugFromFragment('domain-ai-and-agents'), null);
  assert.equal(courseSlugFromFragment('glossary'), null, 'guide section fragments are not course fragments');
  assert.equal(courseSlugFromFragment('course-'), null, 'a course prefix with nothing after it names no slug');
});

// --- assembleSections / sectionForCourse: the assembled list a deep link resolves against ---

const GROUP_SECTIONS: ListSection[] = [
  { id: 'version-control', title: 'Version Control', courses: ['git', 'gh-flow'], source: 'explicit' },
  { id: 'domain:backend', title: 'Backend', courses: ['rust-for-backend'], source: 'domain' },
];

const GROUP_COURSES: FilterableCourse[] = [
  { slug: 'git', title: 'Git Fundamentals' },
  { slug: 'gh-flow', title: 'GitHub Flow' },
  { slug: 'rust-for-backend', title: 'Rust for Backend' },
  { slug: 'unfiled-one', title: 'Solo Course' },
];

test("sectionForCourse resolves a course in an explicit group to that group's id", () => {
  const assembled = assembleSections({ sections: GROUP_SECTIONS, ungrouped: ['unfiled-one'], courses: GROUP_COURSES });
  assert.equal(sectionForCourse(assembled, 'git'), 'version-control');
});

test('sectionForCourse resolves a course in a derived domain section to the domain section id', () => {
  const assembled = assembleSections({ sections: GROUP_SECTIONS, ungrouped: ['unfiled-one'], courses: GROUP_COURSES });
  assert.equal(sectionForCourse(assembled, 'rust-for-backend'), 'domain:backend');
});

test('sectionForCourse resolves a course with no group and no domain to Ungrouped', () => {
  const assembled = assembleSections({ sections: GROUP_SECTIONS, ungrouped: ['unfiled-one'], courses: GROUP_COURSES });
  assert.equal(sectionForCourse(assembled, 'unfiled-one'), UNGROUPED_ID);
});

test('sectionForCourse returns null for a slug no section contains', () => {
  const assembled = assembleSections({ sections: GROUP_SECTIONS, ungrouped: ['unfiled-one'], courses: GROUP_COURSES });
  assert.equal(sectionForCourse(assembled, 'does-not-exist'), null);
});

test('assembleSections drops a slug an explicit group still lists after its course no longer exists', () => {
  const stale: ListSection[] = [{ id: 'version-control', title: 'Version Control', courses: ['git', 'deleted-course'], source: 'explicit' }];
  const assembled = assembleSections({ sections: stale, ungrouped: [], courses: [{ slug: 'git', title: 'Git' }] });
  assert.deepEqual(assembled[0].courses, ['git']);
  assert.equal(sectionForCourse(assembled, 'deleted-course'), null, 'a stale slug must not resolve to a section that no longer renders it');
});

// --- decideToggle: the release/persist decision behind a <details> toggle event ---
// (TenantCoursesPage.toggleSection's only call site - see decideToggle's own
// comment in courseList.ts for the two browser-only regressions this covers)

test('decideToggle: a toggle that agrees with what was rendered is not a user action - the page-load erasure', () => {
  // The regression this guard exists for, reproduced in a browser against
  // `main`: React sets `open` on every section it renders open, the browser
  // fires `toggle` for that attribute write at mount, and the handler used to
  // read it as a click. Each one wrote `true` back, normalization dropped
  // `true` as the default, and the surviving `false` entries were pruned
  // against whatever section list had resolved so far - so the key was
  // removed and every reload came back fully expanded.
  assert.deepEqual(
    decideToggle({ sectionId: 'version-control', activeForcedId: null, next: true, rendered: true, filtering: false }),
    { release: false, persist: false },
  );
  // and the mirror of it: Collapse all removes the attribute, which fires a
  // toggle of its own that setAllOpen has already persisted for.
  assert.deepEqual(
    decideToggle({ sectionId: 'version-control', activeForcedId: null, next: false, rendered: false, filtering: false }),
    { release: false, persist: false },
  );
});

test("decideToggle: the forced section's own programmatic open releases nothing and persists nothing", () => {
  // forced means rendered open, so this is one instance of the rule above
  // rather than a case of its own.
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: 'domain:ai-and-agents', next: true, rendered: true, filtering: false }),
    { release: false, persist: false },
  );
});

test('decideToggle: the user closing a forced section releases the force and persists the close', () => {
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: 'domain:ai-and-agents', next: false, rendered: true, filtering: false }),
    { release: true, persist: true },
  );
});

test('decideToggle: a toggle on a section that is not the active forced one always persists, never releases', () => {
  assert.deepEqual(
    decideToggle({ sectionId: 'version-control', activeForcedId: 'domain:ai-and-agents', next: true, rendered: false, filtering: false }),
    { release: false, persist: true },
  );
  assert.deepEqual(
    decideToggle({ sectionId: 'version-control', activeForcedId: 'domain:ai-and-agents', next: false, rendered: true, filtering: false }),
    { release: false, persist: true },
  );
});

test('decideToggle: a toggle when nothing is forced always persists, never releases', () => {
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: null, next: true, rendered: false, filtering: false }),
    { release: false, persist: true },
  );
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: null, next: false, rendered: true, filtering: false }),
    { release: false, persist: true },
  );
});

test('decideToggle: filtering discards a toggle on the forced section completely - release included, not only persist', () => {
  // regression: closing a forced section while filtering used to release the
  // force (making it look closed on this render) without persisting the
  // close, so the very next render fell back to the filter's own forced-open
  // (buildCourseListView pins open: true while filtering) and the section
  // popped back open on its own. filtering must gate release exactly like it
  // already gates persist, so this is the same {false, false} regardless of
  // which way `next` points.
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: 'domain:ai-and-agents', next: false, rendered: true, filtering: true }),
    { release: false, persist: false },
  );
  assert.deepEqual(
    decideToggle({ sectionId: 'domain:ai-and-agents', activeForcedId: 'domain:ai-and-agents', next: true, rendered: false, filtering: true }),
    { release: false, persist: false },
  );
});

test('decideToggle: filtering discards a toggle on a non-forced section too', () => {
  assert.deepEqual(
    decideToggle({ sectionId: 'version-control', activeForcedId: null, next: true, rendered: false, filtering: true }),
    { release: false, persist: false },
  );
});
