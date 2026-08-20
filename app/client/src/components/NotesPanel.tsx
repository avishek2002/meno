// The personal notes side panel (docs/specs/notes.md): present on the course
// page and every lesson page, closed by default, sectioned so a note stays
// attached to the part of the lesson that provoked it. Non-modal - an
// `aside`, focus moved in on open, never trapped, Escape returns focus to
// whatever opened it. All the DOM-free decisions (section assembly, both
// localStorage key schemes, the debounce/flush state machine, the conflict
// state machine) live in notesPanel.ts; this file is the wiring.
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CourseNotesResponse, LessonSection } from '../../../shared/types.ts';
import { ApiError, putJson } from '../api';
import { useResource } from '../useResource';
import { prefersReducedMotion } from '../reducedMotion.tsx';
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
  readNotesBuffer,
  readNotesOpen,
  relevantBlocks,
  resolveConflict,
  withBufferEntry,
  withoutBufferEntry,
  writeNotesBuffer,
  writeNotesOpen,
  type ConflictInfo,
  type KnownSection,
  type PanelSection,
  type SaveState,
  type SaveTrigger,
} from '../notesPanel.ts';
import type { SectionStore } from '../courseList.ts';

// Guarded the same way LessonPage.tsx's resumeStore is: storage throws in
// private mode, and a throwing store degrades the panel to session-only
// rather than crashing the page it is attached to.
let notesStore: SectionStore | null;
try {
  notesStore = localStorage;
} catch {
  notesStore = null;
}

const DEBOUNCE_MS = 2000;
const HIGHLIGHT_MS = 1500;

export interface NotesFocusRequest {
  key: string;
  /** bumped on every click, even a repeat, so re-clicking the same heading's
   *  button still re-opens/re-focuses the panel. */
  nonce: number;
}

interface NotesPanelProps {
  tenant: string;
  course: string;
  courseTitle: string;
  page: 'course' | 'lesson';
  /** required (with `lesson`) when page === 'lesson' */
  module?: string;
  /** the lesson file slug, no .md - required when page === 'lesson' */
  lesson?: string;
  /** LessonResponse.sections - required when page === 'lesson' */
  sections?: LessonSection[];
  /** set by a per-heading note button; null/undefined otherwise */
  focusRequest?: NotesFocusRequest | null;
}

type StatusLabel = 'idle' | 'saving' | 'saved' | 'error';

export function NotesPanel({ tenant, course, courseTitle, page, module, lesson, sections, focusRequest }: NotesPanelProps) {
  const panelId = useId();
  const selectId = useId();

  const known: KnownSection[] = page === 'course' ? [...COURSE_KNOWN_SECTIONS] : knownSectionsForLesson(sections ?? []);
  const defaultKey = known[0]?.key ?? (page === 'course' ? RESERVED_COURSE_SECTION : RESERVED_LESSON_SECTION);

  const notesUrl = `/api/v1/${encodeURIComponent(tenant)}/notes/${encodeURIComponent(course)}`;
  const { data, revalidate } = useResource<CourseNotesResponse>(notesUrl);

  const [open, setOpen] = useState(() => readNotesOpen(notesStore, tenant));
  const [selectedKey, setSelectedKey] = useState(defaultKey);
  const [text, setText] = useState('');
  const [status, setStatus] = useState<StatusLabel>('idle');
  const [conflict, setConflict] = useState<ConflictInfo | null>(null);
  // Successful writes this session, layered over `data` so a save is visible
  // immediately without a second round trip, and so switching sections keeps
  // whatever was just saved even before the background revalidate lands.
  const [savedOverrides, setSavedOverrides] = useState<Record<string, string>>({});

  const panelRef = useRef<HTMLElement | null>(null);
  const toggleRef = useRef<HTMLButtonElement | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const saveStateRef = useRef<SaveState>(INITIAL_SAVE_STATE);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textRef = useRef('');
  const selectedKeyRef = useRef(selectedKey);
  const hashRef = useRef<string | null>(null);
  // Mirrors `conflict` state for use inside closures (the debounce timer, the
  // pagehide/unmount effect) that must never retry into an unresolved
  // conflict but cannot rely on a stale render's `conflict` variable.
  const conflictRef = useRef<ConflictInfo | null>(null);

  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    selectedKeyRef.current = selectedKey;
  }, [selectedKey]);
  useEffect(() => {
    if (data) hashRef.current = data.raw_sha256;
  }, [data]);
  useEffect(() => {
    conflictRef.current = conflict;
  }, [conflict]);

  const relevant = relevantBlocks(data?.blocks ?? [], page, module ?? null, lesson ?? null);
  const panelSections: PanelSection[] = assemblePanelSections(known, relevant).map((s) =>
    Object.hasOwn(savedOverrides, s.key) ? { ...s, text: savedOverrides[s.key] } : s,
  );
  const matched = panelSections.filter((s) => s.matched);
  const unmatched = panelSections.filter((s) => !s.matched);
  const selected = panelSections.find((s) => s.key === selectedKey) ?? panelSections[0] ?? null;

  const clearDebounce = (): void => {
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current);
      debounceTimer.current = null;
    }
  };

  const doFlush = useCallback((): void => {
    const hash = hashRef.current;
    if (hash === null) {
      // The GET has not landed yet - nothing to send If-Match against.
      // decideWriteFailed keeps `dirty` true so the next trigger retries.
      saveStateRef.current = decideWriteFailed();
      return;
    }
    const flushedSection = selectedKeyRef.current;
    const flushedText = textRef.current;
    setStatus('saving');
    const body: Record<string, unknown> =
      page === 'lesson'
        ? { page: 'lesson', module, lesson, section: flushedSection, text: flushedText }
        : { page: 'course', section: flushedSection, text: flushedText };
    void putJson<{ raw_sha256: string; block: { text: string }; warnings: string[] }>(notesUrl, body, {
      'if-match': hash,
    })
      .then((res) => {
        hashRef.current = res.raw_sha256;
        setSavedOverrides((prev) => ({ ...prev, [flushedSection]: flushedText }));
        writeNotesBuffer(notesStore, tenant, course, withoutBufferEntry(readNotesBuffer(notesStore, tenant, course), flushedSection));
        setStatus('saved');
        const decision = decideWriteSettled(saveStateRef.current);
        saveStateRef.current = decision.state;
        if (decision.action === 'flush-now') doFlush();
      })
      .catch((e: unknown) => {
        saveStateRef.current = decideWriteFailed();
        // Any failed write - a 409 conflict, the server down, a dropped
        // connection, a 500 - buffers the unsaved text so it survives a
        // navigation or a closed tab. The entry is removed only on a
        // successful write (above) or when the learner resolves a conflict
        // by reloading from disk (handleResolve).
        writeNotesBuffer(
          notesStore,
          tenant,
          course,
          withBufferEntry(readNotesBuffer(notesStore, tenant, course), flushedSection, {
            text: flushedText,
            based_on_sha256: hash,
            saved_at: new Date().toISOString(),
          }),
        );
        if (e instanceof ApiError && e.status === 409 && e.body && typeof e.body === 'object') {
          const current = (e.body as { current?: CourseNotesResponse }).current;
          if (current) {
            setConflict({ current, section: flushedSection, pendingText: flushedText });
            setStatus('error');
            return;
          }
        }
        setStatus('error');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [module, lesson, page, notesUrl, tenant, course]);

  const triggerFlush = useCallback(
    (trigger: SaveTrigger): void => {
      if (conflictRef.current) return; // do not auto-retry into an unresolved conflict
      clearDebounce();
      const decision = decideSave(saveStateRef.current, trigger);
      saveStateRef.current = decision.state;
      if (decision.action === 'flush-now') doFlush();
    },
    [doFlush],
  );

  const handleTextChange = (value: string): void => {
    setText(value);
    setStatus('idle');
    const decision = decideSave(saveStateRef.current, 'keystroke');
    saveStateRef.current = decision.state;
    if (decision.action === 'schedule-debounce') {
      clearDebounce();
      debounceTimer.current = setTimeout(() => {
        if (conflictRef.current) return; // do not auto-retry into an unresolved conflict
        const fired = decideDebounceFired(saveStateRef.current);
        saveStateRef.current = fired.state;
        if (fired.action === 'flush-now') doFlush();
      }, DEBOUNCE_MS);
    }
  };

  // Adopt the server (or a previous session's buffered) text whenever the
  // selected section changes or the initial fetch lands - but never while
  // the current edit is dirty or in flight, which would erase what the
  // learner is mid-typing under a background revalidate.
  useEffect(() => {
    if (saveStateRef.current.dirty || saveStateRef.current.inFlight) return;
    const buffer = readNotesBuffer(notesStore, tenant, course);
    const buffered = buffer[selectedKey];
    setText(buffered?.text ?? selected?.text ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedKey, data]);

  // Flush on unmount (route change - LessonPage/CoursePage key this
  // component so a different lesson or course is a fresh mount) and on
  // pagehide (tab close or reload). tenant/course/module/lesson/page are
  // stable for the lifetime of one mounted instance for the same reason, so
  // capturing this closure once at mount is correct, not stale.
  useEffect(() => {
    const onPagehide = (): void => triggerFlush('pagehide');
    window.addEventListener('pagehide', onPagehide);
    return () => {
      window.removeEventListener('pagehide', onPagehide);
      triggerFlush('navigate');
      clearDebounce();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openPanel = (opener: HTMLElement | null): void => {
    triggerRef.current = opener;
    setOpen(true);
    writeNotesOpen(notesStore, tenant, true);
  };

  const closePanel = (): void => {
    triggerFlush('close');
    setOpen(false);
    writeNotesOpen(notesStore, tenant, false);
    (triggerRef.current ?? toggleRef.current)?.focus();
  };

  useEffect(() => {
    if (!focusRequest) return;
    setSelectedKey(focusRequest.key);
    // A per-heading button lives outside React's tree (sectionNoteButtons.tsx
    // mounts it into raw dangerouslySetInnerHTML content), so there is no
    // React element reference to hand openPanel here - Escape falls back to
    // the panel's own always-rendered toggle button instead of that control.
    openPanel(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRequest?.key, focusRequest?.nonce]);

  // A section note button press must have the same observable effect
  // whether the panel was already open or not: this used to depend on
  // `[open]` alone, so pressing a button while the panel was already open
  // on a different section moved `selectedKey` but never moved focus and
  // announced nothing. Depending on focusRequest's nonce too means every
  // button press refocuses the panel, which - together with the dynamic
  // aria-label below naming the now-current section - reaches assistive
  // technology on both paths, not just the closed-to-open one.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.focus({ preventScroll: true });
  }, [open, focusRequest?.nonce]);

  // Escape closes and returns focus - a document-level listener, the same
  // shape InfoTip.tsx's pinned-open Escape handler uses, rather than a JSX
  // onKeyDown: the panel is non-modal, so nothing here may trap Tab, and a
  // document listener is the natural place to close on Escape from anywhere
  // inside the panel without adding a focus trap to get there.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') closePanel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const handleSelect = (key: string): void => {
    triggerFlush('blur'); // flush whatever section is being left
    setSelectedKey(key);
  };

  const handleResolve = (choice: 'reload' | 'overwrite'): void => {
    if (!conflict) return;
    const resolution = resolveConflict(conflict, choice);
    writeNotesBuffer(notesStore, tenant, course, withoutBufferEntry(readNotesBuffer(notesStore, tenant, course), conflict.section));
    setConflict(null);
    setStatus('idle');
    if (resolution.action === 'reload') {
      hashRef.current = resolution.newHash;
      setSavedOverrides((prev) => ({ ...prev, [conflict.section]: resolution.adoptedText }));
      if (selectedKeyRef.current === conflict.section) setText(resolution.adoptedText);
      saveStateRef.current = INITIAL_SAVE_STATE;
      revalidate();
      return;
    }
    // Overwrite: re-send the buffered text with the fresh hash. This calls
    // doFlush directly rather than going through triggerFlush, whose
    // conflict gate would otherwise still see the just-cleared `conflict`
    // ref for one more tick and drop the retry this button exists to make.
    hashRef.current = resolution.ifMatch;
    saveStateRef.current = { dirty: false, inFlight: true, pendingFlush: false };
    doFlush();
  };

  // Revealing a lesson section from the panel (docs/specs/notes.md): the
  // same three-step shape CoursePage.tsx's module-anchor effect uses. The
  // one reduced-motion call site in this feature's client code.
  const revealSection = (key: string): void => {
    const el = document.querySelector<HTMLElement>(`[data-meno-section="${CSS.escape(key)}"]`);
    if (!el) return;
    const reduced = prefersReducedMotion();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.tabIndex = -1;
    el.focus({ preventScroll: true });
    el.classList.add('notes-section-highlight');
    setTimeout(() => el.classList.remove('notes-section-highlight'), HIGHLIGHT_MS);
  };

  const statusText: Record<StatusLabel, string> = {
    idle: '',
    saving: 'Saving...',
    saved: 'Saved',
    error: conflict ? 'This note changed elsewhere - not saved' : 'Not saved - kept on this device, will retry',
  };

  const canReveal = page === 'lesson' && selectedKey !== RESERVED_LESSON_SECTION && selected?.matched === true;

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        className="notes-toggle"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => (open ? closePanel() : openPanel(e.currentTarget))}
      >
        {open ? 'Close notes' : 'Notes'}
      </button>
      {/* Purely visual dimming (styles/notes.css: pointer-events: none) - no
          onClick here. The panel is non-modal, so a capturing scrim would
          block a pointer user from content a keyboard user can already Tab
          into, and click-outside-to-close is not an option either: with
          pointer-events: none the same click also reaches whatever is
          underneath. */}
      {open && <div className="notes-scrim" aria-hidden="true" />}
      {open && (
        <aside
          id={panelId}
          className="notes-panel"
          role="complementary"
          aria-label={`Notes: ${selected?.title ?? courseTitle}`}
          tabIndex={-1}
          ref={panelRef}
        >
          <div className="notes-panel-header">
            <h2>Notes: {courseTitle}</h2>
            <button type="button" className="notes-close" aria-label="Close notes" onClick={closePanel}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>

          {data && data.warnings.length > 0 && (
            <div className="warnings-box">
              {data.warnings.map((w, i) => (
                <p key={i}>{w}</p>
              ))}
            </div>
          )}

          <label className="notes-section-label" htmlFor={selectId}>
            Section
          </label>
          <select id={selectId} className="notes-section-select" value={selectedKey} onChange={(e) => handleSelect(e.target.value)}>
            {matched.length > 0 && (
              <optgroup label="Sections">
                {matched.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
              </optgroup>
            )}
            {unmatched.length > 0 && (
              <optgroup label="Unmatched sections">
                {unmatched.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.title}
                  </option>
                ))}
              </optgroup>
            )}
          </select>

          {selected?.matched === false && (
            <p className="notes-unmatched-note">
              This section's heading no longer matches the lesson. The note is preserved here.
            </p>
          )}

          {canReveal && (
            <button type="button" className="notes-reveal" onClick={() => revealSection(selectedKey)}>
              Show in lesson
            </button>
          )}

          <textarea
            className="notes-textarea"
            aria-label={`Note: ${selected?.title ?? 'section'}`}
            value={text}
            onChange={(e) => handleTextChange(e.target.value)}
            onBlur={() => triggerFlush('blur')}
          />

          <p className="notes-status" role="status" aria-live="polite">
            {statusText[status]}
          </p>

          {conflict && (
            <div className="notes-conflict" role="alert">
              <p>
                This note changed outside the app since you opened it. Your edit has not been saved yet - choose what
                happens to what you just wrote.
              </p>
              <div className="notes-conflict-actions">
                <button type="button" className="notes-conflict-keep" onClick={() => handleResolve('overwrite')}>
                  Keep what I wrote (overwrites the other change)
                </button>
                <button type="button" className="notes-conflict-discard" onClick={() => handleResolve('reload')}>
                  Discard what I wrote (reload from disk)
                </button>
              </div>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
