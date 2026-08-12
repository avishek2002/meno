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
import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import type { Simulation, SimulationLinkDatum, SimulationNodeDatum } from 'd3-force';
import { navigate } from '../router.tsx';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { InfoTip } from '../components/InfoTip';
import { EDGE_STROKE_WIDTH, fitToViewTransform, hasNoConnectionEdges, hopNeighborhood, resolveFocus, seedPosition } from '../graphLayout.ts';
import type { GraphEdge, GraphNode, GraphNodeState, GraphResponse } from '../../../shared/types.ts';

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

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function nodeRadius(inDegree: number): number {
  return Math.min(24, 7 + Math.sqrt(inDegree) * 4);
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

function GraphLegend({ groups }: { groups: GraphResponse['groups'] }) {
  return (
    <div className="graph-legend" aria-label="Legend">
      <div className="graph-legend-channel">
        <h3>Group (fill colour)</h3>
        <ul>
          {groups.map((g, i) => (
            <li key={g.id}>
              <span className="graph-legend-swatch" style={{ background: `var(--graph-group-${i % GROUP_PALETTE_SIZE})` }} />
              {g.title}
            </li>
          ))}
          <li>
            <span className="graph-legend-swatch" style={{ background: 'var(--text-muted)' }} />
            No group
          </li>
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

  const svgElRef = useRef<SVGSVGElement | null>(null);
  const panRef = useRef<{ pointerId: number; startX: number; startY: number; startTx: number; startTy: number } | null>(null);
  const dragRef = useRef<{ id: string; pointerId: number; startX: number; startY: number; startPos: Point; moved: boolean } | null>(
    null,
  );
  const suppressClickRef = useRef<string | null>(null);

  // Physics: computed fresh whenever the response changes, torn down on
  // unmount. Manual ticking (no timer) keeps the result reproducible.
  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setPositions(null);
    setHasFitted(false);
    void (async () => {
      const { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide } = await import('d3-force');
      if (cancelled) return;
      const count = data.nodes.length;
      const simNodes: SimNode[] = data.nodes.map((n) => {
        const seed = seedPosition(n.id, count);
        return { id: n.id, inDegree: n.in_degree, x: seed.x, y: seed.y };
      });
      const simLinks: SimLink[] = data.edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind }));
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
  }, [data]);

  const nodeIds = useMemo(() => data?.nodes.map((n) => n.id) ?? [], [data]);
  const resolvedFocus = useMemo(() => resolveFocus(focus, nodeIds), [focus, nodeIds]);

  const groupIndex = useMemo(() => new Map((data?.groups ?? []).map((g, i) => [g.id, i])), [data]);

  // Fit-to-view once, the first time settled positions are available for a
  // load with no incoming focus - never re-fired by a later pan, zoom, or
  // drag, and re-armed only when the data changes (the physics effect above
  // resets hasFitted on every new fetch). At the maintainer's real node
  // count, seedPosition's radius exceeds the fixed VIEW_SIZE viewBox, so
  // without this the graph opens mostly off-screen. Skipped when a focus is
  // resolved: the centering effect below already centers on that one node,
  // which matters more here than the whole graph being visible at once.
  useEffect(() => {
    if (!positions || resolvedFocus) return;
    if (hasFitted) return;
    const fit = fitToViewTransform([...positions.values()], VIEW_SIZE, FIT_MARGIN);
    setTransform({ x: fit.x, y: fit.y, k: clamp(fit.k, MIN_ZOOM, MAX_ZOOM) });
    setHasFitted(true);
  }, [positions, resolvedFocus, hasFitted]);

  // Center the view on the focused node once, the first time both the focus
  // value and the laid-out positions are available - never re-fired by a
  // later pan or drag, and re-armed only when the focus value itself changes
  // (route from LessonPage/CoursePage, or the user editing the URL).
  useEffect(() => {
    if (!resolvedFocus || !positions) return;
    if (hasCentered === resolvedFocus) return;
    const pos = positions.get(resolvedFocus);
    if (!pos) return;
    setTransform((t) => ({ ...t, x: -pos.x, y: -pos.y }));
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
    return () => el.removeEventListener('wheel', onWheelNative);
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
    if (!node.route) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      activateNode(node);
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

  if (loading && !data) return <p className="status-line">Loading graph...</p>;
  if (error) return <p className="status-line status-error">Could not load graph: {error}</p>;
  if (!data) return null;
  if (data.nodes.length === 0) {
    return (
      <EmptyState
        title={`No graph yet for ${tenant}`}
        body="Once your vault has notes, they will appear here as a picture of how your learning connects."
      />
    );
  }
  if (!positions) return <p className="status-line">Laying out graph...</p>;

  // The highlight set: the hovered node's 1-hop neighborhood while hovering,
  // else the focused node's 2-hop neighborhood while a focus is resolved,
  // else null - which the render below reads as "dim nothing".
  const highlight = hoveredId
    ? hopNeighborhood(hoveredId, data.edges, HOVER_HOPS)
    : resolvedFocus
      ? hopNeighborhood(resolvedFocus, data.edges, FOCUS_HOPS)
      : null;

  const half = VIEW_SIZE / 2;
  const noConnectionsYet = hasNoConnectionEdges(data.edges);

  return (
    <section className="graph-page">
      <h1>
        Graph <InfoTip entry="graphView" />
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
      <div className="graph-canvas-wrap">
        <svg
          ref={setSvgRef}
          className="graph-svg"
          viewBox={`${-half} ${-half} ${VIEW_SIZE} ${VIEW_SIZE}`}
          role="group"
          aria-label={`Knowledge graph for ${tenant}: ${data.nodes.length} notes, ${data.edges.length} connections`}
          onPointerDown={onBackgroundPointerDown}
          onPointerMove={onBackgroundPointerMove}
          onPointerUp={onBackgroundPointerUp}
          onPointerLeave={onBackgroundPointerUp}
        >
          <g transform={`translate(${transform.x} ${transform.y}) scale(${transform.k})`}>
            {data.edges.map((edge) => {
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

            {data.nodes.map((node) => {
              const pos = positions.get(node.id);
              if (!pos) return null;
              const color = groupColorVar(node.group, groupIndex);
              const visual = nodeVisual(node.state, color);
              const r = nodeRadius(node.in_degree);
              const dimmed = highlight ? !highlight.has(node.id) : false;
              const clickable = node.route !== null;
              // A ghost node has no route and no file to open - it renders as
              // an image rather than a link, never a click target
              // (docs/specs/graph.md, "How it behaves" item 6), and its label
              // says so via stateLabel.
              const label = `${node.title}, ${stateLabel(node.state)}`;

              return (
                <g
                  key={node.id}
                  role={clickable ? 'link' : 'img'}
                  aria-label={label}
                  tabIndex={clickable ? 0 : -1}
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
                  <circle
                    cx={pos.x}
                    cy={pos.y}
                    r={r}
                    fill={visual.fill}
                    stroke={visual.stroke}
                    strokeWidth={visual.strokeWidth}
                    strokeDasharray={visual.dash}
                  />
                </g>
              );
            })}
          </g>
        </svg>

        <GraphLegend groups={data.groups} />

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
