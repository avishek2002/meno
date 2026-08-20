// #/t/:tenant/c/:course - a Continue block naming the next action, modules
// with gate state, concept mastery, then the objectives and hub note as a
// closed-by-default briefing (UI-07). Concept mastery and module gate chips
// only render at all because useCourseContext's asCourseMastery accepts the
// {concepts, modules} shape the server actually sends (UI-01).
import { useEffect } from 'react';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { ErrorState } from '../components/ErrorState';
import { RenderedHtml } from '../components/RenderedHtml';
import { Meter } from '../components/Meter';
import { Breadcrumb, type BreadcrumbSegment } from '../components/Breadcrumb';
import { NotesPanel } from '../components/NotesPanel';
import { useCourseContext } from '../useCourseContext';
import { stripMd, type CourseLesson, type CourseModuleEntry, type CourseStructure } from '../courseContext.ts';
import type { ClientCourseMastery, ClientModuleMastery } from '../clientTypes';
import { tenantHref, graphHref, progressHref } from '../../../shared/routeHrefs.ts';
import { prefersReducedMotion } from '../reducedMotion.tsx';

// How long the arrival highlight (below) stays on the module card the
// #module anchor landed on, before it clears itself - long enough to be
// seen, short enough to read as "you just arrived" rather than a permanent
// state that could be confused with a gate chip.
const HIGHLIGHT_MS = 1500;

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

export function CoursePage({ tenant, course, module }: { tenant: string; course: string; module?: string }) {
  const { structure, mastery, hubHtml, data, loading, error, revalidate } = useCourseContext(tenant, course);
  useRegisterRevalidate(revalidate);

  // UI-10: the module anchor (router.tsx's optional trailing #module on the
  // `course` route, or the truncated /m/<module> path form LessonPage's
  // breadcrumb now links to) scrolls once the module card exists in the DOM
  // - it cannot exist before `structure` has loaded, the same ordering
  // reason GuidePage's #section effect waits on nothing but is safe to fire
  // immediately since its sections are static content.
  //
  // Focus moves to the card too, not just the viewport - without it a
  // keyboard user following the breadcrumb link lands with focus still on
  // <main> (App.tsx's route-change effect) and their next Tab restarts from
  // the top, the same gap TenantCoursesPage's deep-link effect fixes for its
  // own forced section. `:focus-visible` is not a reliable ring here:
  // browsers frequently withhold it on a programmatic focus() the way they
  // would not on a real click or Tab, so the highlight below is a separate,
  // explicit signal rather than something this focus() is trusted to draw
  // on its own. CSS `:target` cannot substitute for either: the browser
  // treats the whole hash as one fragment, so no element id in this document
  // will ever match it.
  useEffect(() => {
    if (!module || !structure) return;
    const el = document.getElementById(module);
    if (!el) return;
    const reduced = prefersReducedMotion();
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    el.classList.add('module-card-arrived');
    const timer = setTimeout(() => el.classList.remove('module-card-arrived'), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [module, structure]);

  if (loading && !data) return <AsyncStatus message="Loading course..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load course"
        message="This course could not be loaded."
        detail={error}
        links={[{ label: 'Courses', href: tenantHref(tenant) }]}
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

  // The up-move from a lesson's breadcrumb (LessonPage.tsx) lands here, one
  // level below the tenant root - the same rule that gives the lesson and
  // note pages a breadcrumb, applied to a third page rather than special-
  // cased. Flat sibling pages (Graph, Todos, Progress, Insights, Cost) sit
  // one level under the tenant root too, but stay off this rule: the nav
  // bar's own aria-current already answers "where am I" for those, and nothing
  // ever routes there through this page the way a lesson's "up" routes here.
  const breadcrumbSegments: BreadcrumbSegment[] = [
    { label: 'Courses', href: tenantHref(tenant) },
    { label: structure.title },
  ];

  return (
    <section>
      <Breadcrumb segments={breadcrumbSegments} />
      <header className="course-header">
        <h1>{structure.title}</h1>
        <span className={`status-badge status-${structure.status}`}>{structure.status}</span>
        <a
          className="show-in-graph"
          href={graphHref(tenant, hubBasename(structure.hub))}
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
            <a href={progressHref(tenant)}>progress</a>.
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
            // id makes each card a scroll/link target (UI-10): courseModuleHref
            // builds an href of exactly `#/t/.../c/course#${m.slug}`.
            // tabIndex={-1} only on the anchored module: reachable by the
            // scroll-and-focus effect above's focus() call, never by Tab - a
            // <div> is not natively focusable, and only the one card an
            // anchor actually resolved to ever needs to be a focus target,
            // the same convention TenantCoursesPage's forced <details> uses.
            <div
              key={m.slug}
              id={m.slug}
              className="module-card"
              tabIndex={m.slug === module ? -1 : undefined}
            >
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
          <table className="mastery-table" aria-label="Concept mastery">
            <thead>
              <tr>
                <th scope="col">Concept</th>
                <th scope="col">Level</th>
                <th scope="col">Transfer score</th>
                <th scope="col">Recognition rate</th>
                <th scope="col">Next review</th>
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

      {/* Personal notes (docs/specs/notes.md): the course page has no
          anatomy headings, so it offers only the single whole-course
          section - no `sections`/`focusRequest` wiring needed here. */}
      <NotesPanel key={`${tenant}:${course}`} tenant={tenant} course={course} courseTitle={structure.title} page="course" />
    </section>
  );
}
