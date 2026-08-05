// Wordmark linking home, tenant name + nav when inside a tenant, and the
// "Re-read files" button - files are the truth and there is no watcher, so
// re-reading is always an explicit action.
export function Header({ tenant, onRefresh }: { tenant?: string; onRefresh: () => void }) {
  return (
    <header className="app-header">
      <div className="app-header-left">
        <a href="#/" className="wordmark">
          meno
        </a>
        {tenant && <span className="tenant-name">{tenant}</span>}
      </div>
      {tenant && (
        <nav className="main-nav">
          <a href={`#/t/${encodeURIComponent(tenant)}`}>Courses</a>
          <a href={`#/t/${encodeURIComponent(tenant)}/todos`}>Todos</a>
          <a href={`#/t/${encodeURIComponent(tenant)}/progress`}>Progress</a>
        </nav>
      )}
      <button type="button" className="refresh-btn" onClick={onRefresh}>
        Re-read files
      </button>
    </header>
  );
}
