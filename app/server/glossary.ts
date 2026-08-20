// GET /api/v1/:tenant/glossary. Read-only: walks the tenant fresh (files are
// the truth, no cache), reads each module's terms.yml sidecar through
// lib/terms.ts's parseTerms (never a second parser), and folds every module
// into one call to mergeTerms so curriculum order is preserved end to end.
//
// **No ledger read anywhere in this file.** Terms are inert
// (lib/terms.ts, .claude/CONTRACT-glossary.md): they never become a review
// item, never move a gate, never enter a due computation. If this file ever
// imports readLedgerEvents or deriveMastery it has left the contract.
//
// No write route: terms.yml has exactly two authors, an agent and the
// learner's own text editor - the same arrangement groups.yml settled into.
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { safePath } from './tenant.ts';
import { walkTenant } from './tree.ts';
import { parseTerms, mergeTerms, type ModuleTerms } from '../../lib/terms.ts';
import type { GlossaryResponse } from '../shared/types.ts';
import type { Ctx } from './routes.ts';

/**
 * Assemble every module's terms.yml into one GlossaryResponse for a tenant.
 *
 * The walk order from walkTenant is the curriculum order mergeTerms requires:
 * courses in tree order, each course's modules in module.yml directory order,
 * each module's lessons in its own manifest order. A module with no
 * terms.yml on disk contributes an empty document (schema_version, no terms,
 * no no_terms) rather than an error or a skip - `mergeTerms` just sees
 * nothing to merge for it.
 */
function buildGlossary(root: string, tenant: string): GlossaryResponse {
  const tenantDir = safePath(root, tenant);
  const tree = walkTenant(tenantDir, tenant);
  const parseWarnings: string[] = [];
  const modules: ModuleTerms[] = [];

  for (const course of tree.courses) {
    // same rule resolveNoteCourse (app/server/tree.ts) uses: a course dir is
    // "<domain>/<slug>" for a grouped course, "<slug>" for one still at the
    // vault root.
    const domain = course.dir.includes('/') ? course.dir.split('/')[0] : null;
    for (const mod of course.modules) {
      // module.slug is the module's own directory name - validate's `refs`
      // check guarantees it (lib/graph.ts leans on the same guarantee to
      // build lesson node ids), so terms.yml sits beside module.yml here.
      const termsFile = safePath(root, tenant, course.dir, 'modules', mod.slug, 'terms.yml');
      const raw = existsSync(termsFile) ? readFileSync(termsFile, 'utf8') : '';
      const { doc, warnings } = parseTerms(raw);
      parseWarnings.push(...warnings);
      modules.push({
        course: course.slug,
        course_title: course.title,
        domain,
        module: mod.slug,
        module_title: mod.title,
        lessons: mod.lessons.map((l) => ({ file: l.file, title: l.title })),
        doc,
      });
    }
  }

  const merged = mergeTerms(modules);
  return {
    tenant,
    courses: merged.courses,
    warnings: [...parseWarnings, ...merged.warnings],
  };
}

export const getGlossary = (
  _req: IncomingMessage,
  res: ServerResponse,
  params: Record<string, string>,
  ctx: Ctx,
): void => {
  const payload = buildGlossary(ctx.root, params.tenant);
  const data = JSON.stringify(payload);
  res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
  res.end(data);
};
