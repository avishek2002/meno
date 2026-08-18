// The pure decision behind the guarded back button in Header.tsx: how deep
// into in-app history the current entry sits, and whether that entry still
// needs stamping. Names no browser global (window, history, hashchange all
// stay in the .tsx) so this unit-tests directly.
//
// A plain counter incremented on every hashchange would be wrong: moving
// *backward* through history also fires hashchange, and a naive increment
// would count that as forward too, so the depth would only ever grow and the
// button would never hide again even once the reader paged all the way back
// to the first entry. Reading the depth back off history.state instead tells
// a revisited entry (the user pressed back or forward, and the browser
// restored an entry this module already stamped) apart from a genuinely new
// one (a forward navigation to somewhere never stamped before).

const DEPTH_KEY = '__menoBackDepth';

function readDepth(state: unknown): number | null {
  if (state === null || typeof state !== 'object') return null;
  const value = (state as Record<string, unknown>)[DEPTH_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null;
}

/**
 * `current` is the depth this module had tracked before this transition (the
 * depth of the entry being left). If `state` (the entry being arrived at)
 * already carries a stamped depth, that entry has been visited before -
 * adopt its stamp and ignore `current` entirely, `stamp: false`. Otherwise
 * this is a new entry: the adopted depth is `current + 1` and the caller
 * must `history.replaceState` it onto the entry before moving on, or the
 * next back/forward through it would have nothing to read.
 *
 * On first mount there is no "entry being left" - callers pass `current: -1`
 * so an unstamped starting entry adopts depth 0 (`-1 + 1`) rather than 1, per
 * "on first mount, adopt an existing stamped depth or stamp 0".
 */
export function nextDepth(state: unknown, current: number): { depth: number; stamp: boolean } {
  const existing = readDepth(state);
  if (existing !== null) return { depth: existing, stamp: false };
  return { depth: current + 1, stamp: true };
}

/** Builds the object to `history.replaceState` when `nextDepth` says `stamp:
 *  true` - spreads every other key already on the entry's state forward
 *  rather than clobbering it (this app does not stash anything else there
 *  today, but a state object is not this module's alone to empty), and never
 *  mutates its input. */
export function stampedState(state: unknown, depth: number): Record<string, unknown> {
  const base = state !== null && typeof state === 'object' ? (state as Record<string, unknown>) : {};
  return { ...base, [DEPTH_KEY]: depth };
}
