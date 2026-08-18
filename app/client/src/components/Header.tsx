// Wordmark linking home, tenant name + nav when inside a tenant, the guidebook
// link (always reachable, since the screen you need help on may be the one with
// no tenant yet), a guarded back button, and the "Re-read files" button - files
// are the truth and there is no watcher, so re-reading is always an explicit
// action.
//
// Real anchors with aria-current, not tabs: each of these has its own URL and
// answers the back button, which makes them navigation.
import { useEffect, useState } from 'react';
import { InfoTip } from './InfoTip';
import { nextDepth, stampedState } from '../historyDepth.ts';

// Tracks how many in-app entries back the reader can go, so the back button
// can hide itself entirely rather than ever ejecting someone out of Meno -
// a fresh deep-link load or a bookmark starts at depth 0 with nothing behind
// it. Depth is read off history.state on hashchange, not incremented in
// place; see historyDepth.ts for why a naive counter is wrong.
//
// Links in this app are plain <a href="#..."> anchors (see router.tsx's
// comment on why there is no route library) that never route through a
// shared navigate() call - wikilinks.tsx and GraphPage.tsx are the only
// callers of navigate(), and even those just assign location.hash the same
// way a plain anchor click would. hashchange is the one event that fires for
// every one of those transitions regardless of how the hash changed, which
// is why the stamping happens there instead of at a navigation call site.
function useBackDepth(): number {
  const [depth, setDepth] = useState(0);
  useEffect(() => {
    let current = -1; // sentinel: an unstamped entry at mount adopts depth 0, not "current + 1"
    const adopt = (): void => {
      const decision = nextDepth(history.state, current);
      if (decision.stamp) {
        try {
          history.replaceState(stampedState(history.state, decision.depth), '');
        } catch {
          // Safari throttles history.replaceState (roughly 100 calls per 30
          // seconds) and throws once exceeded. The same degrade instinct as
          // readOpenState/writeOpenState treating a throwing store as
          // session-only, not an error: keep the depth this render adopted
          // in memory (the two lines below still run) even though it never
          // reached the entry's actual state, rather than letting the throw
          // abort adopt() here and leave `current` stale for the next
          // hashchange.
        }
      }
      current = decision.depth;
      setDepth(decision.depth);
    };
    adopt();
    window.addEventListener('hashchange', adopt);
    return () => window.removeEventListener('hashchange', adopt);
  }, []);
  return depth;
}

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
  const backDepth = useBackDepth();

  return (
    <header className="app-header">
      <div className="app-header-left">
        {backDepth > 0 && (
          <button type="button" className="back-btn" aria-label="Back" onClick={() => history.back()}>
            ←
          </button>
        )}
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
            <a href={`#/t/${t}/graph`} aria-current={current('graph')}>
              Graph
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
