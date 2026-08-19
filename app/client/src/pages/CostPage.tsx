// #/t/:tenant/cost - the read-only content-cost report: per-course token spend
// of the agent transcripts that wrote it, priced at published list rates
// (docs/specs/cost.md). A missing snapshot is a normal state, not an error -
// the page then shows how_to_generate rather than a crash or a blank screen.
//
// Two things this page must never do, both named in the spec: render a
// no-data course as $0, and let the shared-orchestration line read as if it
// adds to the total. The total row, its caption, and the shared-orchestration
// section each say independently that the two figures are separate.
import { useCallback, useMemo, type ReactNode } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { CostResponse, TreeResponse } from '../../../shared/types.ts';
import { buildCourseStructure, type CourseStructure } from '../courseContext.ts';
import { tenantHref } from '../../../shared/routeHrefs.ts';

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{children}</div>
    </div>
  );
}

function money(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function CostPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<CostResponse>(`/api/v1/${encodeURIComponent(tenant)}/cost`);
  // Cost identifies a course by `dir`, deliberately not the course.yml slug
  // (lib/cost.ts: "keyed by directory... for a hand-made course the two can
  // differ"), so a course cell has to resolve through /tree's dir, not
  // reuse `course` (a directory basename) as if it were the routing slug.
  const tree = useResource<TreeResponse>(`/api/v1/${encodeURIComponent(tenant)}/tree`);
  const revalidateAll = useCallback(() => {
    revalidate();
    tree.revalidate();
  }, [revalidate, tree.revalidate]);
  useRegisterRevalidate(revalidateAll);

  const structuresByDir = useMemo(() => {
    const out: Record<string, CourseStructure> = {};
    for (const c of tree.data?.courses ?? []) out[c.dir] = buildCourseStructure(tenant, c);
    return out;
  }, [tenant, tree.data]);

  if (loading && !data) return <AsyncStatus message="Loading cost..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load cost"
        message={`Cost data for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: tenantHref(tenant) }]}
      />
    );
  }
  if (!data) return null;

  if (data.reason === 'no-snapshot' || !data.snapshot) {
    return (
      <EmptyState
        headingLevel="h1"
        title={`No cost snapshot yet for ${tenant}`}
        body="Cost reports the token spend of the agent transcripts that wrote this tenant's courses, priced at published list rates. Nothing has been measured on this machine yet."
      >
        <p>To generate one, run:</p>
        <p>
          <code>{data.how_to_generate}</code>
        </p>
      </EmptyState>
    );
  }

  const snap = data.snapshot;
  // Every string below is verbatim from CORE (snapshot.limits), never
  // composed here, only located by content so however many conditional lines
  // CORE emits - generation-only, demotion, skipped transcripts, or none of
  // them - this lookup and the full verbatim list further down both still
  // hold.
  const notABillNote = snap.limits.find((l) => l.includes('not a bill'));
  const generationOnlyNote = snap.limits.find((l) => l.includes('generation-only'));
  const demotedNote = snap.limits.find((l) => l.includes('moved to the shared orchestration line'));

  // dir, not course (the basename), is the unique identity - two courses in
  // different domains can share a basename. Any basename that appears more
  // than once across the priced rows and the no-data rows gets its directory
  // shown as a disambiguator; a unique basename stays plain.
  const basenameCounts = new Map<string, number>();
  for (const c of snap.courses) basenameCounts.set(c.course, (basenameCounts.get(c.course) ?? 0) + 1);
  for (const n of snap.no_data) basenameCounts.set(n.course, (basenameCounts.get(n.course) ?? 0) + 1);
  const ambiguous = (course: string): boolean => (basenameCounts.get(course) ?? 0) > 1;

  return (
    <section className="cost-page">
      <h1>Cost</h1>

      {/* Surfaced first, before any dollar figure, per the two things a reader
          must not miss: these are not a bill, and the underlying scan reads
          this machine's whole Claude Code history, not just this tenant. */}
      <section className="cost-section">
        <h2>About these figures</h2>
        <div className="callout">
          {notABillNote && <p className="cost-disclosure-primary">{notABillNote}</p>}
          <p>
            Where the numbers come from: generating a snapshot (<code>npm run cost</code>) scans your local Claude
            Code transcript history across every project on this machine, not only this tenant - that is the only
            place the evidence exists. Only aggregate totals, counts, and transcript identifiers are written to the
            snapshot; no transcript text, code, or credentials are read onto this page or stored anywhere in this
            repository.
          </p>
        </div>
      </section>

      <p className="status-line">
        Source: {snap.source_label ?? 'none available on this machine'} - prices as of {snap.prices_as_of || 'unknown'} -
        generated {snap.generated_at}
      </p>

      <section className="cost-section">
        <h2>Courses</h2>
        <table aria-label="Course costs">
          <thead>
            <tr>
              <th scope="col">Course</th>
              <th scope="col">Cost</th>
              <th scope="col">Scope</th>
            </tr>
          </thead>
          {snap.courses.length === 0 ? (
            <tbody>
              <tr>
                <td colSpan={3} className="status-line">
                  No priced courses yet on this machine.
                </td>
              </tr>
            </tbody>
          ) : (
            <tbody>
              {snap.courses.map((c) => (
                <tr key={c.dir}>
                  <td>
                    <div>
                      {structuresByDir[c.dir] ? (
                        <a href={structuresByDir[c.dir].href}>{structuresByDir[c.dir].title}</a>
                      ) : (
                        c.course
                      )}
                    </div>
                    {ambiguous(c.course) && <div className="cost-dir-hint">{c.dir}</div>}
                  </td>
                  <td>{money(c.cost_usd)}</td>
                  <td>
                    <span className={`cost-scope-badge cost-scope-${c.scope}`}>
                      {c.scope === 'full' ? 'full' : 'generation only'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          )}
          <tfoot>
            <tr className="cost-total-row">
              <td>Total</td>
              <td>{money(snap.totals.attributed_usd)}</td>
              <td></td>
            </tr>
          </tfoot>
        </table>
        <p className="status-line">
          Total covers the priced course rows above only. It does not include shared orchestration, below.
        </p>
        {generationOnlyNote && <p className="status-line">{generationOnlyNote}</p>}
      </section>

      <section className="cost-section">
        <h2>No data</h2>
        <p className="status-line">
          A course listed here has no cost credited to it directly, which is not the same as costing nothing. Usually
          no transcript evidence has been captured yet. It can also mean evidence existed but was moved to the shared
          orchestration line below - the transcript that would have credited this course turned out to also
          orchestrate other work, so its cost is counted there instead.
        </p>
        {demotedNote && <p className="status-line">{demotedNote}</p>}
        {snap.no_data.length === 0 ? (
          <p className="status-line">None - every course directory on disk has evidence.</p>
        ) : (
          <ul className="cost-no-data-list">
            {snap.no_data.map((n) => (
              <li key={n.dir}>
                {structuresByDir[n.dir] ? <a href={structuresByDir[n.dir].href}>{structuresByDir[n.dir].title}</a> : n.course}
                {ambiguous(n.course) && <span className="cost-dir-hint"> - {n.dir}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cost-section">
        <h2>Shared orchestration</h2>
        <p className="status-line">
          This covers sessions that wrote several courses, or that supervised the sub-agents that did. It is shown
          whole and deliberately <strong>not</strong> divided between them, and it is <strong>not</strong> included in
          the total above.
        </p>
        <div className="cost-shared">
          <p className="cost-shared-figure">{money(snap.shared_orchestration.cost_usd)}</p>
          <div className="stat-grid">
            <Stat label="Transcripts">{snap.shared_orchestration.transcripts}</Stat>
            <Stat label="Requests">{snap.shared_orchestration.requests}</Stat>
            <Stat label="Courses covered">{snap.shared_orchestration.courses.length}</Stat>
          </div>
          {snap.shared_orchestration.courses.length > 0 && (
            <p className="status-line">Covers: {snap.shared_orchestration.courses.join(', ')}</p>
          )}
        </div>
      </section>

      <section className="cost-section">
        <h2>Limits of this page</h2>
        <ul>
          {snap.limits.map((l, i) => (
            <li key={i} className="status-line">
              {l}
            </li>
          ))}
        </ul>
      </section>
    </section>
  );
}
