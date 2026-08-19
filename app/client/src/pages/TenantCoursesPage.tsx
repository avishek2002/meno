// #/t/:tenant - the course list, laid out under the tenant's own groups.
//
// Two resources, joined here: /tree says which courses exist (files are the
// truth), /groups says how to lay them out. The server has already resolved
// both layers - the learner's own groups, then a section per domain directory
// for whatever they have not filed - so this page renders sections and never
// reasons about a stale slug or a fallback rule.
//
// Sections are native <details>/<summary>: open/closed state persists per
// tenant in the browser's storage (courseList.ts owns the pure logic, this
// page is the only place in the client that names the browser storage
// global). A filter input narrows the list to matching titles and slugs;
// while filtering, every matching section renders forced open and a toggle
// on it is discarded rather than written back - see the `key` on <details>
// below for how that stays visually consistent with React's controlled value.
//
// UI-16: this is also where the resume card renders, reading the same
// storage LessonPage writes to on mount. Two files in app/client/src/ now
// name the browser storage global - this one and LessonPage.tsx - because
// a resume affordance has to be written from the page a learner leaves and
// read from the page they return to; there is no third page to route it
// through instead.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InfoTip } from '../components/InfoTip';
import { asMastery, type ClientMastery } from '../clientTypes';
import { lessonHref } from '../courseContext.ts';
import {
  assembleSections,
  buildCourseListView,
  courseSlugFromFragment,
  decideToggle,
  dueCountsByCourse,
  readOpenState,
  readResumeState,
  sectionForCourse,
  withAllOpen,
  withSectionOpen,
  writeOpenState,
  type SectionStore,
} from '../courseList.ts';
import type { CourseNode, GroupsResponse, ProgressResponse, TreeResponse } from '../../../shared/types.ts';
import { homeHref, courseHref, progressHref } from '../../../shared/routeHrefs.ts';
import { prefersReducedMotion } from '../reducedMotion.tsx';

// Accessing localStorage can throw when storage is blocked (private mode,
// locked-down browser settings) - fall back to session-only rather than a
// broken page.
let store: SectionStore | null;
try {
  store = localStorage;
} catch {
  store = null;
}

// A shared, never-mutated empty set for courses with no failed module gate -
// avoids allocating one per card per render.
const EMPTY_SET: ReadonlySet<string> = new Set();

// UI-09: the old row of 10px colour-only dots carried its meaning through
// `background` and a hover-only `title` - unreadable at a glance and
// unreachable from the keyboard. Replaced with a labelled text line (written
// count, due count) plus a segmented bar that is announced as a whole via
// `aria-label` rather than one dot at a time, with a distinguishing outline
// - not colour alone - marking a module whose gate has failed. `skeleton` is
// the only module status meaning "nothing written yet" (schemas/module.schema.json);
// the other four all count as written.
function CourseCard({
  tenant,
  course,
  dueCount,
  failedModules,
}: {
  tenant: string;
  course: CourseNode;
  dueCount: number;
  failedModules: ReadonlySet<string>;
}) {
  const total = course.modules.length;
  const written = course.modules.filter((m) => m.status !== 'skeleton').length;
  const moduleWord = total === 1 ? 'module' : 'modules';
  const reviewWord = dueCount === 1 ? 'review' : 'reviews';
  const failedCount = course.modules.filter((m) => failedModules.has(m.slug)).length;

  const barLabel =
    `${written} of ${total} ${moduleWord} written` +
    (dueCount > 0 ? `, ${dueCount} ${reviewWord} due` : '') +
    (failedCount > 0 ? `, ${failedCount} module gate${failedCount === 1 ? '' : 's'} failed` : '');

  return (
    // The whole card is the click target (UI-09), not just the heading -
    // everything below lives inside this one <a>.
    <a
      href={courseHref(tenant, course.slug)}
      className="course-card-link"
    >
      <h3>{course.title}</h3>
      <p className="course-card-meta">
        <span className={`status-badge status-${course.status}`}>{course.status}</span>
        {' · '}
        {total} {moduleWord}
      </p>
      <p className="course-card-progress-line">
        {written} of {total} {moduleWord} written
        {dueCount > 0 && (
          <>
            {' · '}
            {dueCount} {reviewWord} due
          </>
        )}
      </p>
      <span className="module-bar" role="img" aria-label={barLabel}>
        {course.modules.map((m) => (
          <span
            key={m.slug}
            className={`module-bar-segment status-${m.status}${failedModules.has(m.slug) ? ' gate-fail' : ''}`}
          />
        ))}
      </span>
    </a>
  );
}

export function TenantCoursesPage({ tenant, section }: { tenant: string; section?: string }) {
  const t = encodeURIComponent(tenant);
  const tree = useResource<TreeResponse>(`/api/v1/${t}/tree`);
  const groups = useResource<GroupsResponse>(`/api/v1/${t}/groups`);
  // UI-08: the same /progress call ProgressPage already makes - deriveMastery
  // measures 1ms (routes.ts:157-168) and useResource's cache means a learner
  // who then opens the progress page pays no second round trip.
  const progress = useResource<ProgressResponse>(`/api/v1/${t}/progress`);
  useRegisterRevalidate(() => {
    tree.revalidate();
    groups.revalidate();
    progress.revalidate();
  });

  const [openState, setOpenState] = useState(() => readOpenState(store, tenant));
  useEffect(() => {
    setOpenState(readOpenState(store, tenant));
  }, [tenant]);

  const [query, setQuery] = useState('');

  // A deep-linked course (#/t/<tenant>#course-<slug>) forces the section that
  // claims it open regardless of the persisted collapse state - but the
  // force is a visit, not a preference, so it never round-trips through
  // readOpenState / writeOpenState, and it is released the moment the user
  // toggles that section themselves (tracked below, in the onToggle
  // handler), or the deep link itself changes.
  const [releasedSection, setReleasedSection] = useState<string | null>(null);
  useEffect(() => {
    setReleasedSection(null);
  }, [tenant, section]);

  // Every <details> currently mounted, keyed by section id, so the
  // scroll-and-focus effect below can find whichever one is forced without
  // naming document.getElementById. A DOM id derived from an explicit
  // group's id would put that group's arbitrary groups.yml text back into
  // the document as a URL-shaped surface - the same reason the fragment
  // keys on the course, not the section - so elements are looked up through
  // this ref map instead of an id attribute at all.
  const sectionEls = useRef(new Map<string, HTMLDetailsElement>());

  // Every hook above this line must run on every render - including the
  // loading and error renders below, which return before the JSX that would
  // otherwise be the only reader of `view` - so `courses`/`view` are computed
  // unconditionally here too, off data that is still absent-safe (`?? []`),
  // rather than after the early returns the way the rest of this function's
  // plain (non-hook) locals are.
  const courses = tree.data?.courses ?? [];
  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const ungrouped = groups.data ? groups.data.ungrouped : courses.map((c) => c.slug);
  const warnings = [...(tree.data?.warnings ?? []), ...(groups.data?.warnings ?? [])];

  // UI-16: resume where you left off. Read fresh on every render rather than
  // in state - the record only ever changes by visiting a lesson, which
  // remounts this page on the way back, so there is no stale-closure risk to
  // guard against. Gated on the course still existing in `bySlug`: a course
  // removed since the lesson was opened must not offer a dead link.
  const resume = readResumeState(store, tenant);
  const resumeCourse = resume ? bySlug.get(resume.course) : undefined;

  // UI-08/UI-09: progress is a third, independent fetch - while it is still
  // in flight or has failed, the list renders exactly as it did before this
  // finding rather than blocking on it. asMastery guards the same whole-vault
  // shape ProgressPage already trusts.
  const due = progress.data?.due ?? [];
  const dueCounts = dueCountsByCourse(due);
  const mastery: ClientMastery | null = progress.data ? asMastery(progress.data.mastery) : null;
  const failedModulesByCourse = new Map<string, Set<string>>();
  if (mastery) {
    for (const [courseSlug, cm] of Object.entries(mastery.courses)) {
      const failed = new Set<string>();
      for (const [moduleSlug, mm] of Object.entries(cm.modules)) {
        if (mm.gate === 'fail') failed.add(moduleSlug);
      }
      if (failed.size > 0) failedModulesByCourse.set(courseSlug, failed);
    }
  }
  const totalDue = due.length;
  const dueCourseCount = Object.keys(dueCounts).length;

  const view = buildCourseListView({
    sections: groups.data?.groups ?? [],
    ungrouped,
    courses,
    query,
    openState,
    dueCounts,
  });

  // Resolved independently of `query`/`view.sections`: a deep link must
  // resolve to its housing section regardless of whatever the reader later
  // types into the filter box, which is exactly what the filtered view
  // cannot promise once a section drops out of it.
  const forcedSlug = courseSlugFromFragment(section);
  const assembledSections = assembleSections({ sections: groups.data?.groups ?? [], ungrouped, courses });
  // null while data is still loading (assembledSections is built off the
  // same absent-safe courses/ungrouped as view above, so it is empty
  // until the tree/groups requests resolve) and null for a slug this tenant
  // does not have at all - both degrade silently to the ordinary list, per
  // design.
  const forcedSectionId = forcedSlug !== null ? sectionForCourse(assembledSections, forcedSlug) : null;
  const sectionExists = forcedSectionId !== null;
  const activeForcedId = sectionExists && releasedSection !== forcedSectionId ? forcedSectionId : null;

  // Scroll the deep-linked section into view once, the first time it both
  // resolves and has an element to find - not on load (sectionExists is
  // false until the tree/groups requests resolve, so this is a no-op until
  // then) and not again on a later re-render of the same resolved section.
  useEffect(() => {
    if (!sectionExists || !forcedSectionId) return;
    const el = sectionEls.current.get(forcedSectionId);
    if (!el) return;
    const reduced = prefersReducedMotion();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    // Move focus to the section itself, not just the viewport - without this
    // a keyboard user following the breadcrumb's domain link lands with focus
    // still at the top of the document (their next Tab would start over from
    // there) and a screen reader never announces arrival at all. tabIndex={-1}
    // on the forced <details> below is what makes an otherwise
    // non-focusable element a valid target for this programmatic focus()
    // without adding it to the normal Tab order. GuidePage.tsx's own
    // #section fragment links have the same gap and are intentionally left
    // alone here - pre-existing, out of scope for this change.
    el.focus({ preventScroll: true });
  }, [sectionExists, forcedSectionId]);

  if (tree.loading && !tree.data) return <AsyncStatus message="Loading courses..." />;
  // /groups is waited for as well, not only /tree. The two resolve
  // independently, and on the render where the tree has landed but the groups
  // have not, `ungrouped` falls back to every slug and the list renders one
  // transient `Ungrouped` section - a visible flash of a layout the tenant
  // does not have, and a section list that `writeOpenState` would prune the
  // learner's real stored sections against if anything persisted against it.
  // A groups request that *fails* still falls through to that fallback, which
  // is what the fallback is actually for: an ungrouped list beats no list.
  if (groups.loading && !groups.data) return <AsyncStatus message="Loading courses..." />;
  if (tree.error) {
    return (
      <ErrorState
        title="Could not load courses"
        message={`The course list for ${tenant} could not be loaded.`}
        detail={tree.error}
        links={[{ label: 'Learners', href: homeHref() }]}
      />
    );
  }
  if (courses.length === 0) return <EmptyState headingLevel="h1" title={`No courses yet for ${tenant}`} />;

  const toggleSection = (id: string, next: boolean, rendered: boolean): void => {
    // decideToggle carries the whole release/persist decision, including the
    // is-this-even-a-user-action case (`rendered`, which covers React's own
    // mount and Collapse all attribute writes as well as the deep link's
    // programmatic open) and the filtering-must-come-first case - every one
    // of them was a browser-only defect (see the comment on decideToggle in
    // courseList.ts), which is exactly why the decision does not live here as
    // inline conditionals any more.
    const decision = decideToggle({ sectionId: id, activeForcedId, next, rendered, filtering: view.filtering });
    if (decision.release) setReleasedSection(id);
    if (decision.persist) {
      setOpenState(writeOpenState(store, tenant, withSectionOpen(openState, id, next), view.allSectionIds));
    }
  };

  const setAllOpen = (open: boolean): void => {
    // Collapse all / Expand all never fires a <details> toggle event for the
    // forced section when it does not change that section's own open-ness
    // (Collapse all: React writes false into a `<details open>` React
    // already renders as forced-open, so no DOM change occurs, so no toggle
    // event fires, so the force would otherwise survive the click with no
    // way to clear it). Both buttons are unambiguous user actions on every
    // section's visibility, so both release the force explicitly here rather
    // than relying on a toggle event that this particular click may never
    // produce.
    if (activeForcedId !== null) setReleasedSection(activeForcedId);
    setOpenState(writeOpenState(store, tenant, withAllOpen(view.allSectionIds, open), view.allSectionIds));
  };

  const renderCourseCard = (slug: string): ReactNode => {
    const course = bySlug.get(slug);
    if (!course) return null;
    return (
      <li key={slug} className="course-card">
        <CourseCard
          tenant={tenant}
          course={course}
          dueCount={dueCounts[slug] ?? 0}
          failedModules={failedModulesByCourse.get(slug) ?? EMPTY_SET}
        />
      </li>
    );
  };

  return (
    <section>
      <h1 aria-labelledby="courses-heading">
        <span id="courses-heading">Courses</span> <InfoTip entry="courseGroups" />
      </h1>
      {resume && resumeCourse && (
        <p className="resume-line">
          Resume: <a href={lessonHref(tenant, resume.course, resume.module, resume.file)}>{resume.lessonTitle}</a>{' '}
          ({resumeCourse.title})
        </p>
      )}
      {progress.data && (
        <p className="due-summary-line">
          {totalDue === 0
            ? 'No reviews due right now.'
            : `${totalDue} ${totalDue === 1 ? 'review' : 'reviews'} due across ${dueCourseCount} ${
                dueCourseCount === 1 ? 'course' : 'courses'
              }.`}{' '}
          <a href={progressHref(tenant)}>See progress</a>.
        </p>
      )}
      {warnings.length > 0 && (
        <div className="warnings-box">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <div className="course-list-controls">
        <input
          type="search"
          className="course-filter-input"
          value={query}
          aria-label="Filter courses by title or slug"
          placeholder="Filter courses..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
        <button type="button" onClick={() => setAllOpen(false)} disabled={view.filtering}>
          Collapse all
        </button>
        <button type="button" onClick={() => setAllOpen(true)} disabled={view.filtering}>
          Expand all
        </button>
      </div>

      {view.noResults ? (
        <p className="course-list-no-results">
          No course matches &quot;{query}&quot;.{' '}
          <button type="button" onClick={() => setQuery('')}>
            Clear filter
          </button>
        </p>
      ) : (
        view.sections.map((s) => {
          const forced = s.id === activeForcedId;
          return (
            <details
              // The forced-open flag joins the filtering flag already in this
              // key: <details open> is not truly controlled by React, so a
              // remount is what makes the `open` prop below actually take
              // effect on the transition into (or out of) being forced -
              // exactly the reason the filtering flag was already here.
              key={`${s.id}:${view.filtering ? 'f' : 'n'}:${forced ? 'o' : 'c'}`}
              ref={(el) => {
                if (el) sectionEls.current.set(s.id, el);
                else sectionEls.current.delete(s.id);
              }}
              // -1: reachable by the scroll-and-focus effect above, never by
              // Tab - a <details> is not natively focusable, and only the
              // one section a deep link actually resolved to ever needs to
              // be a focus target.
              tabIndex={forced ? -1 : undefined}
              className="group-section"
              open={forced || s.open}
              onToggle={(e) => toggleSection(s.id, e.currentTarget.open, forced || s.open)}
            >
              <summary>
                {s.title} <span className="group-count">{s.courses.length}</span>
                {s.byDomain && <span className="group-derived"> by domain</span>}
              </summary>
              {s.courses.length === 0 ? (
                <p className="group-empty">No courses yet.</p>
              ) : (
                <>
                  {/* UI-08: the due courses were moved to the front of s.courses by
                      buildCourseListView; this sub-heading is what explains the
                      reordering instead of leaving it mysterious. Two separate
                      <ul>s rather than a heading spliced into one list, so the
                      "Due now" heading never lands inside a course card's <li>. */}
                  {s.dueCount > 0 && (
                    <>
                      <h4 className="due-now-heading">Due now</h4>
                      <ul className="course-list">
                        {s.courses.slice(0, s.dueCount).map((slug) => renderCourseCard(slug))}
                      </ul>
                      {s.courses.length > s.dueCount && <h4 className="due-now-heading">Other courses</h4>}
                    </>
                  )}
                  {s.courses.length > s.dueCount && (
                    <ul className="course-list">{s.courses.slice(s.dueCount).map((slug) => renderCourseCard(slug))}</ul>
                  )}
                </>
              )}
            </details>
          );
        })
      )}
    </section>
  );
}
