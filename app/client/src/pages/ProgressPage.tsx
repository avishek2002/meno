// #/t/:tenant/progress - per-course concept mastery, the due list (grouped,
// ranked by days overdue, and pointed at the lesson that clears each row -
// UI-11), and a humanized recent-activity feed.
import { useCallback, useMemo } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { Meter } from '../components/Meter';
import { InfoTip } from '../components/InfoTip';
import { asMastery } from '../clientTypes';
import { humanizeEvent } from '../humanize';
import { buildCourseStructure, courseHref, type CourseStructure } from '../courseContext.ts';
import { conceptHref, groupByCourse, todayIso, withDaysOverdue } from '../due.ts';
import type { ProgressResponse, TreeResponse } from '../../../shared/types.ts';

export function ProgressPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<ProgressResponse>(`/api/v1/${encodeURIComponent(tenant)}/progress`);
  // The due list and the per-course headings both need course titles and,
  // for a due concept, the lesson that introduced it - neither of which
  // /progress carries. /tree already has both for every course at once, and
  // useResource's cache (UI-05) means this is a second reader of a url the
  // course list has usually already fetched, not a second network round trip.
  const tree = useResource<TreeResponse>(`/api/v1/${encodeURIComponent(tenant)}/tree`);
  const revalidateAll = useCallback(() => {
    revalidate();
    tree.revalidate();
  }, [revalidate, tree.revalidate]);
  useRegisterRevalidate(revalidateAll);

  const structures = useMemo(() => {
    const out: Record<string, CourseStructure> = {};
    for (const c of tree.data?.courses ?? []) out[c.slug] = buildCourseStructure(tenant, c);
    return out;
  }, [tenant, tree.data]);
  const courseTitle = (slug: string): string => structures[slug]?.title ?? slug;

  if (loading && !data) return <AsyncStatus message="Loading progress..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load progress"
        message={`Progress for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: `#/t/${encodeURIComponent(tenant)}` }]}
      />
    );
  }
  if (!data) return null;

  const mastery = asMastery(data.mastery);
  const courses = mastery ? Object.entries(mastery.courses) : [];
  const hasAnything = courses.length > 0 || data.due.length > 0 || data.recent.length > 0;

  if (!hasAnything) {
    return <EmptyState title={`No progress yet for ${tenant}`} body="Nothing has been studied or reviewed yet." />;
  }

  const dueGroups = groupByCourse(withDaysOverdue(data.due, todayIso()));

  return (
    <section>
      <h1>Progress</h1>
      <p className="status-line">
        For the fuller study picture - session cadence, gate history, vault health - see{' '}
        <a href={`#/t/${encodeURIComponent(tenant)}/insights`}>insights</a>.
      </p>

      {data.due.length > 0 && (
        <section className="due-list">
          <h2>
            Due for review <InfoTip entry="dueForReview" />
          </h2>
          <p className="due-action-line">
            To clear a row, ask your agent for a review session - it runs the <code>tutor-session</code> skill.
          </p>
          {dueGroups.map(({ course, rows }) => (
            <div key={course} className="due-course-group">
              <h3>
                <a href={courseHref(tenant, course)}>{courseTitle(course)}</a>{' '}
                <span className="due-course-count">
                  ({rows.length} due)
                </span>
              </h3>
              <table>
                <thead>
                  <tr>
                    <th>Concept</th>
                    <th>Next review</th>
                    <th>Days overdue</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d, i) => {
                    const href = conceptHref(structures[course] ?? null, d.concept);
                    return (
                      <tr key={i}>
                        <td>{href ? <a href={href}>{d.concept}</a> : d.concept}</td>
                        <td>{d.next_review}</td>
                        <td>{d.days_overdue}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {courses.map(([course, cm]) => (
        <section key={course} className="mastery-summary">
          <h2>
            <a href={courseHref(tenant, course)}>{courseTitle(course)}</a>
          </h2>
          <table className="mastery-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>
                  Level <InfoTip entry="masteryLevel" />
                </th>
                <th>
                  Transfer score <InfoTip entry="transferScore" />
                </th>
                <th>
                  Recognition rate <InfoTip entry="recognitionRate" />
                </th>
                <th>
                  Next review <InfoTip entry="nextReview" />
                </th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(cm.concepts).map(([concept, c]) => (
                <tr key={concept}>
                  <td>{concept}</td>
                  <td>
                    <span className={`level-badge level-${c.level}`}>{c.level}</span>
                  </td>
                  <td>
                    <Meter value={c.transfer_score} label="transfer score" />
                  </td>
                  <td>
                    <Meter value={c.recognition_rate} label="recognition rate" />
                  </td>
                  <td>{c.next_review ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {data.recent.length > 0 && (
        <section className="recent-events">
          <h2>Recent activity</h2>
          <ul className="event-feed">
            {data.recent.map((e, i) => (
              <li key={i}>{humanizeEvent(e)}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
