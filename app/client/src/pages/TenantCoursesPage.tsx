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
import { useEffect, useState, type ReactNode } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InfoTip } from '../components/InfoTip';
import { asMastery, type ClientMastery } from '../clientTypes';
import {
  buildCourseListView,
  dueCountsByCourse,
  readOpenState,
  withAllOpen,
  withSectionOpen,
  writeOpenState,
  type SectionStore,
} from '../courseList.ts';
import type { CourseNode, GroupsResponse, ProgressResponse, TreeResponse } from '../../../shared/types.ts';

// Accessing localStorage can throw when storage is blocked (private mode,
// locked-down browser settings) - fall back to session-only rather than a
// broken page. This is the only place in app/client/src/ that may name it.
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
      href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course.slug)}`}
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

export function TenantCoursesPage({ tenant }: { tenant: string }) {
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

  if (tree.loading && !tree.data) return <AsyncStatus message="Loading courses..." />;
  if (tree.error) {
    return (
      <ErrorState
        title="Could not load courses"
        message={`The course list for ${tenant} could not be loaded.`}
        detail={tree.error}
        links={[{ label: 'Learners', href: '#/' }]}
      />
    );
  }

  const courses = tree.data?.courses ?? [];
  if (courses.length === 0) return <EmptyState title={`No courses yet for ${tenant}`} />;

  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const ungrouped = groups.data ? groups.data.ungrouped : courses.map((c) => c.slug);
  const warnings = [...(tree.data?.warnings ?? []), ...(groups.data?.warnings ?? [])];

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

  const toggleSection = (id: string, next: boolean): void => {
    if (view.filtering) return;
    setOpenState(writeOpenState(store, tenant, withSectionOpen(openState, id, next), view.allSectionIds));
  };

  const setAllOpen = (open: boolean): void => {
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
      <h1>
        Courses <InfoTip entry="courseGroups" />
      </h1>
      {progress.data && (
        <p className="due-summary-line">
          {totalDue === 0
            ? 'No reviews due right now.'
            : `${totalDue} ${totalDue === 1 ? 'review' : 'reviews'} due across ${dueCourseCount} ${
                dueCourseCount === 1 ? 'course' : 'courses'
              }.`}{' '}
          <a href={`#/t/${t}/progress`}>See progress</a>.
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
        view.sections.map((s) => (
          <details
            key={`${s.id}:${view.filtering ? 'f' : 'n'}`}
            className="group-section"
            open={s.open}
            onToggle={(e) => toggleSection(s.id, e.currentTarget.open)}
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
                  <ul className="course-list">
                    {s.courses.slice(s.dueCount).map((slug) => renderCourseCard(slug))}
                  </ul>
                )}
              </>
            )}
          </details>
        ))
      )}
    </section>
  );
}
