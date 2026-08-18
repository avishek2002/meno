// The pure half of the course-context seam (UI-02): a /course/:course response
// reshaped for navigation - one flat lesson order across module boundaries,
// resolved hash routes, and prev/next lookups.
//
// A `.ts` file among `.tsx` on purpose, the same reason courseList.ts and
// graphLayout.ts are: the root tsconfig compiles app/**/*.ts without the DOM
// lib, so naming a browser global here fails typecheck instead of failing
// review, and `node --test` covers it like the server. No React import, no
// browser global. The React half is useCourseContext.tsx.
import type { CourseNode } from '../../shared/types.ts';
import { courseHref, lessonHref, courseModuleHref, stripMd } from '../../shared/routeHrefs.ts';

// Re-exported so existing importers (LessonNav.tsx, TenantCoursesPage.tsx,
// CoursePage.tsx, InsightsPage.tsx, ProgressPage.tsx, LessonPage.tsx, and
// course-context.test.ts) keep working unchanged now that the builders
// themselves live in routeHrefs.ts alongside every other route builder -
// this module still needs all four internally, below.
export { courseHref, lessonHref, courseModuleHref, stripMd };

/** A lesson as navigation sees it: lifted out of its module into course order. */
export interface CourseLesson {
  /** owning module slug - the `m` segment of the lesson route */
  module: string;
  /** owning module title, so a breadcrumb never has to look the module up again */
  moduleTitle: string;
  /** lesson file slug with `.md` stripped - the `l` segment of the lesson route */
  file: string;
  title: string;
  concept: string;
  /** manifest status verbatim; 'planned' is the only value with structural meaning here */
  status: string;
  /**
   * status === 'planned'. Planned entries stay in the list rather than being
   * filtered out, because a prev/next control has to be able to say "the next
   * lesson has not been generated yet" instead of rendering a dead arrow
   * (UI-06). Anything wanting only real lessons filters on this flag.
   */
  planned: boolean;
  /** hash route to the lesson, or null when planned - there is no file to open */
  href: string | null;
  /** 0-based position in CourseStructure.lessons, across module boundaries */
  index: number;
}

/** A module plus its lessons, already flattened and route-resolved. */
export interface CourseModuleEntry {
  slug: string;
  title: string;
  status: string;
  concepts: string[];
  prerequisites: string[];
  /** the same CourseLesson objects CourseStructure.lessons holds, in module order */
  lessons: CourseLesson[];
}

/** Everything a breadcrumb, a prev/next pair or an in-course tree needs, and nothing else. */
export interface CourseStructure {
  tenant: string;
  slug: string;
  title: string;
  status: string;
  /** vault-relative course dir, "<domain>/<slug>" - what courseDirOfPath resolves against */
  dir: string;
  /** the hub note's path as the manifest gives it */
  hub: string;
  /** hash route to this course */
  href: string;
  objectives: CourseNode['objectives'];
  modules: CourseModuleEntry[];
  /** every lesson in course order, across module boundaries, planned entries included */
  lessons: CourseLesson[];
  /** how many of `lessons` are not planned */
  writtenCount: number;
}

/** What a prev/next control needs from one position in the course. */
export interface LessonNeighbours {
  /** the lesson the module+file pair names, or null when the course does not list it */
  current: CourseLesson | null;
  /** the adjacent entry in flat order, planned or not - what names the module still to generate */
  previousEntry: CourseLesson | null;
  nextEntry: CourseLesson | null;
  /** the nearest non-planned entry in that direction - what a link points at */
  previous: CourseLesson | null;
  next: CourseLesson | null;
}

/**
 * The course directory a vault path sits under: its first two segments,
 * the "<domain>/<slug>" form CourseNode.dir is already in, or null for a path
 * too shallow to be inside a course. A note page has only a path, so this is
 * how it finds the course to link back to (UI-15) - resolve the result against
 * TreeResponse.courses[].dir to get the slug useCourseContext takes.
 *
 * Hazard two tracks independently rediscovered while wiring links back to a
 * course: `dir` (this function's return value) is not the same string as the
 * routing slug (CourseStructure.slug / CourseNode.slug) for a hand-made
 * course. `course.yml` lets an author give a course any slug they like, but
 * its directory keeps whatever basename it already had on disk - the two
 * happen to match for every agent-generated course, which is why the gap is
 * easy to miss until a hand-made one 404s. Never build a course href from a
 * dir segment; resolve the dir against `TreeResponse.courses[].dir` first
 * to get the real slug, exactly as this function's own doc comment says.
 */
export function courseDirOfPath(path: string): string | null {
  const parts = path.split('/').filter((p) => p !== '');
  if (parts.length < 3) return null; // <domain>/<slug>/<file>.md is the shallowest note inside a course
  return `${parts[0]}/${parts[1]}`;
}

/** The one place a /course response becomes navigation. Pure: same input, same output. */
export function buildCourseStructure(tenant: string, course: CourseNode): CourseStructure {
  const lessons: CourseLesson[] = [];
  const modules: CourseModuleEntry[] = [];

  for (const m of course.modules) {
    const moduleLessons: CourseLesson[] = [];
    for (const l of m.lessons) {
      const file = stripMd(l.file);
      const planned = l.status === 'planned';
      const entry: CourseLesson = {
        module: m.slug,
        moduleTitle: m.title,
        file,
        title: l.title,
        concept: l.concept,
        status: l.status,
        planned,
        href: planned ? null : lessonHref(tenant, course.slug, m.slug, file),
        index: lessons.length,
      };
      lessons.push(entry);
      moduleLessons.push(entry);
    }
    modules.push({
      slug: m.slug,
      title: m.title,
      status: m.status,
      concepts: m.concepts,
      prerequisites: m.prerequisites,
      lessons: moduleLessons,
    });
  }

  return {
    tenant,
    slug: course.slug,
    title: course.title,
    status: course.status,
    dir: course.dir,
    hub: course.hub,
    href: courseHref(tenant, course.slug),
    objectives: course.objectives,
    modules,
    lessons,
    writtenCount: lessons.filter((l) => !l.planned).length,
  };
}

/** The lesson a route's module+file pair names, or null when the manifest does not list it. */
export function findLesson(structure: CourseStructure | null, module: string, file: string): CourseLesson | null {
  if (!structure) return null;
  const wanted = stripMd(file);
  return structure.lessons.find((l) => l.module === module && l.file === wanted) ?? null;
}

/**
 * Prev/next in one call, because a caller needs both answers at once: the
 * adjacent entry (which may be planned, and is what names the module still to
 * be generated) and the nearest written one (which is what a link can point
 * at). All five fields are null when the structure has not loaded or the pair
 * matches nothing, so a consumer branches on the field it uses, never on load
 * state.
 */
export function lessonNeighbours(
  structure: CourseStructure | null,
  module: string,
  file: string,
): LessonNeighbours {
  const current = findLesson(structure, module, file);
  if (!structure || !current) {
    return { current: null, previousEntry: null, nextEntry: null, previous: null, next: null };
  }
  const all = structure.lessons;
  const i = current.index;
  const written = (from: number, step: number): CourseLesson | null => {
    for (let j = from; j >= 0 && j < all.length; j += step) {
      const candidate = all[j];
      if (candidate && !candidate.planned) return candidate;
    }
    return null;
  };
  return {
    current,
    previousEntry: all[i - 1] ?? null,
    nextEntry: all[i + 1] ?? null,
    previous: written(i - 1, -1),
    next: written(i + 1, 1),
  };
}
