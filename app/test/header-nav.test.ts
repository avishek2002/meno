// Pure unit coverage for app/client/src/headerNav.ts (UI-18) - no DOM, no
// rendering. Pins the bug this change fixes: clicking Guide from inside a
// tenant used to drop every other nav link, because the header always linked
// plain #/guide, which does not carry a tenant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNavEntries } from '../client/src/headerNav.ts';

// Glossary sits between Progress and Insights as of v1.17. The list is
// order-sensitive on purpose: buildNavEntries owns nav order, so a reordering
// is a behaviour change and should fail here rather than pass as a set.
const TENANT_LABELS = ['Courses', 'Graph', 'Todos', 'Progress', 'Glossary', 'Insights', 'Cost'];

test('on the tenant-scoped guide route, all seven tenant entries plus Guide are returned', () => {
  const entries = buildNavEntries('guide', 'alice');
  assert.deepEqual(entries.map((e) => e.label), [...TENANT_LABELS, 'Guide']);
  const guide = entries[entries.length - 1];
  assert.equal(guide.href, '#/t/alice/guide');
  assert.equal(guide.className, 'nav-guide');
});

test('on the tenant-less guide route, only Guide is returned', () => {
  const entries = buildNavEntries('guide', undefined);
  assert.deepEqual(entries.map((e) => e.label), ['Guide']);
  assert.equal(entries[0].href, '#/guide');
});

test('Guide is current on both the tenant-scoped and the tenant-less guide form', () => {
  const withTenant = buildNavEntries('guide', 'alice');
  assert.equal(withTenant[withTenant.length - 1].current, 'page');

  const withoutTenant = buildNavEntries('guide', undefined);
  assert.equal(withoutTenant[0].current, 'page');
});

test('course, lesson and note still mark Courses current, the same as tenant does (UI-03)', () => {
  for (const route of ['tenant', 'course', 'lesson', 'note']) {
    const entries = buildNavEntries(route, 'alice');
    const courses = entries.find((e) => e.label === 'Courses');
    assert.ok(courses, `expected a Courses entry for route ${route}`);
    assert.equal(courses?.current, 'page', `expected Courses current for route ${route}`);
    // Nothing else is current at the same time.
    for (const other of entries.filter((e) => e.label !== 'Courses')) {
      assert.equal(other.current, undefined, `expected only Courses current for route ${route}, got ${other.label} too`);
    }
  }
});

test('no route besides its own name (or a Courses sub-route) is marked current', () => {
  const entries = buildNavEntries('todos', 'alice');
  const current = entries.filter((e) => e.current === 'page');
  assert.deepEqual(current.map((e) => e.label), ['Todos']);
});

test('a tenant-less non-guide route still returns just Guide, not an empty list', () => {
  // Not a real route the app produces (every tenant-scoped route requires a
  // tenant to match at all), but the function must never silently return
  // nothing just because tenant is undefined - Guide is the one entry that
  // always exists.
  const entries = buildNavEntries('not-found', undefined);
  assert.deepEqual(entries.map((e) => e.label), ['Guide']);
});
