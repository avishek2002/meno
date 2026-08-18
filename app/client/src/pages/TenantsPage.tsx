// #/ - tenant list.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import type { TenantsResponse } from '../clientTypes';

export function TenantsPage() {
  const { data, error, loading, revalidate } = useResource<TenantsResponse>('/api/v1/tenants');
  useRegisterRevalidate(revalidate);

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

  return (
    <section>
      <h1>Learners</h1>
      <ul className="tenant-list">
        {tenants.map((t) => (
          <li key={t.id}>
            <a href={`#/t/${encodeURIComponent(t.id)}`} className="tenant-card">
              <span className="tenant-card-id">{t.id}</span>
              <span className="tenant-card-meta">
                {t.courses} {t.courses === 1 ? 'course' : 'courses'}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
