// Hand-rolled hash router: a regex table over `location.hash`, matched on every
// `hashchange`. No route library - the app has eight shapes and they don't
// change often enough to earn a dependency.
import { useEffect, useMemo, useState } from 'react';
import { decodeParams } from './routeParams.ts';

export interface Route {
  name: string;
  params: Record<string, string>;
}

interface RouteDef {
  name: string;
  pattern: RegExp;
}

const ROUTES: RouteDef[] = [
  { name: 'home', pattern: /^#\/$/ },
  // The optional trailing fragment is the guidebook's in-page section links:
  // one hash router plus one document fragment, so a section stays linkable.
  { name: 'guide', pattern: /^#\/guide(?:#(?<section>[\w-]+))?$/ },
  { name: 'lesson', pattern: /^#\/t\/(?<tenant>[^/]+)\/c\/(?<course>[^/]+)\/m\/(?<module>[^/]+)\/l\/(?<file>[^/]+)$/ },
  { name: 'course', pattern: /^#\/t\/(?<tenant>[^/]+)\/c\/(?<course>[^/]+)$/ },
  { name: 'todos', pattern: /^#\/t\/(?<tenant>[^/]+)\/todos$/ },
  { name: 'progress', pattern: /^#\/t\/(?<tenant>[^/]+)\/progress$/ },
  { name: 'insights', pattern: /^#\/t\/(?<tenant>[^/]+)\/insights$/ },
  { name: 'cost', pattern: /^#\/t\/(?<tenant>[^/]+)\/cost$/ },
  // The browser puts everything after the first `#` into location.hash, so
  // `?focus=` written after the hash route lives inside the hash itself -
  // the optional query is folded into this one pattern, the same way `guide`
  // folds in its optional trailing fragment above. `[^/?]+` keeps a `?` out
  // of `tenant`; `[^&#]*` keeps a second query param or trailing fragment
  // from silently landing inside `focus` - either fails the match and falls
  // through to not-found instead.
  { name: 'graph', pattern: /^#\/t\/(?<tenant>[^/?]+)\/graph(?:\?focus=(?<focus>[^&#]*))?$/ },
  { name: 'note', pattern: /^#\/t\/(?<tenant>[^/]+)\/n\/(?<path>.+)$/ },
  { name: 'tenant', pattern: /^#\/t\/(?<tenant>[^/]+)$/ },
];

function readHash(): string {
  return window.location.hash || '#/';
}

function matchRoute(hash: string): Route {
  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) return { name: r.name, params: decodeParams(m.groups) };
  }
  return { name: 'not-found', params: {} };
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
