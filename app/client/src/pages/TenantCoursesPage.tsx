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
import { useEffect, useRef, useState } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { InfoTip } from '../components/InfoTip';
import {
  assembleSections,
  buildCourseListView,
  courseSlugFromFragment,
  decideToggle,
  readOpenState,
  sectionForCourse,
  withAllOpen,
  withSectionOpen,
  writeOpenState,
  type SectionStore,
} from '../courseList.ts';
import type { CourseNode, GroupsResponse, TreeResponse } from '../../../shared/types.ts';

// Accessing localStorage can throw when storage is blocked (private mode,
// locked-down browser settings) - fall back to session-only rather than a
// broken page. This is the only place in app/client/src/ that may name it.
let store: SectionStore | null;
try {
  store = localStorage;
} catch {
  store = null;
}

function CourseCard({ tenant, course }: { tenant: string; course: CourseNode }) {
  return (
    <>
      <a href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course.slug)}`}>
        <h3>{course.title}</h3>
      </a>
      <p className="course-card-meta">
        <span className={`status-badge status-${course.status}`}>{course.status}</span>
        {' · '}
        {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'}
      </p>
      <div className="module-status-row">
        {course.modules.map((m) => (
          <span key={m.slug} className={`status-dot status-${m.status}`} title={`${m.title}: ${m.status}`} />
        ))}
      </div>
    </>
  );
}

export function TenantCoursesPage({ tenant, section }: { tenant: string; section?: string }) {
  const t = encodeURIComponent(tenant);
  const tree = useResource<TreeResponse>(`/api/v1/${t}/tree`);
  const groups = useResource<GroupsResponse>(`/api/v1/${t}/groups`);
  useRegisterRevalidate(() => {
    tree.revalidate();
    groups.revalidate();
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

  const view = buildCourseListView({
    sections: groups.data?.groups ?? [],
    ungrouped,
    courses,
    query,
    openState,
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
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  if (tree.loading && !tree.data) return <p className="status-line">Loading courses...</p>;
  if (tree.error) return <p className="status-line status-error">Could not load courses: {tree.error}</p>;
  if (courses.length === 0) return <EmptyState title={`No courses yet for ${tenant}`} />;

  const toggleSection = (id: string, next: boolean): void => {
    // decideToggle carries the whole release/persist decision, including the
    // programmatic-forced-open case and the filtering-must-come-first case -
    // both were browser-only regressions once (see the comment on
    // decideToggle in courseList.ts), which is exactly why the decision does
    // not live here as inline conditionals any more.
    const decision = decideToggle({ sectionId: id, activeForcedId, next, filtering: view.filtering });
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

  return (
    <section>
      <h1>
        Courses <InfoTip entry="courseGroups" />
      </h1>
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
              onToggle={(e) => toggleSection(s.id, e.currentTarget.open)}
            >
              <summary>
                {s.title} <span className="group-count">{s.courses.length}</span>
                {s.byDomain && <span className="group-derived"> by domain</span>}
              </summary>
              {s.courses.length === 0 ? (
                <p className="group-empty">No courses yet.</p>
              ) : (
                <ul className="course-list">
                  {s.courses.map((slug) => {
                    const course = bySlug.get(slug);
                    if (!course) return null;
                    return (
                      <li key={slug} className="course-card">
                        <CourseCard tenant={tenant} course={course} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </details>
          );
        })
      )}
    </section>
  );
}
