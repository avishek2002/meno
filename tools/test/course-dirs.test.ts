import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findCourseDirs, listCourses } from '../../lib/course-dirs.ts';

const EXAMPLE = fileURLToPath(new URL('../../examples/example-learner', import.meta.url));

test('listCourses over the committed example tenant tells a confirmed profile from a skeleton', () => {
  const courses = listCourses(EXAMPLE);
  assert.equal(courses.length, findCourseDirs(EXAMPLE).length);

  const rust = courses.find((c) => c.slug === 'rust-for-backend');
  assert.deepEqual(rust, {
    domain: 'software-engineering',
    slug: 'rust-for-backend',
    title: 'Rust for backend developers',
    hasProfile: true,
  });

  const git = courses.find((c) => c.slug === 'git-fundamentals');
  assert.deepEqual(git, {
    domain: 'software-engineering',
    slug: 'git-fundamentals',
    title: 'Git fundamentals',
    hasProfile: false,
  });
});

test('listCourses falls back to the slug as the title when course.yml is missing or malformed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-course-list-'));
  const courseDir = join(dir, 'software-engineering', 'broken-course');
  mkdirSync(courseDir, { recursive: true });
  writeFileSync(join(courseDir, 'course.yml'), 'title: [this is not a mapping value shape\n');

  const courses = listCourses(dir);
  assert.deepEqual(courses, [
    { domain: 'software-engineering', slug: 'broken-course', title: 'broken-course', hasProfile: false },
  ]);
});

test('listCourses returns an ungrouped course with domain null', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-course-list-'));
  const courseDir = join(dir, 'legacy-course');
  mkdirSync(courseDir, { recursive: true });
  writeFileSync(join(courseDir, 'course.yml'), 'slug: legacy-course\ntitle: Legacy course\n');

  const courses = listCourses(dir);
  assert.deepEqual(courses, [
    { domain: null, slug: 'legacy-course', title: 'Legacy course', hasProfile: false },
  ]);
});

test('listCourses returns an empty list for a tenant directory that does not exist', () => {
  assert.deepEqual(listCourses(join(tmpdir(), 'meno-course-list-does-not-exist')), []);
});
