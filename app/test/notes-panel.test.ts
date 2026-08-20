// Pure unit coverage for app/client/src/notesPanel.ts, the same arrangement
// course-list.test.ts uses for courseList.ts - no server, no DOM. Plus a
// handful of source-grep assertions over the panel's DOM-bearing files
// (done-checklist item 14): no `:target`, no `document.getElementById`, and
// exactly the one `prefersReducedMotion()` call site docs/specs/notes.md's
// "Revealing a lesson section from the panel" describes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  COURSE_KNOWN_SECTIONS,
  INITIAL_SAVE_STATE,
  RESERVED_COURSE_SECTION,
  RESERVED_LESSON_SECTION,
  assemblePanelSections,
  decideDebounceFired,
  decideSave,
  decideWriteFailed,
  decideWriteSettled,
  knownSectionsForLesson,
  notesBufferKey,
  notesOpenKey,
  readNotesBuffer,
  readNotesOpen,
  relevantBlocks,
  resolveConflict,
  withBufferEntry,
  withoutBufferEntry,
  writeNotesBuffer,
  writeNotesOpen,
  type NotesBuffer,
  type SaveState,
} from '../client/src/notesPanel.ts';
import type { CourseNoteBlock, CourseNotesResponse } from '../shared/types.ts';
import type { SectionStore } from '../client/src/courseList.ts';

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

function throwingStore(): SectionStore {
  return {
    getItem: () => {
      throw new Error('quota exceeded');
    },
    setItem: () => {
      throw new Error('quota exceeded');
    },
    removeItem: () => {
      throw new Error('quota exceeded');
    },
  };
}

function read(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
}

// --- section list assembly --------------------------------------------------

test('assemblePanelSections: known sections come first in order, blank text when no block exists', () => {
  const known = [
    { key: 'whole-lesson', title: 'Whole lesson' },
    { key: '4-worked-example', title: 'Worked example' },
    { key: '7-retrieval-check', title: 'Recall' },
  ];
  const blocks: CourseNoteBlock[] = [
    { page: 'lesson', module: 'm1', lesson: 'l1', section: '4-worked-example', text: 'the move happens at the call' },
  ];
  const result = assemblePanelSections(known, blocks);
  assert.deepEqual(
    result.map((s) => [s.key, s.text, s.matched]),
    [
      ['whole-lesson', '', true],
      ['4-worked-example', 'the move happens at the call', true],
      ['7-retrieval-check', '', true],
    ],
  );
});

test('assemblePanelSections: a block matching no known section is unmatched, appended after known ones, in file order', () => {
  const known = [{ key: 'whole-lesson', title: 'Whole lesson' }];
  const blocks: CourseNoteBlock[] = [
    { page: 'lesson', module: 'm1', lesson: 'l1', section: 'whole-lesson', text: 'kept' },
    { page: 'lesson', module: 'm1', lesson: 'l1', section: 'h-old-heading', text: 'orphaned but preserved' },
  ];
  const result = assemblePanelSections(known, blocks);
  assert.deepEqual(
    result.map((s) => [s.key, s.text, s.matched]),
    [
      ['whole-lesson', 'kept', true],
      ['h-old-heading', 'orphaned but preserved', false],
    ],
  );
});

test('assemblePanelSections: a duplicate address resolves to its first occurrence only, matching the server\'s own read rule', () => {
  const known = [{ key: 'whole-lesson', title: 'Whole lesson' }];
  const blocks: CourseNoteBlock[] = [
    { page: 'lesson', module: 'm1', lesson: 'l1', section: 'whole-lesson', text: 'first' },
    { page: 'lesson', module: 'm1', lesson: 'l1', section: 'whole-lesson', text: 'second, shadowed' },
  ];
  const result = assemblePanelSections(known, blocks);
  assert.equal(result.length, 1);
  assert.equal(result[0]!.text, 'first');
});

test('knownSectionsForLesson and COURSE_KNOWN_SECTIONS project the shape assemblePanelSections needs', () => {
  const sections = knownSectionsForLesson([
    { key: 'whole-lesson', title: 'Whole lesson', anatomy_part: null },
    { key: '4-worked-example', title: 'Worked example', anatomy_part: '4-worked-example' },
  ]);
  assert.deepEqual(sections, [
    { key: 'whole-lesson', title: 'Whole lesson' },
    { key: '4-worked-example', title: 'Worked example' },
  ]);
  assert.deepEqual([...COURSE_KNOWN_SECTIONS], [{ key: RESERVED_COURSE_SECTION, title: 'Course' }]);
});

test('relevantBlocks: narrows the whole course notes file to one lesson\'s own blocks, in file order', () => {
  const blocks: CourseNoteBlock[] = [
    { page: 'course', module: null, lesson: null, section: 'whole-course', text: 'a course note' },
    { page: 'lesson', module: 'm1', lesson: 'l1', section: 'whole-lesson', text: 'lesson 1 note' },
    { page: 'lesson', module: 'm1', lesson: 'l2', section: 'whole-lesson', text: 'lesson 2 note' },
  ];
  assert.deepEqual(relevantBlocks(blocks, 'lesson', 'm1', 'l1').map((b) => b.text), ['lesson 1 note']);
  assert.deepEqual(relevantBlocks(blocks, 'course', null, null).map((b) => b.text), ['a course note']);
});

// --- localStorage: open/closed view state -----------------------------------

test('notesOpenKey: versioned, tenant-scoped, and encoded so two tenant names cannot collide', () => {
  assert.equal(notesOpenKey('a tenant'), 'meno.notes.open.v1:a%20tenant');
});

test('readNotesOpen/writeNotesOpen: round-trip through a store, default closed, removes the key when closed', () => {
  const store = memoryStore();
  assert.equal(readNotesOpen(store, 't'), false);
  writeNotesOpen(store, 't', true);
  assert.equal(readNotesOpen(store, 't'), true);
  writeNotesOpen(store, 't', false);
  assert.equal(readNotesOpen(store, 't'), false);
  assert.equal(store.getItem(notesOpenKey('t')), null);
});

test('readNotesOpen/writeNotesOpen: a null or throwing store degrades to closed/session-only, never throws', () => {
  assert.equal(readNotesOpen(null, 't'), false);
  assert.doesNotThrow(() => writeNotesOpen(null, 't', true));
  const throwing = throwingStore();
  assert.equal(readNotesOpen(throwing, 't'), false);
  assert.doesNotThrow(() => writeNotesOpen(throwing, 't', true));
});

// --- localStorage: the unsaved-text buffer ----------------------------------

test('notesBufferKey: versioned, tenant- and course-scoped, both segments encoded', () => {
  assert.equal(notesBufferKey('a tenant', 'rust for backend'), 'meno.notes.buffer.v1:a%20tenant:rust%20for%20backend');
});

test('readNotesBuffer/writeNotesBuffer: round-trip, and an empty buffer removes the key rather than storing {}', () => {
  const store = memoryStore();
  assert.deepEqual(readNotesBuffer(store, 't', 'c'), {});
  const buffer: NotesBuffer = withBufferEntry({}, 'whole-lesson', {
    text: 'unsaved',
    based_on_sha256: 'abc123',
    saved_at: '2026-08-20T00:00:00.000Z',
  });
  writeNotesBuffer(store, 't', 'c', buffer);
  assert.deepEqual(readNotesBuffer(store, 't', 'c'), buffer);
  writeNotesBuffer(store, 't', 'c', withoutBufferEntry(buffer, 'whole-lesson'));
  assert.equal(store.getItem(notesBufferKey('t', 'c')), null);
});

test('readNotesBuffer: {} for a null store, unparseable JSON, a non-object, an array, or an entry missing a field', () => {
  assert.deepEqual(readNotesBuffer(null, 't', 'c'), {});
  const badJson = memoryStore({ [notesBufferKey('t', 'c')]: 'not json' });
  assert.deepEqual(readNotesBuffer(badJson, 't', 'c'), {});
  const arrayShaped = memoryStore({ [notesBufferKey('t', 'c')]: '[1,2,3]' });
  assert.deepEqual(readNotesBuffer(arrayShaped, 't', 'c'), {});
  const halfWritten = memoryStore({ [notesBufferKey('t', 'c')]: JSON.stringify({ x: { text: 'no hash or timestamp' } }) });
  assert.deepEqual(readNotesBuffer(halfWritten, 't', 'c'), {});
});

test('withBufferEntry/withoutBufferEntry: new objects, never mutate their input', () => {
  const original: NotesBuffer = {};
  const withEntry = withBufferEntry(original, 'k', { text: 't', based_on_sha256: 'h', saved_at: 's' });
  assert.deepEqual(original, {});
  assert.notEqual(withEntry, original);
  const without = withoutBufferEntry(withEntry, 'k');
  assert.deepEqual(withEntry, { k: { text: 't', based_on_sha256: 'h', saved_at: 's' } });
  assert.deepEqual(without, {});
});

// --- the debounce/flush decision --------------------------------------------

test('decideSave: a keystroke schedules a debounce, and marks dirty', () => {
  const decision = decideSave(INITIAL_SAVE_STATE, 'keystroke');
  assert.equal(decision.action, 'schedule-debounce');
  assert.deepEqual(decision.state, { dirty: true, inFlight: false, pendingFlush: false });
});

test('decideSave: blur/close/navigate/pagehide flush immediately when dirty, do nothing when clean', () => {
  const dirty: SaveState = { dirty: true, inFlight: false, pendingFlush: false };
  for (const trigger of ['blur', 'close', 'navigate', 'pagehide'] as const) {
    const decision = decideSave(dirty, trigger);
    assert.equal(decision.action, 'flush-now', trigger);
    assert.deepEqual(decision.state, { dirty: false, inFlight: true, pendingFlush: false }, trigger);
  }
  const clean = decideSave(INITIAL_SAVE_STATE, 'blur');
  assert.equal(clean.action, 'noop');
  assert.deepEqual(clean.state, INITIAL_SAVE_STATE);
});

test('decideSave: an in-flight write is not duplicated - a trigger that lands mid-write marks pendingFlush instead of a second flush-now', () => {
  const inFlight: SaveState = { dirty: false, inFlight: true, pendingFlush: false };
  const onKeystroke = decideSave(inFlight, 'keystroke');
  assert.equal(onKeystroke.action, 'noop');
  assert.deepEqual(onKeystroke.state, { dirty: true, inFlight: true, pendingFlush: false });

  const onBlur = decideSave(inFlight, 'blur');
  assert.equal(onBlur.action, 'noop');
  assert.deepEqual(onBlur.state, { dirty: true, inFlight: true, pendingFlush: true });
});

test('decideDebounceFired: flushes when dirty and idle, defers via pendingFlush when a write is already in flight, no-ops when clean', () => {
  const dirty: SaveState = { dirty: true, inFlight: false, pendingFlush: false };
  assert.equal(decideDebounceFired(dirty).action, 'flush-now');

  const inFlight: SaveState = { dirty: true, inFlight: true, pendingFlush: false };
  const deferred = decideDebounceFired(inFlight);
  assert.equal(deferred.action, 'noop');
  assert.equal(deferred.state.pendingFlush, true);

  assert.equal(decideDebounceFired(INITIAL_SAVE_STATE).action, 'noop');
});

test('decideWriteSettled: fires the deferred flush when one was requested mid-write, otherwise clears inFlight with no new write', () => {
  const withPending: SaveState = { dirty: true, inFlight: true, pendingFlush: true };
  const settled = decideWriteSettled(withPending);
  assert.equal(settled.action, 'flush-now');
  assert.deepEqual(settled.state, { dirty: false, inFlight: true, pendingFlush: false });

  const withoutPending: SaveState = { dirty: false, inFlight: true, pendingFlush: false };
  const clean = decideWriteSettled(withoutPending);
  assert.equal(clean.action, 'noop');
  assert.deepEqual(clean.state, { dirty: false, inFlight: false, pendingFlush: false });
});

test('decideWriteFailed: leaves dirty true so the ordinary triggers retry once the failure is resolved', () => {
  assert.deepEqual(decideWriteFailed(), { dirty: true, inFlight: false, pendingFlush: false });
});

// --- the conflict state machine's two exits ---------------------------------

const CONFLICT_CURRENT: CourseNotesResponse = {
  course: 'rust-for-backend',
  path: 'software-engineering/rust-for-backend/rust-for-backend-notes.md',
  exists: true,
  blocks: [
    { page: 'lesson', module: 'm1', lesson: 'l1', section: RESERVED_LESSON_SECTION, text: 'what someone else just wrote' },
  ],
  raw_sha256: 'fresh-hash',
  warnings: [],
};

test('resolveConflict: "reload from disk" adopts the conflicting block\'s text and the fresh hash', () => {
  const resolution = resolveConflict(
    { current: CONFLICT_CURRENT, section: RESERVED_LESSON_SECTION, pendingText: 'what I was mid-typing' },
    'reload',
  );
  assert.deepEqual(resolution, { action: 'reload', adoptedText: 'what someone else just wrote', newHash: 'fresh-hash' });
});

test('resolveConflict: "reload from disk" adopts \'\' when the section has no block on the server yet', () => {
  const resolution = resolveConflict(
    { current: CONFLICT_CURRENT, section: 'h-some-other-heading', pendingText: 'irrelevant' },
    'reload',
  );
  assert.deepEqual(resolution, { action: 'reload', adoptedText: '', newHash: 'fresh-hash' });
});

test('resolveConflict: "overwrite" re-sends the buffered text with the fresh hash as If-Match', () => {
  const resolution = resolveConflict(
    { current: CONFLICT_CURRENT, section: RESERVED_LESSON_SECTION, pendingText: 'what I was mid-typing' },
    'overwrite',
  );
  assert.deepEqual(resolution, { action: 'overwrite', text: 'what I was mid-typing', ifMatch: 'fresh-hash' });
});

// --- done-checklist item 14: source assertions ------------------------------

test('notes.css never uses :target - it cannot match under this hash router', () => {
  const source = read('../client/src/styles/notes.css');
  assert.doesNotMatch(source, /:target/);
});

test('NotesPanel.tsx never calls document.getElementById', () => {
  const source = read('../client/src/components/NotesPanel.tsx');
  assert.doesNotMatch(source, /document\.getElementById/);
});

test('sectionNoteButtons.tsx never calls document.getElementById', () => {
  const source = read('../client/src/sectionNoteButtons.tsx');
  assert.doesNotMatch(source, /document\.getElementById/);
});

test('NotesPanel.tsx reveals a section through prefersReducedMotion(), not an inline matchMedia string, and is the one call site in this feature\'s client code', () => {
  const notesPanelSource = read('../client/src/components/NotesPanel.tsx');
  assert.match(notesPanelSource, /prefersReducedMotion\(\)/);
  assert.doesNotMatch(notesPanelSource, /matchMedia/);
  const sectionButtonsSource = read('../client/src/sectionNoteButtons.tsx');
  assert.doesNotMatch(sectionButtonsSource, /matchMedia|prefersReducedMotion/);
  const notesPanelLogicSource = read('../client/src/notesPanel.ts');
  assert.doesNotMatch(notesPanelLogicSource, /matchMedia|prefersReducedMotion/);
});

// --- browser-verified defects: no test-suite coverage without these guards --

test('sectionNoteButtons.tsx mounts as plain DOM, never a react-dom root - a per-heading root raced with the parent render', () => {
  // Verified in a clean browser: creating and destroying a react-dom root
  // per heading, torn down synchronously during a React render pass, logged
  // "Attempted to synchronously unmount a root while React was already
  // rendering" eleven times on a single lesson page load. These buttons live
  // outside React's tree by design, so no createRoot/ReactDOM/flushSync may
  // appear here - only plain document.createElement/addEventListener/remove.
  const source = read('../client/src/sectionNoteButtons.tsx');
  assert.doesNotMatch(source, /createRoot|ReactDOM|flushSync/);
});

test('notes.css declares .notes-scrim pointer-events: none - the panel is non-modal, so the scrim must dim without blocking clicks', () => {
  // Verified in a clean browser at 900px: with the scrim capturing pointer
  // events, document.elementFromPoint() on a content link returned the
  // scrim, not the link, so a pointer user could not reach content a
  // keyboard user could already Tab into (the panel has role="complementary",
  // no aria-modal, no focus trap - it was never meant to block the page).
  const source = read('../client/src/styles/notes.css');
  assert.match(source, /\.notes-scrim\s*{[^}]*pointer-events:\s*none/s);
});

// --- four-lens council review fixes ------------------------------------------

test('invariant 8 guard: notes.css never selects .content, so it can never set a width/max-width/margin/padding on the reading column', () => {
  // The panel is `position: fixed` throughout and must never become a
  // document-flow sibling of `.content` (styles/notes.css's own top
  // comment). Verified live at 1440px and 900px with no automated guard -
  // this is that guard, in the same source-grep idiom course-list.test.ts's
  // case 13 uses for its localStorage boundary: the strongest check this
  // repo's tooling (no DOM, no browser) allows.
  const source = read('../client/src/styles/notes.css');
  // Strip comments first - the file's own top comment names `.content` in
  // prose (explaining why it never touches it), which must not itself trip
  // this guard. What must never appear is an actual rule selecting it.
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(
    withoutComments,
    /\.content\b/,
    'notes.css must never select .content in a rule - the reading column\'s box model belongs to styles.css alone',
  );
});

test('doFlush buffers the unsaved text on any failed write, not only a 409 - a plain network failure must not lose it', () => {
  // HIGH finding: writeNotesBuffer used to sit inside the `e.status === 409`
  // branch only, so a dropped connection or a 500 set status('error') with
  // nothing persisted. The buffer write must now happen unconditionally in
  // the catch, before the 409-specific conflict branch runs.
  const source = read('../client/src/components/NotesPanel.tsx');
  const catchMatch = source.match(/\.catch\(\(e: unknown\) => \{[\s\S]*?\n {6}\}\);/);
  assert.ok(catchMatch, 'doFlush must have a .catch((e: unknown) => { ... }) handler');
  const catchBody = catchMatch![0];
  const bufferIndex = catchBody.indexOf('writeNotesBuffer(');
  const statusCheckIndex = catchBody.indexOf('e.status === 409');
  assert.ok(bufferIndex >= 0, 'the catch handler must call writeNotesBuffer');
  assert.ok(statusCheckIndex >= 0, 'the catch handler must still special-case 409 for the conflict UI');
  assert.ok(bufferIndex < statusCheckIndex, 'writeNotesBuffer must run before the 409 branch, i.e. unconditionally for every failure');
});

test('the conflict actions are not styled or worded as peers: "keep" names the safe action, "discard" names the destructive one', () => {
  // MODERATE-HIGH finding: two identically-styled one-click buttons
  // ("Reload from disk", "Overwrite") did not say which one destroys the
  // learner's unsaved words. Each action must now be labelled by its effect
  // on the learner's own text and carry a distinct class so the destructive
  // action can be styled visually secondary.
  const source = read('../client/src/components/NotesPanel.tsx');
  assert.match(source, /className="notes-conflict-keep"[\s\S]{0,80}onClick=\{\(\) => handleResolve\('overwrite'\)\}/);
  assert.match(source, /className="notes-conflict-discard"[\s\S]{0,80}onClick=\{\(\) => handleResolve\('reload'\)\}/);
  assert.match(source, /Keep what I wrote/);
  assert.match(source, /Discard what I wrote/);
  assert.doesNotMatch(source, /^\s*<button type="button" onClick=\{\(\) => handleResolve/m, 'no more unstyled, unlabelled peer buttons');

  const css = read('../client/src/styles/notes.css');
  assert.match(css, /\.notes-conflict-keep\s*\{[^}]*border:\s*1px solid var\(--warning-border\)/s, 'the safe action reads as primary');
  assert.match(css, /\.notes-conflict-discard\s*\{[^}]*background:\s*transparent/s, 'the destructive action is visually secondary, not a peer');
});

test('a section note button press moves focus, and announces via the panel accessible name, whether the panel was open or closed', () => {
  // MODERATE finding: the focus effect depended on `[open]` alone, so
  // pressing a section note button while the panel was already open on a
  // different section changed selectedKey but moved no focus and announced
  // nothing. The effect must also depend on focusRequest's nonce, and the
  // panel's accessible name must name the currently selected section.
  const source = read('../client/src/components/NotesPanel.tsx');
  assert.match(
    source,
    /panelRef\.current\?\.focus\(\{ preventScroll: true \}\);\s*\n\s*\}, \[open, focusRequest\?\.nonce\]\);/,
    'the focus effect must re-run on every focusRequest, not only on the closed-to-open transition',
  );
  assert.match(
    source,
    /aria-label=\{`Notes: \$\{selected\?\.title \?\? courseTitle\}`\}/,
    'the panel\'s accessible name must name the currently selected section',
  );
});
