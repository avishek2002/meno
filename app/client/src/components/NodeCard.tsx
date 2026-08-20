// The graph's non-modal node card (docs/specs/graph.md, "How it behaves" item
// 12): clicking a node, or pressing Enter/Space on a focused one, opens this
// pinned to a corner of the canvas INSTEAD of navigating (invariant 21). No
// `role="dialog"`, no focus trap, no `aria-live` - it opens deliberately, so
// it does not need announcing, and the graph stays live underneath: pan,
// zoom, drag and hover all keep working while it is open.
//
// Fetches GET /api/v1/:tenant/graph/node?id=<id> per open node through the
// existing useResource hook, which already keys its fetch on the url and
// cancels a stale in-flight request on cleanup - the mechanism that makes a
// late response for a card the learner already swapped land nowhere, which
// is what NodeCardResponse.id being "echoed back verbatim" exists to guard.
//
// Escape closing the card, and which corner it is pinned to, are component
// concerns with no arithmetic in them (docs/specs/graph.md, "The pure seam").
// Escape itself is handled by ONE listener in GraphPage.tsx, not here: a card
// listener and a fullscreen listener both bound to window 'keydown' would
// both fire on the same Escape press, so GraphPage owns the single priority
// rule instead (card first, fullscreen second) - the "Escape stays
// unambiguous" the design calls for.
//
// The container carries tabIndex={-1} so it is a valid focus target, but
// NEITHER moves focus to itself nor holds a focus trap here: whether opening
// this card should steal focus (a genuine open, from a click or Enter) or
// leave it on the graph (an already-open card just swapping to describe a
// newly arrow-key-active node) depends on WHY nodeId changed, which only
// GraphPage's activateNode/moveActive know - so GraphPage owns that decision
// via the forwarded ref, imperatively, rather than this component guessing
// from nodeId alone.
import { forwardRef } from 'react';
import { useResource } from '../useResource';
import type { NodeCardResponse } from '../../../shared/types.ts';

export const NodeCard = forwardRef<HTMLDivElement, { tenant: string; nodeId: string; onClose: () => void }>(
  function NodeCard({ tenant, nodeId, onClose }, ref) {
    const { data, error, loading } = useResource<NodeCardResponse>(
      `/api/v1/${encodeURIComponent(tenant)}/graph/node?id=${encodeURIComponent(nodeId)}`,
    );

    return (
      <div className="node-card" ref={ref} tabIndex={-1} role="group" aria-label="Node details">
        <button type="button" className="node-card-close" onClick={onClose} aria-label="Close node details">
          Close
        </button>

        {loading && !data && (
          <p className="status-line" role="status" aria-live="polite">
            Loading...
          </p>
        )}

        {error && !loading && (
          <p role="alert" className="node-card-error">
            Could not load this node: {error}
          </p>
        )}

        {data && (
          <>
            <h2 className="node-card-title">{data.title}</h2>
            <p className="node-card-kind">{data.kind}</p>

            {data.warnings.length > 0 && (
              <div className="warnings-box">
                {data.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}

            <p className="node-card-summary">{data.summary ?? 'No description yet.'}</p>

            {data.objectives.length > 0 && (
              <ul className="node-card-objectives">
                {data.objectives.map((o) => (
                  <li key={o.id}>
                    <strong>{o.id}</strong> {o.text}
                  </li>
                ))}
              </ul>
            )}

            {data.progress && (
              <p className="node-card-progress">
                {data.progress.lessons_mastered} mastered, {data.progress.lessons_generated} written of{' '}
                {data.progress.lessons_total} lessons planned across {data.progress.courses}{' '}
                {data.progress.courses === 1 ? 'course' : 'courses'}.
              </p>
            )}

            {/* The card's single bottom button - the only way out of the graph
                canvas now that a click opens a card instead of navigating
                (docs/specs/graph.md, NodeCardAction). Rendered disabled rather
                than absent for a ghost lesson, so the card keeps its shape and
                says why the button does nothing - aria-disabled rather than
                the `disabled` attribute (same reasoning as the zoom buttons in
                GraphPage.tsx, finding 1) so the button stays reachable by
                keyboard instead of being pulled out of the tab order, and
                aria-describedby pointing at the reason paragraph so a screen
                reader announces WHY, not just that the button does nothing -
                previously an unassociated sibling <p> a `disabled` button
                could never reach in the first place. */}
            {data.action.enabled ? (
              <a className="node-card-action" href={data.action.href ?? undefined}>
                {data.action.label}
              </a>
            ) : (
              <>
                <button
                  type="button"
                  className="node-card-action"
                  aria-disabled="true"
                  aria-describedby={data.action.disabled_reason ? 'node-card-disabled-reason' : undefined}
                  onClick={(e) => e.preventDefault()}
                >
                  {data.action.label}
                </button>
                {data.action.disabled_reason && (
                  <p id="node-card-disabled-reason" className="node-card-disabled-reason">
                    {data.action.disabled_reason}
                  </p>
                )}
              </>
            )}
          </>
        )}
      </div>
    );
  },
);
