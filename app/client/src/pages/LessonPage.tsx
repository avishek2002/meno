// #/t/:tenant/c/:course/m/:module/l/:file - lesson body, interactive checks,
// mermaid diagrams, references, and the once-after-20s read-progress ping.
import { useCallback, useEffect, useState } from 'react';
import { useResource } from '../useResource';
import { useCourseContext } from '../useCourseContext';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { ErrorState } from '../components/ErrorState';
import { RenderedHtml } from '../components/RenderedHtml';
import { ReferencesPanel } from '../components/ReferencesPanel';
import { Breadcrumb, type BreadcrumbSegment } from '../components/Breadcrumb';
import { LessonNav } from '../components/LessonNav';
import { NotesPanel, type NotesFocusRequest } from '../components/NotesPanel';
import { courseHref } from '../courseContext.ts';
import { writeResumeState, type SectionStore } from '../courseList.ts';
import { postJson } from '../api';
import { parseSources } from '../clientTypes';
import type { LessonResponse } from '../../../shared/types.ts';
import { tenantHref, graphHref, courseModulePathHref } from '../../../shared/routeHrefs.ts';

// UI-16: the resume affordance persists to the same guarded localStorage
// TenantCoursesPage already uses for open-state, under a second key
// (courseList.ts's RESUME_STATE_PREFIX). Recording happens here, on the
// lesson page, so this is a second, small, independent guard rather than a
// shared import from TenantCoursesPage - the two pages have no other reason
// to depend on each other, and the try/catch is three lines. See
// app/test/course-list.test.ts's localStorage source grep, which allowlists
// both files by name rather than asserting exactly one.
let resumeStore: SectionStore | null;
try {
  resumeStore = localStorage;
} catch {
  resumeStore = null;
}

interface LessonPageProps {
  tenant: string;
  course: string;
  module: string;
  file: string;
}

export function LessonPage({ tenant, course, module, file }: LessonPageProps) {
  const url = `/api/v1/${encodeURIComponent(tenant)}/lesson/${encodeURIComponent(course)}/${encodeURIComponent(module)}/${encodeURIComponent(file)}`;
  const { data, error, status, loading, revalidate } = useResource<LessonResponse>(url);

  // Personal notes (docs/specs/notes.md): a per-heading note button opens the
  // panel already focused on that section. Nonce rather than a bare key so a
  // repeat click on the same heading still re-opens/re-focuses the panel.
  const [notesFocusRequest, setNotesFocusRequest] = useState<NotesFocusRequest | null>(null);
  const handleOpenNoteSection = useCallback((sectionKey: string): void => {
    setNotesFocusRequest((prev) => ({ key: sectionKey, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);

  // UI-06: the breadcrumb and prev/next both come from the same course fetch
  // that powers the course page (UI-02), never a lesson-local guess at the
  // course/module title.
  const courseCtx = useCourseContext(tenant, course);
  const neighbours = courseCtx.neighbours(module, file);

  // Cross-track gap: this page reads from two fetches - the lesson body and
  // useCourseContext's /course call - but only ever registered the first
  // one's revalidate. "Re-read files" refreshed the body while leaving the
  // breadcrumb and prev/next stale against the old course structure. Both
  // have to run for a refresh to mean what it says.
  const revalidateBoth = useCallback((): void => {
    revalidate();
    courseCtx.revalidate();
  }, [revalidate, courseCtx.revalidate]);
  useRegisterRevalidate(revalidateBoth);

  // UI-16: record this lesson as the one to resume, once its title is known.
  // Deliberately not gated on the 20s read-progress ping below - opening the
  // lesson is what "where you left off" means, not lingering on it.
  useEffect(() => {
    if (!data) return;
    const lessonTitle = typeof data.frontmatter.title === 'string' ? data.frontmatter.title : file;
    writeResumeState(resumeStore, tenant, { course, module, file, lessonTitle });
  }, [tenant, course, module, file, data]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void postJson(`/api/v1/${encodeURIComponent(tenant)}/lesson/read`, {
        course,
        module,
        lesson: file,
        seconds: 20,
      }).catch(() => {
        // best-effort: reading progress is not on the critical path for the reader
      });
    }, 20000);
    return () => clearTimeout(timer);
  }, [tenant, course, module, file]);

  if (loading && !data) return <AsyncStatus message="Loading lesson..." />;
  if (error) {
    // A 404 here almost always means the module has not been generated yet -
    // that is the app's own vocabulary for the failure, not the server's
    // "no such lesson" string, which still goes in `detail` (UI-04).
    const notFound = status === 404;
    return (
      <ErrorState
        title={notFound ? 'Lesson not found' : 'Could not load lesson'}
        message={notFound ? 'This lesson has not been generated yet.' : 'This lesson could not be loaded.'}
        detail={error}
        links={[
          { label: 'Back to course', href: courseHref(tenant, course) },
          { label: 'Courses', href: tenantHref(tenant) },
        ]}
      />
    );
  }
  if (!data) return null;

  const sources = parseSources(data.frontmatter);
  const title = typeof data.frontmatter.title === 'string' ? data.frontmatter.title : file;

  // Fall back to the raw slug when the course fetch has not landed yet (or
  // failed) rather than blocking the breadcrumb on a second network round
  // trip - it upgrades to the real title the moment useCourseContext resolves.
  const courseTitle = courseCtx.structure?.title ?? course;
  const moduleTitle = neighbours.current?.moduleTitle ?? module;
  // The lesson title is the final segment so aria-current="page" (set by
  // Breadcrumb on the last entry) lands on the lesson, not the module - a
  // screen reader should hear "you are on the lesson", matching the <h1>.
  // The module segment links to the course page truncated at that module
  // (courseModulePathHref's path form, routes.ts's second `course`
  // RouteDef) - the up-move a nested page's back control resolves to: one
  // level up is the module's card on the course page, not the tenant root.
  const breadcrumbSegments: BreadcrumbSegment[] = [
    { label: 'Courses', href: tenantHref(tenant) },
    { label: courseTitle, href: courseCtx.structure?.href ?? courseHref(tenant, course) },
    { label: moduleTitle, href: courseModulePathHref(tenant, course, module) },
    { label: title },
  ];

  return (
    <article className="lesson">
      <Breadcrumb segments={breadcrumbSegments} />
      <header className="lesson-header">
        <h1>{title}</h1>
        <a className="show-in-graph" href={graphHref(tenant, file)}>
          Show in graph
        </a>
      </header>
      {data.warnings.length > 0 && (
        <div className="warnings-box">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      <RenderedHtml
        html={data.html}
        tenant={tenant}
        className="prose"
        checks={data.checks}
        course={course}
        module={module}
        lesson={file}
        noteSections={data.sections}
        onOpenNoteSection={handleOpenNoteSection}
      />
      <ReferencesPanel sources={sources} />
      <LessonNav neighbours={neighbours} />
      <NotesPanel
        key={`${tenant}:${course}:${module}:${file}`}
        tenant={tenant}
        course={course}
        courseTitle={courseTitle}
        page="lesson"
        module={module}
        lesson={file}
        sections={data.sections}
        focusRequest={notesFocusRequest}
      />
    </article>
  );
}
