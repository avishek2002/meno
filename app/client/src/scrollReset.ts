// Whether App.tsx's route-change scroll reset should skip window.scrollTo(0,
// 0). Pulled out of App.tsx so it unit-tests without a DOM (root tsconfig
// compiles app/**/*.ts without the DOM lib, the same reason routeParams.ts
// and routeTitles.ts sit apart from their .tsx consumers).
//
// Three routes carry an optional trailing anchor - routes.ts's
// "fragment-folding" pattern - and each has its own page-level effect that
// scrolls to that anchor once it exists in the DOM: guide's #section,
// course's #module (UI-10), and tenant's #course-<slug> deep link. Resetting
// to the top first and then scrolling to the anchor is a visible jump, and
// used to work only because CoursePage's anchor effect is gated on
// useResource's promise, so it always lands in a commit after the reset -
// true by accident of the fetch being async, not because anything said so.
// This makes the skip explicit and route-shape-driven instead.
//
// `lesson`'s `module` param is not this case: it is a required path segment
// (routes.ts's lesson pattern has no optional group), always present, and
// LessonPage has no anchor-scroll effect - so lesson must keep resetting to
// the top on every navigation, and the check below is keyed by route name
// as well as by param, not by param alone.
import type { RouteLike } from './routeTitles.ts';

const ANCHOR_PARAM_BY_ROUTE: Record<string, string> = {
  course: 'module',
  guide: 'section',
  tenant: 'section',
};

export function shouldSkipScrollReset(route: RouteLike): boolean {
  const anchorParam = ANCHOR_PARAM_BY_ROUTE[route.name];
  return anchorParam !== undefined && route.params[anchorParam] !== undefined;
}
