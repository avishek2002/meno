// The tenant's groups.yml on disk. Reading is permissive (lib/groups.ts turns a
// half-edited file into an empty document plus warnings, never a throw), and
// writing is the whole-file atomic replace the todos path already uses, guarded
// by the caller's If-Match content hash.
//
// This is the second file the app is allowed to write, and it is deliberately
// the same class as the first: organization, not evidence. No group operation
// appends a ledger event, touches mastery, or edits a course manifest - the
// write-authority seam (decision 14) is about who may claim a learner knows
// something, and grouping never makes that claim.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseGroups, serializeGroups, type GroupsDoc } from '../../lib/groups.ts';
import { writeFileAtomic } from './atomic.ts';

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

/** Serialize through the YAML writer, never by hand - see lib/groups.ts. */
export function writeGroups(tenantDir: string, doc: GroupsDoc): string {
  const next = serializeGroups(doc);
  writeFileAtomic(join(tenantDir, GROUPS_FILE), next);
  return next;
}
