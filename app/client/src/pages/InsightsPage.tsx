// #/t/:tenant/insights - the read-only study-insights report: usage counts,
// review health, gate/evidence honesty, and vault hygiene, mirroring
// InsightsReport's sections (lib/insights.ts) plus the narrative reports the
// study-insights skill has written. Deliberately neutral: no pass/fail
// coloring anywhere on this page (docs/specs/insights.md) - it must not read
// as a second gate, only as an honest mirror of what the ledger and vault say.
import { useCallback, useMemo, type ReactNode } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { InsightsResponse, Rate, TreeResponse } from '../../../shared/types.ts';
import { InfoTip } from '../components/InfoTip';
import { TODO_KIND_INFO } from '../todoTags';
import { buildCourseStructure, courseHref, type CourseStructure } from '../courseContext.ts';
import { conceptHref, daysOverdue } from '../due.ts';

/**
 * `usage.lessons_never_opened` entries are `${course}/${module}/${file}`
 * (lib/insights.ts, the same triple lessonHref takes) - split it back apart
 * so the row can link to the real lesson instead of naming it as an opaque
 * string.
 */
function parseNeverOpened(key: string): { course: string; module: string; file: string } | null {
  const parts = key.split('/');
  if (parts.length !== 3 || parts.some((p) => p === '')) return null;
  const [course, module, file] = parts;
  return { course, module, file };
}

/** A course or module cell: a link when the structure resolves it, plain text otherwise (structure not loaded, or an unknown course). */
function CourseCell({ tenant, course, structures }: { tenant: string; course: string; structures: Record<string, CourseStructure> }) {
  const title = structures[course]?.title;
  return <a href={courseHref(tenant, course)}>{title ?? course}</a>;
}

/** A concept cell: links to the lesson that introduced it, falling back to the course page (UI-11's fallback), or plain text before the course structure has loaded. */
function ConceptCell({ concept, structure }: { concept: string; structure: CourseStructure | undefined }) {
  const href = conceptHref(structure ?? null, concept);
  return href ? <a href={href}>{concept}</a> : <>{concept}</>;
}

function RateText({ value }: { value: Rate }) {
  if (value.value === null) return <span className="rate-empty">not enough data ({value.n})</span>;
  return (
    <span className="rate-value">
      {Math.round(value.value * 100)}% ({value.n}/{value.of})
    </span>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

export function InsightsPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<InsightsResponse>(`/api/v1/${encodeURIComponent(tenant)}/insights`);
  // Every course/module/concept named on this page is a bare identifier in
  // the InsightsReport payload (lib/insights.ts) - resolving it to a title
  // and a lesson link needs the course structure /tree already carries.
  // useResource's cache (UI-05) means a page that fetched /tree already
  // serves this for free.
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

  if (loading && !data) return <AsyncStatus message="Loading insights..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load insights"
        message={`Insights for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: `#/t/${encodeURIComponent(tenant)}` }]}
      />
    );
  }
  if (!data) return null;

  if (data.basis.ledger_lines === 0) {
    return <EmptyState title={`No study activity yet for ${tenant}`} body="Insights has nothing to report until a course exists and study begins." />;
  }

  const { sessions, reviews, gates, evidence, usage, vault, limits, notes } = data;

  return (
    <section className="insights-page">
      <h1>
        Insights <InfoTip entry="insights" />
      </h1>
      <p className="status-line">As of {data.as_of}, over {data.basis.ledger_lines} ledger lines.</p>
      <p className="status-line">
        For the due list ordered by urgency and grouped by course, see <a href={`#/t/${encodeURIComponent(tenant)}/progress`}>progress</a>.
      </p>

      <section className="insights-section">
        <h2>Sessions</h2>
        <div className="stat-grid">
          <Stat label="Sessions">{sessions.n}</Stat>
          <Stat label="Active days">{sessions.active_days}</Stat>
          <Stat label="Last session">{sessions.last ?? '-'}</Stat>
          <Stat label="Days since last">{sessions.days_since_last ?? '-'}</Stat>
          <Stat label="Median gap">
            {sessions.median_gap_days === null ? <span className="rate-empty">not enough data ({sessions.n})</span> : `${sessions.median_gap_days} days`}
          </Stat>
        </div>
      </section>

      <section className="insights-section">
        <h2>Reviews</h2>
        <div className="stat-grid">
          <Stat label="Overdue">{reviews.overdue.length}</Stat>
          <Stat label="Due coverage">
            <RateText value={reviews.due_coverage} />
          </Stat>
        </div>
        {reviews.overdue.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Concept</th>
                <th>Next review</th>
                <th>Days overdue</th>
              </tr>
            </thead>
            <tbody>
              {reviews.overdue.map((o, i) => (
                <tr key={i}>
                  <td>
                    <CourseCell tenant={tenant} course={o.course} structures={structures} />
                  </td>
                  <td>
                    <ConceptCell concept={o.concept} structure={structures[o.course]} />
                  </td>
                  <td>{o.next_review}</td>
                  <td>{daysOverdue(o.next_review, data.as_of)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="insights-section">
        <h2>Gates</h2>
        <div className="stat-grid">
          <Stat label="Pass">{gates.outcomes.pass}</Stat>
          <Stat label="Fail">{gates.outcomes.fail}</Stat>
          <Stat label="Insufficient evidence">{gates.outcomes['insufficient-evidence']}</Stat>
          <Stat label="Override rate">
            <RateText value={gates.override_rate} />
          </Stat>
        </div>
        {gates.unrepaid_overrides.length > 0 && (
          <div className="insights-callout">
            <h3>Unrepaid overrides</h3>
            <p className="status-line">
              Concepts you overrode past a failed gate that have not yet earned a fresh agent-graded transfer score.
            </p>
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Concept</th>
                  <th>Gated</th>
                  <th>Reinject after</th>
                </tr>
              </thead>
              <tbody>
                {gates.unrepaid_overrides.map((u, i) => (
                  <tr key={i}>
                    <td>
                      <CourseCell tenant={tenant} course={u.course} structures={structures} />
                    </td>
                    <td>
                      <ConceptCell concept={u.concept} structure={structures[u.course]} />
                    </td>
                    <td>{u.gate_ts}</td>
                    <td>{u.reinject_after}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="insights-section">
        <h2>Evidence</h2>
        <div className="stat-grid">
          <Stat label="Transfer coverage">
            <RateText value={evidence.transfer_coverage} />
          </Stat>
          <Stat label="Recognition-only concepts">{evidence.recognition_only_concepts.length}</Stat>
          <Stat label="Mastered on old evidence">{evidence.mastered_on_old_evidence.length}</Stat>
          <Stat label="Weak concepts">{evidence.weak_concepts.length}</Stat>
        </div>
        {evidence.recognition_only_concepts.length > 0 && (
          <p className="status-line">Recognition-only: {evidence.recognition_only_concepts.join(', ')}</p>
        )}
        {evidence.mastered_on_old_evidence.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Concept</th>
                <th>Days since transfer evidence</th>
              </tr>
            </thead>
            <tbody>
              {evidence.mastered_on_old_evidence.map((m, i) => (
                <tr key={i}>
                  <td>
                    <CourseCell tenant={tenant} course={m.course} structures={structures} />
                  </td>
                  <td>
                    <ConceptCell concept={m.concept} structure={structures[m.course]} />
                  </td>
                  <td>{m.days_since_transfer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {evidence.weak_concepts.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Concept</th>
                <th>First transfer score</th>
                <th>Latest transfer score</th>
                <th>n transfer</th>
              </tr>
            </thead>
            <tbody>
              {evidence.weak_concepts.map((w, i) => (
                <tr key={i}>
                  <td>
                    <CourseCell tenant={tenant} course={w.course} structures={structures} />
                  </td>
                  <td>
                    <ConceptCell concept={w.concept} structure={structures[w.course]} />
                  </td>
                  <td>{w.first_score}</td>
                  <td>{w.latest_score}</td>
                  <td>{w.n_transfer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="insights-section">
        <h2>Usage</h2>
        <div className="stat-grid">
          <Stat label="Authored check usage">
            <RateText value={usage.check_usage} />
          </Stat>
          <Stat label="Lessons never opened">{usage.lessons_never_opened.length}</Stat>
          <Stat label="Planned debt">{usage.planned_debt.reduce((a, p) => a + p.planned, 0)} lesson(s)</Stat>
        </div>
        <div className="stat-grid">
          <Stat label="UI recognition">{usage.surface_mix.ui_recognition}</Stat>
          <Stat label="Agent recognition">{usage.surface_mix.agent_recognition}</Stat>
          <Stat label="Agent transfer">{usage.surface_mix.agent_transfer}</Stat>
          <Stat label="Reads">{usage.surface_mix.reads}</Stat>
        </div>
        <div className="stat-grid">
          <Stat label="Todos: for agent">{usage.todos.byAudience['for-agent']} open</Stat>
          <Stat label="Todos: for me">{usage.todos.byAudience['for-me']} open</Stat>
          <Stat label="Todos: done">{usage.todos.done}</Stat>
          <Stat label="Todos: open total">{usage.todos.open}</Stat>
        </div>
        <ul className="todo-kind-breakdown">
          {TODO_KIND_INFO.map((k) => (
            <li key={k.kind}>
              {k.label}: {usage.todos.byKind[k.kind]}
            </li>
          ))}
        </ul>
        {usage.lessons_never_opened.length > 0 && (
          <details className="insights-detail-list">
            <summary>Lessons never opened ({usage.lessons_never_opened.length})</summary>
            <ul>
              {usage.lessons_never_opened.map((key) => {
                const parsed = parseNeverOpened(key);
                if (!parsed) return <li key={key}>{key}</li>;
                const structure = structures[parsed.course];
                const lesson = structure?.lessons.find((l) => l.module === parsed.module && l.file === parsed.file);
                // Every neverOpened entry names a generated (non-planned) lesson, so once
                // the structure has loaded it should always resolve; the course-page
                // fallback only fires while /tree is still loading or on a data mismatch.
                const href = lesson?.href ?? structure?.href ?? null;
                const label = lesson ? `${structure!.title} / ${lesson.moduleTitle} / ${lesson.title}` : key;
                return <li key={key}>{href ? <a href={href}>{label}</a> : label}</li>;
              })}
            </ul>
          </details>
        )}
        {usage.planned_debt.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>Course</th>
                <th>Module</th>
                <th>Planned (not yet generated)</th>
              </tr>
            </thead>
            <tbody>
              {usage.planned_debt.map((p, i) => (
                <tr key={i}>
                  <td>
                    <CourseCell tenant={tenant} course={p.course} structures={structures} />
                  </td>
                  <td>
                    {/* The route has no module anchor yet (docs/reviews/2026-08-13-ui-navigation-review.md
                        UI-10 asks for one; CoursePage/router.tsx do not support it), so this links to the
                        course page as the closest faithful target rather than the module itself. */}
                    <a href={courseHref(tenant, p.course)}>{p.module}</a>
                  </td>
                  <td>{p.planned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="insights-section">
        <h2>Vault health</h2>
        <div className="stat-grid">
          <Stat label="Orphaned notes">{vault.orphaned_notes.length}</Stat>
          <Stat label="Broken links">{vault.broken_links.reduce((a, b) => a + b.targets.length, 0)}</Stat>
          <Stat label="Ambiguous basenames">{vault.ambiguous_basenames.length}</Stat>
          <Stat label="Referenced but untaught">{vault.referenced_but_untaught.length}</Stat>
        </div>
      </section>

      {notes.length > 0 && (
        <section className="insights-section">
          <h2>Narrative reports</h2>
          <ul className="insights-notes-list">
            {notes.map((n) => (
              <li key={n}>
                <a href={`#/t/${encodeURIComponent(tenant)}/n/${encodeURIComponent(n)}`}>{n}</a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="insights-section">
        <h2>Limits of this report</h2>
        <ul>
          {limits.map((l, i) => (
            <li key={i} className="status-line">
              {l}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
