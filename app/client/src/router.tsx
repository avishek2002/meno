// Hand-rolled hash router: a regex table over `location.hash`, matched on every
// `hashchange`. No route library - the app has seven shapes and they don't
// change often enough to earn a dependency.
import { useEffect, useMemo, useState } from 'react';

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
  { name: 'note', pattern: /^#\/t\/(?<tenant>[^/]+)\/n\/(?<path>.+)$/ },
  { name: 'tenant', pattern: /^#\/t\/(?<tenant>[^/]+)$/ },
];

function readHash(): string {
  return window.location.hash || '#/';
}

function decodeParams(groups: Record<string, string> | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(groups ?? {})) {
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
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
