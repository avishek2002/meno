// Pure unit coverage for routeTitle/routeNames in app/client/src/routeTitles.ts
// (UI-03) - no DOM, no rendering. Before this change every non-guide route
// left document.title reading the literal string "meno"; these tests pin
// down that every route produces a distinct, route-derived title instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeNames, routeTitle, type RouteLike as Route } from '../client/src/routeTitles.ts';

function route(name: string, params: Record<string, string> = {}): Route {
  return { name, params };
}

test('home is the bare app title; every other route names itself before the app suffix', () => {
  assert.equal(routeTitle(route('home')), 'meno');
  assert.equal(routeTitle(route('guide')), 'Guide - meno');
  assert.equal(routeTitle(route('not-found')), 'Not found - meno');
});

test('tenant-scoped report pages read "<label> - <tenant> - meno"', () => {
  assert.equal(routeTitle(route('tenant', { tenant: 'alice' })), 'Courses - alice - meno');
  assert.equal(routeTitle(route('todos', { tenant: 'alice' })), 'Todos - alice - meno');
  assert.equal(routeTitle(route('progress', { tenant: 'alice' })), 'Progress - alice - meno');
  assert.equal(routeTitle(route('insights', { tenant: 'alice' })), 'Insights - alice - meno');
  assert.equal(routeTitle(route('cost', { tenant: 'alice' })), 'Cost - alice - meno');
  assert.equal(routeTitle(route('graph', { tenant: 'alice' })), 'Graph - alice - meno');
  assert.equal(routeTitle(route('glossary', { tenant: 'alice' })), 'Glossary - alice - meno');
});

test('course and lesson titles lead with the identifier, not the word for the kind of page', () => {
  assert.equal(
    routeTitle(route('course', { tenant: 'alice', course: 'rust-for-backend' })),
    'rust-for-backend - meno',
  );
  assert.equal(
    routeTitle(
      route('lesson', {
        tenant: 'alice',
        course: 'rust-for-backend',
        module: '01-syntax-and-ownership-basics',
        file: '03-ownership',
      }),
    ),
    '03-ownership - rust-for-backend - meno',
  );
  assert.equal(routeTitle(route('note', { tenant: 'alice', path: 'hub.md' })), 'hub.md - meno');
});

test('a missing identifying param falls back to the route label instead of an empty segment', () => {
  assert.equal(routeTitle(route('course', { tenant: 'alice' })), 'Course - meno');
  assert.equal(
    routeTitle(route('lesson', { tenant: 'alice', course: 'rust-for-backend', module: 'm1' })),
    'Lesson - rust-for-backend - meno',
  );
  assert.equal(routeTitle(route('note', { tenant: 'alice' })), 'Note - meno');
});

test('every route name routeNames() reports produces a title distinguishable from every other route on the same tenant', () => {
  const tenant = 'alice';
  const titles = routeNames().map((name) => routeTitle(route(name, { tenant })));
  assert.equal(new Set(titles).size, titles.length, `expected every route to render a distinct title, got: ${titles.join(' | ')}`);
});

test('routeNames covers every route the table can produce, plus the not-found fallback', () => {
  const names = routeNames();
  assert.deepEqual(
    [...names].sort(),
    [
      'cost',
      'course',
      'glossary',
      'graph',
      'guide',
      'home',
      'insights',
      'lesson',
      'not-found',
      'note',
      'progress',
      'tenant',
      'todos',
    ],
  );
});
