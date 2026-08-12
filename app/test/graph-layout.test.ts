// Pure unit coverage for app/client/src/graphLayout.ts (docs/specs/graph.md
// invariants 13 and 14) and a guard test for the router's decodeParams fix -
// no server, no DOM, no fixture. The one test file FRONTEND owns; npm test
// globs app/test/*.test.ts so this runs in the gate alongside BACKEND's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  EDGE_STROKE_WIDTH,
  filterGraphByGroups,
  fitToViewTransform,
  groupCounts,
  hashId,
  hasNoConnectionEdges,
  hopNeighborhood,
  resolveFocus,
  seedPosition,
} from '../client/src/graphLayout.ts';
import { decodeParams } from '../client/src/routeParams.ts';

// --- invariant 13: focus resolution ---

const NODE_IDS = [
  'home.md',
  'software-engineering/git-fundamentals/git-fundamentals-hub.md',
  'software-engineering/git-fundamentals/modules/01-commits-and-history/01-the-commit-graph.md',
  'software-engineering/rust-for-backend/rust-for-backend-hub.md',
  'software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md',
  // a second course whose hub basename collides with nothing else, but whose
  // final path segment ("ownership") is ambiguous against the suffix above
  // once truncated - exercises the "unique" requirement at each tier.
  'software-engineering/other-course/modules/01-x/03-ownership-notes.md',
];

test('focus resolves by exact id, then unique basename, then unique suffix, then nothing', () => {
  // exact id wins even when a basename or suffix match would also apply
  assert.equal(resolveFocus('home.md', NODE_IDS), 'home.md');

  // unique basename without .md
  assert.equal(
    resolveFocus('rust-for-backend-hub', NODE_IDS),
    'software-engineering/rust-for-backend/rust-for-backend-hub.md',
  );
  assert.equal(
    resolveFocus('03-ownership', NODE_IDS),
    'software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md',
  );

  // unique path suffix (a value with no unique basename match, longer than a basename)
  const ids = [...NODE_IDS, 'other-tenant-shape/modules/01-x/03-ownership.md'];
  // "03-ownership" is now ambiguous as a basename (two nodes end in exactly
  // that basename), so basename resolution must fail and fall through to
  // suffix resolution, which needs the caller to supply more path.
  assert.equal(resolveFocus('03-ownership', ids), null, 'an ambiguous basename must not silently pick one');
  assert.equal(
    resolveFocus('rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md', ids),
    'software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md',
  );

  // unknown value: renders the whole graph, not an error
  assert.equal(resolveFocus('does-not-exist', NODE_IDS), null);

  // absent or empty is treated as no focus, never a search for the empty string
  assert.equal(resolveFocus(undefined, NODE_IDS), null);
  assert.equal(resolveFocus(null, NODE_IDS), null);
  assert.equal(resolveFocus('', NODE_IDS), null);
});

// --- invariant 14: deterministic seeding, and the DOM-free / React-free boundary ---

test('seed positions are a pure function of id and count, and graphLayout names no browser global', () => {
  const a1 = seedPosition('home.md', 12);
  const a2 = seedPosition('home.md', 12);
  assert.deepEqual(a1, a2, 'same id and count must yield byte-identical output on every call');

  // the count is part of the pure function's input - changing it changes where the point lands
  const differentCount = seedPosition('home.md', 400);
  assert.notDeepEqual(a1, differentCount, 'a different node count must be able to move the seed');
  assert.equal(typeof a1.x, 'number');
  assert.equal(typeof a1.y, 'number');

  // a different id gets, in general, a different angle - hashId is not the identity function
  assert.notEqual(hashId('home.md'), hashId('todos.md'));

  // two independent calls to hashId for the same string agree - no clock, no Math.random
  assert.equal(hashId('software-engineering/git-fundamentals/git-fundamentals-hub.md'), hashId('software-engineering/git-fundamentals/git-fundamentals-hub.md'));

  // source grep: no browser global, no React import, no Math.random, no Date.now
  const src = readFileSync(fileURLToPath(new URL('../client/src/graphLayout.ts', import.meta.url)), 'utf8');
  assert.equal(src.includes("from 'react'"), false);
  assert.equal(src.includes('window.'), false);
  assert.equal(src.includes('document.'), false);
  assert.equal(src.includes('localStorage'), false);
  assert.equal(src.includes('navigator.'), false);
  // grep for a call, not the bare word - the module's own header comment
  // documents "no Math.random, no Date.now" in prose, which would otherwise
  // false-positive against a substring match
  assert.equal(src.includes('Math.random('), false);
  assert.equal(src.includes('Date.now('), false);
});

// --- hopNeighborhood: the shared basis for hover-dim (1 hop) and focus-dim (2 hops) ---

const EDGES = [
  { source: 'a', target: 'b' },
  { source: 'b', target: 'c' },
  { source: 'c', target: 'd' },
  { source: 'e', target: 'a' }, // undirected: reachable from 'a' by traversing the edge backwards
];

test('hopNeighborhood includes the origin, walks edges as undirected, and stops at the hop limit', () => {
  assert.deepEqual([...hopNeighborhood('a', EDGES, 0)].sort(), ['a']);
  assert.deepEqual([...hopNeighborhood('a', EDGES, 1)].sort(), ['a', 'b', 'e']);
  assert.deepEqual([...hopNeighborhood('a', EDGES, 2)].sort(), ['a', 'b', 'c', 'e']);
  assert.deepEqual([...hopNeighborhood('a', EDGES, 5)].sort(), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual([...hopNeighborhood('z', EDGES, 2)].sort(), ['z'], 'an isolated id is its own whole neighborhood');
});

// --- the router's decodeParams fix: an optional group that did not participate must be dropped ---

test('decodeParams drops a non-participating optional group instead of stringifying "undefined"', () => {
  // this is exactly the shape a RegExp match produces for an optional named
  // group that did not match - e.g. plain "#/t/main/graph" against
  // /^#\/t\/(?<tenant>[^/?]+)\/graph(?:\?focus=(?<focus>[^&#]*))?$/
  const groups = { tenant: 'main', focus: undefined };
  const decoded = decodeParams(groups);
  assert.deepEqual(decoded, { tenant: 'main' });
  assert.equal(Object.hasOwn(decoded, 'focus'), false, 'an absent group must never surface as the literal string "undefined"');

  // a genuinely present, empty group (?focus=) is still decoded, just as an empty string -
  // graphLayout.resolveFocus, not decodeParams, is what treats '' as "no focus"
  assert.deepEqual(decodeParams({ tenant: 'main', focus: '' }), { tenant: 'main', focus: '' });

  // percent-encoding still round-trips for a group that did participate
  assert.deepEqual(decodeParams({ tenant: 'main', focus: '03-ownership' }), { tenant: 'main', focus: '03-ownership' });
  assert.deepEqual(decodeParams({ section: 'todo-tags' }), { section: 'todo-tags' });

  // an undecodable percent-sequence falls back to the raw value rather than throwing
  assert.deepEqual(decodeParams({ path: '%' }), { path: '%' });

  assert.deepEqual(decodeParams(undefined), {});
});

// --- source grep: routeParams.ts stays DOM-free too, the same discipline courseList.ts follows ---

test('routeParams.ts names no browser global and imports no React', () => {
  const src = readFileSync(fileURLToPath(new URL('../client/src/routeParams.ts', import.meta.url)), 'utf8');
  assert.equal(src.includes("from 'react'"), false);
  assert.equal(src.includes('window.'), false);
  assert.equal(src.includes('document.'), false);
});

// --- app/client/src stays free of a second graph-focused pure module (there is exactly one) ---

// --- edge stroke width: the one definition GraphPage's canvas and legend both read ---

test('EDGE_STROKE_WIDTH is 3 for connection and 1 for reference and membership, and GraphPage sources it instead of a magic number', () => {
  assert.equal(EDGE_STROKE_WIDTH.connection, 3);
  assert.equal(EDGE_STROKE_WIDTH.reference, 1);
  assert.equal(EDGE_STROKE_WIDTH.membership, 1);
  assert.ok(EDGE_STROKE_WIDTH.connection > EDGE_STROKE_WIDTH.reference, 'a connection edge must render thicker than a reference edge');

  const src = readFileSync(fileURLToPath(new URL('../client/src/pages/GraphPage.tsx', import.meta.url)), 'utf8');
  assert.equal(src.includes('EDGE_STROKE_WIDTH'), true, 'GraphPage must read the shared width definition');
  // guard against a regression back to a hardcoded literal on the legend's preview lines
  assert.equal(src.includes('strokeWidth="3"'), false, 'the legend must not hardcode the connection width');
  assert.equal(src.includes('strokeWidth="1"'), false, 'the legend must not hardcode the reference width');
});

// --- the no-connections-yet notice predicate ---

test('hasNoConnectionEdges is true only when the edge list has no connection-kind edge', () => {
  assert.equal(hasNoConnectionEdges([]), true, 'no edges at all counts as no connections yet');
  assert.equal(
    hasNoConnectionEdges([
      { source: 'a', target: 'b', kind: 'reference' },
      { source: 'b', target: 'c', kind: 'membership' },
    ]),
    true,
  );
  assert.equal(
    hasNoConnectionEdges([
      { source: 'a', target: 'b', kind: 'reference' },
      { source: 'x', target: 'y', kind: 'connection' },
    ]),
    false,
  );
});

// --- fit-to-view maths ---

test('fitToViewTransform: identity for zero nodes, centers a single node without scaling, and shrinks a graph wider than the viewBox to fit with margin', () => {
  assert.deepEqual(fitToViewTransform([], 900, 40), { x: 0, y: 0, k: 1 });

  assert.deepEqual(fitToViewTransform([{ x: 120, y: -60 }], 900, 40), { x: -120, y: 60, k: 1 });

  // a graph much wider than the 900 viewBox must shrink (k < 1) so every
  // point still fits inside the viewBox once translated and scaled
  const wide = [
    { x: -1000, y: 0 },
    { x: 1000, y: 0 },
    { x: 0, y: 50 },
    { x: 0, y: -50 },
  ];
  const fit = fitToViewTransform(wide, 900, 40);
  assert.ok(fit.k < 1, 'a bounding box wider than the viewBox must scale down');
  assert.ok(fit.k > 0, 'scale must stay positive');
  for (const p of wide) {
    const screenX = p.x * fit.k + fit.x;
    const screenY = p.y * fit.k + fit.y;
    assert.ok(Math.abs(screenX) <= 450 + 1e-6, `point ${p.x},${p.y} must land within the half-viewBox after fitting`);
    assert.ok(Math.abs(screenY) <= 450 + 1e-6, `point ${p.x},${p.y} must land within the half-viewBox after fitting`);
  }

  // a graph already smaller than the viewBox must not be scaled up
  const small = [
    { x: -10, y: -10 },
    { x: 10, y: 10 },
  ];
  assert.equal(fitToViewTransform(small, 900, 40).k, 1);
});

// --- group filter: counting for the legend/filter toggles, and the subgraph cut fed to d3-force ---

test('groupCounts: one row per server group in order, plus Ungrouped only when a node has group === null', () => {
  const groups = [
    { id: 'group-a', title: 'Group A' },
    { id: 'group-b', title: 'Group B' },
  ];
  const nodes = [{ group: 'group-a' }, { group: 'group-a' }, { group: 'group-b' }, { group: null }];

  assert.deepEqual(groupCounts(nodes, groups), [
    { id: 'group-a', title: 'Group A', count: 2 },
    { id: 'group-b', title: 'Group B', count: 1 },
    { id: null, title: 'Ungrouped', count: 1 },
  ]);

  // no node has group === null: no Ungrouped row at all, not a zero-count one
  const allGrouped = [{ group: 'group-a' }, { group: 'group-b' }];
  assert.deepEqual(groupCounts(allGrouped, groups), [
    { id: 'group-a', title: 'Group A', count: 1 },
    { id: 'group-b', title: 'Group B', count: 1 },
  ]);
});

const FILTER_NODES = [
  { id: 'a1', group: 'course-a' },
  { id: 'a2', group: 'course-a' },
  { id: 'b1', group: 'course-b' },
  { id: 'home', group: null },
];

const FILTER_EDGES = [
  { source: 'a1', target: 'a2' }, // both endpoints in course-a
  { source: 'a1', target: 'b1' }, // spans course-a and course-b
  { source: 'b1', target: 'home' }, // spans course-b and the ungrouped bucket
];

test('filterGraphByGroups: every group visible is the identity', () => {
  const all = new Set<string | null>(['course-a', 'course-b', null]);
  assert.deepEqual(filterGraphByGroups(FILTER_NODES, FILTER_EDGES, all), { nodes: FILTER_NODES, edges: FILTER_EDGES });
});

test('filterGraphByGroups: hiding one group drops its nodes and every edge touching them, including a cross-group edge with only one side hidden', () => {
  const visible = new Set<string | null>(['course-a', null]); // course-b hidden
  const result = filterGraphByGroups(FILTER_NODES, FILTER_EDGES, visible);

  assert.deepEqual(result.nodes, [
    { id: 'a1', group: 'course-a' },
    { id: 'a2', group: 'course-a' },
    { id: 'home', group: null },
  ]);
  // a1<->b1 is gone even though a1 stayed visible - only b1 was hidden, and that is enough to drop the edge
  // b1<->home is gone for the same reason
  assert.deepEqual(result.edges, [{ source: 'a1', target: 'a2' }]);
});

test('filterGraphByGroups: hiding the ungrouped bucket drops only the null-group nodes', () => {
  const visible = new Set<string | null>(['course-a', 'course-b']); // null (ungrouped) hidden
  const result = filterGraphByGroups(FILTER_NODES, FILTER_EDGES, visible);

  assert.deepEqual(result.nodes, [
    { id: 'a1', group: 'course-a' },
    { id: 'a2', group: 'course-a' },
    { id: 'b1', group: 'course-b' },
  ]);
  assert.deepEqual(result.edges, [
    { source: 'a1', target: 'a2' },
    { source: 'a1', target: 'b1' },
  ]);
});

test('filterGraphByGroups: every group hidden yields an empty subgraph, not a crash', () => {
  const result = filterGraphByGroups(FILTER_NODES, FILTER_EDGES, new Set<string | null>());
  assert.deepEqual(result, { nodes: [], edges: [] });
});

test('exactly one client file exports resolveFocus: graphLayout.ts', () => {
  const clientSrcDir = fileURLToPath(new URL('../client/src', import.meta.url));
  const files: string[] = [];
  (function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else {
        files.push(full);
      }
    }
  })(clientSrcDir);

  const exportingResolveFocus = files.filter((f) => readFileSync(f, 'utf8').includes('export function resolveFocus'));
  assert.equal(exportingResolveFocus.length, 1);
  assert.ok(exportingResolveFocus[0].endsWith(join('client', 'src', 'graphLayout.ts')));
});
