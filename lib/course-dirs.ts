// Where a tenant's courses live on disk. One implementation, shared by the app's
// tree walk and the insights manifest loader, so "find the courses in a vault"
// exists exactly once - same rule as lib/vault.ts and lib/mastery.ts.
//
// Courses sit at <tenant>/<domain>/<course-slug>/, mirroring the community tier's
// content/community/<domain>/<slug>/ exactly. Depth 1 is still accepted so a vault
// written before the domain grouping keeps rendering instead of silently emptying;
// tools/validate.ts is what insists on the move, because a warning you can see beats
// a course list that is quietly short.
//
// The domain vocabulary in content/community/DOMAINS.md is deliberately NOT consulted
// here. This walk answers "where are the course.yml files", and validate answers "is
// that a legal place for one" - keeping the runtime free of a content-file dependency.
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Vault-relative directories holding a course.yml, sorted.
 * Returns `<domain>/<slug>` for grouped courses and `<slug>` for ungrouped ones.
 */
export function findCourseDirs(tenantDir: string): string[] {
  if (!existsSync(tenantDir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(tenantDir).sort()) {
    const dir = join(tenantDir, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (existsSync(join(dir, 'course.yml'))) {
      out.push(entry);
      continue;
    }
    for (const sub of readdirSync(dir).sort()) {
      const nested = join(dir, sub);
      if (!statSync(nested).isDirectory()) continue;
      if (existsSync(join(nested, 'course.yml'))) out.push(`${entry}/${sub}`);
    }
  }
  return out;
}
