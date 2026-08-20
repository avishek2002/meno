// #/t/:tenant/glossary - the read-only merged vocabulary the tenant's courses
// have introduced (CONTRACT-glossary.md). Terms are display-only: this page
// reads no ledger and shows no mastery state, only what each course's
// terms.yml sidecars merged into.
//
// Rendering order is never re-derived: `courses` arrives in tree-walk order
// and each course's `entries` in curriculum order (module sequence, then
// lesson sequence) - that order is the whole point of the feature, so this
// page must never alphabetize it.
import { useState } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { GlossaryResponse, GlossaryCourse, GlossaryEntry } from '../../../shared/types.ts';
import { tenantHref, lessonHref } from '../../../shared/routeHrefs.ts';

/**
 * Plain substring match, case-insensitive - the same rule TenantCoursesPage's
 * course filter applies to a title/slug (courseList.ts's foldForSearch),
 * applied here to a term's spelling and its definition. No fuzzy matching,
 * no new dependency.
 */
function fold(raw: string): string {
  return raw.toLowerCase().trim();
}

function entryMatches(entry: GlossaryEntry, foldedQuery: string): boolean {
  return fold(entry.term).includes(foldedQuery) || fold(entry.definition).includes(foldedQuery);
}

/**
 * see_also holds term keys, not display spellings. A key that resolves to an
 * entry in this same course renders with that entry's own display spelling;
 * a key with no entry in this course (a forward reference to a module not
 * yet generated is normal, per the contract) renders as the raw key instead
 * of a broken link. Neither ever becomes a link: this version has no
 * fragment-safe per-term anchor to point at (a term key may contain spaces
 * and uppercase), so finding a row is the filter input's job, not a click.
 */
function SeeAlso({ course, keys }: { course: GlossaryCourse; keys: string[] }) {
  if (keys.length === 0) return null;
  const byKey = new Map(course.entries.map((e) => [e.key, e.term]));
  return (
    <p className="status-line glossary-see-also">
      Also see:{' '}
      {keys.map((k, i) => (
        <span key={k}>
          {i > 0 && ', '}
          {byKey.get(k) ?? k}
        </span>
      ))}
    </p>
  );
}

/**
 * Split a course's entries into consecutive runs sharing an introducing module.
 *
 * A run, not a group-by: `entries` already arrives in curriculum order (module
 * sequence, then lesson sequence), so every entry a module introduced is
 * already contiguous. Walking runs preserves that order by construction, where
 * a Map-keyed group-by would quietly re-order the moment its insertion order
 * and the server's disagreed - and curriculum order is the whole reason this
 * page exists rather than an alphabetical list.
 */
function moduleRuns(entries: GlossaryEntry[]): { module: string; title: string; entries: GlossaryEntry[] }[] {
  const runs: { module: string; title: string; entries: GlossaryEntry[] }[] = [];
  for (const entry of entries) {
    const last = runs.at(-1);
    if (last && last.module === entry.introduced_by.module) last.entries.push(entry);
    else runs.push({ module: entry.introduced_by.module, title: entry.introduced_by.module_title, entries: [entry] });
  }
  return runs;
}

function GlossaryEntryCard({ tenant, course, entry }: { tenant: string; course: GlossaryCourse; entry: GlossaryEntry }) {
  return (
    <div className="glossary-entry">
      <h4>{entry.term}</h4>
      <p>{entry.definition}</p>
      <p className="status-line">
        Introduced in{' '}
        <a href={lessonHref(tenant, entry.introduced_by.course, entry.introduced_by.module, entry.introduced_by.file)}>
          {entry.introduced_by.title}
        </a>
      </p>
      {entry.reused_by.length > 0 && (
        <p className="status-line">
          Also used in{' '}
          {entry.reused_by.map((b, i) => (
            <span key={`${b.module} ${b.file}`}>
              {i > 0 && ', '}
              <a href={lessonHref(tenant, b.course, b.module, b.file)}>{b.title}</a>
            </span>
          ))}
        </p>
      )}
      <SeeAlso course={course} keys={entry.see_also} />
    </div>
  );
}

export function GlossaryPage({ tenant }: { tenant: string }) {
  const { data, error, loading, revalidate } = useResource<GlossaryResponse>(`/api/v1/${encodeURIComponent(tenant)}/glossary`);
  useRegisterRevalidate(revalidate);

  const [query, setQuery] = useState('');

  if (loading && !data) return <AsyncStatus message="Loading glossary..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load glossary"
        message={`The glossary for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: tenantHref(tenant) }]}
      />
    );
  }
  if (!data) return null;

  // Courses in tree-walk order, exactly as the server sent them - a course
  // with no terms.yml entries at all is simply not worth a heading, but the
  // ones that remain keep their given order untouched.
  const coursesWithTerms = data.courses.filter((c) => c.entries.length > 0);

  if (coursesWithTerms.length === 0) {
    return (
      <EmptyState
        headingLevel="h1"
        title={`No glossary terms yet for ${tenant}`}
        body="Terms appear here once a module's lesson bodies introduce vocabulary through a terms.yml sidecar."
      />
    );
  }

  const foldedQuery = fold(query);
  const filtering = foldedQuery !== '';
  const filteredCourses = filtering
    ? coursesWithTerms
        .map((c) => ({ ...c, entries: c.entries.filter((e) => entryMatches(e, foldedQuery)) }))
        .filter((c) => c.entries.length > 0)
    : coursesWithTerms;
  const matchCount = filteredCourses.reduce((n, c) => n + c.entries.length, 0);

  return (
    <section className="glossary-page">
      <h1 aria-labelledby="glossary-heading">
        <span id="glossary-heading">Glossary</span>
      </h1>

      {data.warnings.length > 0 && (
        <div className="warnings-box">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      <div className="course-list-controls">
        <input
          type="search"
          className="course-filter-input"
          value={query}
          aria-label="Filter glossary terms by term or definition"
          placeholder="Filter terms..."
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setQuery('');
          }}
        />
      </div>

      {filtering && (
        <p className="status-line" role="status" aria-live="polite">
          {matchCount === 0
            ? `No term matches "${query}".`
            : `${matchCount} ${matchCount === 1 ? 'match' : 'matches'} for "${query}".`}
        </p>
      )}

      {filtering && matchCount === 0 ? (
        <p className="course-list-no-results">
          <button type="button" onClick={() => setQuery('')}>
            Clear filter
          </button>
        </p>
      ) : (
        filteredCourses.map((course) => (
          <section key={course.course} className="glossary-course">
            <h2>{course.title}</h2>
            {moduleRuns(course.entries).map((run) => (
              <section key={`${run.module} ${run.entries[0].key}`} className="glossary-module">
                <h3>{run.title}</h3>
                {run.entries.map((entry) => (
                  <GlossaryEntryCard key={entry.key} tenant={tenant} course={course} entry={entry} />
                ))}
              </section>
            ))}
          </section>
        ))
      )}
    </section>
  );
}
