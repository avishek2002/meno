// Pure unit coverage for app/shared/routeHrefs.ts - no server, no DOM. Two
// concerns: each builder's own output shape and encoding, and the
// round-trip property that makes the builders and routes.ts's route table
// provably one system - matchRoute(builder(...)) has to recover exactly the
// params the builder was called with.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  homeHref,
  guideHref,
  tenantHref,
  tenantCourseHref,
  courseHref,
  lessonHref,
  courseModuleHref,
  courseModulePathHref,
  todosHref,
  progressHref,
  insightsHref,
  costHref,
  graphHref,
  noteHref,
  stripMd,
} from '../shared/routeHrefs.ts';
import { matchRoute } from '../client/src/routes.ts';

// A value carrying all four hazards a builder's encoding has to survive: a
// space, a literal `#`, a literal `/`, and a non-ASCII character.
const TRICKY = 'a b#c/déf';
const TRICKY_ENCODED = encodeURIComponent(TRICKY);

test('homeHref and guideHref build the fixed routes', () => {
  assert.equal(homeHref(), '#/');
  assert.equal(guideHref(), '#/guide');
  assert.equal(guideHref('glossary'), '#/guide#glossary');
});

test('tenantHref percent-encodes the tenant', () => {
  assert.equal(tenantHref('alice'), '#/t/alice');
  assert.equal(tenantHref(TRICKY), `#/t/${TRICKY_ENCODED}`);
});

test('tenantCourseHref percent-encodes the tenant but not the course slug fragment', () => {
  // The course slug is drawn from the id grammar section ids use
  // (/^[a-z0-9]+(-[a-z0-9]+)*$/, lib/groups.ts) and never needs escaping in
  // a fragment - courseList.ts's courseSlugFromFragment is the parse-side
  // owner of this same 'course-' prefix.
  assert.equal(tenantCourseHref('alice', 'git-fundamentals'), '#/t/alice#course-git-fundamentals');
  assert.equal(tenantCourseHref(TRICKY, 'git-fundamentals'), `#/t/${TRICKY_ENCODED}#course-git-fundamentals`);
});

test('courseHref percent-encodes both tenant and course', () => {
  assert.equal(courseHref('alice', 'git-fundamentals'), '#/t/alice/c/git-fundamentals');
  assert.equal(courseHref(TRICKY, TRICKY), `#/t/${TRICKY_ENCODED}/c/${TRICKY_ENCODED}`);
});

test('lessonHref percent-encodes every segment and strips a .md suffix off the file', () => {
  assert.equal(lessonHref('alice', 'git-fundamentals', 'm1-basics', 'staging.md'), '#/t/alice/c/git-fundamentals/m/m1-basics/l/staging');
  assert.equal(lessonHref('alice', 'git-fundamentals', 'm1-basics', 'staging'), '#/t/alice/c/git-fundamentals/m/m1-basics/l/staging');
  assert.equal(lessonHref(TRICKY, TRICKY, TRICKY, `${TRICKY}.md`), `#/t/${TRICKY_ENCODED}/c/${TRICKY_ENCODED}/m/${TRICKY_ENCODED}/l/${TRICKY_ENCODED}`);
});

test('courseModuleHref (fragment form) percent-encodes tenant and course but not the module', () => {
  // Same reasoning as tenantCourseHref above: a module slug is drawn from
  // the same safe id grammar, so the fragment never needs escaping.
  assert.equal(courseModuleHref('alice', 'git-fundamentals', 'm1-basics'), '#/t/alice/c/git-fundamentals#m1-basics');
});

test('courseModulePathHref (path form) percent-encodes every segment', () => {
  assert.equal(courseModulePathHref('alice', 'git-fundamentals', 'm1-basics'), '#/t/alice/c/git-fundamentals/m/m1-basics');
  assert.equal(courseModulePathHref(TRICKY, TRICKY, TRICKY), `#/t/${TRICKY_ENCODED}/c/${TRICKY_ENCODED}/m/${TRICKY_ENCODED}`);
});

test('todosHref, progressHref, insightsHref, costHref percent-encode the tenant', () => {
  assert.equal(todosHref(TRICKY), `#/t/${TRICKY_ENCODED}/todos`);
  assert.equal(progressHref(TRICKY), `#/t/${TRICKY_ENCODED}/progress`);
  assert.equal(insightsHref(TRICKY), `#/t/${TRICKY_ENCODED}/insights`);
  assert.equal(costHref(TRICKY), `#/t/${TRICKY_ENCODED}/cost`);
});

test('graphHref percent-encodes tenant and an optional focus', () => {
  assert.equal(graphHref('alice'), '#/t/alice/graph');
  assert.equal(graphHref(TRICKY, TRICKY), `#/t/${TRICKY_ENCODED}/graph?focus=${TRICKY_ENCODED}`);
});

test('noteHref percent-encodes tenant and each note-path segment, keeping "/" as the literal separator', () => {
  assert.equal(noteHref('alice', 'software-engineering/git-fundamentals/home.md'), '#/t/alice/n/software-engineering/git-fundamentals/home.md');
  // A directory or file name containing a space, "#", and a non-ASCII
  // character - each segment encoded on its own, joined back with a literal
  // "/", never one whole-string encodeURIComponent call (which would turn
  // every directory separator into a literal "%2F" - see wikilinkText.ts's
  // and InsightsPage.tsx's pre-sweep call sites, which did exactly that).
  assert.equal(
    noteHref('alice', 'insights/a report#1 (déf).md'),
    `#/t/alice/n/insights/${encodeURIComponent('a report#1 (déf).md')}`,
  );
});

test('stripMd drops a trailing .md suffix and is a no-op otherwise', () => {
  assert.equal(stripMd('staging.md'), 'staging');
  assert.equal(stripMd('staging'), 'staging');
});

// --- round-trip: matchRoute(builder(...)) recovers exactly what went in ---

test('round-trip: home, guide (with and without a section)', () => {
  assert.deepEqual(matchRoute(homeHref()), { name: 'home', params: {} });
  assert.deepEqual(matchRoute(guideHref()).params, {});
  assert.equal(matchRoute(guideHref()).name, 'guide');
  const withSection = matchRoute(guideHref('glossary'));
  assert.equal(withSection.name, 'guide');
  assert.deepEqual(withSection.params, { section: 'glossary' });
});

test('round-trip: tenant, with and without the course-list deep-link fragment', () => {
  const plain = matchRoute(tenantHref(TRICKY));
  assert.equal(plain.name, 'tenant');
  assert.deepEqual(plain.params, { tenant: TRICKY });

  const withCourse = matchRoute(tenantCourseHref(TRICKY, 'git-fundamentals'));
  assert.equal(withCourse.name, 'tenant');
  assert.deepEqual(withCourse.params, { tenant: TRICKY, section: 'course-git-fundamentals' });
});

test('round-trip: course, with no module, the #module fragment form, and the /m/<module> path form', () => {
  const bare = matchRoute(courseHref(TRICKY, TRICKY));
  assert.equal(bare.name, 'course');
  assert.deepEqual(bare.params, { tenant: TRICKY, course: TRICKY });

  const fragmentForm = matchRoute(courseModuleHref(TRICKY, TRICKY, 'm1-basics'));
  assert.equal(fragmentForm.name, 'course');
  assert.deepEqual(fragmentForm.params, { tenant: TRICKY, course: TRICKY, module: 'm1-basics' });

  const pathForm = matchRoute(courseModulePathHref(TRICKY, TRICKY, TRICKY));
  assert.equal(pathForm.name, 'course');
  assert.deepEqual(pathForm.params, { tenant: TRICKY, course: TRICKY, module: TRICKY });
});

test('round-trip: lesson', () => {
  const route = matchRoute(lessonHref(TRICKY, TRICKY, TRICKY, `${TRICKY}.md`));
  assert.equal(route.name, 'lesson');
  assert.deepEqual(route.params, { tenant: TRICKY, course: TRICKY, module: TRICKY, file: TRICKY });
});

test('round-trip: todos, progress, insights, cost', () => {
  assert.deepEqual(matchRoute(todosHref(TRICKY)), { name: 'todos', params: { tenant: TRICKY } });
  assert.deepEqual(matchRoute(progressHref(TRICKY)), { name: 'progress', params: { tenant: TRICKY } });
  assert.deepEqual(matchRoute(insightsHref(TRICKY)), { name: 'insights', params: { tenant: TRICKY } });
  assert.deepEqual(matchRoute(costHref(TRICKY)), { name: 'cost', params: { tenant: TRICKY } });
});

test('round-trip: graph, with and without ?focus=', () => {
  const bare = matchRoute(graphHref(TRICKY));
  assert.equal(bare.name, 'graph');
  assert.deepEqual(bare.params, { tenant: TRICKY });

  const withFocus = matchRoute(graphHref(TRICKY, TRICKY));
  assert.equal(withFocus.name, 'graph');
  assert.deepEqual(withFocus.params, { tenant: TRICKY, focus: TRICKY });
});

test('round-trip: note, path segments containing "/" recover as one unsplit path', () => {
  const path = `insights/${TRICKY}.md`;
  const route = matchRoute(noteHref(TRICKY, path));
  assert.equal(route.name, 'note');
  assert.deepEqual(route.params, { tenant: TRICKY, path });
});
