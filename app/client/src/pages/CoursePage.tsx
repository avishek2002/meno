// #/t/:tenant/c/:course - a Continue block naming the next action, modules
// with gate state, concept mastery, then the objectives and hub note as a
// closed-by-default briefing (UI-07). Concept mastery and module gate chips
// only render at all because useCourseContext's asCourseMastery accepts the
// {concepts, modules} shape the server actually sends (UI-01).
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { ErrorState } from '../components/ErrorState';
import { RenderedHtml } from '../components/RenderedHtml';
import { Meter } from '../components/Meter';
import { useCourseContext } from '../useCourseContext';
import { stripMd, type CourseLesson, type CourseModuleEntry, type CourseStructure } from '../courseContext.ts';
import type { ClientCourseMastery, ClientModuleMastery } from '../clientTypes';

// The basename form graphLayout.ts's focus resolution understands: strip the
// directory and the .md suffix from the hub file, so this link never needs
// to know the course's own directory (docs/specs/graph.md invariant 13).
function hubBasename(hub: string): string {
  const slash = hub.lastIndexOf('/');
  return stripMd(slash === -1 ? hub : hub.slice(slash + 1));
}

const GATE_LABEL: Record<ClientModuleMastery['gate'], string> = {
  none: '',
  pass: 'Passed',
  fail: 'Failed',
  'insufficient-evidence': 'Insufficient evidence',
};

// A word carries the meaning; this is the second, non-colour channel a gate
// chip needs (UI-01: "never colour alone"). aria-hidden because the visible
// label text already says the same thing to assistive technology.
const GATE_ICON: Record<ClientModuleMastery['gate'], string> = {
  none: '',
  pass: '✓',
  fail: '✗',
  'insufficient-evidence': '!',
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Concepts whose next_review has arrived. Dates in ClientConceptMastery are
 * plain YYYY-MM-DD strings, so lexicographic comparison is date comparison.
 */
function dueConcepts(mastery: ClientCourseMastery | null): [string, string | null][] {
  if (!mastery) return [];
  const today = todayIso();
  return Object.entries(mastery.concepts)
    .filter(([, c]) => c.next_review !== null && c.next_review <= today)
    .map(([concept, c]) => [concept, c.next_review]);
}

/** The lowest-numbered module not yet mastered, or null when every module is. */
function firstIncompleteModule(structure: CourseStructure): CourseModuleEntry | null {
  return structure.modules.find((m) => m.status !== 'mastered') ?? null;
}

/**
 * The first non-planned lesson inside the lowest-numbered incomplete module
 * (UI-07's Continue target). Null when that module has nothing written yet -
 * the caller names the module instead of a dead link, the same convention
 * LessonNav uses for an ungenerated next lesson.
 */
function continueLesson(module: CourseModuleEntry | null): CourseLesson | null {
  if (!module) return null;
  return module.lessons.find((l) => !l.planned) ?? null;
}

export function CoursePage({ tenant, course }: { tenant: string; course: string }) {
  const { structure, mastery, hubHtml, data, loading, error, revalidate } = useCourseContext(tenant, course);
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <AsyncStatus message="Loading course..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load course"
        message="This course could not be loaded."
        detail={error}
        links={[{ label: 'Courses', href: `#/t/${encodeURIComponent(tenant)}` }]}
      />
    );
  }
  if (!data || !structure) return null;

  const concepts = mastery ? Object.entries(mastery.concepts) : [];
  // No key in the mastery map at all means no ledger event has ever named
  // this course - a genuinely new course, not one with a quiet history. That
  // is the "no ledger events" case the details elements stay open for.
  const isNewCourse = mastery === null;

  const failedModules = structure.modules.filter((m) => mastery?.modules[m.slug]?.gate === 'fail');
  const due = dueConcepts(mastery);
  const incompleteModule = firstIncompleteModule(structure);
  const target = due.length === 0 ? continueLesson(incompleteModule) : null;

  return (
    <section>
      <header className="course-header">
        <h1>{structure.title}</h1>
        <span className={`status-badge status-${structure.status}`}>{structure.status}</span>
        <a
          className="show-in-graph"
          href={`#/t/${encodeURIComponent(tenant)}/graph?focus=${encodeURIComponent(hubBasename(structure.hub))}`}
        >
          Show in graph
        </a>
      </header>

      {failedModules.length > 0 && (
        <div className="course-gate-alert" role="status">
          <span aria-hidden="true">{GATE_ICON.fail}</span> Gate failed:{' '}
          {failedModules
            .map((m) => `${m.title}${mastery?.modules[m.slug]?.locked ? ' (locked)' : ''}`)
            .join(', ')}
          . Lessons stay open below - review before continuing.
        </div>
      )}

      <section className="continue-block">
        <h2>Continue</h2>
        {due.length > 0 ? (
          <p>
            {due.length} concept{due.length === 1 ? '' : 's'} due for review:{' '}
            {due.map(([concept]) => concept).join(', ')}. Ask your agent to run a tutor session, or see{' '}
            <a href={`#/t/${encodeURIComponent(tenant)}/progress`}>progress</a>.
          </p>
        ) : target ? (
          <p>
            Next: <a href={target.href ?? '#'}>{target.title}</a> ({target.moduleTitle})
          </p>
        ) : incompleteModule ? (
          <p>{incompleteModule.title} has not been generated yet.</p>
        ) : (
          <p>Every module in this course is mastered.</p>
        )}
      </section>

      <section className="modules">
        <h2>Modules</h2>
        {structure.modules.map((m) => {
          const gate = mastery?.modules[m.slug] ?? null;
          return (
            <div key={m.slug} className="module-card">
              <h3>
                {m.title} <span className={`status-badge status-${m.status}`}>{m.status}</span>
                {gate && gate.gate !== 'none' && (
                  <span className={`gate-chip gate-chip-${gate.gate}`}>
                    <span aria-hidden="true">{GATE_ICON[gate.gate]}</span> {GATE_LABEL[gate.gate]}
                    {gate.locked ? ' - locked' : ''}
                    {gate.overridden ? ' - overridden' : ''}
                  </span>
                )}
              </h3>
              <ul className="lesson-list">
                {m.lessons.map((l) => (
                  <li key={l.file}>
                    {!l.planned ? (
                      <a href={l.href ?? '#'}>{l.title}</a>
                    ) : (
                      <span className="lesson-planned">{l.title} (planned)</span>
                    )}
                    <span className="lesson-status"> - {l.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      {concepts.length > 0 && (
        <section className="mastery-summary">
          <h2>Concept mastery</h2>
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
              {concepts.map(([concept, c]) => (
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
      )}

      {structure.objectives.length > 0 && (
        <details className="objectives" open={isNewCourse}>
          <summary>Objectives</summary>
          <ul>
            {structure.objectives.map((o) => (
              <li key={o.id}>
                <strong>{o.id}</strong> ({o.bloom}): {o.text}
                {o.assessed_by && <div className="objective-assessed">Assessed by: {o.assessed_by}</div>}
              </li>
            ))}
          </ul>
        </details>
      )}

      {hubHtml && (
        <details className="hub-note" open={isNewCourse}>
          <summary>Map</summary>
          <RenderedHtml html={hubHtml} tenant={tenant} className="prose" />
        </details>
      )}
    </section>
  );
}
