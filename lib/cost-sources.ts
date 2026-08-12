// Registry and resolver for cost sources (docs/specs/cost.md, "Selection and degradation").
// Registration order is precedence order: the first registered source reporting available()
// wins. There is one entry today; a second entry must not reorder the first.
import type { CostSource } from './cost.ts';
import { claudeCodeSource } from './cost-source-claude-code.ts';

export const COST_SOURCES: CostSource[] = [claudeCodeSource];

/**
 * The first registered source reporting available(), or null. Never throws: a source whose
 * available() throws is treated as unavailable, a second line of defence over the contract
 * that a correct source never throws there in the first place.
 */
export function selectCostSource(sources: CostSource[] = COST_SOURCES): CostSource | null {
  for (const source of sources) {
    try {
      if (source.available()) return source;
    } catch {
      // a throwing available() is unavailable, not a crash
    }
  }
  return null;
}
