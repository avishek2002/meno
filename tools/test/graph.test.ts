// Invariants 1-8 of docs/specs/graph.md, over synthetic in-memory file maps -
// no fixture, no disk. lib/graph.ts must stay pure over these inputs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildGraph, dedupeEdges } from '../../lib/graph.ts';
import type { GraphInput } from '../../lib/graph.ts';
import { buildVaultGraph, type VaultFile } from '../../lib/vault.ts';
import type { CourseNode } from '../../app/shared/types.ts';
import type { ResolvedGroups } from '../../lib/groups.ts';
import type { Mastery } from '../../lib/mastery.ts';

function mkInput(opts: {
  files: VaultFile[];
  courses?: CourseNode[];
  groups?: ResolvedGroups;
  mastery?: Mastery;
  tenant?: string;
}): GraphInput {
  const tenant = opts.tenant ?? 'test-tenant';
  return {
    tenant,
    files: opts.files,
    vault: buildVaultGraph(opts.files),
    tree: { tenant, courses: opts.courses ?? [], warnings: [] },
    groups: opts.groups ?? { groups: [], ungrouped: [], warnings: [] },
    mastery: opts.mastery ?? { schema_version: 1, courses: {} },
  };
}

function course(overrides: Partial<CourseNode>): CourseNode {
  return {
    dir: 'domain/c1',
    slug: 'c1',
    title: 'C1',
    status: 'active',
    hub: './c1-hub.md',
    objectives: [],
    modules: [],
    ...overrides,
  };
}

// --- 1. every walked note is exactly one node ---

test('every walked note is exactly one node, and sources/ and progress/ are absent', () => {
  const files: VaultFile[] = [
    { path: 'home.md', text: '# Home\n' },
    { path: 'todos.md', text: '# Todos\n' },
    { path: 'notes/a.md', text: '# A\n' },
  ];
  const got = buildGraph(mkInput({ files }));
  assert.equal(got.nodes.length, files.length);
  assert.deepEqual(got.nodes.map((n) => n.id), files.map((f) => f.path).sort());
  assert.ok(got.nodes.every((n) => !n.id.startsWith('sources/') && !n.id.startsWith('progress/')));
});

// --- 2. ghost lesson, keeps id once written ---

test('a planned lesson with no file is a ghost node with a null route, and keeps its id once written', () => {
  const courses = [
    course({
      modules: [
        {
          slug: 'm1',
          title: 'M1',
          status: 'skeleton',
          est_hours: 3,
          serves: [],
          prerequisites: [],
          concepts: ['k'],
          lessons: [{ file: '01-a.md', title: 'A', concept: 'k', status: 'planned' }],
        },
      ],
    }),
  ];
  const lessonId = 'domain/c1/modules/m1/01-a.md';

  const ghostFiles: VaultFile[] = [
    { path: 'home.md', text: '# Home\n' },
    { path: 'domain/c1/c1-hub.md', text: '# C1\n' },
  ];
  const ghost = buildGraph(mkInput({ files: ghostFiles, courses }));
  const ghostNode = ghost.nodes.find((n) => n.id === lessonId)!;
  assert.ok(ghostNode, 'the ghost node exists even though no file backs it');
  assert.equal(ghostNode.kind, 'lesson');
  assert.equal(ghostNode.state, 'ghost');
  assert.equal(ghostNode.route, null);
  assert.equal(ghostNode.title, 'A', 'title comes from the manifest, not a file');

  const writtenFiles: VaultFile[] = [...ghostFiles, { path: lessonId, text: '# A\n' }];
  const written = buildGraph(mkInput({ files: writtenFiles, courses }));
  const writtenNode = written.nodes.find((n) => n.id === lessonId)!;
  assert.ok(writtenNode, 'the same id is kept once the body is written');
  assert.equal(writtenNode.state, 'generated');
  assert.notEqual(writtenNode.route, null);
});

// --- 3. only a lesson is ever mastered ---

test('only a lesson is ever mastered, and only from deriveMastery', () => {
  const courses = [
    course({
      modules: [
        {
          slug: 'm1',
          title: 'M1',
          status: 'generated',
          est_hours: 3,
          serves: [],
          prerequisites: [],
          concepts: ['k'],
          lessons: [{ file: '01-a.md', title: 'A', concept: 'k', status: 'generated' }],
        },
      ],
    }),
  ];
  const files: VaultFile[] = [
    { path: 'home.md', text: '# Home\n' },
    { path: 'domain/c1/c1-hub.md', text: '# C1\n' },
    { path: 'domain/c1/modules/m1/01-a.md', text: '# A\n' },
  ];
  const mastery: Mastery = {
    schema_version: 1,
    courses: {
      c1: {
        concepts: {
          k: { level: 'mastered', module: 'm1', n_transfer: 1, transfer_score: 1, recognition_rate: null, next_review: null, stale: false, weak_until: null },
        },
        modules: {},
      },
    },
  };
  const got = buildGraph(mkInput({ files, courses, mastery }));
  const lesson = got.nodes.find((n) => n.id === 'domain/c1/modules/m1/01-a.md')!;
  assert.equal(lesson.state, 'mastered');
  const hub = got.nodes.find((n) => n.id === 'domain/c1/c1-hub.md')!;
  assert.equal(hub.kind, 'hub');
  assert.notEqual(hub.state, 'mastered', 'only a lesson node is ever mastered');
  const home = got.nodes.find((n) => n.id === 'home.md')!;
  assert.notEqual(home.state, 'mastered');
});

// --- 4. edge endpoints valid, no self-loops, broken links are not edges ---

test('every edge endpoint is a node, no edge is a self-loop, and a broken link is not an edge', () => {
  const files: VaultFile[] = [
    { path: 'home.md', text: '# Home\n[[home]] [[missing-note]] [[a]]\n' },
    { path: 'a.md', text: '# A\n' },
  ];
  const got = buildGraph(mkInput({ files }));
  const nodeIds = new Set(got.nodes.map((n) => n.id));
  for (const e of got.edges) {
    assert.ok(nodeIds.has(e.source), `edge source "${e.source}" is a node`);
    assert.ok(nodeIds.has(e.target), `edge target "${e.target}" is a node`);
    assert.notEqual(e.source, e.target, 'no self-loop');
  }
  assert.deepEqual(got.edges, [{ source: 'home.md', target: 'a.md', kind: 'reference' }]);
});

// --- 5 & 6: precedence and dedup, reason only on connection edges ---

test('one edge per unordered pair, with connection over reference over membership', () => {
  const courses = [
    course({
      dir: 'd/c1',
      slug: 'c1',
      hub: './c1-hub.md',
      modules: [
        {
          slug: 'm1',
          title: 'M1',
          status: 'generated',
          est_hours: 3,
          serves: [],
          prerequisites: [],
          concepts: ['k'],
          lessons: [{ file: '01-a.md', title: 'A', concept: 'k', status: 'generated' }],
        },
      ],
    }),
    course({ dir: 'd/c2', slug: 'c2', title: 'C2', hub: './c2-hub.md', modules: [] }),
  ];
  const files: VaultFile[] = [
    { path: 'home.md', text: '# Home\n' },
    {
      path: 'd/c1/c1-hub.md',
      text: [
        '# C1',
        '',
        '[[01-a]]',
        '',
        '<!-- meno:connects:start -->',
        '- [[c2-hub|C2]] - a reason',
        '<!-- meno:connects:end -->',
        '',
      ].join('\n'),
    },
    { path: 'd/c1/modules/m1/01-a.md', text: '# A\n' },
    { path: 'd/c2/c2-hub.md', text: '# C2\n' },
  ];
  const got = buildGraph(mkInput({ files, courses }));

  const pair = (edges: typeof got.edges, x: string, y: string) =>
    edges.filter((e) => (e.source === x && e.target === y) || (e.source === y && e.target === x));

  // hub <-> lesson: reference (wikilink) beats membership (manifest)
  const hubLesson = pair(got.edges, 'd/c1/c1-hub.md', 'd/c1/modules/m1/01-a.md');
  assert.equal(hubLesson.length, 1);
  assert.equal(hubLesson[0].kind, 'reference');

  // hub <-> hub: connection (meno:connects) beats the reference the same wikilink also produces
  const hubHub = pair(got.edges, 'd/c1/c1-hub.md', 'd/c2/c2-hub.md');
  assert.equal(hubHub.length, 1);
  assert.equal(hubHub[0].kind, 'connection');
  assert.equal(hubHub[0].reason, 'a reason');
});

test('reason is set on connection edges and on nothing else', () => {
  const courses = [
    course({
      dir: 'd/c1',
      slug: 'c1',
      hub: './c1-hub.md',
      modules: [
        {
          slug: 'm1',
          title: 'M1',
          status: 'generated',
          est_hours: 3,
          serves: [],
          prerequisites: [],
          concepts: ['k'],
          lessons: [{ file: '01-a.md', title: 'A', concept: 'k', status: 'generated' }],
        },
      ],
    }),
    course({ dir: 'd/c2', slug: 'c2', title: 'C2', hub: './c2-hub.md', modules: [] }),
  ];
  const files: VaultFile[] = [
    {
      path: 'd/c1/c1-hub.md',
      text: [
        '# C1',
        '',
        '<!-- meno:connects:start -->',
        '- [[c2-hub|C2]] - a reason',
        '<!-- meno:connects:end -->',
        '',
      ].join('\n'),
    },
    { path: 'd/c1/modules/m1/01-a.md', text: '# A\n' },
    { path: 'd/c2/c2-hub.md', text: '# C2\n' },
  ];
  const got = buildGraph(mkInput({ files, courses }));
  for (const e of got.edges) {
    if (e.kind === 'connection') assert.equal(typeof e.reason, 'string');
    else assert.equal(e.reason, undefined, `${e.kind} edge must not carry a reason`);
  }
  assert.ok(got.edges.some((e) => e.kind === 'connection'));
});

// --- 7. in_degree counts distinct sources over the deduplicated edges ---

test('in_degree counts distinct sources over the deduplicated edges', () => {
  const files: VaultFile[] = [
    { path: 'a.md', text: '# A\n[[c]] [[c]]\n' }, // duplicate wikilink, still one pair
    { path: 'b.md', text: '# B\n[[c]]\n' },
    { path: 'c.md', text: '# C\n' },
  ];
  const got = buildGraph(mkInput({ files }));
  const byId = Object.fromEntries(got.nodes.map((n) => [n.id, n]));
  assert.equal(byId['c.md'].in_degree, 2);
  assert.equal(byId['a.md'].in_degree, 0);
  assert.equal(byId['b.md'].in_degree, 0);
});

// --- 8. buildGraph is pure and deterministic ---

test('buildGraph is deterministic and sorted', () => {
  const courses = [
    course({
      modules: [
        {
          slug: 'm1',
          title: 'M1',
          status: 'skeleton',
          est_hours: 3,
          serves: [],
          prerequisites: [],
          concepts: ['k', 'j'],
          lessons: [
            { file: '02-b.md', title: 'B', concept: 'j', status: 'planned' },
            { file: '01-a.md', title: 'A', concept: 'k', status: 'planned' },
          ],
        },
      ],
    }),
  ];
  const files: VaultFile[] = [
    { path: 'domain/c1/c1-hub.md', text: '# C1\n[[home]]\n' },
    { path: 'home.md', text: '# Home\n[[domain/c1/c1-hub]]\n' },
  ];
  const a = buildGraph(mkInput({ files, courses }));
  const b = buildGraph(mkInput({ files: [...files].reverse(), courses: [{ ...courses[0], modules: [{ ...courses[0].modules[0], lessons: [...courses[0].modules[0].lessons].reverse() }] }] }));
  assert.deepEqual(a, b);

  const ids = a.nodes.map((n) => n.id);
  assert.deepEqual(ids, [...ids].sort());
  const edgeKey = (e: (typeof a.edges)[number]) => `${e.source}|${e.target}|${e.kind}`;
  const keys = a.edges.map(edgeKey);
  assert.deepEqual(keys, [...keys].sort());
});

// --- dedupeEdges directly: order independence and the source-sorts-lower tiebreak ---

test('dedupeEdges collapses reciprocal edges of the same kind to the lower-sorting source', () => {
  const edges = [
    { source: 'z-hub.md', target: 'a-hub.md', kind: 'connection' as const, reason: 'from z' },
    { source: 'a-hub.md', target: 'z-hub.md', kind: 'connection' as const, reason: 'from a' },
  ];
  const got = dedupeEdges(edges);
  assert.equal(got.length, 1);
  assert.equal(got[0].source, 'a-hub.md');
  assert.equal(got[0].reason, 'from a');
});

test('dedupeEdges drops self-loops and is order-independent', () => {
  const a = dedupeEdges([
    { source: 'x.md', target: 'x.md', kind: 'reference' },
    { source: 'x.md', target: 'y.md', kind: 'membership' },
    { source: 'x.md', target: 'y.md', kind: 'reference' },
  ]);
  const b = dedupeEdges([
    { source: 'x.md', target: 'y.md', kind: 'reference' },
    { source: 'x.md', target: 'y.md', kind: 'membership' },
    { source: 'x.md', target: 'x.md', kind: 'reference' },
  ]);
  assert.deepEqual(a, [{ source: 'x.md', target: 'y.md', kind: 'reference' }]);
  assert.deepEqual(a, b);
});

// --- self-targeting connects bullet: the self-edge is dropped and it warns ---

test('a self-targeting connects bullet is a warning and produces no edge', () => {
  const courses = [
    course({
      dir: 'd/c1',
      slug: 'c1',
      hub: './c1-hub.md',
      modules: [],
    }),
  ];
  const files: VaultFile[] = [
    {
      path: 'd/c1/c1-hub.md',
      text: ['# C1', '', '<!-- meno:connects:start -->', '- [[c1-hub|Itself]] - a typo, points at itself', '<!-- meno:connects:end -->', ''].join('\n'),
    },
  ];
  const got = buildGraph(mkInput({ files, courses }));
  assert.deepEqual(got.edges, [], 'the self-loop never becomes an edge');
  assert.ok(
    got.warnings.some((w) => w.includes('d/c1/c1-hub.md') && w.toLowerCase().includes('self')),
    'a self-targeting connects bullet is reported in warnings',
  );
});

// --- source hygiene: a raw NUL byte turns a source file into "binary" to git,
// making it unreviewable in a pull request (must be a printable separator) ---

test('lib/graph.ts and this test file contain no raw NUL byte', () => {
  const graphSrc = readFileSync(fileURLToPath(new URL('../../lib/graph.ts', import.meta.url)), 'utf8');
  assert.ok(!graphSrc.includes('\u0000'), 'lib/graph.ts must not contain a raw NUL byte');
  const thisSrc = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.ok(!thisSrc.includes('\u0000'), 'this test file must not contain a raw NUL byte');
});
