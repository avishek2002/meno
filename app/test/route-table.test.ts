// Pure unit coverage for app/client/src/routes.ts - the hash-route table and
// matchRoute, pulled out of router.tsx precisely so this can run without a
// DOM or JSX (root tsconfig compiles app/**/*.ts with neither).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { matchRoute } from '../client/src/routes.ts';

test('#/t/alice matches tenant with no section', () => {
  const route = matchRoute('#/t/alice');
  assert.equal(route.name, 'tenant');
  assert.deepEqual(route.params, { tenant: 'alice' });
  assert.equal(Object.hasOwn(route.params, 'section'), false, 'an absent fragment must not surface as a param at all');
});

test('#/t/alice#course-llm-cost-and-token-engineering matches tenant with tenant and section split correctly', () => {
  // The fragment scheme itself (course-<slug>, courseList.ts's
  // courseSlugFromFragment) is not this route's concern - the `tenant`
  // pattern only needs to fold any legal [\w-]+ fragment into `section`
  // without swallowing it into `tenant`, whatever prefix that fragment
  // happens to carry.
  const route = matchRoute('#/t/alice#course-llm-cost-and-token-engineering');
  assert.equal(route.name, 'tenant');
  // This is the greedy-swallow bug the tenant pattern must not have: `[^/]+`
  // also matches a literal `#`, so a naive copy of every other tenant-shaped
  // route's class would let `tenant` eat the whole fragment (the section
  // group is optional, so it would just match zero characters) and produce
  // tenant === 'alice#course-llm-cost-and-token-engineering' instead of
  // splitting the two.
  assert.equal(route.params.tenant, 'alice');
  assert.notEqual(route.params.tenant, 'alice#course-llm-cost-and-token-engineering');
  assert.equal(route.params.section, 'course-llm-cost-and-token-engineering');
});

test('a fragment with an illegal character falls through to not-found', () => {
  // "." is outside [\w-], the same class guide's #section group enforces
  const route = matchRoute('#/t/alice#course.ai');
  assert.equal(route.name, 'not-found');
});

test('#/guide#glossary still matches guide with its section', () => {
  const route = matchRoute('#/guide#glossary');
  assert.equal(route.name, 'guide');
  assert.deepEqual(route.params, { section: 'glossary' });
});

test('the graph route with ?focus= still matches, and without it still matches with tenant only', () => {
  const withFocus = matchRoute('#/t/alice/graph?focus=03-ownership');
  assert.equal(withFocus.name, 'graph');
  assert.deepEqual(withFocus.params, { tenant: 'alice', focus: '03-ownership' });

  const withoutFocus = matchRoute('#/t/alice/graph');
  assert.equal(withoutFocus.name, 'graph');
  assert.deepEqual(withoutFocus.params, { tenant: 'alice' });
});

test('the note route still matches, path captures everything after /n/', () => {
  const route = matchRoute('#/t/alice/n/software-engineering/git-fundamentals/home.md');
  assert.equal(route.name, 'note');
  assert.deepEqual(route.params, { tenant: 'alice', path: 'software-engineering/git-fundamentals/home.md' });
});

test('the lesson route still matches all four segments', () => {
  const route = matchRoute('#/t/alice/c/git-fundamentals/m/01-commits/l/01-the-commit-graph.md');
  assert.equal(route.name, 'lesson');
  assert.deepEqual(route.params, {
    tenant: 'alice',
    course: 'git-fundamentals',
    module: '01-commits',
    file: '01-the-commit-graph.md',
  });
});

test('#/t/alice/c/git-fundamentals#01-commits still matches course with the fragment form of the module anchor', () => {
  // The pre-existing #module fragment (UI-10) - courseModuleHref's output,
  // and any bookmark made before the /m/<module> path form below existed -
  // must keep resolving exactly as it did.
  const route = matchRoute('#/t/alice/c/git-fundamentals#01-commits');
  assert.equal(route.name, 'course');
  assert.deepEqual(route.params, { tenant: 'alice', course: 'git-fundamentals', module: '01-commits' });
});

test('#/t/alice/c/git-fundamentals/m/01-commits matches course with the path form of the module', () => {
  // The truncation case this route addition exists for: deleting
  // `/l/<file>` off the end of a lesson URL used to land on not-found. It
  // has to resolve to the same route (and the same param shape) the
  // fragment form above does, just spelled as a path segment.
  const route = matchRoute('#/t/alice/c/git-fundamentals/m/01-commits');
  assert.equal(route.name, 'course');
  assert.deepEqual(route.params, { tenant: 'alice', course: 'git-fundamentals', module: '01-commits' });
});

test('#/t/alice/c/git-fundamentals still matches course with no module at all', () => {
  const route = matchRoute('#/t/alice/c/git-fundamentals');
  assert.equal(route.name, 'course');
  assert.deepEqual(route.params, { tenant: 'alice', course: 'git-fundamentals' });
});

test('every meaningful prefix of a lesson route matches a named route', () => {
  // "Meaningful prefix" means truncated at a /<letter>/<value> pair
  // boundary, not at an arbitrary character - deleting `/l/01-the-commit-
  // graph` off the end must not land on not-found (this is the module-
  // truncation defect this route addition fixes), and neither must deleting
  // `/m/01-commits/l/01-the-commit-graph` (the pre-existing course
  // truncation) or `/c/git-fundamentals/m/01-commits/l/01-the-commit-graph`
  // (tenant). Built from the pair list itself, not copied out as literal
  // strings, so a future segment added to the lesson route is covered by
  // this same test without anyone having to remember to extend it.
  const pairs: Array<[string, string]> = [
    ['t', 'alice'],
    ['c', 'git-fundamentals'],
    ['m', '01-commits'],
    ['l', '01-the-commit-graph'],
  ];
  let hash = '#';
  for (const [letter, value] of pairs) {
    hash += `/${letter}/${value}`;
    const route = matchRoute(hash);
    assert.notEqual(route.name, 'not-found', `${hash} must resolve to a named route`);
  }
  // The full hash above is the lesson route specifically, and the pair
  // immediately before it (the /m/ truncation) is the new course-module
  // route this change adds - pin both by name so the invariant loop above
  // can't accidentally pass by matching the wrong route.
  assert.equal(matchRoute(hash).name, 'lesson');
  const truncatedToModule = hash.replace(/\/l\/01-the-commit-graph$/, '');
  assert.equal(matchRoute(truncatedToModule).name, 'course');
});

test('routes.ts names no browser global and imports no React', () => {
  const src = readFileSync(fileURLToPath(new URL('../client/src/routes.ts', import.meta.url)), 'utf8');
  assert.equal(src.includes("from 'react'"), false);
  assert.equal(src.includes('window.'), false);
  assert.equal(src.includes('document.'), false);
  assert.equal(src.includes('localStorage'), false);
});
