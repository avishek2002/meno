// #/ - tenant list.
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import type { TenantsResponse } from '../clientTypes';

export function TenantsPage() {
  const { data, error, loading, revalidate } = useResource<TenantsResponse>('/api/v1/tenants');
  useRegisterRevalidate(revalidate);

  if (loading && !data) return <p className="status-line">Loading tenants...</p>;
  if (error) return <p className="status-line status-error">Could not load tenants: {error}</p>;
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
