// document.title per route (UI-03). Pure and DOM-free on purpose: it lives
// apart from router.tsx so the root tsconfig - which has no DOM lib and no
// jsx setting - can compile the tests that pin this behavior down.
//
// ROUTE_NAMES is the single source of truth for what routes exist. router.tsx
// types its pattern table against it, so adding a route without a title is a
// typecheck error rather than a route that silently reads "meno".

export const ROUTE_NAMES = [
  'home',
  'guide',
  'lesson',
  'course',
  'todos',
  'progress',
  'insights',
  'cost',
  'graph',
  'note',
  'tenant',
] as const;

export type RouteName = (typeof ROUTE_NAMES)[number];

/** The shape routeTitle needs, which router.tsx's Route structurally satisfies. */
export interface RouteLike {
  name: string;
  params: Record<string, string>;
}

const ROUTE_TITLES: Record<string, string> = {
  home: 'Learners',
  guide: 'Guide',
  tenant: 'Courses',
  course: 'Course',
  lesson: 'Lesson',
  todos: 'Todos',
  progress: 'Progress',
  insights: 'Insights',
  cost: 'Cost',
  graph: 'Graph',
  note: 'Note',
  'not-found': 'Not found',
};

export const APP_TITLE = 'meno';

/**
 * The full string to assign to document.title, suffix included, so a caller is
 * one line: `document.title = routeTitle(route)`. Segments run most specific
 * first, the way a browser tab truncates - a lesson reads
 * "<file> - <course> - meno", because the tab strip only ever shows the front.
 *
 * Deliberately built from route params only, which means slugs, not titles -
 * the router never fetches. A page that has loaded better information may
 * overwrite document.title afterwards; this is the correct default, not a
 * ceiling.
 */
export function routeTitle(route: RouteLike): string {
  const p = route.params;
  const label = ROUTE_TITLES[route.name] ?? ROUTE_TITLES['not-found'];
  let segments: (string | undefined)[];
  switch (route.name) {
    case 'home':
      // Nothing more specific exists than the app itself.
      segments = [];
      break;
    case 'guide':
      segments = [label];
      break;
    case 'tenant':
      segments = [label, p.tenant];
      break;
    // For these three the param identifies the page better than the word for
    // its kind does, so the label is only the fallback for a missing param.
    case 'course':
      segments = [p.course ?? label];
      break;
    case 'lesson':
      segments = [p.file ?? label, p.course];
      break;
    case 'note':
      segments = [p.path ?? label];
      break;
    default:
      segments = [label, p.tenant];
  }
  return [...segments, APP_TITLE].filter((s) => typeof s === 'string' && s !== '').join(' - ');
}

/** Every route name the pattern table can produce, plus the not-found fallback. */
export function routeNames(): string[] {
  return [...ROUTE_NAMES, 'not-found'];
}
