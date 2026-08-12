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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';

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

/** One entry in listCourses' output: identity facts about a course a tenant already has. */
export interface CourseListing {
  /** null for an ungrouped course still sitting at the vault root. */
  domain: string | null;
  slug: string;
  title: string;
  /**
   * true when <course-dir>/profile.md exists - the learning contract
   * elicit-needs writes (elicit-needs/references/profile-format.md). A course
   * with a profile is under contract; one without it is an unstarted
   * skeleton, present in the vault but never confirmed.
   */
  hasProfile: boolean;
}

/**
 * Every course a tenant already has, one entry per findCourseDirs result,
 * with just enough read from course.yml and profile.md's presence to answer
 * "does this tenant already hold this course" - the check find-subjects'
 * routing step needs before it ever proposes a candidate (docs/specs/subject-
 * finder.md). Malformed or missing course.yml falls back to the slug as the
 * title, the same degraded-path rule lib/groups.ts and app/server/tree.ts's
 * tryYaml already hold to, rather than throwing.
 */
export function listCourses(tenantDir: string): CourseListing[] {
  return findCourseDirs(tenantDir).map((dir) => {
    const parts = dir.split('/');
    const domain = parts.length > 1 ? parts[0] : null;
    const slug = parts.at(-1) as string;
    const courseDir = join(tenantDir, dir);

    let title = slug;
    try {
      const parsed = parseYaml(readFileSync(join(courseDir, 'course.yml'), 'utf8'));
      if (parsed && typeof parsed === 'object' && typeof (parsed as { title?: unknown }).title === 'string') {
        title = (parsed as { title: string }).title;
      }
    } catch {
      // malformed course.yml: keep the slug as the title rather than throw
    }

    return { domain, slug, title, hasProfile: existsSync(join(courseDir, 'profile.md')) };
  });
}
