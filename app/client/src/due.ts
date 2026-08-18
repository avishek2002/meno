// Shared "due" arithmetic and grouping (UI-10, UI-11). Before this file
// existed, lib/insights.ts's overdue table computed days-overdue and the
// progress page's due table did not - the two pages showed the same rows and
// disagreed about how urgent they were. Both pages now call the same
// functions.
//
// Pure and DOM-free on purpose, the same split as courseContext.ts and
// resourceCache.ts: the root tsconfig compiles app/**/*.ts without the DOM
// lib, so a browser global here fails typecheck instead of failing review,
// and `node --test` covers it directly.
import type { CourseStructure } from './courseContext.ts';

/** The minimum a row needs to be aged and grouped. DueConcept and the insights overdue row both satisfy it structurally. */
export interface DueRow {
  course: string;
  concept: string;
  next_review: string;
}

/** One course's due rows, in their original relative order. */
export interface DueGroup<T extends DueRow> {
  course: string;
  rows: T[];
}

/**
 * Whole days between two ISO date (or date-time) strings, `asOf` minus
 * `nextReview`, rounded - the same formula lib/insights.ts's own daysBetween
 * uses, so a row never gets two different overdue counts depending on which
 * page rendered it.
 */
export function daysOverdue(nextReview: string, asOf: string): number {
  const from = Date.parse(nextReview.slice(0, 10));
  const to = Date.parse(asOf.slice(0, 10));
  return Math.round((to - from) / 86400000);
}

/** Today as an ISO day string, for a caller with no server-supplied as_of (the progress page; insights carries its own). */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Attach days_overdue to every row and sort most-overdue first (UI-11). */
export function withDaysOverdue<T extends DueRow>(rows: T[], asOf: string): (T & { days_overdue: number })[] {
  return rows
    .map((r) => ({ ...r, days_overdue: daysOverdue(r.next_review, asOf) }))
    .sort((a, b) => b.days_overdue - a.days_overdue);
}

/**
 * Groups rows by course, one group per distinct course, in the order each
 * course first appears in `rows` - so grouping an already most-overdue-first
 * list (withDaysOverdue) also orders the groups by their most urgent row,
 * without a second sort pass.
 */
export function groupByCourse<T extends DueRow>(rows: T[]): DueGroup<T>[] {
  const order: string[] = [];
  const byCourse = new Map<string, T[]>();
  for (const r of rows) {
    let bucket = byCourse.get(r.course);
    if (!bucket) {
      bucket = [];
      byCourse.set(r.course, bucket);
      order.push(r.course);
    }
    bucket.push(r);
  }
  return order.map((course) => ({ course, rows: byCourse.get(course)! }));
}

/**
 * Where a concept cell should link: the lesson that introduced it, when the
 * course structure resolves it and that lesson is written, otherwise the
 * course page itself - closer than a dead end, and the closest faithful
 * target when the true lesson is still planned or the structure has not
 * loaded yet (UI-11's fallback). Null only when there is no structure at all
 * to resolve against, so a caller renders plain text rather than a link to
 * nowhere.
 */
export function conceptHref(structure: CourseStructure | null | undefined, concept: string): string | null {
  if (!structure) return null;
  const lesson = structure.lessons.find((l) => l.concept === concept);
  return lesson?.href ?? structure.href;
}
