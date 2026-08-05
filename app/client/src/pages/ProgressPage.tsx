// #/t/:tenant/progress - per-course concept mastery, the due list, and a
// humanized recent-activity feed.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { Meter } from '../components/Meter';
import { asMastery } from '../clientTypes';
import { humanizeEvent } from '../humanize';
import type { ProgressResponse } from '../../../shared/types.ts';

export function ProgressPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<ProgressResponse>(`/api/v1/${encodeURIComponent(tenant)}/progress`);
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading progress...</p>;
  if (error) return <p className="status-line status-error">Could not load progress: {error}</p>;
  if (!data) return null;

  const mastery = asMastery(data.mastery);
  const courses = mastery ? Object.entries(mastery.courses) : [];
  const hasAnything = courses.length > 0 || data.due.length > 0 || data.recent.length > 0;

  if (!hasAnything) {
    return <EmptyState title={`No progress yet for ${tenant}`} body="Nothing has been studied or reviewed yet." />;
  }

  return (
    <section>
      <h1>Progress</h1>

      {data.due.length > 0 && (
        <section className="due-list">
          <h2>Due for review</h2>
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Concept</th>
                <th>Next review</th>
              </tr>
            </thead>
            <tbody>
              {data.due.map((d, i) => (
                <tr key={i}>
                  <td>
                    <a href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(d.course)}`}>{d.course}</a>
                  </td>
                  <td>{d.concept}</td>
                  <td>{d.next_review}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {courses.map(([course, cm]) => (
        <section key={course} className="mastery-summary">
          <h2>{course}</h2>
          <table className="mastery-table">
            <thead>
              <tr>
                <th>Concept</th>
                <th>Level</th>
                <th>Transfer score</th>
                <th>Recognition rate</th>
                <th>Next review</th>
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
