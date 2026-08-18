// Hand-rolled hash router: matches location.hash against the route table in
// routes.ts on every hashchange. No route library - the app has a handful of
// shapes and they don't change often enough to earn a dependency. The route
// table itself lives in routes.ts, not here, so it unit-tests without a DOM.
import { useEffect, useMemo, useState } from 'react';
import { matchRoute, type Route } from './routes.ts';

// Re-exported so existing importers of `Route` from this module keep working
// unchanged now that its definition moved to routes.ts.
export type { Route };
export { APP_TITLE, routeNames, routeTitle } from './routeTitles.ts';

function readHash(): string {
  return window.location.hash || '#/';
}

export function useRoute(): Route {
  const [hash, setHash] = useState<string>(readHash);
  useEffect(() => {
    const onChange = (): void => setHash(readHash());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return useMemo(() => matchRoute(hash), [hash]);
}

export function navigate(hash: string): void {
  window.location.hash = hash;
}
