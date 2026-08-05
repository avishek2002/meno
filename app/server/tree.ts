// Derived structure: walk the tenant tree fresh on every request. Files are the
// truth; there is no cache to invalidate, which is why "adding files makes them
// appear with no config change" holds by construction. Single-digit
// milliseconds at personal-LMS scale.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
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

  for (const entry of readdirSync(tenantDir).sort()) {
    const courseDir = join(tenantDir, entry);
    const courseFile = join(courseDir, 'course.yml');
    if (!existsSync(courseFile)) continue;
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

    courses.push({
      slug: String(course.slug ?? entry),
      title: String(course.title ?? entry),
      status: String(course.status ?? 'active'),
      hub: String(course.hub ?? ''),
      objectives: (course.objectives as CourseNode['objectives']) ?? [],
      modules,
    });
  }
  return { tenant, courses, warnings };
}

// basename (without .md) -> vault-relative path; ambiguous basenames resolve to
// null, mirroring Obsidian's shortest-unique behavior at our flat-enough scale
export function vaultIndex(tenantDir: string): Map<string, string | null> {
  const index = new Map<string, string | null>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.')) continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (entry.endsWith('.md')) {
        const base = entry.slice(0, -3);
        const rel = relative(tenantDir, p);
        index.set(base, index.has(base) ? null : rel);
      }
    }
  };
  if (existsSync(tenantDir)) walk(tenantDir);
  return index;
}
