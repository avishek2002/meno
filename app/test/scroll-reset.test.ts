// Pure unit coverage for app/client/src/scrollReset.ts - the App.tsx
// route-change scroll reset must skip exactly the routes that carry an
// in-page anchor of their own, explicitly rather than by the accident of
// which fetch happens to be async.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldSkipScrollReset } from '../client/src/scrollReset.ts';

test('a course route with a module anchor skips the reset', () => {
  const route = { name: 'course', params: { tenant: 'alice', course: 'intro-to-ai', module: '01-foundations' } };
  assert.equal(shouldSkipScrollReset(route), true);
});

test('a course route with no module anchor still resets', () => {
  const route = { name: 'course', params: { tenant: 'alice', course: 'intro-to-ai' } };
  assert.equal(shouldSkipScrollReset(route), false);
});

test('a guide route with a section anchor skips the reset', () => {
  const route = { name: 'guide', params: { section: 'glossary' } };
  assert.equal(shouldSkipScrollReset(route), true);
});

test('a guide route with no section still resets', () => {
  const route = { name: 'guide', params: {} };
  assert.equal(shouldSkipScrollReset(route), false);
});

test('a tenant route with a section deep link skips the reset', () => {
  const route = { name: 'tenant', params: { tenant: 'alice', section: 'course-llm-cost' } };
  assert.equal(shouldSkipScrollReset(route), true);
});

test('a lesson route always resets, even though its module param is always present', () => {
  // lesson's `module` is a required path segment, not an optional anchor
  // group - routes.ts's lesson pattern has no trailing fragment, and
  // LessonPage has no anchor-scroll effect to protect.
  const route = {
    name: 'lesson',
    params: { tenant: 'alice', course: 'intro-to-ai', module: '01-foundations', file: '01-tokens' },
  };
  assert.equal(shouldSkipScrollReset(route), false);
});

test('a route with neither anchor param resets normally', () => {
  const route = { name: 'todos', params: { tenant: 'alice' } };
  assert.equal(shouldSkipScrollReset(route), false);
});
