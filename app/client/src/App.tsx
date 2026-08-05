// Route dispatch + the header shell. Holds the ref the "Re-read files" button
// reads from - see RevalidateContext.tsx for how pages register into it.
import { useCallback, useRef, type ReactNode } from 'react';
import { useRoute } from './router';
import { RevalidateContext } from './RevalidateContext';
import { Header } from './components/Header';
import { TenantsPage } from './pages/TenantsPage';
import { TenantCoursesPage } from './pages/TenantCoursesPage';
import { CoursePage } from './pages/CoursePage';
import { LessonPage } from './pages/LessonPage';
import { TodosPage } from './pages/TodosPage';
import { ProgressPage } from './pages/ProgressPage';
import { InsightsPage } from './pages/InsightsPage';
import { NotePage } from './pages/NotePage';
import { NotFoundPage } from './pages/NotFoundPage';

export default function App() {
  const route = useRoute();
  const revalidateRef = useRef<(() => void) | null>(null);
  const setRevalidate = useCallback((fn: (() => void) | null): void => {
    revalidateRef.current = fn;
  }, []);

  let page: ReactNode;
  switch (route.name) {
    case 'home':
      page = <TenantsPage />;
      break;
    case 'tenant':
      page = <TenantCoursesPage tenant={route.params.tenant} />;
      break;
    case 'course':
      page = <CoursePage tenant={route.params.tenant} course={route.params.course} />;
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
    case 'note':
      page = <NotePage tenant={route.params.tenant} path={route.params.path} />;
      break;
    default:
      page = <NotFoundPage />;
  }

  return (
    <RevalidateContext.Provider value={setRevalidate}>
      <Header tenant={route.params.tenant} onRefresh={() => revalidateRef.current?.()} />
      <main className="content">{page}</main>
    </RevalidateContext.Provider>
  );
}
