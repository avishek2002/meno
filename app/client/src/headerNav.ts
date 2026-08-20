// The pure decision behind the header's nav links (UI-18): which entries
// render, in what order, with what href, and with what aria-current state.
// Pulled out of Header.tsx for the same reason routeParams.ts, courseList.ts,
// historyDepth.ts, scrollReset.ts and graphLayout.ts sit apart from their
// .tsx consumers - the root tsconfig compiles app/**/*.ts without the DOM
// lib, so this is the only way the nav's shape gets a `node --test` guard
// instead of a defect that can only be seen by rendering JSX. There is no
// DOM test library in this repo, so a header bug like the one this file
// exists to fix - clicking Guide from inside a tenant silently dropped every
// other nav link - has no other route to being pinned down by the gate.
import {
  guideHrefFor,
  tenantHref,
  graphHref,
  todosHref,
  progressHref,
  glossaryHref,
  insightsHref,
  costHref,
} from '../../shared/routeHrefs.ts';

export interface NavEntry {
  label: string;
  href: string;
  /** Spread straight onto the anchor's aria-current, so the type matches
   *  what that attribute accepts (undefined omits it) rather than a bare
   *  boolean Header would have to translate. */
  current: 'page' | undefined;
  /** CSS hook only the Guide entry carries (styles.css, styles/nav.css);
   *  every tenant entry omits it. */
  className?: string;
}

// course, lesson and note are reached only by drilling into Courses - there
// is no other nav item for them - so all three carry the same aria-current as
// the course list itself (UI-03). Without this, three levels into a course
// reads to assistive tech as though the learner had left every section of the
// app.
const COURSES_SUB_ROUTES = new Set(['tenant', 'course', 'lesson', 'note']);

function currentFor(name: string, route: string): 'page' | undefined {
  const match = name === 'tenant' ? COURSES_SUB_ROUTES.has(route) : route === name;
  return match ? 'page' : undefined;
}

/**
 * The ordered nav entries for `route` (a route name, e.g. `route.name`) given
 * whichever tenant, if any, the current URL carries. Seven tenant-scoped links
 * plus Guide when a tenant is known; Guide alone when it is not (UI-18) - the
 * list must never come back empty, because #/guide is deliberately reachable
 * with no tenant, on the reasoning that the screen someone needs help on may
 * be the one with no tenant yet (see Header.tsx's comment on the same point).
 *
 * Guide's own href switches form with `tenant`: `tenantGuideHref` inside a
 * tenant, so the seven other links and Guide all point at the same tenant, and
 * `guideHref` outside one. That switch is what fixes UI-18 - before it, the
 * header always linked plain `#/guide`, which matched the tenant-less `guide`
 * RouteDef even when a tenant was open, and the nav block above it would not
 * render on the guide page or on the first in-guide section click that
 * followed it, because neither of those was inside `tenant`, `course`,
 * `lesson` or `note`. The two-form guide route (routes.ts) is what makes
 * `tenantGuideHref`'s output resolve back to the same page with `route.name`
 * still `'guide'`, so `currentFor` above needs no change to keep marking
 * Guide current on either form.
 */
export function buildNavEntries(route: string, tenant: string | undefined): NavEntry[] {
  const entries: NavEntry[] = [];
  if (tenant !== undefined) {
    entries.push(
      { label: 'Courses', href: tenantHref(tenant), current: currentFor('tenant', route) },
      { label: 'Graph', href: graphHref(tenant), current: currentFor('graph', route) },
      { label: 'Todos', href: todosHref(tenant), current: currentFor('todos', route) },
      { label: 'Progress', href: progressHref(tenant), current: currentFor('progress', route) },
      { label: 'Glossary', href: glossaryHref(tenant), current: currentFor('glossary', route) },
      { label: 'Insights', href: insightsHref(tenant), current: currentFor('insights', route) },
      { label: 'Cost', href: costHref(tenant), current: currentFor('cost', route) },
    );
  }
  entries.push({
    label: 'Guide',
    href: guideHrefFor(tenant),
    current: currentFor('guide', route),
    className: 'nav-guide',
  });
  return entries;
}
