// Wordmark linking home, tenant name + nav when inside a tenant, the guidebook
// link (always reachable, since the screen you need help on may be the one with
// no tenant yet), and the "Re-read files" button - files are the truth and there
// is no watcher, so re-reading is always an explicit action.
//
// Real anchors with aria-current, not tabs: each of these has its own URL and
// answers the back button, which makes them navigation.
import { InfoTip } from './InfoTip';

export function Header({
  tenant,
  route,
  onRefresh,
}: {
  tenant?: string;
  route: string;
  onRefresh: () => void;
}) {
  const t = tenant ? encodeURIComponent(tenant) : '';
  const current = (name: string): 'page' | undefined => (route === name ? 'page' : undefined);

  return (
    <header className="app-header">
      <div className="app-header-left">
        <a href="#/" className="wordmark">
          meno
        </a>
        {tenant && <span className="tenant-name">{tenant}</span>}
      </div>
      <nav className="main-nav" aria-label="Main">
        {tenant && (
          <>
            <a href={`#/t/${t}`} aria-current={current('tenant')}>
              Courses
            </a>
            <a href={`#/t/${t}/todos`} aria-current={current('todos')}>
              Todos
            </a>
            <a href={`#/t/${t}/progress`} aria-current={current('progress')}>
              Progress
            </a>
            <a href={`#/t/${t}/insights`} aria-current={current('insights')}>
              Insights
            </a>
            <a href={`#/t/${t}/cost`} aria-current={current('cost')}>
              Cost
            </a>
          </>
        )}
        <a href="#/guide" className="nav-guide" aria-current={current('guide')}>
          Guide
        </a>
      </nav>
      <span className="header-refresh">
        <button type="button" className="refresh-btn" onClick={onRefresh}>
          Re-read files
        </button>
        <InfoTip entry="reReadFiles" />
      </span>
    </header>
  );
}
