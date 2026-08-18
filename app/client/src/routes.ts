// The hash-route table plus matchRoute: pulled out of router.tsx so it
// unit-tests without a DOM (root tsconfig compiles app/**/*.ts without the
// DOM lib, and node --test cannot strip JSX either) - the same discipline
// routeParams.ts, courseList.ts, and graphLayout.ts already follow beside
// their .tsx consumer.
import { decodeParams } from './routeParams.ts';
import { type RouteName } from './routeTitles.ts';

export interface Route {
  name: string;
  params: Record<string, string>;
}

export interface RouteDef {
  // Typed against ROUTE_NAMES (routeTitles.ts) so a new route without a
  // title fails typecheck instead of silently rendering "meno".
  name: RouteName;
  pattern: RegExp;
}

export const ROUTES: RouteDef[] = [
  { name: 'home', pattern: /^#\/$/ },
  // The optional trailing fragment is the guidebook's in-page section links:
  // one hash router plus one document fragment, so a section stays linkable.
  { name: 'guide', pattern: /^#\/guide(?:#(?<section>[\w-]+))?$/ },
  { name: 'lesson', pattern: /^#\/t\/(?<tenant>[^/]+)\/c\/(?<course>[^/]+)\/m\/(?<module>[^/]+)\/l\/(?<file>[^/]+)$/ },
  // The optional trailing #module fragment (UI-10) is a module anchor within
  // the course page, the same shape as guide's #section above - `course` has
  // to exclude '#' from its character class or it would swallow the fragment
  // into the slug instead of leaving it for the named group.
  { name: 'course', pattern: /^#\/t\/(?<tenant>[^/]+)\/c\/(?<course>[^/#]+)(?:#(?<module>[\w-]+))?$/ },
  // Truncating a lesson URL down to its module (deleting `/l/<file>`) has to
  // land on the course page at that module, not not-found - the same
  // destination the #module fragment above already reaches, just spelled as
  // a path segment instead of a fragment. This is a second RouteDef, not a
  // second named group added to the pattern above: a single pattern can only
  // declare one `(?<module>...)` per alternative, and JavaScript historically
  // rejected the same group name repeated across `|` alternatives in one
  // pattern (support for that is too recent to rely on here). Two RouteDef
  // entries sharing the name 'course' keeps the fragment form above
  // untouched - courseModuleHref keeps emitting it, so no existing bookmark
  // or generated link breaks - while giving the truncated path form its own
  // pattern. `course` excludes '/' the same way every other course-slug
  // group in this file does, and this pattern has no trailing fragment
  // group, so it never competes with the fragment-form entry above: that one
  // cannot consume a `/m/...` suffix (its `course` group excludes '/' and
  // `$` anchors right after the optional fragment), and this one has no `/l/`
  // to consume, so the `lesson` pattern above still matches first whenever
  // one is present. Order relative to the fragment-form entry does not
  // matter for the same reason; it sits here only to stay next to it.
  { name: 'course', pattern: /^#\/t\/(?<tenant>[^/]+)\/c\/(?<course>[^/]+)\/m\/(?<module>[^/]+)$/ },
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
  // `tenant` also matches the course-list deep link, `#/t/<tenant>#course-<slug>`
  // (courseList.ts's courseSlugFromFragment resolves the fragment; this
  // route only has to carry it) - the same fragment-folding `guide` does
  // above. The subtlety: every other tenant-shaped route above uses `[^/]+`
  // for `tenant` because a tenant name never contains a slash, but `[^/]+`
  // also matches a literal `#`. Copying that class here would let a greedy
  // `tenant` swallow the whole fragment too, since the trailing section
  // group is optional and can always match zero characters instead - the
  // fragment would land inside `tenant`, not `section`. Excluding `#` from
  // the tenant class (mirroring how `graph` above excludes `?`) forces the
  // regex engine to leave the fragment for the section group. This is safe
  // because every link that builds a tenant URL encodes the tenant with
  // encodeURIComponent, which percent-encodes a literal `#` - a real tenant
  // name can never contain one unencoded.
  { name: 'tenant', pattern: /^#\/t\/(?<tenant>[^/#]+)(?:#(?<section>[\w-]+))?$/ },
];

export function matchRoute(hash: string): Route {
  for (const r of ROUTES) {
    const m = hash.match(r.pattern);
    if (m) return { name: r.name, params: decodeParams(m.groups) };
  }
  return { name: 'not-found', params: {} };
}
