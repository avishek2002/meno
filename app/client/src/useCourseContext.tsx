// The one fetch of /course/:course, shaped for navigation (UI-02). Every
// consumer that needs course structure - the course page, the lesson page's
// breadcrumb and prev/next, a note page linking back to its course - goes
// through this hook, so the shape is derived once instead of four times.
//
// The React half only: everything pure lives in courseContext.ts, which
// `node --test` covers. No new endpoint - the response already carries the
// ordered modules, their lessons and this course's mastery.
import { useMemo } from 'react';
import { useResource } from './useResource';
import { asCourseMastery, type ClientCourseMastery } from './clientTypes';
import {
  buildCourseStructure,
  lessonNeighbours,
  type CourseStructure,
  type LessonNeighbours,
} from './courseContext.ts';
import type { CourseNode } from '../../shared/types.ts';

/**
 * GET /api/v1/:tenant/course/:course. A CourseNode plus the rendered hub note
 * and this course's mastery - already unwrapped to {concepts, modules} by the
 * server (app/server/routes.ts getCourse sends `mastery.courses[course]`), not
 * the whole {courses: {...}} map the progress route returns.
 */
export interface CourseResponse extends CourseNode {
  hubHtml: string;
  mastery: unknown;
}

export interface CourseContext {
  /** null until the fetch lands, or when it failed */
  structure: CourseStructure | null;
  /** this course's mastery, null when the payload carries none */
  mastery: ClientCourseMastery | null;
  /** the hub note, server-rendered; '' when the course has none */
  hubHtml: string;
  /** the raw response, for anything the shaped view deliberately drops */
  data: CourseResponse | null;
  loading: boolean;
  error: string | null;
  /** pass to useRegisterRevalidate so the header's "Re-read files" reaches this fetch */
  revalidate: () => void;
  /** prev/next for a lesson route's module+file pair; all-null before the fetch lands */
  neighbours: (module: string, file: string) => LessonNeighbours;
}

/**
 * `course` is nullable so a page that has to resolve the slug first (a note
 * page mapping its path to a course dir, UI-15) can call the hook
 * unconditionally and pass null until it knows - useResource already treats a
 * null url as idle rather than as an error.
 */
export function useCourseContext(tenant: string, course: string | null): CourseContext {
  const url = course
    ? `/api/v1/${encodeURIComponent(tenant)}/course/${encodeURIComponent(course)}`
    : null;
  const { data, error, loading, revalidate } = useResource<CourseResponse>(url);

  const structure = useMemo(
    () => (data ? buildCourseStructure(tenant, data) : null),
    [tenant, data],
  );
  const mastery = useMemo(() => (data ? asCourseMastery(data.mastery) : null), [data]);
  const neighbours = useMemo(
    () => (module: string, file: string): LessonNeighbours => lessonNeighbours(structure, module, file),
    [structure],
  );

  return {
    structure,
    mastery,
    hubHtml: data?.hubHtml ?? '',
    data,
    loading,
    error,
    revalidate,
    neighbours,
  };
}
