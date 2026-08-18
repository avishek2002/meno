// Derived structure: walk the tenant tree fresh on every request. Files are the
// truth; there is no cache to invalidate, which is why "adding files makes them
// appear with no config change" holds by construction. Single-digit
// milliseconds at personal-LMS scale.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { findCourseDirs } from '../../lib/course-dirs.ts';
import type { CourseNode, ModuleNode, TreeResponse } from '../shared/types.ts';

function tryYaml(file: string, warnings: string[]): Record<string, unknown> | null {
  try {
    const v = parseYaml(readFileSync(file, 'utf8'));
    if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
    warnings.push(`${file}: not a YAML mapping`);
  } catch (e) {
    warnings.push(`${file}: ${(e as Error).message}`);
  }
  return null;
}

export function walkTenant(tenantDir: string, tenant: string): TreeResponse {
  const warnings: string[] = [];
  const courses: CourseNode[] = [];
  if (!existsSync(tenantDir)) return { tenant, courses, warnings };

  for (const entry of findCourseDirs(tenantDir)) {
    const courseDir = join(tenantDir, entry);
    const courseFile = join(courseDir, 'course.yml');
    const course = tryYaml(courseFile, warnings);
    if (!course) continue;

    const modules: ModuleNode[] = [];
    const modulesDir = join(courseDir, 'modules');
    if (existsSync(modulesDir)) {
      for (const modEntry of readdirSync(modulesDir).sort()) {
        const modFile = join(modulesDir, modEntry, 'module.yml');
        if (!existsSync(modFile)) continue;
        const mod = tryYaml(modFile, warnings);
        if (!mod) continue;
        modules.push({
          slug: String(mod.module ?? modEntry),
          title: String(mod.title ?? modEntry),
          status: String(mod.status ?? 'skeleton'),
          est_hours: Number(mod.est_hours ?? 0),
          serves: (mod.serves as string[]) ?? [],
          prerequisites: (mod.prerequisites as string[]) ?? [],
          concepts: (mod.concepts as string[]) ?? [],
          lessons: ((mod.lessons as ModuleNode['lessons']) ?? []).map((l) => ({
            file: l.file,
            title: l.title,
            concept: l.concept,
            status: l.status,
          })),
        });
      }
    }

    const leaf = entry.split('/').at(-1) as string;
    courses.push({
      dir: entry,
      slug: String(course.slug ?? leaf),
      title: String(course.title ?? leaf),
      status: String(course.status ?? 'active'),
      hub: String(course.hub ?? ''),
      objectives: (course.objectives as CourseNode['objectives']) ?? [],
      modules,
    });
  }
  return { tenant, courses, warnings };
}

// GET /note needs to know which course a note lives under (for the breadcrumb)
// without the client guessing from the path itself - a guess like "first path
// segment" breaks on sources/ and insights/, which sit at the vault root next
// to the domain dirs. The walk already has every course's dir; this just
// matches notePath against it the same way a filesystem would resolve the
// most specific containing directory.
export function resolveNoteCourse(
  courses: CourseNode[],
  notePath: string,
): { course: { slug: string; title: string }; domain: string | null } | null {
  // longest-match is defensive: findCourseDirs currently stops descending the
  // moment a directory has its own course.yml, so today's walk can never hand
  // this function a course dir that is itself the parent of another course
  // dir. Keeping the tie-break here means this pure function stays correct on
  // its own terms even if that walk's shape ever changes, at the cost of one
  // comparison.
  let best: CourseNode | null = null;
  for (const course of courses) {
    const prefix = `${course.dir}/`;
    if (!notePath.startsWith(prefix)) continue;
    if (!best || course.dir.length > best.dir.length) best = course;
  }
  if (!best) return null;
  const domain = best.dir.includes('/') ? best.dir.split('/')[0] : null;
  return { course: { slug: best.slug, title: best.title }, domain };
}

// basename (without .md) -> vault-relative path; ambiguous basenames resolve to
// null, mirroring Obsidian's shortest-unique behavior at our flat-enough scale.
// Path-style targets ([[modules/01-x/01-y]]) also resolve, exactly as Obsidian
// resolves them - lib/vault.ts applies the same rule to the graph walk.
export function vaultIndex(tenantDir: string): Map<string, string | null> {
  const index = new Map<string, string | null>();
  const paths: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) {
        const base = entry.slice(0, -3);
        const rel = relative(tenantDir, p);
        paths.push(rel);
        index.set(base, index.has(base) ? null : rel);
      }
    }
  };
  if (existsSync(tenantDir)) walk(tenantDir);
  for (const rel of paths) index.set(rel.slice(0, -3), rel);
  return index;
}
