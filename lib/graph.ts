// The knowledge-graph model: one node per vault note plus one per planned
// lesson, three kinds of edge, and the three visual channels the view draws
// with (group, state, incoming links). The app server is the only caller
// today; validate re-uses `lib/connects.ts` directly rather than going through
// here, because it needs the diagnostics this file discards.
//
// Pure over in-memory inputs, exactly like lib/vault.ts and lib/mastery.ts:
// nothing here touches the filesystem, the clock, or the network, so the whole
// model unit-tests over synthetic file maps with no fixture. Wiring a tenant
// directory into `GraphInput` is the caller's job (app/server/routes.ts does it
// from the same loaders every other endpoint already uses - no second walk).
//
// This is the join layer. It owns no format: lesson anatomy belongs to
// generate-module, manifests to generate-curriculum, the connects block to
// second-brain, mastery to lib/mastery.ts. Spec: docs/specs/graph.md.
import type { VaultFile, VaultGraph } from './vault.ts';
import type { ResolvedGroups } from './groups.ts';
import type { Mastery } from './mastery.ts';
import { parseConnects } from './connects.ts';
import type {
  TreeResponse,
  CourseNode,
  ModuleNode,
  LessonEntry,
  GraphNode,
  GraphNodeKind,
  GraphNodeState,
  GraphEdge,
  GraphEdgeKind,
  GraphResponse,
} from '../app/shared/types.ts';

/**
 * Everything the model needs, already computed by the existing single
 * implementations. Deliberately four separate producers rather than a tenant
 * directory: it is what makes this file testable, and it is what stops a fifth
 * walk of the tree appearing.
 */
export interface GraphInput {
  /** Names the tenant only so node routes can be built; never used as a path. */
  tenant: string;
  /** `loadVaultFiles(tenantDir)` - already excludes `sources/` and `progress/`. */
  files: VaultFile[];
  /** `buildVaultGraph(files)` - the resolved link index, the source of reference edges. */
  vault: VaultGraph;
  /** `walkTenant(tenantDir, tenant)` - courses, modules, and planned lessons. */
  tree: TreeResponse;
  /** `resolveGroups(doc, courses)` - the fill-colour channel and the legend. */
  groups: ResolvedGroups;
  /** `deriveMastery(events)` - the only thing that may make a node `mastered`. */
  mastery: Mastery;
}

/**
 * Collapse edges so that any unordered pair of nodes carries at most one.
 *
 * The rule, in full:
 *
 * 1. An edge whose `source` equals its `target` is dropped. A hub that links
 *    itself is a typo, not a loop worth drawing.
 * 2. Two edges are the same pair when `{source, target}` match as an unordered
 *    set - direction does not separate them, because the view draws undirected
 *    edges (decision 7: an arrow would imply a semantics the edge cannot carry).
 * 3. Kind precedence is total: `connection` > `reference` > `membership`. The
 *    surviving edge is the highest-precedence one present for that pair, and it
 *    keeps that edge's own `source`, `target`, and `reason`. So a membership
 *    edge and a reference edge for the same pair collapse to one edge, and a
 *    connection edge always wins over both - the thick line is the point of the
 *    view and must never be hidden under a thin one.
 *    Reference beats membership because the wikilink is authored and carries a
 *    real direction, where membership is inferred from the manifest.
 * 4. Two edges of the SAME kind for the same pair (reciprocal `meno:connects`
 *    blocks, or a note that wikilinks another twice) collapse to the one whose
 *    `source` sorts lower, so the output does not depend on input order.
 *
 * Returns a new array sorted by (`source`, `target`, `kind`). Does not mutate
 * its argument.
 */
const KIND_RANK: Record<GraphEdgeKind, number> = { connection: 3, reference: 2, membership: 1 };

export function dedupeEdges(edges: GraphEdge[]): GraphEdge[] {
  const groups = new Map<string, GraphEdge[]>();
  for (const e of edges) {
    if (e.source === e.target) continue; // rule 1: no self-loop
    const [a, b] = e.source < e.target ? [e.source, e.target] : [e.target, e.source];
    const key = `${a}|${b}`; // rule 2: unordered pair
    const list = groups.get(key);
    if (list) list.push(e);
    else groups.set(key, [e]);
  }

  const out: GraphEdge[] = [];
  for (const list of groups.values()) {
    let best = list[0];
    for (const e of list.slice(1)) {
      if (KIND_RANK[e.kind] > KIND_RANK[best.kind]) {
        best = e; // rule 3: highest-precedence kind wins
      } else if (KIND_RANK[e.kind] === KIND_RANK[best.kind] && e.source < best.source) {
        best = e; // rule 4: same kind, lower-sorting source wins, order-independent
      }
    }
    out.push(best);
  }

  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  out.sort((x, y) => cmp(x.source, y.source) || cmp(x.target, y.target) || cmp(x.kind, y.kind));
  return out;
}

/**
 * Build the whole graph.
 *
 * Nodes:
 * - One per file in `input.files` (the vault walk already excludes `sources/`
 *   and `progress/`), id = the vault-relative path.
 * - One per `lessons[]` entry in every module of every course, id =
 *   `<course.dir>/modules/<module.slug>/<lesson.file>`. Validate's `refs` check
 *   guarantees `module.slug` is the directory name, so that path is exact. An
 *   entry whose file is already in `input.files` is the same node, not a second
 *   one.
 * - `kind` by the fixed precedence `home` > `hub` > `lesson` > `note`:
 *   `home.md` at the vault root is `home`; a file a `course.yml` names in its
 *   `hub` field is `hub`; a file a `module.yml` lists in `lessons[]` is
 *   `lesson`; everything else - `todos.md`, `profile.md`, `insights/*` - is
 *   `note`.
 * - `title`: the lesson's manifest `title` for a lesson, the course `title` for
 *   a hub, otherwise the note's first ATX `# ` heading, otherwise its basename
 *   without the `.md`.
 * - `state`: `ghost` when no file exists for the node, `mastered` when it is a
 *   lesson whose manifest `concept` is at level `mastered` in
 *   `mastery.courses[<course slug>]`, `generated` otherwise. Only a lesson is
 *   ever `mastered`.
 * - `group` and `course`: the resolved section id and slug of the course whose
 *   directory contains the node, both null for anything outside a course. A
 *   course in no section (possible only if `resolveGroups` dropped it) gets
 *   `group: null` with its `course` still set.
 * - `route`: null when `state` is `ghost`; otherwise
 *   `#/t/<tenant>/c/<course>/m/<module>/l/<file-without-.md>` for a lesson and
 *   `#/t/<tenant>/n/<vault path>` for every other node, each segment
 *   `encodeURIComponent`d (the vault path keeps its `/` separators).
 * - `in_degree`: the number of distinct nodes that are the `source` of a
 *   DEDUPLICATED edge whose `target` is this node. Computed after `dedupeEdges`,
 *   so each neighbour counts at most once.
 *
 * Edges, before dedup:
 * - `reference`, one per entry of `vault.resolved`: source = the linking file,
 *   target = the resolved path. Broken links are not edges.
 * - `membership`, one per `lessons[]` entry: source = the lesson node, target =
 *   the course's hub node. A course whose `hub` names no file contributes none.
 * - `connection`, from `parseConnects` over each hub's text: source = the hub
 *   that declared it, target = the hub the wikilink resolves to through
 *   `vault.index` (the same resolver the app and validate use - unique basename
 *   wins, ambiguous resolves to nothing). An unresolvable target contributes no
 *   edge and one warning; validate is where it is an error. A target that
 *   resolves back to the declaring hub itself (a self-link) contributes one
 *   warning and no edge - `dedupeEdges` would drop the resulting self-loop
 *   silently otherwise, and the point of the warning is to say so out loud.
 *
 * Output is deterministic: nodes sorted by `id`, edges as `dedupeEdges` leaves
 * them, `groups` in `resolveGroups` order. `warnings` carries
 * `input.groups.warnings` first, then one line per unresolvable connects
 * target, then one line per self-targeting connects bullet, then one line per
 * connects diagnostic - never an error, never a throw.
 */
const encPathSegment = (p: string): string => p.split('/').map(encodeURIComponent).join('/');

/** A lesson manifest entry, wherever it lives, joined back to its course and module. */
interface LessonRef {
  id: string;
  course: CourseNode;
  module: ModuleNode;
  lesson: LessonEntry;
}

const hubIdOf = (course: CourseNode): string | null =>
  course.hub ? `${course.dir}/${course.hub.replace(/^\.\//, '')}` : null;

export function buildGraph(input: GraphInput): GraphResponse {
  const { tenant, files, vault, tree, groups, mastery } = input;

  const fileTextById = new Map<string, string>();
  const fileIds = new Set<string>();
  for (const f of files) {
    fileTextById.set(f.path, f.text);
    fileIds.add(f.path);
  }

  // lesson node id -> the manifest entry that planned it (planned or generated)
  const lessonById = new Map<string, LessonRef>();
  for (const course of tree.courses) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        const id = `${course.dir}/modules/${mod.slug}/${lesson.file}`;
        lessonById.set(id, { id, course, module: mod, lesson });
      }
    }
  }

  // hub node id -> its course, but only when the hub file actually exists as a
  // node - a course.hub naming no real file contributes neither a hub node nor
  // membership edges (its lessons still get nodes, just no hub to attach to)
  const hubIdToCourse = new Map<string, CourseNode>();
  for (const course of tree.courses) {
    const hubId = hubIdOf(course);
    if (hubId && fileIds.has(hubId)) hubIdToCourse.set(hubId, course);
  }

  // course slug -> resolved fill-colour section id
  const groupBySlug = new Map<string, string>();
  for (const g of groups.groups) {
    for (const slug of g.courses) groupBySlug.set(slug, g.id);
  }

  // courses sorted by directory length, longest first, so a node under a
  // nested course directory (never happens today, but the walk does not
  // forbid it) resolves to its most specific owner
  const coursesByDirDepth = [...tree.courses].sort((a, b) => b.dir.length - a.dir.length);
  const ownerOf = (id: string): CourseNode | undefined => coursesByDirDepth.find((c) => id.startsWith(`${c.dir}/`));

  const nodeIds = new Set<string>(fileIds);
  for (const id of lessonById.keys()) nodeIds.add(id);

  const nodes: GraphNode[] = [];
  for (const id of nodeIds) {
    const lessonInfo = lessonById.get(id);
    const owningCourseAsHub = hubIdToCourse.get(id);
    const isHome = id === 'home.md';

    const kind: GraphNodeKind = isHome ? 'home' : owningCourseAsHub ? 'hub' : lessonInfo ? 'lesson' : 'note';

    const owning = lessonInfo?.course ?? owningCourseAsHub ?? ownerOf(id);
    const courseSlug = owning?.slug ?? null;
    const group = courseSlug !== null ? groupBySlug.get(courseSlug) ?? null : null;

    const fileExists = fileIds.has(id);

    let title: string;
    if (lessonInfo) {
      title = lessonInfo.lesson.title;
    } else if (owningCourseAsHub) {
      title = owningCourseAsHub.title;
    } else {
      const text = fileTextById.get(id) ?? '';
      const heading = text.match(/^#\s+(.+)$/m);
      title = heading ? heading[1].trim() : (id.split('/').at(-1) ?? id).replace(/\.md$/, '');
    }

    let state: GraphNodeState;
    if (!fileExists) {
      state = 'ghost';
    } else if (lessonInfo) {
      const level = mastery.courses[lessonInfo.course.slug]?.concepts[lessonInfo.lesson.concept]?.level;
      state = level === 'mastered' ? 'mastered' : 'generated';
    } else {
      state = 'generated';
    }

    let route: string | null;
    if (state === 'ghost') {
      route = null;
    } else if (lessonInfo) {
      const file = encodeURIComponent(lessonInfo.lesson.file.replace(/\.md$/, ''));
      route =
        `#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(lessonInfo.course.slug)}` +
        `/m/${encodeURIComponent(lessonInfo.module.slug)}/l/${file}`;
    } else {
      route = `#/t/${encodeURIComponent(tenant)}/n/${encPathSegment(id)}`;
    }

    nodes.push({ id, title, kind, group, course: courseSlug, state, in_degree: 0, route });
  }

  // --- edges, before dedup ---
  const rawEdges: GraphEdge[] = [];

  for (const [source, targets] of vault.resolved) {
    for (const target of targets) rawEdges.push({ source, target, kind: 'reference' });
  }

  for (const course of tree.courses) {
    const hubId = hubIdOf(course);
    if (!hubId || !fileIds.has(hubId)) continue; // a hub naming no file contributes no membership edges
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        const lessonId = `${course.dir}/modules/${mod.slug}/${lesson.file}`;
        rawEdges.push({ source: lessonId, target: hubId, kind: 'membership' });
      }
    }
  }

  const unresolvedWarnings: string[] = [];
  const selfLinkWarnings: string[] = [];
  const diagnosticWarnings: string[] = [];
  for (const [hubId] of hubIdToCourse) {
    const text = fileTextById.get(hubId) ?? '';
    const block = parseConnects(text);
    for (const entry of block.entries) {
      const target = vault.index.get(entry.target) ?? null;
      if (!target || !nodeIds.has(target)) {
        unresolvedWarnings.push(`${hubId}: meno:connects target "${entry.target}" does not resolve to a note in this vault`);
        continue;
      }
      if (target === hubId) {
        selfLinkWarnings.push(`${hubId}: meno:connects target "${entry.target}" resolves to this hub itself (self-link) - the edge is dropped`);
        continue;
      }
      rawEdges.push({ source: hubId, target, kind: 'connection', reason: entry.reason });
    }
    for (const d of block.diagnostics) {
      diagnosticWarnings.push(d.line > 0 ? `${hubId}:${d.line}: ${d.message}` : `${hubId}: ${d.message}`);
    }
  }

  const edges = dedupeEdges(rawEdges);

  const inDegree = new Map<string, number>();
  for (const e of edges) inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
  for (const n of nodes) n.in_degree = inDegree.get(n.id) ?? 0;

  const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
  nodes.sort((a, b) => cmp(a.id, b.id));

  return {
    tenant,
    nodes,
    edges,
    groups: groups.groups.map((g) => ({ id: g.id, title: g.title })),
    warnings: [...groups.warnings, ...unresolvedWarnings, ...selfLinkWarnings, ...diagnosticWarnings],
  };
}
