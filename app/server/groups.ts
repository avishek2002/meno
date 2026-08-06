// The tenant's groups.yml on disk. Reading is permissive (lib/groups.ts turns a
// half-edited file into an empty document plus warnings, never a throw).
//
// The app only reads this file (v1.6). It used to be the second file the app
// was allowed to write, on the theory that grouping is organization, not
// evidence - true, but the explicit layer competes with the domain layer
// rather than complementing it, so a write surface for it was never
// load-bearing. An agent following second-brain, or the learner in a text
// editor, are the only authors now.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGroups, type GroupsDoc } from '../../lib/groups.ts';

export const GROUPS_FILE = 'groups.yml';

/** The raw bytes, so callers hash exactly what is on disk (an absent file is ""). */
export function readGroupsRaw(tenantDir: string): string {
  const file = join(tenantDir, GROUPS_FILE);
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

export function readGroups(tenantDir: string): { raw: string; doc: GroupsDoc; warnings: string[] } {
  const raw = readGroupsRaw(tenantDir);
  const { doc, warnings } = parseGroups(raw);
  return { raw, doc, warnings };
}
