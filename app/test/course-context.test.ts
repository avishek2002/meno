// Pure unit coverage for app/client/src/courseContext.ts - no server, no DOM,
// no fixture. These are the invariants six parallel UI tracks build on: the
// flat lesson order, planned entries kept rather than dropped, and prev/next
// crossing module boundaries. The React wrapper (useCourseContext.tsx) has no
// logic of its own to test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  buildCourseStructure,
  courseDirOfPath,
  courseHref,
  courseModuleHref,
  findLesson,
  lessonHref,
  lessonNeighbours,
  stripMd,
} from '../client/src/courseContext.ts';
import type { CourseNode } from '../shared/types.ts';

// Module 2's first lesson is planned on purpose: it sits exactly where a
// prev/next control crosses a module boundary, which is the case UI-06 needs.
const COURSE: CourseNode = {
  dir: 'software-engineering/git-fundamentals',
  slug: 'git-fundamentals',
  title: 'Git Fundamentals',
  status: 'active',
  hub: 'git-fundamentals-hub.md',
  objectives: [{ id: 'O1', text: 'commit confidently', bloom: 'apply' }],
  modules: [
    {
      slug: 'm1-basics',
      title: 'Basics',
      status: 'generated',
      est_hours: 2,
      serves: ['O1'],
      prerequisites: [],
      concepts: ['commit'],
      lessons: [
        { file: 'what-is-a-commit.md', title: 'What is a commit', concept: 'commit', status: 'generated' },
        { file: 'staging.md', title: 'Staging', concept: 'staging', status: 'generated' },
      ],
    },
    {
      slug: 'm2-branching',
      title: 'Branching',
      status: 'planned',
      est_hours: 3,
      serves: ['O1'],
      prerequisites: ['m1-basics'],
      concepts: ['branch'],
      lessons: [
        { file: 'branches.md', title: 'Branches', concept: 'branch', status: 'planned' },
        { file: 'merging.md', title: 'Merging', concept: 'merge', status: 'generated' },
      ],
    },
  ],
};

test('buildCourseStructure flattens lessons into one course order, keeping planned entries marked', () => {
  const s = buildCourseStructure('alice', COURSE);

  assert.deepEqual(
    s.lessons.map((l) => l.file),
    ['what-is-a-commit', 'staging', 'branches', 'merging'],
  );
  // index is the position in the flat list, not the position within the module
  assert.deepEqual(
    s.lessons.map((l) => l.index),
    [0, 1, 2, 3],
  );
  // a planned lesson stays in the list and is marked, so a prev/next control can
  // say the next lesson is not written yet instead of rendering a dead arrow
  assert.equal(s.lessons[2].planned, true);
  assert.equal(s.lessons[2].href, null);
  assert.equal(s.lessons[2].moduleTitle, 'Branching');
  assert.equal(s.writtenCount, 3);

  // the module view holds the same objects, so a consumer can compare by identity
  assert.equal(s.modules[1].lessons[0], s.lessons[2]);

  assert.equal(s.href, courseHref('alice', 'git-fundamentals'));
  assert.equal(s.lessons[0].href, lessonHref('alice', 'git-fundamentals', 'm1-basics', 'what-is-a-commit'));
  assert.equal(s.dir, 'software-engineering/git-fundamentals');
});

test('routes drop the .md suffix and percent-encode every segment', () => {
  assert.equal(stripMd('staging.md'), 'staging');
  assert.equal(stripMd('staging'), 'staging');
  assert.equal(courseHref('a b', 'c/d'), '#/t/a%20b/c/c%2Fd');
  assert.equal(lessonHref('t', 'c', 'm', 'f.md'), '#/t/t/c/c/m/m/l/f');
});

test('courseModuleHref appends an unencoded #module fragment to the course href', () => {
  assert.equal(courseModuleHref('alice', 'git-fundamentals', 'm1-basics'), '#/t/alice/c/git-fundamentals#m1-basics');
});

test('findLesson matches a route pair with or without the .md suffix, and returns null otherwise', () => {
  const s = buildCourseStructure('alice', COURSE);
  assert.equal(findLesson(s, 'm1-basics', 'staging')?.title, 'Staging');
  assert.equal(findLesson(s, 'm1-basics', 'staging.md')?.title, 'Staging');
  // same file slug under a different module is a different lesson
  assert.equal(findLesson(s, 'm2-branching', 'staging'), null);
  assert.equal(findLesson(null, 'm1-basics', 'staging'), null);
});

test('lessonNeighbours crosses module boundaries and skips planned entries, while still naming the planned one', () => {
  const s = buildCourseStructure('alice', COURSE);

  const last = lessonNeighbours(s, 'm1-basics', 'staging');
  assert.equal(last.current?.file, 'staging');
  assert.equal(last.previous?.file, 'what-is-a-commit');
  // the adjacent entry is the planned lesson in the next module; the next
  // linkable one is the written lesson past it
  assert.equal(last.nextEntry?.file, 'branches');
  assert.equal(last.nextEntry?.planned, true);
  assert.equal(last.next?.file, 'merging');
  assert.equal(last.next?.module, 'm2-branching');

  const first = lessonNeighbours(s, 'm1-basics', 'what-is-a-commit');
  assert.equal(first.previous, null);
  assert.equal(first.previousEntry, null);

  const end = lessonNeighbours(s, 'm2-branching', 'merging');
  assert.equal(end.next, null);
  assert.equal(end.nextEntry, null);
  // walking back also skips the planned entry
  assert.equal(end.previousEntry?.file, 'branches');
  assert.equal(end.previous?.file, 'staging');
});

test('lessonNeighbours is all-null for an unloaded course or an unlisted lesson, never a throw', () => {
  const s = buildCourseStructure('alice', COURSE);
  for (const n of [lessonNeighbours(null, 'm1-basics', 'staging'), lessonNeighbours(s, 'nope', 'nope')]) {
    assert.deepEqual(n, { current: null, previousEntry: null, nextEntry: null, previous: null, next: null });
  }
});

test('courseDirOfPath returns the two-segment course dir, null above it', () => {
  assert.equal(courseDirOfPath('software-engineering/git-fundamentals/git-fundamentals-hub.md'), 'software-engineering/git-fundamentals');
  assert.equal(courseDirOfPath('software-engineering/git-fundamentals/modules/m1/x.md'), 'software-engineering/git-fundamentals');
  assert.equal(courseDirOfPath('home.md'), null);
  assert.equal(courseDirOfPath('insights/2026-08-13.md'), null);
});

test('courseContext.ts names no browser global and imports no React', () => {
  // the root tsconfig compiles app/**/*.ts without the DOM lib, and this module
  // is the pure half of the seam on purpose - the React half is a .tsx file
  const src = readFileSync(fileURLToPath(new URL('../client/src/courseContext.ts', import.meta.url)), 'utf8');
  assert.equal(src.includes("from 'react'"), false);
  assert.equal(src.includes('window.'), false);
  assert.equal(src.includes('document.'), false);
  assert.equal(src.includes('localStorage'), false);
});
