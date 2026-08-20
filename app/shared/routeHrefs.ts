// Named builders for every hash route the app links to - routes.ts
// (app/client/src) is the matching half of this pair, and every pattern
// there has exactly one builder here. Lives under app/shared/, not
// app/client/src/, for the same reason CourseNode itself lives in types.ts
// rather than in courseContext.ts: lib/graph.ts is server-side code and
// must not import client or React dependencies, but it still has to emit
// routes into the /graph API payload's `route` field, a contract this file
// documents in types.ts. app/shared/ is the one directory both the client
// and lib/ already import from, so it is the only consistent home.
//
// Before this file, the same route grammar was re-templated by hand at 52
// call sites across 18 files, each redoing its own encodeURIComponent calls
// - this is that grammar collapsed into one place. Every value interpolated
// into a path segment is percent-encoded with encodeURIComponent, matching
// what every route in routes.ts expects; a course-module fragment and a
// guide/tenant section fragment are the only exceptions (see courseModuleHref
// below for why).

/** Manifests carry lesson files with the suffix; every route segment is without it. */
export function stripMd(file: string): string {
  return file.replace(/\.md$/, '');
}

export function homeHref(): string {
  return '#/';
}

/** #/guide, optionally anchored at a section id (glossary included - it is just another id). */
export function guideHref(section?: string): string {
  return section === undefined ? '#/guide' : `#/guide#${section}`;
}

export function tenantHref(tenant: string): string {
  return `#/t/${encodeURIComponent(tenant)}`;
}

/**
 * The one chooser in this file, not a third route pattern: given whatever
 * tenant the reader currently has open (undefined if none), the guidebook URL
 * that keeps them there - tenantGuideHref below inside a tenant, guideHref
 * above outside one.
 *
 * It exists because that choice is the whole of UI-18 and it has two call
 * sites, not one: the header's Guide link (headerNav.ts) and the guidebook's
 * own table of contents (GuidePage.tsx). Getting it right in the header and
 * wrong in the table of contents is not a hypothetical - it is the shape the
 * bug took in the first place, where the nav block reappeared on arrival at
 * the guide and vanished again on the first section click. One function with
 * one test is what stops the two call sites from drifting apart again.
 *
 * Here rather than beside either caller because this file is already the
 * shared home both of them import from, and because it is DOM-free: GuidePage
 * is .tsx, which `node --test` cannot strip, so a copy of this ternary living
 * inline there could never be covered by the gate.
 */
export function guideHrefFor(tenant: string | undefined, section?: string): string {
  return tenant === undefined ? guideHref(section) : tenantGuideHref(tenant, section);
}

/**
 * The tenant-scoped guidebook (UI-18): #/t/<tenant>/guide, optionally
 * anchored at a section id the same way guideHref above is. Not
 * percent-encoded on the section for the same reason courseModuleHref below
 * is not - see that comment for the id grammar this fragment is drawn from.
 */
export function tenantGuideHref(tenant: string, section?: string): string {
  const base = `${tenantHref(tenant)}/guide`;
  return section === undefined ? base : `${base}#${section}`;
}

/**
 * The course-list deep link, #/t/<tenant>#course-<slug> - courseList.ts's
 * courseSlugFromFragment (the fragment scheme's owner) resolves it back to a
 * slug. Not percent-encoded, matching courseModuleHref below: a course slug
 * is drawn from the same id grammar section ids use
 * (`/^[a-z0-9]+(-[a-z0-9]+)*$/`, lib/groups.ts), which contains nothing a URL
 * fragment needs escaped.
 */
export function tenantCourseHref(tenant: string, courseSlug: string): string {
  return `${tenantHref(tenant)}#course-${courseSlug}`;
}

export function courseHref(tenant: string, course: string): string {
  return `#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course)}`;
}

export function lessonHref(tenant: string, course: string, module: string, file: string): string {
  return `${courseHref(tenant, course)}/m/${encodeURIComponent(module)}/l/${encodeURIComponent(stripMd(file))}`;
}

/**
 * A course link anchored at one of its modules (UI-10) as the pre-existing
 * #module fragment, still emitted for bookmark compatibility - see routes.ts's
 * `course` RouteDef comment for why the fragment form and the path form
 * (courseModulePathHref below) are two separate route entries rather than
 * one. Not percent-encoded: see tenantCourseHref above for why a module slug
 * never needs escaping in a fragment.
 */
export function courseModuleHref(tenant: string, course: string, module: string): string {
  return `${courseHref(tenant, course)}#${module}`;
}

/**
 * The same course-at-module link as courseModuleHref, spelled as a path
 * segment (#/t/<tenant>/c/<course>/m/<module>) instead of a fragment - what
 * truncating a lesson URL down to its module lands on (routes.ts's second
 * `course` RouteDef). New call sites should prefer this form; courseModuleHref
 * stays for the links that intentionally keep emitting the older bookmark-
 * compatible shape.
 */
export function courseModulePathHref(tenant: string, course: string, module: string): string {
  return `${courseHref(tenant, course)}/m/${encodeURIComponent(module)}`;
}

export function todosHref(tenant: string): string {
  return `${tenantHref(tenant)}/todos`;
}

export function progressHref(tenant: string): string {
  return `${tenantHref(tenant)}/progress`;
}

export function insightsHref(tenant: string): string {
  return `${tenantHref(tenant)}/insights`;
}

export function costHref(tenant: string): string {
  return `${tenantHref(tenant)}/cost`;
}

export function glossaryHref(tenant: string): string {
  return `${tenantHref(tenant)}/glossary`;
}

/** #/t/<tenant>/graph, optionally centred on a node via ?focus=. */
export function graphHref(tenant: string, focus?: string): string {
  return focus === undefined ? `${tenantHref(tenant)}/graph` : `${tenantHref(tenant)}/graph?focus=${encodeURIComponent(focus)}`;
}

/**
 * routes.ts's `note` pattern captures everything after `/n/` as one group
 * and keeps `/` as the path's own segment separator (`(?<path>.+)`), so a
 * vault path is encoded segment-by-segment rather than as one whole string -
 * encoding the whole string would turn every `/` into a literal `%2F`, which
 * still matches the pattern and still round-trips through decodeParams's
 * single decodeURIComponent call, but produces an unreadable URL for no
 * reason. This is lib/graph.ts's own encPathSegment, promoted here: its
 * `route` field is the one of the three note-route call sites that already
 * had a written contract (GraphResponse.route, app/shared/types.ts), so it is
 * the version every note-path builder keeps.
 */
export function noteHref(tenant: string, path: string): string {
  const encodedPath = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${tenantHref(tenant)}/n/${encodedPath}`;
}
