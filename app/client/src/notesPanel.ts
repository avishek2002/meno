// Personal notes side panel: all DOM-free logic - section list assembly, the
// two browser-storage key schemes, the debounce/flush decision, and the
// conflict state machine's two exits. Pure on purpose, the same arrangement
// courseList.ts established, so `node --test` covers it without a browser -
// and, like courseList.ts, this file never names the storage global itself,
// only the SectionStore shape a caller hands in.
// See docs/specs/notes.md for the format and HTTP surface this serves.
import type { CourseNoteBlock, CourseNotesResponse, LessonSection } from '../../shared/types.ts';
import type { SectionStore } from './courseList.ts';

export const RESERVED_COURSE_SECTION = 'whole-course';
export const RESERVED_LESSON_SECTION = 'whole-lesson';

// --- section list assembly --------------------------------------------------

/** The minimum a "known" section needs to render in the panel: a key the
 *  server named, plus a title to show. LessonSection satisfies this
 *  structurally; the course page's single entry is built by hand below. */
export interface KnownSection {
  key: string;
  title: string;
}

/** The one known section a course page ever offers - there are no course-page
 *  anatomy headings, so this list never grows. */
export const COURSE_KNOWN_SECTIONS: readonly KnownSection[] = [{ key: RESERVED_COURSE_SECTION, title: 'Course' }];

export function knownSectionsForLesson(sections: readonly LessonSection[]): KnownSection[] {
  return sections.map((s) => ({ key: s.key, title: s.title }));
}

/** A row the panel renders: a known section (always shown, blank text when no
 *  block exists yet) or an unmatched one (a block whose section key matches
 *  no current heading - preserved, editable, never dropped, per invariant 3). */
export interface PanelSection {
  key: string;
  title: string;
  text: string;
  matched: boolean;
}

/** `blocks` filtered to the ones this page/lesson actually owns, in file
 *  order - CourseNotesResponse.blocks is the whole course's notes file, so a
 *  lesson page must narrow it to its own module and lesson before
 *  assembling. `module`/`lesson` are the two separate CourseNoteBlock
 *  fields, not the combined `<module>/<lesson>` form the note block's
 *  `lesson=` marker attribute uses in the file format - the server splits
 *  that on the way into the JSON response. */
export function relevantBlocks(
  blocks: readonly CourseNoteBlock[],
  page: 'course' | 'lesson',
  module: string | null,
  lesson: string | null,
): CourseNoteBlock[] {
  return blocks.filter((b) => b.page === page && (page === 'course' || (b.module === module && b.lesson === lesson)));
}

/** Known sections first, in the order given (LessonResponse.sections order on
 *  a lesson page, COURSE_KNOWN_SECTIONS on the course page), each carrying
 *  its block's text or '' when unsaved; then any block matching no known
 *  section, in file order, grouped by the caller under "Unmatched sections".
 *  A duplicate address in `blocks` (the format allows it; the first is
 *  authoritative) resolves to its first occurrence only, matching the
 *  server's own read rule. */
export function assemblePanelSections(known: readonly KnownSection[], blocks: readonly CourseNoteBlock[]): PanelSection[] {
  const firstByKey = new Map<string, CourseNoteBlock>();
  for (const b of blocks) {
    if (!firstByKey.has(b.section)) firstByKey.set(b.section, b);
  }
  const knownKeys = new Set(known.map((k) => k.key));
  const matched: PanelSection[] = known.map((k) => ({
    key: k.key,
    title: k.title,
    text: firstByKey.get(k.key)?.text ?? '',
    matched: true,
  }));
  const unmatched: PanelSection[] = blocks
    .filter((b) => !knownKeys.has(b.section) && firstByKey.get(b.section) === b)
    .map((b) => ({ key: b.section, title: b.section, text: b.text, matched: false }));
  return [...matched, ...unmatched];
}

// --- browser storage: open/closed view state --------------------------------

export const OPEN_KEY_PREFIX = 'meno.notes.open.v1';

export function notesOpenKey(tenant: string): string {
  return `${OPEN_KEY_PREFIX}:${encodeURIComponent(tenant)}`;
}

/** Disposable view state: absent or unreadable means closed, the default. */
export function readNotesOpen(store: SectionStore | null, tenant: string): boolean {
  if (!store) return false;
  try {
    return store.getItem(notesOpenKey(tenant)) === '1';
  } catch {
    return false;
  }
}

/** Never throws: a quota or private-mode failure downgrades to session-only,
 *  the same degrade instinct courseList.ts's open/resume state uses. */
export function writeNotesOpen(store: SectionStore | null, tenant: string, open: boolean): void {
  if (!store) return;
  try {
    if (open) store.setItem(notesOpenKey(tenant), '1');
    else store.removeItem(notesOpenKey(tenant));
  } catch {
    // quota or private-mode failure - open/closed just does not persist this session
  }
}

// --- browser storage: the unsaved-text buffer --------------------------------
//
// The one place the client holds learner content (docs/specs/notes.md,
// "The panel" section). An entry exists only between a failed write and its
// resolution: written when a save fails, deleted the moment its write
// succeeds or the learner picks "reload from disk".

export const BUFFER_KEY_PREFIX = 'meno.notes.buffer.v1';

export function notesBufferKey(tenant: string, course: string): string {
  return `${BUFFER_KEY_PREFIX}:${encodeURIComponent(tenant)}:${encodeURIComponent(course)}`;
}

export interface NotesBufferEntry {
  text: string;
  based_on_sha256: string;
  saved_at: string;
}

/** section key -> the unsaved entry for it. */
export type NotesBuffer = Record<string, NotesBufferEntry>;

function isBufferEntry(v: unknown): v is NotesBufferEntry {
  return (
    v !== null &&
    typeof v === 'object' &&
    typeof (v as Record<string, unknown>).text === 'string' &&
    typeof (v as Record<string, unknown>).based_on_sha256 === 'string' &&
    typeof (v as Record<string, unknown>).saved_at === 'string'
  );
}

/** Reads and validates; {} for a missing key, unparseable JSON, a non-object,
 *  an array, a null or throwing store, or any entry missing a field - a
 *  half-written record must never resurrect as a phantom unsaved note. */
export function readNotesBuffer(store: SectionStore | null, tenant: string, course: string): NotesBuffer {
  if (!store) return {};
  let raw: string | null;
  try {
    raw = store.getItem(notesBufferKey(tenant, course));
  } catch {
    return {};
  }
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const result: NotesBuffer = {};
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    if (!Object.hasOwn(parsed as object, key)) continue;
    const value = (parsed as Record<string, unknown>)[key];
    if (isBufferEntry(value)) result[key] = value;
  }
  return result;
}

/** Never throws: a quota or private-mode failure downgrades the buffer to
 *  session-only. Writing an empty buffer removes the key rather than storing
 *  '{}', matching writeOpenState's normalization instinct. */
export function writeNotesBuffer(store: SectionStore | null, tenant: string, course: string, buffer: NotesBuffer): void {
  if (!store) return;
  const key = notesBufferKey(tenant, course);
  try {
    if (Object.keys(buffer).length === 0) {
      store.removeItem(key);
    } else {
      store.setItem(key, JSON.stringify(buffer));
    }
  } catch {
    // quota or private-mode failure - the buffer just does not persist
  }
}

/** New object; never mutates its input. */
export function withBufferEntry(buffer: NotesBuffer, section: string, entry: NotesBufferEntry): NotesBuffer {
  return { ...buffer, [section]: entry };
}

/** New object; never mutates its input. */
export function withoutBufferEntry(buffer: NotesBuffer, section: string): NotesBuffer {
  const next = { ...buffer };
  delete next[section];
  return next;
}

// --- the debounce/flush decision --------------------------------------------
//
// One state machine per currently-edited section. A keystroke schedules the
// ~2s debounce (the panel owns the actual timer; this only decides whether
// one is needed). Every other trigger - blur, panel close, route change,
// pagehide - flushes immediately. An in-flight write is never duplicated: a
// trigger that lands while one is already running marks `pendingFlush`
// rather than starting a second PUT, and the write's own settlement
// (decideWriteSettled) is what fires the deferred flush once the first one
// resolves.

export type SaveTrigger = 'keystroke' | 'blur' | 'close' | 'navigate' | 'pagehide';

export interface SaveState {
  /** text differs from what the last successful write saved */
  dirty: boolean;
  /** a PUT is currently in flight */
  inFlight: boolean;
  /** a flush was requested while inFlight; fire it once the write settles */
  pendingFlush: boolean;
}

export const INITIAL_SAVE_STATE: SaveState = { dirty: false, inFlight: false, pendingFlush: false };

export type SaveAction = 'schedule-debounce' | 'flush-now' | 'noop';

export interface SaveDecision {
  state: SaveState;
  action: SaveAction;
}

export function decideSave(state: SaveState, trigger: SaveTrigger): SaveDecision {
  if (trigger === 'keystroke') {
    const next: SaveState = { ...state, dirty: true };
    return { state: next, action: next.inFlight ? 'noop' : 'schedule-debounce' };
  }
  // blur, close, navigate, pagehide: flush immediately, never debounced.
  if (state.inFlight) {
    return { state: { ...state, dirty: true, pendingFlush: true }, action: 'noop' };
  }
  if (!state.dirty) return { state, action: 'noop' };
  return { state: { ...state, inFlight: true, dirty: false }, action: 'flush-now' };
}

/** The ~2s debounce timer elapsed with no intervening flush. */
export function decideDebounceFired(state: SaveState): SaveDecision {
  if (state.inFlight) return { state: { ...state, pendingFlush: true }, action: 'noop' };
  if (!state.dirty) return { state, action: 'noop' };
  return { state: { ...state, inFlight: true, dirty: false }, action: 'flush-now' };
}

/** A write succeeded. If a flush was requested while it was running, that
 *  request fires now instead of being lost - never two PUTs in flight at
 *  once, never a dropped one either. */
export function decideWriteSettled(state: SaveState): SaveDecision {
  if (state.pendingFlush) {
    return { state: { dirty: false, inFlight: true, pendingFlush: false }, action: 'flush-now' };
  }
  return { state: { ...state, inFlight: false, pendingFlush: false }, action: 'noop' };
}

/** A write failed (network error, or a 409 the panel is now surfacing as a
 *  conflict). `dirty` stays true so the ordinary triggers retry once the
 *  failure is resolved; the panel is responsible for not re-firing a flush
 *  into an unresolved conflict, which is a UI-level gate, not this
 *  function's concern. */
export function decideWriteFailed(): SaveState {
  return { dirty: true, inFlight: false, pendingFlush: false };
}

// --- the conflict state machine ---------------------------------------------

export interface ConflictInfo {
  current: CourseNotesResponse;
  section: string;
  /** the text the failed write tried to save */
  pendingText: string;
}

export type ConflictResolution =
  | { action: 'reload'; adoptedText: string; newHash: string }
  | { action: 'overwrite'; text: string; ifMatch: string };

/** The two exits, and only these two - no auto-merge, no diff view
 *  (docs/specs/notes.md invariant list). "Reload from disk" adopts the
 *  conflicting block's text (or '' when this section has no block yet on
 *  the server) and the fresh hash. "Overwrite" re-sends the buffered text
 *  with the fresh hash as `If-Match`. */
export function resolveConflict(info: ConflictInfo, choice: 'reload' | 'overwrite'): ConflictResolution {
  if (choice === 'reload') {
    const block = info.current.blocks.find((b) => b.section === info.section);
    return { action: 'reload', adoptedText: block?.text ?? '', newHash: info.current.raw_sha256 };
  }
  return { action: 'overwrite', text: info.pendingText, ifMatch: info.current.raw_sha256 };
}
