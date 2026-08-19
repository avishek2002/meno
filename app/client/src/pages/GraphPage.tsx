// #/t/:tenant/graph - every note in the tenant vault as one picture, joined to
// the ledger. Physics from d3-force, dynamically imported exactly as
// mermaid.tsx imports mermaid, so a learner who never opens this page never
// downloads it. React-rendered SVG, not canvas, for free hit testing, CSS
// theming, and real elements in the accessibility tree.
//
// Determinism (docs/specs/graph.md invariant 14): every node starts at
// graphLayout.seedPosition(id, count) - a pure function of the id and the
// node count, no clock, no Math.random anywhere in this file or graphLayout.ts.
// d3-force never introduces randomness of its own here because every node
// already has an x/y before the simulation starts (d3-force only randomizes
// nodes whose position is undefined). The simulation is stepped a fixed
// number of times synchronously, with no requestAnimationFrame loop, so the
// same graph lays out identically on every load; only a manual drag (session
// only, never persisted) moves a node after that.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { navigate } from '../router.tsx';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { InfoTip } from '../components/InfoTip';
import {
  EDGE_STROKE_WIDTH,
  connectedNodeIds,
  filterGraphByGroups,
  fitToViewTransform,
  groupCounts,
  hasNoConnectionEdges,
  hopNeighborhood,
  resolveFocus,
  searchNodesByTitle,
  seedPosition,
} from '../graphLayout.ts';
import type { GraphGroupCount, TitleMatch } from '../graphLayout.ts';
import type { GraphEdge, GraphNode, GraphNodeState, GraphResponse } from '../../../shared/types.ts';
import { tenantHref, graphHref } from '../../../shared/routeHrefs.ts';

interface SimNode extends SimulationNodeDatum {
  id: string;
  inDegree: number;
}

interface SimLink extends SimulationLinkDatum<SimNode> {
  kind: GraphEdge['kind'];
}

interface Point {
  x: number;
  y: number;
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

const VIEW_SIZE = 900; // svg user-space width/height; the viewBox is centered on the origin
const FIT_MARGIN = 48; // px of breathing room fit-to-view leaves on each side of the settled graph
const TICKS = 300; // fixed manual step count - deterministic, no animation timer
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const DRAG_THRESHOLD = 4; // px of pointer movement before a pointerdown+up counts as a drag, not a click
const HOVER_HOPS = 1;
const FOCUS_HOPS = 2;
const GROUP_PALETTE_SIZE = 8; // app/client/src/styles.css defines --graph-group-0..7
const MIN_NODE_RADIUS = 7; // svg user-space glyph floor, named explicitly per UI-12's "enforce a minimum radius"
const MAX_NODE_RADIUS = 24;
// Half of a 24x24 CSS px hit target (WCAG 2.5.8, "target size minimum"): what
// the invisible padding circle below solves for, never the visible glyph -
// UI-12 measured a 2px rendered diameter at 200 nodes because fit-to-view's
// zoom-out and the viewBox-to-CSS ratio both shrink the glyph, and growing
// the glyph enough to survive that compounded shrink would blow past
// MAX_NODE_RADIUS ("without growing the glyph itself").
const HIT_TARGET_RADIUS_CSS = 12;
// A node auto-labels once its glyph clears this radius (in_degree 4, see
// nodeRadius) regardless of hover or focus; every node in the current
// highlight set (hover's 1-hop or ?focus='s 2-hop neighbourhood) labels too,
// so a focused view is self-describing even when every member is small -
// UI-12.
const LABEL_RADIUS_THRESHOLD = 14;
// Size-threshold labels only auto-render once zoomed in at least this far -
// at the maintainer's real corpus the default fit lands around k=0.6, well
// above this, but zooming out again (wheel) hides them rather than
// smearing text across a shrunk cluster. Highlighted-neighbourhood labels
// ignore this: a learner who explicitly asked to see one node's
// neighbourhood should see it labelled regardless of zoom (UI-12 v2).
const AUTO_LABEL_MIN_ZOOM = 0.35;
// Minimum CSS px between two label anchors before the lower-priority one is
// dropped (UI-12 v2's "collision avoidance") - a cheap greedy
// nearest-neighbour suppression rather than a real text-layout solver,
// sized for the corpus that motivated this finding (9 always-eligible hub
// labels). It will not prevent every overlap between two very long titles,
// but it stops the dense many-label smear the finding measured.
const MIN_LABEL_SPACING_CSS = 72;

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function nodeRadius(inDegree: number): number {
  return Math.min(MAX_NODE_RADIUS, MIN_NODE_RADIUS + Math.sqrt(inDegree) * 4);
}

function groupColorVar(groupId: string | null, groupIndex: Map<string, number>): string {
  if (groupId === null) return 'var(--text-muted)';
  const i = groupIndex.get(groupId);
  return i === undefined ? 'var(--text-muted)' : `var(--graph-group-${i % GROUP_PALETTE_SIZE})`;
}

interface NodeVisual {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash?: string;
  opacity: number;
}

// The node-style channel: ghost (planned, no file), outline/"generated"
// (written, not mastered), solid/"mastered" - docs/specs/graph.md, "How it
// behaves" item 2.
function nodeVisual(state: GraphNodeState, color: string): NodeVisual {
  if (state === 'ghost') return { fill: 'none', stroke: color, strokeWidth: 1.5, dash: '3 2', opacity: 0.85 };
  if (state === 'mastered') return { fill: color, stroke: color, strokeWidth: 1.5, opacity: 1 };
  return { fill: 'var(--bg-raised)', stroke: color, strokeWidth: 2, opacity: 1 };
}

function stateLabel(state: GraphNodeState): string {
  if (state === 'ghost') return 'planned - no file yet, not clickable';
  if (state === 'mastered') return 'mastered';
  return 'written, not yet mastered';
}

interface TooltipInfo {
  nodeId: string;
  title: string;
  state: GraphNodeState;
  left: number;
  top: number;
}

const GROUP_SWATCH_INDEXES = Array.from({ length: GROUP_PALETTE_SIZE }, (_, i) => i);

// The legend and the group filter are the same concern (docs/specs/graph.md,
// "How it behaves" item 2): the legend names what a fill colour means, the
// filter turns that colour on and off, so one toggle carries both - a real
// checkbox with a label, not a clickable div, wired to a count computed over
// the FULL node list so it always shows what turning the toggle off is about
// to hide, never what an earlier toggle already hid.
function GraphLegend({
  groupCounts,
  groupIndex,
  visibleGroupIds,
  onToggleGroup,
}: {
  groupCounts: GraphGroupCount[];
  groupIndex: Map<string, number>;
  visibleGroupIds: ReadonlySet<string | null>;
  onToggleGroup: (id: string | null) => void;
}) {
  return (
    <div className="graph-legend" aria-label="Legend and group filter">
      <div className="graph-legend-channel">
        <h3>Group (fill colour)</h3>
        <p className="graph-legend-note">Turn a group off to hide it from the graph.</p>
        <ul>
          {groupCounts.map((g) => {
            const checkboxId = `graph-group-toggle-${g.id ?? 'ungrouped'}`;
            const color = groupColorVar(g.id, groupIndex);
            return (
              <li key={checkboxId}>
                <input type="checkbox" id={checkboxId} checked={visibleGroupIds.has(g.id)} onChange={() => onToggleGroup(g.id)} />
                <label htmlFor={checkboxId} className="graph-legend-toggle-label">
                  <span className="graph-legend-swatch" style={{ background: color }} />
                  {g.title} ({g.count})
                </label>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="graph-legend-channel">
        <h3>State (node style)</h3>
        <ul>
          <li>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            Ghost - planned, no file yet
          </li>
          <li>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="var(--bg-raised)" stroke="var(--text-muted)" strokeWidth="2" />
            </svg>
            Written, not yet mastered
          </li>
          <li>
            <svg width="16" height="16" aria-hidden="true">
              <circle cx="8" cy="8" r="6" fill="var(--text-muted)" stroke="var(--text-muted)" />
            </svg>
            Mastered
          </li>
        </ul>
      </div>
      <div className="graph-legend-channel">
        <h3>Incoming links (size)</h3>
        <p className="graph-legend-note">Bigger nodes are pointed at by more other notes.</p>
      </div>
      <div className="graph-legend-channel">
        <h3>Edges</h3>
        <ul>
          <li>
            <svg width="24" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="24" y2="5" stroke="var(--accent)" strokeWidth={EDGE_STROKE_WIDTH.connection} />
            </svg>
            Connection - a course you said connects to another
          </li>
          <li>
            <svg width="24" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="24" y2="5" stroke="var(--border)" strokeWidth={EDGE_STROKE_WIDTH.reference} />
            </svg>
            Reference or course structure
          </li>
        </ul>
      </div>
    </div>
  );
}

export function GraphPage({ tenant, focus }: { tenant: string; focus?: string }) {
  const { data, error, loading, revalidate } = useResource<GraphResponse>(`/api/v1/${encodeURIComponent(tenant)}/graph`);
  useRegisterRevalidate(revalidate);

  const [positions, setPositions] = useState<Map<string, Point> | null>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [tooltip, setTooltip] = useState<TooltipInfo | null>(null);
  const [hasCentered, setHasCentered] = useState<string | null>(null); // the focus value already centered on
  const [hasFitted, setHasFitted] = useState(false); // whether fit-to-view has already run for this data load
  // null means "no override yet": every group is visible, the default this
  // resets to on every fresh fetch (design point 3 - the graph must look
  // exactly as it does today on first load, including after an explicit
  // re-read). Deliberately component state only, never the URL (design
  // point 10 - nothing links into a filtered graph).
  const [groupOverride, setGroupOverride] = useState<Set<string | null> | null>(null);

  const svgElRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; startPos: Point; moved: boolean } | null>(
    null,
  );
  const suppressClickRef = useRef<string | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());

  // CSS px per svg user-space unit at scale 1 (transform.k not yet
  // applied), tracked via ResizeObserver in setSvgRef below - the other
  // half of the hit-area math (UI-12). The viewBox is square but the
  // element is not (`width: 100%`, `height: 70vh`), and with no explicit
  // preserveAspectRatio the default `xMidYMid meet` scales uniformly by
  // whichever of width/VIEW_SIZE or height/VIEW_SIZE is smaller, letterboxing
  // the other axis - using width alone would silently overstate the hit
  // radius on any viewport where height is the binding dimension. Defaults
  // to 1 (a 1:1 guess) until the observer's first callback fires, which only
  // affects one initial paint of an invisible circle.
  const [baseScalePxPerUnit, setBaseScalePxPerUnit] = useState<number>(1);
  // The one node currently in the tab sequence (UI-12's roving-focus entry
  // point) - every other node stays tabIndex={-1} and moves via arrow keys
  // (onNodeKeyDown/moveActive below), so Tab passes over the whole node
  // group in a single stop instead of the 94 stops it used to take.
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [legendOpen, setLegendOpen] = useState<boolean>(true);

  // The counts the legend/filter panel shows - always over the FULL,
  // unfiltered node list (graphLayout.groupCounts), so a toggle always shows
  // what it is about to hide rather than what an earlier toggle already hid.
  const legendGroupCounts = useMemo(() => (data ? groupCounts(data.nodes, data.groups) : []), [data]);

  // Every group visible, including the ungrouped bucket only if it has any
  // members - the identity filter a fresh load renders under.
  const defaultVisibleGroupIds = useMemo(() => {
    const ids = new Set<string | null>((data?.groups ?? []).map((g) => g.id));
    if (data?.nodes.some((n) => n.group === null)) ids.add(null);
    return ids;
  }, [data]);

  // A fresh fetch always starts from "everything visible" - any earlier
  // filter choice was scoped to the response it was made against.
  useEffect(() => {
    setGroupOverride(null);
  }, [data]);

  const visibleGroupIds = groupOverride ?? defaultVisibleGroupIds;

  const toggleGroup = useCallback(
    (id: string | null): void => {
      setGroupOverride((prev) => {
        const next = new Set(prev ?? defaultVisibleGroupIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [defaultVisibleGroupIds],
  );

  // The subgraph actually fed to physics and paint (docs/specs/graph.md, this
  // change): a hidden node is cut here, before the simulation ever sees it,
  // not just dimmed or skipped at render time - graphLayout.filterGraphByGroups
  // also drops every edge with a now-missing endpoint.
  const visibleGraph = useMemo(() => {
    if (!data) return null;
    return filterGraphByGroups(data.nodes, data.edges, visibleGroupIds);
  }, [data, visibleGroupIds]);

  // Physics: computed fresh whenever the visible subgraph changes - a fresh
  // response, or a group toggled on or off - torn down on unmount. Manual
  // ticking (no timer) keeps the result reproducible.
  useEffect(() => {
    if (!visibleGraph) return;
    let cancelled = false;
    setPositions(null);
    setHasFitted(false);
    void (async () => {
      const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = await import('d3-force');
      if (cancelled) return;
      const count = visibleGraph.nodes.length;
      const simNodes: SimNode[] = visibleGraph.nodes.map((n) => {
        const seed = seedPosition(n.id, count);
        return { id: n.id, inDegree: n.in_degree, x: seed.x, y: seed.y };
      });
      const simLinks: SimLink[] = visibleGraph.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
      // The two-generic overload of forceSimulation (nodes + a link datum
      // type) has to be selected with an explicit type argument - it cannot
      // be inferred from nodesData alone, since links are attached later.
      const sim: Simulation<SimNode, SimLink> = forceSimulation<SimNode, SimLink>(simNodes)
        .force(
          'link',
          forceLink<SimNode, SimLink>(simLinks)
            .id((d) => d.id)
            .distance(70)
            .strength(0.25),
        )
        .force('charge', forceManyBody<SimNode>().strength(-140))
        .force('center', forceCenter<SimNode>(0, 0))
        .force(
          'collide',
          forceCollide<SimNode>((d) => nodeRadius(d.inDegree) + 6),
        )
        .stop();
      for (let i = 0; i < TICKS; i++) sim.tick();
      if (cancelled) return;
      const next = new Map<string, Point>();
      for (const n of simNodes) next.set(n.id, { x: n.x ?? 0, y: n.y ?? 0 });
      setPositions(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [visibleGraph]);

  const nodeIds = useMemo(() => data?.nodes.map((n) => n.id) ?? [], [data]);
  const resolvedFocus = useMemo(() => resolveFocus(focus, nodeIds), [focus, nodeIds]);

  const groupIndex = useMemo(() => new Map((data?.groups ?? []).map((g, i) => [g.id, i])), [data]);

  // Keeps the roving-focus entry point valid across a fresh fetch or a
  // group toggle (UI-12): a resolved ?focus= wins when it survived the
  // filter, else the previous active node if it is still visible, else the
  // first visible node - never null while any node is on screen.
  useEffect(() => {
    if (!visibleGraph || visibleGraph.nodes.length === 0) {
      setActiveNodeId(null);
      return;
    }
    setActiveNodeId((prev) => {
      if (resolvedFocus && visibleGraph.nodes.some((n) => n.id === resolvedFocus)) return resolvedFocus;
      if (prev && visibleGraph.nodes.some((n) => n.id === prev)) return prev;
      return visibleGraph.nodes[0].id;
    });
  }, [visibleGraph, resolvedFocus]);

  // Arrow-key roving focus (UI-12): walks the visible node list one at a
  // time in render order and imperatively focuses the DOM node, since a
  // tabIndex={-1} element is still focusable via .focus() even before React
  // has committed the new tabIndex={0} for it.
  const moveActive = useCallback(
    (delta: number): void => {
      if (!visibleGraph || visibleGraph.nodes.length === 0) return;
      const order = visibleGraph.nodes;
      const currentId = activeNodeId ?? order[0].id;
      const idx = order.findIndex((n) => n.id === currentId);
      const nextIdx = idx === -1 ? 0 : (idx + delta + order.length) % order.length;
      const nextId = order[nextIdx].id;
      setActiveNodeId(nextId);
      nodeRefs.current.get(nextId)?.focus();
    },
    [visibleGraph, activeNodeId],
  );

  // The search box's candidate list (UI-12) - a plain substring filter over
  // titles, capped in searchNodesByTitle. Picking or submitting a match
  // navigates through the same `?focus=` deep link LessonPage/CoursePage
  // use, so centering and the focus-neighbourhood highlight come from the
  // one existing code path rather than a second one built for search.
  const searchMatches = useMemo(() => (data ? searchNodesByTitle(data.nodes, searchQuery) : []), [data, searchQuery]);

  // Fit-to-view once, the first time settled positions are available for a
  // load with no incoming focus - never re-fired by a later pan, zoom, or
  // drag, and re-armed whenever the visible subgraph changes (the physics
  // effect above resets hasFitted on every new fetch AND every group toggle,
  // so a filter change refits the remaining subgraph to fill the frame
  // instead of sitting wherever it settled inside the old bounds). At the
  // maintainer's real node count, seedPosition's radius exceeds the fixed
  // VIEW_SIZE viewBox, so without this the graph opens mostly off-screen.
  // Skipped when a focus is resolved: the centering effect below already
  // centers on that one node, which matters more here than the whole graph
  // being visible at once - and that priority holds during filtering too,
  // since neither effect's dependencies change because of it.
  //
  // Fits to CONNECTED nodes only (UI-12 v2) - a node with no edge at all
  // never gets pulled toward the rest of the layout by the tick loop above,
  // so it drifts out under pure repulsion and, left in the fit calculation,
  // drags the zoom out to include it: measured on the maintainer's vault,
  // 35 of 200 nodes are edgeless and the fit including them left the
  // connected majority in about 6% of the canvas. A totally edgeless graph
  // (connected.size === 0) falls back to fitting every point rather than an
  // empty fit.
  useEffect(() => {
    if (!positions || resolvedFocus || !visibleGraph) return;
    if (hasFitted) return;
    const connected = connectedNodeIds(visibleGraph.edges);
    const fitPoints = connected.size > 0 ? [...positions.entries()].filter(([id]) => connected.has(id)).map(([, p]) => p) : [...positions.values()];
    const fit = fitToViewTransform(fitPoints, VIEW_SIZE, FIT_MARGIN);
    setTransform({ x: fit.x, y: fit.y, k: clamp(fit.k, MIN_ZOOM, MAX_ZOOM) });
    setHasFitted(true);
  }, [positions, resolvedFocus, hasFitted, visibleGraph]);

  // Center the view on the focused node once, the first time both the focus
  // value and the laid-out positions are available - never re-fired by a
  // later pan or drag, and re-armed only when the focus value itself changes
  // (route from LessonPage/CoursePage, or the user editing the URL).
  //
  // The rendered transform is `translate(x y) scale(k)`, which scales a
  // point BEFORE translating it (screenPos = pos*k + transform), so putting
  // a node at the origin needs `x = -pos.x * k`, not `-pos.x` (UI-12 v2 bug
  // found while verifying search: this was already wrong for any existing
  // `?focus=` deep link whenever fit-to-view had produced k != 1, and got
  // far more visible once the fit fix above made the default k something
  // other than the old ~0.2 - a search hit on a node hundreds of user-space
  // units from the origin landed clipped near the canvas edge instead of
  // centered).
  useEffect(() => {
    if (!resolvedFocus || !positions) return;
    if (hasCentered === resolvedFocus) return;
    const pos = positions.get(resolvedFocus);
    if (!pos) return;
    setTransform((t) => ({ ...t, x: -pos.x * t.k, y: -pos.y * t.k }));
    setHasCentered(resolvedFocus);
  }, [resolvedFocus, positions, hasCentered]);

  // Non-passive wheel listener: React attaches wheel handlers passively by
  // default, which silently drops preventDefault - attach natively instead
  // so zooming does not also scroll the page.
  const setSvgRef = useCallback((el: SVGSVGElement | null) => {
    svgElRef.current = el;
    if (!el) return;
    const onWheelNative = (e: WheelEvent): void => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setTransform((t) => ({ ...t, k: clamp(t.k * factor, MIN_ZOOM, MAX_ZOOM) }));
    };
    el.addEventListener('wheel', onWheelNative, { passive: false });
    // Tracks the SVG's rendered CSS size so the hit-area padding (UI-12)
    // can convert a 24 CSS px target into the right svg user-space radius
    // regardless of viewport size or how far fit-to-view has zoomed out.
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setBaseScalePxPerUnit(Math.min(rect.width, rect.height) / VIEW_SIZE);
    });
    observer.observe(el);
    return () => {
      el.removeEventListener('wheel', onWheelNative);
      observer.disconnect();
    };
  }, []);

  function clientDeltaToWorld(dxPx: number, dyPx: number): Point {
    const rect = svgElRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const scale = VIEW_SIZE / rect.width;
    return { x: (dxPx * scale) / transform.k, y: (dyPx * scale) / transform.k };
  }

  function onBackgroundPointerDown(e: ReactPointerEvent<SVGSVGElement>): void {
    panRef.current = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startTx: transform.x, startTy: transform.y };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onBackgroundPointerMove(e: ReactPointerEvent<SVGSVGElement>): void {
    const p = panRef.current;
    if (!p || p.pointerId !== e.pointerId) return;
    const d = clientDeltaToWorld(e.clientX - p.startX, e.clientY - p.startY);
    setTransform((t) => ({ ...t, x: p.startTx + d.x, y: p.startTy + d.y }));
  }

  function onBackgroundPointerUp(e: ReactPointerEvent<SVGSVGElement>): void {
    if (panRef.current?.pointerId === e.pointerId) panRef.current = null;
  }

  function onNodePointerDown(e: ReactPointerEvent<SVGGElement>, nodeId: string): void {
    e.stopPropagation();
    const pos = positions?.get(nodeId);
    if (!pos) return;
    dragRef.current = { id: nodeId, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, startPos: pos, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onNodePointerMove(e: ReactPointerEvent<SVGGElement>): void {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    if (Math.abs(e.clientX - d.startX) > DRAG_THRESHOLD || Math.abs(e.clientY - d.startY) > DRAG_THRESHOLD) d.moved = true;
    const delta = clientDeltaToWorld(e.clientX - d.startX, e.clientY - d.startY);
    setPositions((prev) => {
      if (!prev) return prev;
      const next = new Map(prev);
      next.set(d.id, { x: d.startPos.x + delta.x, y: d.startPos.y + delta.y });
      return next;
    });
    // Keep the tooltip attached to the node while it is being dragged -
    // otherwise left/top stay pinned to where the pointer first entered and
    // visibly separate from the node as it moves.
    if (tooltip && tooltip.nodeId === d.id) {
      const r = e.currentTarget.getBoundingClientRect();
      setTooltip((t) => (t ? { ...t, left: r.left + r.width / 2, top: r.top } : t));
    }
  }

  function onNodePointerUp(e: ReactPointerEvent<SVGGElement>): void {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (d.moved) suppressClickRef.current = d.id;
  }

  // A drag (pointer moved past DRAG_THRESHOLD) sets suppressClickRef on
  // pointerup; the click that the browser fires right after is then
  // swallowed here instead of navigating. Ghost nodes never call this - they
  // have no route, so activate() is a no-op for them regardless.
  function activateNode(node: GraphNode): void {
    if (!node.route) return;
    if (suppressClickRef.current === node.id) {
      suppressClickRef.current = null;
      return;
    }
    navigate(node.route);
  }

  function onNodeKeyDown(e: ReactKeyboardEvent<SVGGElement>, node: GraphNode): void {
    if (e.key === 'Enter' || e.key === ' ') {
      if (!node.route) return;
      e.preventDefault();
      activateNode(node);
      return;
    }
    // Roving focus (UI-12): arrow keys walk the visible node list one at a
    // time instead of Tab - a keyboard probe used to need 104 Tab presses
    // to leave the node set; now Tab passes over the whole group in one
    // stop and arrow keys do the within-group movement instead.
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      moveActive(1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      moveActive(-1);
    }
  }

  function showTooltip(e: { currentTarget: Element }, node: GraphNode): void {
    const r = e.currentTarget.getBoundingClientRect();
    setHoveredId(node.id);
    setTooltip({ nodeId: node.id, title: node.title, state: node.state, left: r.left + r.width / 2, top: r.top });
  }

  function hideTooltip(): void {
    setHoveredId(null);
    setTooltip(null);
  }

  // Both the search box and (deferred to the router) the "Show in graph"
  // links on LessonPage/CoursePage drive this same `?focus=` path - UI-12's
  // "reusing the same resolve-focus path the existing ?focus= deep link
  // uses" - so centering, highlighting, and now labelling all come from the
  // one resolveFocus/resolvedFocus flow above rather than a second one.
  function focusNodeById(id: string): void {
    navigate(graphHref(tenant, id));
    setSearchQuery('');
  }

  function onSearchSubmit(e: ReactFormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    const exact = searchMatches.find((m: TitleMatch) => m.title.toLowerCase() === q);
    const match = exact ?? searchMatches[0];
    if (match) focusNodeById(match.id);
  }

  if (loading && !data) return <AsyncStatus message="Loading graph..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load graph"
        message={`The knowledge graph for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: tenantHref(tenant) }]}
      />
    );
  }
  if (!data || !visibleGraph) return null;
  if (data.nodes.length === 0) {
    return (
      <EmptyState
        headingLevel="h1"
        title={`No graph yet for ${tenant}`}
        body="Once your vault has notes, they will appear here as a picture of how your learning connects."
      />
    );
  }
  if (!positions) return <AsyncStatus message="Laying out graph..." />;

  // The highlight set: the hovered node's 1-hop neighborhood while hovering,
  // else the focused node's 2-hop neighborhood while a focus is resolved,
  // else null - which the render below reads as "dim nothing". Walked over
  // the VISIBLE edge set, not the full one: a path that only exists through a
  // currently-hidden node must not light up two visible nodes as neighbors.
  const highlight = hoveredId
    ? hopNeighborhood(hoveredId, visibleGraph.edges, HOVER_HOPS)
    : resolvedFocus
      ? hopNeighborhood(resolvedFocus, visibleGraph.edges, FOCUS_HOPS)
      : null;

  const half = VIEW_SIZE / 2;
  // Deliberately the FULL, unfiltered edge set (docs/specs/graph.md, this
  // change) - this notice means "no connection edge has been AUTHORED", not
  // "none is currently visible". If the group filter hides the last
  // connection edge, this must stay false: telling the maintainer to run a
  // second-brain sweep for edges that already exist would be a lie.
  const noConnectionsYet = hasNoConnectionEdges(data.edges);
  const nothingVisible = visibleGraph.nodes.length === 0;
  // Rendered CSS px per svg user-space unit at the current zoom - see
  // HIT_TARGET_RADIUS_CSS above. transform.k is always >= MIN_ZOOM (0.2), so
  // this is never zero.
  const pxPerUnit = baseScalePxPerUnit * transform.k;

  // Which nodes actually get a text label this frame (UI-12 v2). The exact
  // hovered/focused node - the one thing a hover or a search hit is
  // actually about - always gets a label, full stop. Everything else
  // (its highlighted neighbours, and any large node past AUTO_LABEL_MIN_ZOOM)
  // is greedily accepted anchor-first, then highlighted-before-large, then
  // largest-first, skipping any candidate whose anchor lands within
  // MIN_LABEL_SPACING_CSS of one already accepted. Highlighted neighbours do
  // NOT bypass spacing the way the anchor does: a hub's 2-hop neighbourhood
  // can be most of the graph (measured: focusing one well-connected course
  // hub put 68 of 200 nodes in the highlight set), and unconditionally
  // labelling all of them recreates exactly the smear this exists to fix.
  const labelIds = new Set<string>();
  {
    const anchorId = hoveredId ?? resolvedFocus ?? null;
    const anchorPos = anchorId ? positions.get(anchorId) : undefined;
    const accepted: Point[] = [];
    if (anchorPos) {
      labelIds.add(anchorId!);
      accepted.push(anchorPos);
    }
    const candidates = visibleGraph.nodes
      .map((node) => {
        if (node.id === anchorId) return null;
        const pos = positions.get(node.id);
        if (!pos) return null;
        const inHighlight = highlight ? highlight.has(node.id) : false;
        const eligible = inHighlight || (nodeRadius(node.in_degree) >= LABEL_RADIUS_THRESHOLD && transform.k >= AUTO_LABEL_MIN_ZOOM);
        if (!eligible) return null;
        return { id: node.id, pos, inHighlight, r: nodeRadius(node.in_degree) };
      })
      .filter((c): c is { id: string; pos: Point; inHighlight: boolean; r: number } => c !== null)
      .sort((a, b) => Number(b.inHighlight) - Number(a.inHighlight) || b.r - a.r);
    for (const c of candidates) {
      const tooClose = accepted.some((p) => Math.hypot(c.pos.x - p.x, c.pos.y - p.y) * pxPerUnit < MIN_LABEL_SPACING_CSS);
      if (tooClose) continue;
      accepted.push(c.pos);
      labelIds.add(c.id);
    }
  }

  return (
    <section className="graph-page">
      <h1 aria-labelledby="graph-heading">
        <span id="graph-heading">Graph</span> <InfoTip entry="graphView" />
      </h1>
      {data.warnings.length > 0 && (
        <div className="warnings-box">
          {data.warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}
      {noConnectionsYet && (
        <p className="notice">
          No cross-course connections have been authored yet, so the thick accent link this view exists to show is
          absent. Run a <code>second-brain</code> sweep to add <code>## Connects to</code> blocks to your course hubs,
          and they will appear here.
        </p>
      )}
      <form className="graph-search" role="search" onSubmit={onSearchSubmit}>
        <label htmlFor="graph-search-input">Find a note by title</label>
        <div className="graph-search-row">
          <input
            id="graph-search-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title..."
            autoComplete="off"
            aria-describedby="graph-search-hint"
          />
          <button type="submit">Go</button>
        </div>
        <span id="graph-search-hint" className="graph-visually-hidden">
          Press enter, or choose a result below, to centre and highlight that note in the graph.
        </span>
        {searchQuery.trim().length > 0 && (
          <ul className="graph-search-results">
            {searchMatches.length === 0 ? (
              <li className="graph-search-empty">No notes match &quot;{searchQuery.trim()}&quot;</li>
            ) : (
              searchMatches.map((m: TitleMatch) => (
                <li key={m.id}>
                  <button type="button" onClick={() => focusNodeById(m.id)}>
                    {m.title}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </form>
      <a href="#graph-legend-panel" className="graph-skip-link">
        Skip past graph nodes
      </a>
      <div className="graph-canvas-wrap">
        {/* Its own bordered box (UI-12 v2), separate from the legend column,
            so the drawing area reads as visually distinct from the legend
            rather than both looking like they share one backdrop - see
            graph.css: the base sheet's canvas background/border moved here
            from graph-canvas-wrap, which is now a bare flex row. */}
        <div className="graph-canvas">
          {nothingVisible ? (
            // All groups toggled off (design point 6): the existing empty
            // state, not a blank canvas and not a crash. The legend/filter
            // panel stays rendered below so a group can be turned back on -
            // there is no other way back in, since filter state is component
            // state only (design point 10, no URL).
            <EmptyState
              title="No groups selected"
              body="Every course group is turned off in the legend and filter panel. Turn one back on to see the graph again."
            />
          ) : (
            <svg
            ref={setSvgRef}
            className="graph-svg"
            viewBox={`${-half} ${-half} ${VIEW_SIZE} ${VIEW_SIZE}`}
            role="group"
            aria-label={`Knowledge graph for ${tenant}: ${visibleGraph.nodes.length} notes, ${visibleGraph.edges.length} connections`}
            onPointerDown={onBackgroundPointerDown}
            onPointerMove={onBackgroundPointerMove}
            onPointerUp={onBackgroundPointerUp}
            onPointerLeave={onBackgroundPointerUp}
          >
            <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
              {visibleGraph.edges.map((edge) => {
                const from = positions.get(edge.source);
                const to = positions.get(edge.target);
                if (!from || !to) return null;
                const dimmed = highlight ? !highlight.has(edge.source) || !highlight.has(edge.target) : false;
                const thick = edge.kind === 'connection';
                return (
                  <line
                    key={`${edge.source}->${edge.target}:${edge.kind}`}
                    x1={from.x}
                    y1={from.y}
                    x2={to.x}
                    y2={to.y}
                    className={thick ? 'graph-edge graph-edge-connection' : 'graph-edge graph-edge-thin'}
                    strokeWidth={EDGE_STROKE_WIDTH[edge.kind]}
                    opacity={dimmed ? 0.12 : thick ? 0.9 : 0.45}
                  >
                    {edge.reason && <title>{edge.reason}</title>}
                  </line>
                );
              })}

              {visibleGraph.nodes.map((node) => {
                const pos = positions.get(node.id);
                if (!pos) return null;
                const color = groupColorVar(node.group, groupIndex);
                const visual = nodeVisual(node.state, color);
                const r = nodeRadius(node.in_degree);
                // The invisible hit-target circle (UI-12): always at least
                // r, so it never shrinks the click area below the glyph,
                // but grown independently of r to reach a real 24 CSS px
                // target - see HIT_TARGET_RADIUS_CSS and pxPerUnit above.
                const padR = Math.max(r, HIT_TARGET_RADIUS_CSS / pxPerUnit);
                const dimmed = highlight ? !highlight.has(node.id) : false;
                const clickable = node.route !== null;
                // Computed once above, over the whole visible node list, so
                // a collision between two candidates can be resolved by
                // priority instead of render order (UI-12 v2).
                const showLabel = labelIds.has(node.id);
                // A ghost node has no route and no file to open - it renders as
                // an image rather than a link, never a click target
                // (docs/specs/graph.md, "How it behaves" item 6), and its label
                // says so via stateLabel.
                const label = `${node.title}, ${stateLabel(node.state)}`;

                return (
                  <g
                    key={node.id}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(node.id, el);
                      else nodeRefs.current.delete(node.id);
                    }}
                    role={clickable ? 'link' : 'img'}
                    aria-label={label}
                    // Roving focus (UI-12): only the active node is ever in
                    // the Tab sequence - see the activeNodeId effect and
                    // moveActive above.
                    tabIndex={node.id === activeNodeId ? 0 : -1}
                    className={clickable ? 'graph-node graph-node-clickable' : 'graph-node'}
                    opacity={dimmed ? 0.15 : visual.opacity}
                    onPointerDown={(e) => onNodePointerDown(e, node.id)}
                    onPointerMove={onNodePointerMove}
                    onPointerUp={onNodePointerUp}
                    onPointerEnter={(e) => showTooltip(e, node)}
                    onPointerLeave={hideTooltip}
                    onFocus={(e) => showTooltip(e, node)}
                    onBlur={hideTooltip}
                    onClick={() => activateNode(node)}
                    onKeyDown={(e) => onNodeKeyDown(e, node)}
                  >
                    <circle cx={pos.x} cy={pos.y} r={padR} fill="transparent" pointerEvents="all" />
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={r}
                      fill={visual.fill}
                      stroke={visual.stroke}
                      strokeWidth={visual.strokeWidth}
                      strokeDasharray={visual.dash}
                      pointerEvents="none"
                    />
                    {showLabel && (
                      <text
                        className="graph-node-label"
                        // Counter-scales against the outer pan/zoom group so
                        // label text stays a constant CSS size regardless of
                        // how far fit-to-view has zoomed out (UI-12) - the
                        // glyph itself is not counter-scaled, only the text.
                        transform={`translate(${pos.x} ${pos.y}) scale(${1 / transform.k})`}
                        x={r + 4}
                        y={0}
                        dominantBaseline="middle"
                        pointerEvents="none"
                      >
                        {node.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
          )}
        </div>

        {/* A real column beside the canvas, not an overlay on top of it
            (UI-12: the legend used to cover 27% of the canvas and hide 8
            nodes) - see graph.css. id/tabIndex is the skip link's target;
            also collapsible, since the finding names either fix as
            sufficient. */}
        <div className="graph-legend-panel" id="graph-legend-panel" tabIndex={-1}>
          <button
            type="button"
            className="graph-legend-toggle"
            onClick={() => setLegendOpen((v) => !v)}
            aria-expanded={legendOpen}
            aria-controls="graph-legend-body"
          >
            {legendOpen ? 'Hide legend' : 'Show legend'}
          </button>
          {legendOpen && (
            <div id="graph-legend-body">
              <GraphLegend
                groupCounts={legendGroupCounts}
                groupIndex={groupIndex}
                visibleGroupIds={visibleGroupIds}
                onToggleGroup={toggleGroup}
              />
            </div>
          )}
        </div>

        {tooltip && (
          <div className="graph-tooltip" style={{ left: tooltip.left, top: tooltip.top }} role="status">
            <strong>{tooltip.title}</strong>
            <span>{stateLabel(tooltip.state)}</span>
          </div>
        )}
      </div>
    </section>
  );
}
