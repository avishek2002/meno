// Pure unit coverage for app/client/src/due.ts (UI-10, UI-11): the
// days-overdue arithmetic both the progress and insights pages now share,
// the course grouping the progress due list uses, and the concept-to-lesson
// fallback. No DOM, no rendering.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { conceptHref, daysOverdue, groupByCourse, withDaysOverdue } from '../client/src/due.ts';
import { buildCourseStructure } from '../client/src/courseContext.ts';
import type { CourseNode } from '../shared/types.ts';

function course(overrides: Partial<CourseNode> = {}): CourseNode {
  return {
    dir: 'domain/rust-for-backend',
    slug: 'rust-for-backend',
    title: 'Rust for Backend',
    status: 'active',
    hub: 'hub.md',
    objectives: [],
    modules: [
      {
        slug: '01-basics',
        title: 'Basics',
        status: 'active',
        est_hours: 1,
        serves: [],
        prerequisites: [],
        concepts: ['ownership'],
        lessons: [
          { file: '01-ownership.md', title: 'Ownership', concept: 'ownership', status: 'generated' },
          { file: '02-borrowing.md', title: 'Borrowing', concept: 'borrowing', status: 'planned' },
        ],
      },
    ],
    ...overrides,
  };
}

test('daysOverdue matches lib/insights.ts daysBetween: whole days, asOf minus nextReview', () => {
  assert.equal(daysOverdue('2026-08-01', '2026-08-06'), 5);
  assert.equal(daysOverdue('2026-08-06T00:00:00Z', '2026-08-06'), 0);
  assert.equal(daysOverdue('2026-08-10', '2026-08-06'), -4);
});

test('withDaysOverdue attaches the count and sorts most overdue first', () => {
  const rows = [
    { course: 'a', concept: 'x', next_review: '2026-08-05' },
    { course: 'a', concept: 'y', next_review: '2026-08-01' },
    { course: 'b', concept: 'z', next_review: '2026-08-04' },
  ];
  const out = withDaysOverdue(rows, '2026-08-06');
  assert.deepEqual(
    out.map((r) => [r.concept, r.days_overdue]),
    [
      ['y', 5],
      ['z', 2],
      ['x', 1],
    ],
  );
});

test('groupByCourse groups without reordering rows within a course, and orders groups by first appearance', () => {
  const rows = [
    { course: 'b', concept: 'z', next_review: '2026-08-04' },
    { course: 'a', concept: 'x', next_review: '2026-08-05' },
    { course: 'a', concept: 'y', next_review: '2026-08-01' },
  ];
  const groups = groupByCourse(rows);
  assert.deepEqual(
    groups.map((g) => g.course),
    ['b', 'a'],
  );
  assert.equal(groups[1]?.rows.length, 2);
});

test('conceptHref links to the lesson that introduced the concept', () => {
  const structure = buildCourseStructure('alice', course());
  assert.equal(conceptHref(structure, 'ownership'), '#/t/alice/c/rust-for-backend/m/01-basics/l/01-ownership');
});

test('conceptHref falls back to the course page when the lesson is still planned', () => {
  const structure = buildCourseStructure('alice', course());
  assert.equal(conceptHref(structure, 'borrowing'), '#/t/alice/c/rust-for-backend');
});

test('conceptHref falls back to the course page when the concept resolves to no lesson at all', () => {
  const structure = buildCourseStructure('alice', course());
  assert.equal(conceptHref(structure, 'no-such-concept'), '#/t/alice/c/rust-for-backend');
});

test('conceptHref returns null with no structure to resolve against', () => {
  assert.equal(conceptHref(null, 'ownership'), null);
});
