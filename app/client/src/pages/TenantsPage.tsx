// #/ - tenant list.
import { useEffect } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { navigate } from '../router';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { TenantsResponse } from '../clientTypes';
import type { ProgressResponse } from '../../../shared/types.ts';

// UI-08: a due count on the learner card, fetched independently per card so a
// slow or failing /progress for one learner never blocks the others or the
// tenant list itself - it just renders that one card without a count.
function LearnerCard({ id, courses }: { id: string; courses: number }) {
  const progress = useResource<ProgressResponse>(`/api/v1/${encodeURIComponent(id)}/progress`);
  const due = progress.data?.due.length ?? 0;
  return (
    <a href={`#/t/${encodeURIComponent(id)}`} className="tenant-card">
      <span className="tenant-card-id">{id}</span>
      <span className="tenant-card-meta">
        {courses} {courses === 1 ? 'course' : 'courses'}
        {due > 0 && (
          <>
            {' · '}
            {due} {due === 1 ? 'review' : 'reviews'} due
          </>
        )}
      </span>
    </a>
  );
}

export function TenantsPage() {
  const { data, error, loading, revalidate } = useResource<TenantsResponse>('/api/v1/tenants');
  useRegisterRevalidate(revalidate);

  // UI-08: with exactly one learner, this page is a guaranteed dead click
  // every session - skip it and land straight on their course list, where
  // the due-review summary this same finding adds is the first thing seen.
  useEffect(() => {
    if (data && data.tenants.length === 1) navigate(`#/t/${encodeURIComponent(data.tenants[0].id)}`);
  }, [data]);

  if (loading && !data) return <AsyncStatus message="Loading learners..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load learners"
        message="The list of learners could not be loaded."
        detail={error}
        links={[{ label: 'Guide', href: '#/guide' }]}
      />
    );
  }
  const tenants = data?.tenants ?? [];

  if (tenants.length === 0) {
    return (
      <EmptyState
        title="No learner content yet"
        body="Meno has no tenants yet - nobody has started a learning contract on this machine."
      />
    );
  }

  // The redirect above fires from an effect, one render after tenants
  // resolves - render nothing in that single-tenant gap rather than a list
  // that would only flash and vanish.
  if (tenants.length === 1) return <AsyncStatus message="Loading your course list..." />;

  return (
    <section>
      <h1>Learners</h1>
      <ul className="tenant-list">
        {tenants.map((t) => (
          <li key={t.id}>
            <LearnerCard id={t.id} courses={t.courses} />
          </li>
        ))}
      </ul>
    </section>
  );
}
