// Course-list view state: which sections are open, what a filter query leaves
// visible, and which lesson to resume (UI-16). Pure on purpose - no React, no
// DOM - so `node --test` can cover it, which is the only client-side logic in
// this repo that gets that. The page hands its browser storage in as a
// two-method store; this module never names a browser global itself (the
// root tsconfig compiles it without the DOM lib, so naming one is a
// typecheck failure, not a convention).

/** A section as the server resolved it: GroupsResponse.groups entries. */
export interface ListSection {
  id: string;
  title: string;
  courses: string[];
  source: 'explicit' | 'domain';
}

/** The minimum a course needs to be filtered and rendered. CourseNode satisfies it structurally. */
export interface FilterableCourse {
  slug: string;
  title: string;
}

/** sectionId -> open. Absent means open: the default is expanded. */
export type OpenState = Record<string, boolean>;

/** The slice of a key-value store this module uses. DOM-free by design; the browser's storage satisfies it. */
export interface SectionStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface VisibleSection {
  id: string;
  title: string;
  /** render the "by domain" marker: a derived domain section, never Ungrouped */
  byDomain: boolean;
  /** slugs to render, in section order, filter-applied; due-first (UI-08), stable
   *  otherwise; every one is present in `courses` */
  courses: string[];
  /** how many of the leading entries in `courses` have a due review - the page
   *  renders these under a "Due now" sub-heading so the reordering is explained
   *  rather than mysterious, per the review's own phrasing */
  dueCount: number;
  /** whether the <details> renders open */
  open: boolean;
}

export interface CourseListView {
  /** sections to render; while filtering, sections with no match are absent */
  sections: VisibleSection[];
  /** every section id including the ones filtering hid - what pruning must be measured against */
  allSectionIds: string[];
  /** true when the query folds to a non-empty string */
  filtering: boolean;
  /** courses rendered across all sections */
  matches: number;
  /** filtering && matches === 0 */
  noResults: boolean;
}

/** The section id for courses with no group and no domain. Contains ":", which the group-id
 *  grammar (/^[a-z0-9]+(-[a-z0-9]+)*$/) forbids, so it can never collide with an explicit
 *  group id, and it is not "domain:"-prefixed, so it cannot collide with a derived one. */
export const UNGROUPED_ID = 'section:ungrouped';
export const UNGROUPED_TITLE = 'Ungrouped';

const COURSE_FRAGMENT_PREFIX = 'course-';

/** URL fragment ("course-<slug>", the `section` route param) -> course slug -
 *  what TenantCoursesPage resolves against sectionForCourse below. The
 *  fragment keys on the course, not the domain, even though the domain is
 *  the more obvious reading of "where does this note live": a domain gets a
 *  derived section only for whatever courses fall back to it, so a domain
 *  where every course is claimed by an explicit group in groups.yml (the
 *  committed example tenant's own shape) has no section for a #domain-<x>
 *  link to open at all - it would be inert on exactly the fixture meant to
 *  demonstrate it. A course slug always resolves, because every course
 *  belongs to exactly one section by construction, and it is already a URL
 *  surface elsewhere (#/t/x/c/<slug>), while an arbitrary groups.yml id
 *  still never appears in one. `undefined` (no fragment), the retired
 *  "domain-<x>" shape (never shipped, means nothing now), and an empty slug
 *  all mean "no forced course", not a thrown error - a stale or hand-edited
 *  link must degrade to the ordinary list. */
export function courseSlugFromFragment(fragment: string | undefined): string | null {
  if (fragment === undefined || !fragment.startsWith(COURSE_FRAGMENT_PREFIX)) return null;
  const slug = fragment.slice(COURSE_FRAGMENT_PREFIX.length);
  return slug === '' ? null : slug;
}

/** Which assembled section - explicit group, derived domain, or Ungrouped -
 *  currently claims a course, or null when none does (a stale slug, or one
 *  this tenant never had). `sections` must already be joined against the
 *  courses that actually exist (assembleSections below does exactly that),
 *  or a slug an explicit group still lists after its course was deleted
 *  could resolve to a section that no longer renders it. First match wins:
 *  a course belongs to exactly one section by construction, so there is
 *  nothing further to disambiguate. */
export function sectionForCourse(sections: readonly ListSection[], slug: string): string | null {
  for (const section of sections) {
    if (section.courses.includes(slug)) return section.id;
  }
  return null;
}

/** What a native <details> toggle event should do to force-release state and
 *  to persisted open/collapse state, given everything the decision depends
 *  on. The whole decision lives here, rather than as inline conditionals in
 *  TenantCoursesPage, because every failure mode below was found by browser
 *  testing rather than by the gate - none of them has a DOM to fail in.
 *
 *  1. A `toggle` event only means "the user did this" when the element's new
 *     state disagrees with the state we last rendered for it. The browser
 *     fires `toggle` for any change to the `open` attribute, including the
 *     ones React itself makes: setting `open` on a freshly mounted (or
 *     remounted) `<details>` fires one, and so does Collapse all removing
 *     it. Reading those as user input is how the collapse state came to be
 *     erased on every page load - each open section reported `true` at
 *     mount, the handler wrote it back, and `writeOpenState` normalization
 *     pruned the rest of the object away against a section list that was
 *     still resolving. `next === rendered` is that whole family of events,
 *     and it releases nothing and persists nothing. The deep link's own
 *     programmatic open (TenantCoursesPage remounts the forced section to
 *     make the `open` prop take effect - see the `key` comment there) is one
 *     instance of it rather than a case of its own: forced means rendered
 *     open, so the toggle that force produces reports `true` against a
 *     `rendered` of `true` and is discarded here.
 *
 *  2. While filtering, every matching section renders forced open by the
 *     filter itself (buildCourseListView pins `open: true`), and a toggle
 *     during filtering is already discarded rather than persisted - but if
 *     the toggled section also happens to be the deep-link's forced one,
 *     releasing the force without persisting anything makes the *next*
 *     render fall back to `s.open`, which is still pinned true by the
 *     filter, so the section pops back open on its own. The filtering check
 *     has to gate the release exactly as it already gates the persist, or
 *     "discarded" stops being true for the release half of the decision.
 *     That is why filtering is checked first, before the rendered-state
 *     comparison above even runs. */
export interface ToggleDecision {
  /** call setReleasedSection(sectionId) */
  release: boolean;
  /** write next into persisted open state */
  persist: boolean;
}

export function decideToggle(input: {
  sectionId: string;
  activeForcedId: string | null;
  /** the element's state after the toggle */
  next: boolean;
  /** the `open` value the last render gave this section (`forced || s.open`) */
  rendered: boolean;
  filtering: boolean;
}): ToggleDecision {
  const { sectionId, activeForcedId, next, rendered, filtering } = input;
  if (filtering) return { release: false, persist: false };
  if (next === rendered) return { release: false, persist: false };
  return { release: sectionId === activeForcedId, persist: true };
}

/** Versioned, app-namespaced storage-key prefix. Bump the version, never the meaning. */
export const OPEN_STATE_PREFIX = 'meno.courseList.open.v1';

/** `${OPEN_STATE_PREFIX}:${encodeURIComponent(tenant)}` - encoded so two tenant names
 *  can never produce the same key. */
export function openStateKey(tenant: string): string {
  return `${OPEN_STATE_PREFIX}:${encodeURIComponent(tenant)}`;
}

/** NFKD, combining marks stripped (/\p{M}/gu), lowercased, then trimmed - the trim is
 *  what makes a whitespace-only query fold to '' so `filtering` (1.1 item 4) reads it
 *  as not filtering. The same normalization discipline lib/groups.ts uses on titles and ids. */
export function foldForSearch(raw: string): string {
  return raw.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** hasOwn, never a bare index: a stored "constructor" key must not read off Object.prototype.
 *  Missing, or any non-boolean value, means open. */
export function isSectionOpen(state: OpenState, sectionId: string): boolean {
  if (!Object.hasOwn(state, sectionId)) return true;
  const value = state[sectionId];
  return typeof value === 'boolean' ? value : true;
}

/** New object; never mutates its input. */
export function withSectionOpen(state: OpenState, sectionId: string, open: boolean): OpenState {
  return { ...state, [sectionId]: open };
}

/** New object setting every id at once - the Collapse all / Expand all control. */
export function withAllOpen(sectionIds: readonly string[], open: boolean): OpenState {
  const next: OpenState = {};
  for (const id of sectionIds) next[id] = open;
  return next;
}

function normalizeState(state: OpenState, allSectionIds: readonly string[]): OpenState {
  const allowed = new Set(allSectionIds);
  const next: OpenState = {};
  for (const id of allSectionIds) {
    if (!Object.hasOwn(state, id)) continue;
    if (!allowed.has(id)) continue;
    const value = state[id];
    if (value === false) next[id] = false;
  }
  return next;
}

/** Reads and normalizes. Returns {} for an absent key, unparseable JSON, a non-object, an
 *  array, a null store, or a throwing store. Keeps only own, boolean-valued, false entries. */
export function readOpenState(store: SectionStore | null, tenant: string): OpenState {
  if (!store) return {};
  let raw: string | null;
  try {
    raw = store.getItem(openStateKey(tenant));
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
  const result: OpenState = {};
  for (const key of Object.keys(parsed as Record<string, unknown>)) {
    if (!Object.hasOwn(parsed as object, key)) continue;
    const value = (parsed as Record<string, unknown>)[key];
    if (value === false) result[key] = false;
  }
  return result;
}

/** Normalizes, persists, and returns what it persisted, so in-memory and on-disk never diverge.
 *  Normalization: drop ids not in `allSectionIds`, drop `true` entries (that is the default),
 *  removeItem when the result is empty. Never throws - a quota or private-mode failure
 *  downgrades the feature to session-only. */
export function writeOpenState(
  store: SectionStore | null,
  tenant: string,
  state: OpenState,
  allSectionIds: readonly string[],
): OpenState {
  const normalized = normalizeState(state, allSectionIds);
  if (!store) return normalized;
  const key = openStateKey(tenant);
  try {
    if (Object.keys(normalized).length === 0) {
      store.removeItem(key);
    } else {
      store.setItem(key, JSON.stringify(normalized));
    }
  } catch {
    // quota or private-mode failure - the feature degrades to session-only
  }
  return normalized;
}
/** Sections joined against the courses that actually exist: explicit groups
 *  and Ungrouped as the registry says, with any slug the tree no longer
 *  knows about already dropped (a warning for that is raised upstream, in
 *  lib/groups.ts's resolveGroups - this module only ever renders, never
 *  warns). Ungrouped is appended only once that join leaves it non-empty.
 *  buildCourseListView and sectionForCourse both start from this exact
 *  list, so "which section a course lives in" can never answer differently
 *  for the two of them - a deep link and the rendered list would otherwise
 *  be free to disagree about where a course is. */
export function assembleSections(input: {
  sections: readonly ListSection[]; // GroupsResponse.groups
  ungrouped: readonly string[]; // GroupsResponse.ungrouped
  courses: readonly FilterableCourse[]; // TreeResponse.courses
}): ListSection[] {
  const bySlug = new Set(input.courses.map((c) => c.slug));
  const joinedGroups = input.sections.map((s) => ({ ...s, courses: s.courses.filter((slug) => bySlug.has(slug)) }));
  const joinedUngrouped = input.ungrouped.filter((slug) => bySlug.has(slug));
  return [
    ...joinedGroups,
    ...(joinedUngrouped.length > 0
      ? [{ id: UNGROUPED_ID, title: UNGROUPED_TITLE, courses: joinedUngrouped, source: 'domain' as const }]
      : []),
  ];
}

// --- UI-16: resume where you left off ---
//
// Same storage, same guard, a second key rather than a second mechanism:
// the last lesson opened, per tenant. LessonPage writes it on mount,
// TenantCoursesPage reads it to render the resume card. Pure here for the
// same reason open state is - `node --test` covers the shape and the
// degrade paths without a browser.

/** What the course list needs to render "Resume: <lesson>" and link straight
 *  back to it. `lessonTitle` travels with the record rather than being
 *  looked up again later, because the course list would otherwise have to
 *  fetch that course's structure just to label one card. */
export interface ResumeState {
  course: string;
  module: string;
  file: string;
  lessonTitle: string;
}

/** Versioned, app-namespaced, distinct from OPEN_STATE_PREFIX - a stale or
 *  future-shaped resume record must never collide with open-state reads. */
export const RESUME_STATE_PREFIX = 'meno.courseList.resume.v1';

export function resumeStateKey(tenant: string): string {
  return `${RESUME_STATE_PREFIX}:${encodeURIComponent(tenant)}`;
}

/** Reads and validates; null for a missing key, unparseable JSON, a non-object,
 *  a null or throwing store, or a shape missing any of the four string fields -
 *  the course list must never render a resume card off a half-written record. */
export function readResumeState(store: SectionStore | null, tenant: string): ResumeState | null {
  if (!store) return null;
  let raw: string | null;
  try {
    raw = store.getItem(resumeStateKey(tenant));
  } catch {
    return null;
  }
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const p = parsed as Record<string, unknown>;
  if (
    typeof p.course !== 'string' ||
    typeof p.module !== 'string' ||
    typeof p.file !== 'string' ||
    typeof p.lessonTitle !== 'string'
  ) {
    return null;
  }
  return { course: p.course, module: p.module, file: p.file, lessonTitle: p.lessonTitle };
}

/** Never throws: a quota or private-mode failure downgrades resume to
 *  session-only, the same as open state - a lesson page must not break
 *  because a resume card could not be written. */
export function writeResumeState(store: SectionStore | null, tenant: string, resume: ResumeState): void {
  if (!store) return;
  try {
    store.setItem(resumeStateKey(tenant), JSON.stringify(resume));
  } catch {
    // quota or private-mode failure - resume just does not persist this session
  }
}

/** slug -> number of due entries for that course. Pure aggregation over
 *  whatever course-bearing array the caller has (ProgressResponse.due, or a
 *  test fixture shaped like it) - this module names no server type. */
export function dueCountsByCourse(due: readonly { course: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const d of due) {
    counts[d.course] = (counts[d.course] ?? 0) + 1;
  }
  return counts;
}

/** The whole list, assembled: join to the tree, append Ungrouped, apply the filter,
 *  resolve open state. The page renders the result and holds no list logic of its own. */
export function buildCourseListView(input: {
  sections: readonly ListSection[]; // GroupsResponse.groups
  ungrouped: readonly string[]; // GroupsResponse.ungrouped
  courses: readonly FilterableCourse[]; // TreeResponse.courses
  query: string; // raw input value
  openState: OpenState;
  /** slug -> due count (UI-08); defaults to empty, which leaves section order
   *  exactly as before - existing callers and tests are unaffected. */
  dueCounts?: Record<string, number>;
}): CourseListView {
  const bySlug = new Map(input.courses.map((c) => [c.slug, c]));
  const assembled = assembleSections(input);
  const allSectionIds = assembled.map((s) => s.id);

  const foldedQuery = foldForSearch(input.query);
  const filtering = foldedQuery !== '';
  const dueCounts = input.dueCounts ?? {};

  let matches = 0;
  const sections: VisibleSection[] = [];

  for (const section of assembled) {
    // already joined against `courses` by assembleSections above
    let visibleCourses: string[];
    if (filtering) {
      visibleCourses = section.courses.filter((slug) => {
        const course = bySlug.get(slug)!;
        return foldForSearch(course.title).includes(foldedQuery) || foldForSearch(course.slug).includes(foldedQuery);
      });
      if (visibleCourses.length === 0) continue;
    } else {
      visibleCourses = section.courses;
    }

    matches += visibleCourses.length;

    // Due-first, stable otherwise: partition rather than sort, so two courses
    // that are both due (or both not) keep their server/filter order. The
    // partition point is `dueCount`, which is what tells the page where to
    // draw the "Due now" sub-heading.
    const due = visibleCourses.filter((slug) => (dueCounts[slug] ?? 0) > 0);
    const notDue = visibleCourses.filter((slug) => (dueCounts[slug] ?? 0) === 0);

    sections.push({
      id: section.id,
      title: section.title,
      byDomain: section.source === 'domain' && section.id !== UNGROUPED_ID,
      courses: [...due, ...notDue],
      dueCount: due.length,
      open: filtering ? true : isSectionOpen(input.openState, section.id),
    });
  }

  return {
    sections,
    allSectionIds,
    filtering,
    matches,
    noResults: filtering && matches === 0,
  };
}
