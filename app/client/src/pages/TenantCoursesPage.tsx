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
import { useEffect, useState } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { InfoTip } from '../components/InfoTip';
import {
  buildCourseListView,
  readOpenState,
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

export function TenantCoursesPage({ tenant }: { tenant: string }) {
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

  if (tree.loading && !tree.data) return <p className="status-line">Loading courses...</p>;
  if (tree.error) return <p className="status-line status-error">Could not load courses: {tree.error}</p>;

  const courses = tree.data?.courses ?? [];
  if (courses.length === 0) return <EmptyState title={`No courses yet for ${tenant}`} />;

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

  const toggleSection = (id: string, next: boolean): void => {
    if (view.filtering) return;
    setOpenState(writeOpenState(store, tenant, withSectionOpen(openState, id, next), view.allSectionIds));
  };

  const setAllOpen = (open: boolean): void => {
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
        ))
      )}
    </section>
  );
}
