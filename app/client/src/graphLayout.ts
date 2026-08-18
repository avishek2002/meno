// The pure half of the graph view: id hashing and seed positions, focus
// resolution, n-hop neighborhood sets, edge stroke widths, the
// no-connections-yet predicate, and fit-to-view maths. A `.ts` file among
// `.tsx` on purpose, the same reason courseList.ts is: the root tsconfig
// compiles app/**/*.ts without the DOM lib, so naming a browser global here
// fails typecheck instead of failing review, and `node --test` covers it
// like the server. No React import, no browser global, no Math.random, no
// Date.now.
import type { GraphEdgeKind } from '../../shared/types.ts';

/** The minimum an edge endpoint needs for neighborhood and dedupe reasoning. */
export interface LayoutEdge {
  source: string;
  target: string;
}

/** hopNeighborhood plus anything that also needs the edge's kind. */
export interface LayoutEdgeWithKind extends LayoutEdge {
  kind: GraphEdgeKind;
}

export interface SeedPosition {
  x: number;
  y: number;
}

export interface FitTransform {
  x: number;
  y: number;
  k: number;
}

/**
 * The single definition of edge stroke width, in svg user-space px
 * (docs/specs/graph.md, "How it behaves" item 3: two weights, thin default
 * and thick connection). GraphPage's canvas `<line>` elements and the
 * legend's preview `<line>` elements both read this object, so the legend
 * can never show a width the canvas does not actually render.
 */
export const EDGE_STROKE_WIDTH: Record<GraphEdgeKind, number> = {
  connection: 3,
  reference: 1,
  membership: 1,
};

// FNV-1a, 32-bit, over the node id's UTF-16 code units. Deterministic: no
// clock, no randomness, same string always yields the same hash.
const FNV_OFFSET_BASIS = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

export function hashId(id: string): number {
  let h = FNV_OFFSET_BASIS;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME);
  }
  return h >>> 0; // unsigned 32-bit
}

/**
 * Deterministic seeding (docs/specs/graph.md invariant 14): the starting
 * angle and radius are a pure function of the node id and the node count, so
 * the same vault lays out identically on every load. Pinned algorithm - do
 * not change the constants without updating the spec.
 */
export function seedPosition(id: string, count: number): SeedPosition {
  const hash = hashId(id);
  const angle = (hash / 2 ** 32) * 2 * Math.PI;
  const radius = 40 + (((hash >>> 16) & 0xffff) / 0xffff) * (60 * Math.sqrt(count));
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}

/** Last path segment, `.md` stripped - the basename form LessonPage and CoursePage emit into `?focus=`. */
function basenameNoExt(id: string): string {
  const slash = id.lastIndexOf('/');
  const base = slash === -1 ? id : id.slice(slash + 1);
  return base.endsWith('.md') ? base.slice(0, -3) : base;
}

/**
 * Focus resolution (docs/specs/graph.md invariant 13): exact node id wins,
 * else a unique basename-without-`.md` match, else a unique match on nodes
 * whose id ends with `/<value>`, else null and the whole graph renders. An
 * empty or absent value is treated as absent, never as a search for "".
 */
export function resolveFocus(value: string | null | undefined, nodeIds: readonly string[]): string | null {
  if (!value) return null;
  if (nodeIds.includes(value)) return value;

  const basenameMatches = nodeIds.filter((id) => basenameNoExt(id) === value);
  if (basenameMatches.length === 1) return basenameMatches[0];

  const suffix = `/${value}`;
  const suffixMatches = nodeIds.filter((id) => id.endsWith(suffix));
  if (suffixMatches.length === 1) return suffixMatches[0];

  return null;
}

/**
 * Every node id reachable from `nodeId` within `hops` edge traversals,
 * including `nodeId` itself - the set to keep at full opacity; everything
 * else dims. Edges are treated as undirected, matching invariant 4.
 */
export function hopNeighborhood(nodeId: string, edges: readonly LayoutEdge[], hops: number): Set<string> {
  const visited = new Set<string>([nodeId]);
  let frontier = new Set<string>([nodeId]);
  for (let h = 0; h < hops && frontier.size > 0; h++) {
    const next = new Set<string>();
    for (const e of edges) {
      if (frontier.has(e.source) && !visited.has(e.target)) next.add(e.target);
      if (frontier.has(e.target) && !visited.has(e.source)) next.add(e.source);
    }
    for (const id of next) visited.add(id);
    frontier = next;
  }
  return visited;
}

/**
 * True when the graph has no `connection` edge at all - the state the
 * maintainer's real vault is in on first run, before any `## Connects to`
 * block has been authored. Distinct from an empty graph (zero nodes, its own
 * onboarding empty state): this predicate only fires once there is
 * something to look at, and the caller is responsible for also checking
 * that nodes exist.
 */
export function hasNoConnectionEdges(edges: readonly LayoutEdgeWithKind[]): boolean {
  return edges.every((e) => e.kind !== 'connection');
}

/**
 * Fit-to-view maths (docs/specs/graph.md invariant 14 - deterministic, no
 * DOM, no clock): given the settled node positions and the fixed square
 * viewBox size the canvas draws at, compute the translate+uniform-scale
 * transform that brings every point into view with a margin on each side.
 * Never scales up past 1 - a small graph keeps its current 1:1 layout, only
 * a graph wider or taller than the viewBox shrinks to fit. Pure: same input
 * always yields the same output, so a caller applying this once per
 * settled-position set stays deterministic across loads.
 */
/** One row per group toggle (docs/specs/graph.md, "How it behaves" item 2). */
export interface GraphGroupCount {
  /** a `groups.yml`-resolved group id, or null for the synthetic "no course group" bucket */
  id: string | null;
  title: string;
  count: number;
}

/**
 * One row per legend/filter toggle: every group in the server's own order,
 * each with how many nodes currently resolve to it, plus a synthetic
 * "Ungrouped" row - but only when at least one node has `group === null`
 * (the tenant home note and `todos.md` carry no course group; a vault where
 * every node sits in a course gets no such row at all). Counted over the
 * full node list handed in, so a caller passing the unfiltered graph always
 * shows what a toggle is about to hide, never what filtering already hid.
 */
export function groupCounts(
  nodes: readonly { group: string | null }[],
  groups: readonly { id: string; title: string }[],
): GraphGroupCount[] {
  const rows: GraphGroupCount[] = groups.map((g) => ({
    id: g.id,
    title: g.title,
    count: nodes.filter((n) => n.group === g.id).length,
  }));
  const ungroupedCount = nodes.filter((n) => n.group === null).length;
  if (ungroupedCount > 0) rows.push({ id: null, title: 'Ungrouped', count: ungroupedCount });
  return rows;
}

/** One row per search result - GraphPage's search box (UI-12). */
export interface TitleMatch {
  id: string;
  title: string;
}

const SEARCH_RESULT_LIMIT = 8;

/**
 * Case-insensitive substring search over node titles for the graph page's
 * search box (UI-12) - the graph has no server-side search, so this stays a
 * pure client-side filter capped at SEARCH_RESULT_LIMIT results, the same
 * way an unbounded query would otherwise flood the result list and the tab
 * order with buttons. An empty or whitespace-only query matches nothing,
 * the same "empty means absent" rule resolveFocus uses for `?focus=`.
 * Picking a result still resolves through resolveFocus/`?focus=` at the
 * call site - this function only narrows candidates, it does not focus one.
 */
export function searchNodesByTitle(
  nodes: readonly { id: string; title: string }[],
  query: string,
  limit: number = SEARCH_RESULT_LIMIT,
): TitleMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const matches: TitleMatch[] = [];
  for (const n of nodes) {
    if (!n.title.toLowerCase().includes(q)) continue;
    matches.push({ id: n.id, title: n.title });
    if (matches.length >= limit) break;
  }
  return matches;
}

export interface FilteredSubgraph<N, E> {
  nodes: N[];
  edges: E[];
}

/**
 * The group filter's simulation-level cut: a hidden group has to disappear
 * from the d3-force input, not just from the paint, or the physics keeps
 * fighting over nodes nobody can see and the visible layout comes out wrong.
 * Returns the nodes whose `group` (null included, for the ungrouped bucket)
 * is in `visibleGroupIds`, and only the edges whose BOTH endpoints survive
 * that cut - an edge with exactly one hidden endpoint is dropped entirely,
 * never drawn dangling toward a node that is not there.
 */
export function filterGraphByGroups<N extends { id: string; group: string | null }, E extends LayoutEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  visibleGroupIds: ReadonlySet<string | null>,
): FilteredSubgraph<N, E> {
  const visibleNodes = nodes.filter((n) => visibleGroupIds.has(n.group));
  const visibleIds = new Set(visibleNodes.map((n) => n.id));
  const visibleEdges = edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target));
  return { nodes: visibleNodes, edges: visibleEdges };
}

/**
 * The id of every node that is a `source` or `target` of at least one edge
 * (either direction, since edges are undirected - invariant 4). Feeds
 * fit-to-view's node filter below: a node with no edge at all has nothing
 * pulling it toward the rest of the layout during the physics tick loop, so
 * it stays wherever `seedPosition` put it and, empirically, `forceManyBody`'s
 * repulsion pushes it further out still - one disconnected node at the
 * corpus this was measured against (200 nodes, 35 with zero edges) settled
 * over 2800 svg user-space units from the connected majority's own settled
 * span of roughly 700. Fitting the view to every point let that handful of
 * edgeless nodes dictate the zoom for the whole graph, shrinking the
 * connected majority into about 6% of the canvas (UI-12 v2).
 */
export function connectedNodeIds(edges: readonly LayoutEdge[]): Set<string> {
  const ids = new Set<string>();
  for (const e of edges) {
    ids.add(e.source);
    ids.add(e.target);
  }
  return ids;
}

export function fitToViewTransform(points: readonly SeedPosition[], viewSize: number, margin: number): FitTransform {
  if (points.length === 0) return { x: 0, y: 0, k: 1 };
  if (points.length === 1) return { x: -points[0].x, y: -points[0].y, k: 1 };

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }

  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const width = maxX - minX;
  const height = maxY - minY;
  const available = Math.max(viewSize - 2 * margin, 1);
  // never zoom in past 1 - fit-to-view only ever shrinks an over-wide graph
  const k = Math.min(1, available / Math.max(width, height, 1e-6));

  return { x: -centerX * k, y: -centerY * k, k };
}
