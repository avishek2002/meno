// Prev/next chrome for a lesson (UI-06): the only way past "Show in graph" and
// the browser back button today. Placed below the references panel.
//
// Takes a LessonNeighbours rather than tenant/course/module/file, because
// every href a CourseLesson carries (courseContext.ts, lessonHref) is already
// fully route-resolved - this component only ever reads, never builds, a
// hash route.
//
// The acceptance check is "the next written lesson is reachable in one
// click", not "the next manifest entry is". So the *Entry field decides what
// to say (it may be a planned lesson, naming the module still to generate)
// and the plain field decides what to link (the nearest lesson that is
// actually written), and the two can differ: when they do, both render - the
// pending note plus a "skip to" link past it - so a run of planned lessons
// never turns into a dead end.
import type { ReactNode } from 'react';
import type { CourseLesson, LessonNeighbours } from '../courseContext.ts';

interface LessonNavProps {
  neighbours: LessonNeighbours;
}

function renderSide(
  direction: 'previous' | 'next',
  entry: CourseLesson | null,
  written: CourseLesson | null,
): ReactNode {
  if (!entry) return null; // this is the first or last lesson in the course - nothing to render

  const label = direction === 'previous' ? 'Previous' : 'Next';

  if (!entry.planned) {
    // the adjacent entry is itself written, so it is also the nearest
    // written lesson in this direction - one link, nothing more to say
    return (
      <a className={`lesson-nav-link lesson-nav-${direction}`} href={entry.href ?? undefined}>
        {label}: {entry.title}
      </a>
    );
  }

  return (
    <>
      <p className="lesson-nav-pending">
        {label} lesson not yet generated - {entry.moduleTitle}
      </p>
      {written && (
        <a className={`lesson-nav-link lesson-nav-${direction} lesson-nav-skip`} href={written.href ?? undefined}>
          Skip to {direction === 'previous' ? 'previous' : 'next'} written lesson: {written.title}
        </a>
      )}
    </>
  );
}

export function LessonNav({ neighbours }: LessonNavProps) {
  const { previousEntry, nextEntry, previous, next } = neighbours;
  if (!previousEntry && !nextEntry) return null; // course has exactly one lesson

  return (
    <nav className="lesson-nav" aria-label="Lesson navigation">
      <div className="lesson-nav-prev">{renderSide('previous', previousEntry, previous)}</div>
      <div className="lesson-nav-next">{renderSide('next', nextEntry, next)}</div>
    </nav>
  );
}
