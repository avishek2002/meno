// Route dispatch + the header shell. Holds the ref the "Re-read files" button
// reads from - see RevalidateContext.tsx for how pages register into it.
import { lazy, Suspense, useCallback, useEffect, useRef, type ReactNode } from 'react';
import { routeTitle, useRoute } from './router';
import { RevalidateContext } from './RevalidateContext';
import { Header } from './components/Header';
import { AsyncStatus } from './components/AsyncStatus';
import { TenantsPage } from './pages/TenantsPage';
import { NotFoundPage } from './pages/NotFoundPage';

// UI-17: everything past the landing page was statically imported into the
// entry chunk regardless of which route the learner actually opened. These
// nine are route-level React.lazy - one dynamic import per page, code-split
// by Vite automatically - so the entry bundle carries only the shell, the
// router and the one route (home) reachable before any tenant is known.
// TenantsPage and NotFoundPage stay static: both are small and one of them
// renders on first paint of almost every session. GuidePage's own content
// (guide/content.ts) is worth splitting out even though the header's
// InfoTip already forces guide/glossary.ts into every bundle regardless -
// the glossary alone is a fraction of what GuidePage pulls in. The Suspense
// fallback below reuses AsyncStatus rather than inventing a second loading
// style (UI-03 built the one this app has).
const GuidePage = lazy(() => import('./pages/GuidePage').then((m) => ({ default: m.GuidePage })));
const TenantCoursesPage = lazy(() => import('./pages/TenantCoursesPage').then((m) => ({ default: m.TenantCoursesPage })));
const CoursePage = lazy(() => import('./pages/CoursePage').then((m) => ({ default: m.CoursePage })));
const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })));
const TodosPage = lazy(() => import('./pages/TodosPage').then((m) => ({ default: m.TodosPage })));
const ProgressPage = lazy(() => import('./pages/ProgressPage').then((m) => ({ default: m.ProgressPage })));
const InsightsPage = lazy(() => import('./pages/InsightsPage').then((m) => ({ default: m.InsightsPage })));
const CostPage = lazy(() => import('./pages/CostPage').then((m) => ({ default: m.CostPage })));
const GraphPage = lazy(() => import('./pages/GraphPage').then((m) => ({ default: m.GraphPage })));
const NotePage = lazy(() => import('./pages/NotePage').then((m) => ({ default: m.NotePage })));

export default function App() {
  const route = useRoute();
  const revalidateRef = useRef<(() => void) | null>(null);
  const setRevalidate = useCallback((fn: (() => void) | null): void => {
    revalidateRef.current = fn;
  }, []);

  // The one place a route change does what a page load does (UI-03): set the
  // tab title, reset scroll, and move focus into the new view. `route` is a
  // fresh object only when the hash actually changes (router.tsx's useRoute
  // memoizes on the hash), so this never fires on a re-render that leaves the
  // route alone.
  const mainRef = useRef<HTMLElement | null>(null);
  // Focus must move on a route CHANGE only, never on first paint - stealing
  // focus on load would fight whatever the browser already decided to focus.
  const hasNavigated = useRef(false);
  useEffect(() => {
    document.title = routeTitle(route);
    // Every navigation resets to the top, including back - the decision
    // recorded in the review: no prior-scroll restoration.
    window.scrollTo(0, 0);
    if (hasNavigated.current) mainRef.current?.focus();
    hasNavigated.current = true;
  }, [route]);

  let page: ReactNode;
  switch (route.name) {
    case 'home':
      page = <TenantsPage />;
      break;
    case 'guide':
      page = <GuidePage section={route.params.section} />;
      break;
    case 'tenant':
      page = <TenantCoursesPage tenant={route.params.tenant} />;
      break;
    case 'course':
      // route.params.module is the optional #module anchor (UI-10), mirroring
      // guide's optional trailing #section fragment - undefined when the hash
      // carries none, which CoursePage treats as "no anchor to scroll to".
      page = <CoursePage tenant={route.params.tenant} course={route.params.course} module={route.params.module} />;
      break;
    case 'lesson':
      page = (
        <LessonPage
          tenant={route.params.tenant}
          course={route.params.course}
          module={route.params.module}
          file={route.params.file}
        />
      );
      break;
    case 'todos':
      page = <TodosPage tenant={route.params.tenant} />;
      break;
    case 'progress':
      page = <ProgressPage tenant={route.params.tenant} />;
      break;
    case 'insights':
      page = <InsightsPage tenant={route.params.tenant} />;
      break;
    case 'cost':
      page = <CostPage tenant={route.params.tenant} />;
      break;
    case 'graph':
      page = <GraphPage tenant={route.params.tenant} focus={route.params.focus} />;
      break;
    case 'note':
      page = <NotePage tenant={route.params.tenant} path={route.params.path} />;
      break;
    default:
      page = <NotFoundPage />;
  }

  return (
    <RevalidateContext.Provider value={setRevalidate}>
      <Header
        tenant={route.params.tenant}
        route={route.name}
        onRefresh={() => revalidateRef.current?.()}
      />
      {/* tabIndex={-1}: not in tab order, but a valid programmatic focus
          target - the landing spot the effect above moves focus to on every
          route change, so a keyboard or screen-reader user gets a signal that
          navigation happened. */}
      <main className="content" ref={mainRef} tabIndex={-1}>
        <Suspense fallback={<AsyncStatus message="Loading..." />}>{page}</Suspense>
      </main>
    </RevalidateContext.Provider>
  );
}
