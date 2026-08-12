import { fileURLToPath } from 'node:url';
// Deterministic, offline validation of every content format Meno defines.
// Usage: node tools/validate.ts [targetDir ...] [--strict] [--json]
//   targets default to examples/ - every course tree found under each target
//   is checked. Exit codes: 0 clean (or warnings without --strict), 1 errors,
//   2 warnings-only under --strict.
//
// Checks grow phase by phase; docs/specs/validation.md is the spec.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsExport from 'ajv-formats';

// ajv-formats ships CommonJS; under Node ESM the callable lands on .default
const addFormats = ((addFormatsExport as unknown as { default?: unknown }).default ??
  addFormatsExport) as (ajv: Ajv2020) => void;
import { parse as parseYaml } from 'yaml';
import { parseFrontmatter } from '../lib/frontmatter.ts';
import { parseLesson, anatomyOf } from '../lib/lesson.ts';
import { parseLedger, deriveMastery, serializeMastery, type LedgerEvent } from '../lib/mastery.ts';
import { parseContributors, parseUnit } from '../lib/attribution.ts';
import { parseGroups } from '../lib/groups.ts';
import { parseConnects } from '../lib/connects.ts';
import { loadVaultFiles, buildVaultGraph, type VaultGraph } from '../lib/vault.ts';

export interface Finding {
  level: 'error' | 'warning';
  check: string;
  path: string;
  message: string;
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

// findings name a repo-relative path when the file is in this repository, and
// the plain path when it is not (a real tenant elsewhere on disk, a fixture in
// a temp directory) - "../../../private/tmp/..." helps nobody
const displayPath = (file: string): string => (file.startsWith(repoRoot) ? relative(repoRoot, file) : file);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.git') continue;
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function loadSchema(name: string): ValidateFunction {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  if (name !== 'source.schema.json') {
    ajv.addSchema(JSON.parse(readFileSync(join(repoRoot, 'schemas', 'source.schema.json'), 'utf8')));
  }
  const schema = JSON.parse(readFileSync(join(repoRoot, 'schemas', name), 'utf8'));
  return ajv.compile(schema);
}

const DEPTH_TO_BLOOM: Record<string, string> = {
  orient: 'understand',
  build: 'apply',
  'work-ready': 'analyze',
  teach: 'create',
};

const PROFILE_BODY_SECTIONS = ['## Goal', '## Starting point', '## Scope contract', '## Adjustment log'];

export function checkProfiles(target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateProfile = loadSchema('profile.schema.json');
  for (const file of files.filter((f) => f.endsWith('/profile.md'))) {
    const rel = relative(repoRoot, file);
    const { frontmatter, body, warnings } = parseFrontmatter(readFileSync(file, 'utf8'));
    for (const w of warnings) findings.push({ level: 'error', check: 'schema', path: rel, message: w });
    if (!frontmatter) continue;

    if (!validateProfile(frontmatter)) {
      for (const err of validateProfile.errors ?? []) {
        findings.push({
          level: 'error',
          check: 'schema',
          path: rel,
          message: `${err.instancePath || '/'} ${err.message}`,
        });
      }
    }

    // cross-field rules JSON Schema cannot express
    const fm = frontmatter as Record<string, unknown>;
    const depth = fm.depth as string;
    if (depth in DEPTH_TO_BLOOM && fm.bloom_ceiling !== DEPTH_TO_BLOOM[depth]) {
      findings.push({
        level: 'error',
        check: 'profile-consistency',
        path: rel,
        message: `bloom_ceiling must be "${DEPTH_TO_BLOOM[depth]}" for depth "${depth}", got "${fm.bloom_ceiling}"`,
      });
    }
    const { hours_per_week: hpw, total_weeks: tw, budget_hours: bh } = fm as {
      hours_per_week?: number;
      total_weeks?: number;
      budget_hours?: number;
    };
    if (typeof hpw === 'number' && typeof tw === 'number' && typeof bh === 'number' && hpw * tw !== bh) {
      findings.push({
        level: 'error',
        check: 'profile-consistency',
        path: rel,
        message: `budget_hours (${bh}) must equal hours_per_week x total_weeks (${hpw * tw})`,
      });
    }
    if (fm.questions_asked as number > 7) {
      findings.push({
        level: 'warning',
        check: 'profile-consistency',
        path: rel,
        message: `questions_asked (${fm.questions_asked}) exceeds the interview budget of 7`,
      });
    }

    for (const section of PROFILE_BODY_SECTIONS) {
      if (!body.includes(`\n${section}`) && !body.startsWith(section)) {
        findings.push({ level: 'error', check: 'profile-body', path: rel, message: `missing required section "${section}"` });
      }
    }
    const adjLog = body.split('## Adjustment log')[1];
    if (adjLog !== undefined && !/-\s*\d{4}-\d{2}-\d{2}/.test(adjLog)) {
      findings.push({
        level: 'error',
        check: 'profile-body',
        path: rel,
        message: 'Adjustment log has no dated entry (expected "- YYYY-MM-DD - ...")',
      });
    }
  }
  return findings;
}

export function checkTenancy(_target: string, _files: string[]): Finding[] {
  const findings: Finding[] = [];
  const claudeMd = join(repoRoot, 'CLAUDE.md');
  if (existsSync(claudeMd)) {
    const text = readFileSync(claudeMd, 'utf8').trim();
    if (text !== '@AGENTS.md') {
      findings.push({
        level: 'error',
        check: 'tenancy',
        path: 'CLAUDE.md',
        message: 'CLAUDE.md must be exactly the one-line @AGENTS.md shim',
      });
    }
  }
  const gitignore = readFileSync(join(repoRoot, '.gitignore'), 'utf8');
  if (!/^content\/tenants\/$/m.test(gitignore)) {
    findings.push({
      level: 'error',
      check: 'tenancy',
      path: '.gitignore',
      message: 'missing the content/tenants/ tenancy rule',
    });
  }
  // default-deny under content/: only the three tiers may sit at its top level
  const contentDir = join(repoRoot, 'content');
  if (existsSync(contentDir)) {
    const allowed = new Set(['community', 'org', 'tenants']);
    for (const entry of readdirSync(contentDir)) {
      if (!allowed.has(entry)) {
        findings.push({
          level: 'error',
          check: 'tenancy',
          path: `content/${entry}`,
          message: 'unexpected entry under content/ - only community/, org/, and tenants/ are allowed',
        });
      }
    }
  }
  return findings;
}

const BLOOM_ORDER = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];

function bloomAbove(bloom: string, ceiling: string): boolean {
  const b = BLOOM_ORDER.indexOf(bloom);
  const c = BLOOM_ORDER.indexOf(ceiling);
  return b !== -1 && c !== -1 && b > c;
}

function parseYamlFile(file: string, findings: Finding[], check: string): Record<string, unknown> | null {
  try {
    const parsed = parseYaml(readFileSync(file, 'utf8'));
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      findings.push({ level: 'error', check, path: relative(repoRoot, file), message: 'not a YAML mapping' });
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    findings.push({
      level: 'error',
      check,
      path: relative(repoRoot, file),
      message: `invalid YAML: ${(e as Error).message}`,
    });
    return null;
  }
}

interface SourceRecord {
  title?: string;
  url?: string;
  archived_url?: string;
  accessed?: string;
  source_type?: string;
  why?: string;
}

/** Compare two URLs ignoring differences that never change which page is meant. */
function canonicalUrl(u: string): string {
  return u.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '').toLowerCase();
}

function checkSourceRecords(sources: SourceRecord[], rel: string, findings: Finding[]): void {
  const today = new Date().toISOString().slice(0, 10);
  for (const [i, s] of sources.entries()) {
    const at = `${rel} sources[${i}]`;
    if (s.source_type === 'web') {
      if (!s.archived_url) {
        findings.push({
          level: 'warning',
          check: 'citations',
          path: rel,
          message: `${at}: web source with empty archived_url (allowed only with the reason stated in why: "${s.why}")`,
        });
      } else if (!/^https:\/\/web\.archive\.org\/web\//.test(s.archived_url)) {
        findings.push({
          level: 'error',
          check: 'citations',
          path: rel,
          message: `${at}: archived_url must be a web.archive.org/web/ snapshot, got "${s.archived_url}"`,
        });
      } else if (s.url) {
        // The snapshot must be OF the cited url. Archiving follows redirects and records
        // where it landed, while url keeps what was typed, so any source that moved
        // silently produces a pair pointing at two different pages. Offline and exact:
        // compare the original URL embedded after the wayback timestamp.
        const captured = s.archived_url.match(/^https:\/\/web\.archive\.org\/web\/\d+(?:[a-z_]+)?\/(.+)$/);
        if (!captured) {
          findings.push({
            level: 'error',
            check: 'citations',
            path: rel,
            message: `${at}: archived_url has no original URL after the snapshot timestamp: "${s.archived_url}"`,
          });
        } else if (canonicalUrl(captured[1]) !== canonicalUrl(s.url)) {
          findings.push({
            level: 'error',
            check: 'citations',
            path: rel,
            message: `${at}: archived_url is a snapshot of "${captured[1]}" but url is "${s.url}" - the snapshot must capture the cited page (a redirect usually means url needs updating to where it now resolves)`,
          });
        }
      }
      if (s.url && !/^https?:\/\//.test(s.url)) {
        findings.push({ level: 'error', check: 'citations', path: rel, message: `${at}: web source url must be http(s)` });
      }
    } else if (s.source_type === 'user') {
      if (s.url && !s.url.startsWith('sources/')) {
        findings.push({
          level: 'error',
          check: 'citations',
          path: rel,
          message: `${at}: user source url must be a vault-relative path starting with "sources/"`,
        });
      }
      if (s.archived_url) {
        findings.push({ level: 'error', check: 'citations', path: rel, message: `${at}: user sources are not archived; archived_url must be empty` });
      }
    }
    if (s.accessed && s.accessed > today) {
      findings.push({ level: 'error', check: 'citations', path: rel, message: `${at}: accessed date ${s.accessed} is in the future` });
    }
  }
}

export function checkCourses(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateCourse = loadSchema('course.schema.json');
  const validateModule = loadSchema('module.schema.json');

  for (const courseFile of files.filter((f) => f.endsWith('/course.yml'))) {
    const courseDir = courseFile.slice(0, -'/course.yml'.length);
    const relCourse = relative(repoRoot, courseFile);
    const course = parseYamlFile(courseFile, findings, 'manifests');
    if (!course) continue;

    if (!validateCourse(course)) {
      for (const err of validateCourse.errors ?? []) {
        findings.push({ level: 'error', check: 'manifests', path: relCourse, message: `${err.instancePath || '/'} ${err.message}` });
      }
    }
    const courseDirName = courseDir.split('/').at(-1);
    if (course.slug && course.slug !== courseDirName) {
      findings.push({
        level: 'error',
        check: 'refs',
        path: relCourse,
        message: `course slug "${course.slug}" does not match its directory "${courseDirName}"`,
      });
    }

    // profile context (topic packs have none)
    let ceiling: string | undefined;
    let budget: number | undefined;
    const profilePath = join(courseDir, 'profile.md');
    if (existsSync(profilePath)) {
      const { frontmatter } = parseFrontmatter(readFileSync(profilePath, 'utf8'));
      ceiling = frontmatter?.bloom_ceiling as string | undefined;
      budget = frontmatter?.budget_hours as number | undefined;
    }

    // collect module manifests
    const moduleFiles = files.filter((f) => f.startsWith(join(courseDir, 'modules') + '/') && f.endsWith('/module.yml'));
    const modules = new Map<string, Record<string, unknown>>();
    for (const mf of moduleFiles) {
      const relMod = relative(repoRoot, mf);
      const mod = parseYamlFile(mf, findings, 'manifests');
      if (!mod) continue;
      if (!validateModule(mod)) {
        for (const err of validateModule.errors ?? []) {
          findings.push({ level: 'error', check: 'manifests', path: relMod, message: `${err.instancePath || '/'} ${err.message}` });
        }
      }
      const dirSlug = mf.split('/').at(-2)!;
      if (mod.module !== dirSlug) {
        findings.push({ level: 'error', check: 'refs', path: relMod, message: `module field "${mod.module}" does not match directory "${dirSlug}"` });
      }
      modules.set(String(mod.module), mod);

      // per-module rules
      const est = mod.est_hours as number;
      if (typeof est === 'number' && (est < 2 || est > 6)) {
        findings.push({ level: 'warning', check: 'refs', path: relMod, message: `est_hours ${est} outside the 2-6 sizing guideline` });
      }
      const concepts = (mod.concepts as string[]) ?? [];
      if (concepts.length < 2) {
        findings.push({ level: 'warning', check: 'refs', path: relMod, message: 'fewer than 2 sibling concepts (allowed only when the material truly has no siblings)' });
      }
      for (const obj of (mod.objectives as { bloom?: string; id?: string }[]) ?? []) {
        if (ceiling && obj.bloom && bloomAbove(obj.bloom, ceiling)) {
          findings.push({ level: 'error', check: 'refs', path: relMod, message: `objective ${obj.id} bloom "${obj.bloom}" exceeds the profile ceiling "${ceiling}"` });
        }
      }
      // a duplicate file within one module.yml silently overwrites in lib/graph.ts's
      // lessonById map (keyed by computed id), so the second entry's lesson vanishes
      // from the graph with no signal anywhere else - this is the only check for it
      const seenLessonFiles = new Set<string>();
      for (const lesson of (mod.lessons as { file?: string; concept?: string; status?: string }[]) ?? []) {
        if (lesson.concept && !concepts.includes(lesson.concept)) {
          findings.push({ level: 'error', check: 'refs', path: relMod, message: `lesson ${lesson.file} concept "${lesson.concept}" not in the module's concepts list` });
        }
        const lessonPath = join(courseDir, 'modules', dirSlug, lesson.file ?? '');
        if (lesson.status && lesson.status !== 'planned' && !existsSync(lessonPath)) {
          findings.push({ level: 'error', check: 'refs', path: relMod, message: `lesson ${lesson.file} has status "${lesson.status}" but the file does not exist` });
        }
        if (lesson.file) {
          if (seenLessonFiles.has(lesson.file)) {
            findings.push({
              level: 'warning',
              check: 'refs',
              path: relMod,
              message: `duplicate lesson file "${lesson.file}" in this module - the second entry silently overwrites the first in the graph`,
            });
          }
          seenLessonFiles.add(lesson.file);
        }
      }
      checkSourceRecords((mod.sources as SourceRecord[]) ?? [], relMod, findings);
    }

    // cross-file: course.yml mirrors the module.yml set
    const courseModules = (course.modules as { slug?: string; status?: string; est_hours?: number; title?: string; serves?: string[]; n?: number }[]) ?? [];
    const courseSlugs = new Set(courseModules.map((m) => m.slug));
    for (const slug of modules.keys()) {
      if (!courseSlugs.has(slug)) {
        findings.push({ level: 'error', check: 'refs', path: relCourse, message: `module ${slug} exists on disk but is missing from course.yml (derived view is stale)` });
      }
    }
    for (const cm of courseModules) {
      const mod = modules.get(cm.slug ?? '');
      if (!mod) {
        findings.push({ level: 'error', check: 'refs', path: relCourse, message: `course.yml lists module ${cm.slug} but modules/${cm.slug}/module.yml does not exist` });
        continue;
      }
      for (const field of ['status', 'est_hours', 'title'] as const) {
        if (cm[field] !== mod[field]) {
          findings.push({
            level: 'error',
            check: 'refs',
            path: relCourse,
            message: `course.yml module ${cm.slug} ${field} "${cm[field]}" drifted from module.yml "${mod[field]}" (regenerate course.yml)`,
          });
        }
      }
    }

    // objectives and prerequisites resolve
    const objectiveIds = new Set(((course.objectives as { id?: string }[]) ?? []).map((o) => o.id));
    for (const obj of (course.objectives as { id?: string; bloom?: string }[]) ?? []) {
      if (ceiling && obj.bloom && bloomAbove(obj.bloom, ceiling)) {
        findings.push({ level: 'error', check: 'refs', path: relCourse, message: `course objective ${obj.id} bloom "${obj.bloom}" exceeds the profile ceiling "${ceiling}"` });
      }
    }
    for (const [slug, mod] of modules) {
      for (const s of (mod.serves as string[]) ?? []) {
        if (!objectiveIds.has(s)) {
          findings.push({ level: 'error', check: 'refs', path: relCourse, message: `module ${slug} serves unknown objective "${s}"` });
        }
      }
      for (const p of (mod.prerequisites as string[]) ?? []) {
        if (!modules.has(p)) {
          findings.push({ level: 'error', check: 'refs', path: relCourse, message: `module ${slug} prerequisite "${p}" names no existing module` });
        }
      }
    }

    // budget: honest sums, at most 10 percent over
    if (typeof budget === 'number' && modules.size > 0) {
      const total = [...modules.values()].reduce((acc, m) => acc + ((m.est_hours as number) || 0), 0);
      if (total > budget * 1.1) {
        findings.push({
          level: 'error',
          check: 'refs',
          path: relCourse,
          message: `module hours sum to ${total}, more than 10 percent over the ${budget}-hour budget`,
        });
      }
    }

    // hub: exists, carries the dependency map, derived markers balanced
    const hubPath = join(courseDir, String(course.hub ?? '').replace(/^\.\//, ''));
    if (!existsSync(hubPath)) {
      findings.push({ level: 'error', check: 'hub', path: relCourse, message: `hub note "${course.hub}" does not exist` });
    } else {
      const hub = readFileSync(hubPath, 'utf8');
      const relHub = relative(repoRoot, hubPath);
      if (!hub.includes('```mermaid')) {
        findings.push({ level: 'error', check: 'hub', path: relHub, message: 'hub note has no mermaid dependency map' });
      }
      const starts = (hub.match(/<!-- meno:derived:start -->/g) ?? []).length;
      const ends = (hub.match(/<!-- meno:derived:end -->/g) ?? []).length;
      if (starts !== ends || starts === 0) {
        findings.push({ level: 'error', check: 'hub', path: relHub, message: `derived markers unbalanced (${starts} start, ${ends} end)` });
      }
    }
  }
  return findings;
}

export function checkLessons(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateLesson = loadSchema('lesson.schema.json');

  for (const courseFile of files.filter((f) => f.endsWith('/course.yml'))) {
    const courseDir = courseFile.slice(0, -'/course.yml'.length);
    const course = parseYamlFile(courseFile, [], 'lessons');
    const courseSlug = String(course?.slug ?? courseDir.split('/').at(-1));

    // course-wide concept union (interleaving legitimately crosses lessons)
    const moduleFiles = files.filter((f) => f.startsWith(join(courseDir, 'modules') + '/') && f.endsWith('/module.yml'));
    const courseConcepts = new Set<string>();
    const modules: { dir: string; slug: string; mod: Record<string, unknown> }[] = [];
    for (const mf of moduleFiles) {
      const mod = parseYamlFile(mf, [], 'lessons');
      if (!mod) continue;
      for (const c of (mod.concepts as string[]) ?? []) courseConcepts.add(c);
      modules.push({ dir: mf.slice(0, -'/module.yml'.length), slug: String(mod.module), mod });
    }

    for (const { dir, slug: moduleSlug, mod } of modules) {
      const moduleConcepts = new Set((mod.concepts as string[]) ?? []);
      const lessons = ((mod.lessons as { file?: string; status?: string; concept?: string }[]) ?? []).filter(
        (l) => l.status && l.status !== 'planned',
      );
      for (const [li, entry] of lessons.entries()) {
        const file = join(dir, entry.file ?? '');
        if (!existsSync(file)) continue; // refs check already reports this
        const rel = relative(repoRoot, file);
        const lesson = parseLesson(readFileSync(file, 'utf8'));
        for (const w of lesson.warnings) findings.push({ level: 'error', check: 'lessons', path: rel, message: w });
        const fm = lesson.frontmatter;
        if (!fm) continue;

        if (!validateLesson(fm)) {
          for (const err of validateLesson.errors ?? []) {
            findings.push({ level: 'error', check: 'lessons', path: rel, message: `${err.instancePath || '/'} ${err.message}` });
          }
        }
        const expectedId = `${courseSlug}/${moduleSlug}/${(entry.file ?? '').replace(/\.md$/, '')}`;
        if (fm.id !== expectedId) {
          findings.push({ level: 'error', check: 'lessons', path: rel, message: `frontmatter id "${fm.id}" should be "${expectedId}"` });
        }
        if (fm.module !== moduleSlug) {
          findings.push({ level: 'error', check: 'lessons', path: rel, message: `frontmatter module "${fm.module}" does not match "${moduleSlug}"` });
        }
        if (fm.status !== entry.status) {
          findings.push({ level: 'warning', check: 'lessons', path: rel, message: `frontmatter status "${fm.status}" drifted from module.yml entry "${entry.status}"` });
        }
        for (const c of (fm.concepts as string[]) ?? []) {
          if (!moduleConcepts.has(c)) {
            findings.push({ level: 'error', check: 'lessons', path: rel, message: `frontmatter concept "${c}" not in the module's concepts list` });
          }
        }

        const anatomy = anatomyOf(lesson);
        if (anatomy.score < 9) {
          const missing = Object.entries(anatomy.parts).filter(([, ok]) => !ok).map(([k]) => k);
          findings.push({ level: 'error', check: 'lessons', path: rel, message: `anatomy ${anatomy.score}/9 - missing: ${missing.join(', ')}` });
        }

        const seenIds = new Set<string>();
        for (const check of lesson.checks) {
          const at = `check at line ${check.line}`;
          for (const field of ['id', 'type', 'concept', 'prompt', 'explain'] as const) {
            if (!check[field]) findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: missing required "${field}"` });
          }
          if (check.answer === undefined) findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: missing required "answer"` });
          if (check.id) {
            if (seenIds.has(check.id)) findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: duplicate check id "${check.id}"` });
            seenIds.add(check.id);
            if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(check.id)) {
              findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: id "${check.id}" is not a kebab-case slug` });
            }
          }
          if (check.type && !['mcq', 'cloze', 'flashcard'].includes(check.type)) {
            findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: unknown type "${check.type}"` });
          }
          if (check.type === 'mcq') {
            const opts = check.options ?? [];
            if (opts.length < 3 || opts.length > 5) {
              findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: mcq needs 3-5 options, has ${opts.length}` });
            }
            const ans = Number(check.answer);
            if (!Number.isInteger(ans) || ans < 1 || ans > opts.length) {
              findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: mcq answer "${check.answer}" out of range 1-${opts.length}` });
            }
          }
          if (check.type === 'cloze' && check.prompt && !check.prompt.includes('{{')) {
            findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: cloze prompt has no {{...}} gap` });
          }
          if (check.concept && !courseConcepts.has(check.concept)) {
            findings.push({ level: 'error', check: 'checks', path: rel, message: `${at}: concept "${check.concept}" not taught anywhere in this course` });
          }
        }

        // interleaving: later lessons in a multi-concept module should mix concepts
        if (li > 0 && moduleConcepts.size >= 2 && lesson.checks.length > 0) {
          const used = new Set(lesson.checks.map((c) => c.concept).filter(Boolean));
          if (used.size === 1) {
            findings.push({ level: 'warning', check: 'checks', path: rel, message: 'all recall checks target one concept; later lessons should interleave earlier concepts' });
          }
        }
      }
    }
  }
  return findings;
}

export function checkLedgers(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateEvent = loadSchema('ledger.schema.json');
  for (const file of files.filter((f) => f.endsWith('/progress/ledger.jsonl'))) {
    const rel = relative(repoRoot, file);
    const { events, warnings } = parseLedger(readFileSync(file, 'utf8'));
    for (const w of warnings) findings.push({ level: 'error', check: 'ledger', path: rel, message: w });
    let prevTs = '';
    for (const [i, e] of events.entries()) {
      const at = `line ${i + 1}`;
      const eventName = e.event;
      if (!validateEvent(e)) {
        const msgs = (validateEvent.errors ?? []).slice(0, 3).map((err) => `${err.instancePath || '/'} ${err.message}`);
        findings.push({ level: 'error', check: 'ledger', path: rel, message: `${at} (${eventName}): ${msgs.join('; ')}` });
      }
      // instants, not strings: offsets make lexicographic comparison lie
      if (prevTs !== '' && (Number.isNaN(Date.parse(e.ts)) || Date.parse(e.ts) <= Date.parse(prevTs))) {
        findings.push({ level: 'error', check: 'ledger', path: rel, message: `${at}: ts "${e.ts}" not strictly after the previous line (ts is a join key; bump 1ms on collision)` });
      }
      prevTs = e.ts;
      // write authority at rest: the one place a hand-edited or buggy-agent ledger gets caught
      const gateClass = e.event !== 'read' && e.event !== 'scored';
      if (e.source === 'ui' && (gateClass || (e as LedgerEvent).level === 'transfer')) {
        findings.push({ level: 'error', check: 'ledger', path: rel, message: `${at}: source "ui" may never carry event "${e.event}"${(e as LedgerEvent).level === 'transfer' ? ' at transfer level' : ''} (decision 14)` });
      }
    }
  }
  return findings;
}

export function checkMastery(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const ledgerFile of files.filter((f) => f.endsWith('/progress/ledger.jsonl'))) {
    const masteryFile = join(ledgerFile.slice(0, -'/ledger.jsonl'.length), 'mastery.yml');
    const relM = relative(repoRoot, masteryFile);
    const { events } = parseLedger(readFileSync(ledgerFile, 'utf8'));
    const expected = serializeMastery(deriveMastery(events));
    if (!existsSync(masteryFile)) {
      findings.push({ level: 'warning', check: 'mastery', path: relM, message: 'mastery.yml not derived yet (node tools/rebuild-mastery.ts <tenant-dir>)' });
      continue;
    }
    const actual = readFileSync(masteryFile, 'utf8');
    if (actual !== expected) {
      findings.push({ level: 'error', check: 'mastery', path: relM, message: 'mastery.yml is not byte-identical to the ledger-derived rebuild (stale or hand-edited; rerun tools/rebuild-mastery.ts)' });
    }
  }
  return findings;
}

const INSIGHTS_SECTIONS = [
  '## What the numbers say',
  '## How you are using Meno',
  '## Where you are stuck',
  '## Suggestions',
  '## Topics you might want',
  '## Limits of this report',
];

// Every standalone numeric token in the body must trace back to the embedded
// metrics_snapshot (docs/specs/insights.md, cite-your-numbers): strip fenced
// and inline code, quoted strings, ISO dates, and id-shaped tokens (containing
// "#" or "/") first, then literal-substring-match what remains against the
// stringified snapshot. Deliberately literal, not percent-aware: a body that
// paraphrases a rate as "62%" when the snapshot holds 0.62 is exactly the kind
// of untraceable restatement this rule exists to catch (study-insights/SKILL.md
// tells the writer to quote n/of or the raw decimal instead).
function uncitedNumbers(body: string, metricsJson: string): string[] {
  let text = body.replace(/```[\s\S]*?```/g, ' ').replace(/`[^`\n]*`/g, ' ');
  text = text.replace(/"[^"\n]*"/g, ' ').replace(/'[^'\n]*'/g, ' ');
  text = text.replace(/\d{4}-\d{2}-\d{2}/g, ' '); // dates, before id-stripping
  text = text.replace(/\S*[#/]\S*/g, ' '); // item/concept ids (and n/of fractions, harmlessly)
  const found = new Set<string>();
  for (const m of text.matchAll(/\d+(?:\.\d+)?/g)) {
    if (!metricsJson.includes(m[0])) found.add(m[0]);
  }
  return [...found];
}

export function checkInsights(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateInsights = loadSchema('insights.schema.json');

  for (const file of files.filter((f) => /\/insights\/[^/]+-insights\.md$/.test(f))) {
    const rel = relative(repoRoot, file);
    const { frontmatter, body, warnings } = parseFrontmatter(readFileSync(file, 'utf8'));
    for (const w of warnings) findings.push({ level: 'error', check: 'insights', path: rel, message: w });
    if (!frontmatter) continue;

    if (!validateInsights(frontmatter)) {
      for (const err of validateInsights.errors ?? []) {
        findings.push({ level: 'error', check: 'insights', path: rel, message: `${err.instancePath || '/'} ${err.message}` });
      }
    }

    for (const section of INSIGHTS_SECTIONS) {
      if (!body.includes(`\n${section}`) && !body.startsWith(section)) {
        findings.push({ level: 'error', check: 'insights', path: rel, message: `missing required section "${section}"` });
      }
    }

    if (frontmatter.metrics_snapshot !== undefined) {
      const metricsJson = JSON.stringify(frontmatter.metrics_snapshot);
      for (const tok of uncitedNumbers(body, metricsJson)) {
        findings.push({
          level: 'warning',
          check: 'insights',
          path: rel,
          message: `number "${tok}" in the body does not appear in frontmatter metrics_snapshot (cite-your-numbers)`,
        });
      }
    }
  }
  return findings;
}

// cost is a machine-produced file (tools/cost.ts's whole body), so the check adds only the
// cross-field rules the schema cannot express (docs/specs/cost.md).
export function checkCost(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const validateCost = loadSchema('cost.schema.json');

  for (const file of files.filter((f) => /\/cost\/snapshot\.json$/.test(f))) {
    const rel = displayPath(file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(file, 'utf8'));
    } catch (e) {
      findings.push({ level: 'error', check: 'cost', path: rel, message: `invalid JSON: ${(e as Error).message}` });
      continue;
    }

    if (!validateCost(parsed)) {
      for (const err of validateCost.errors ?? []) {
        findings.push({ level: 'error', check: 'cost', path: rel, message: `${err.instancePath || '/'} ${err.message}` });
      }
    }
    if (!parsed || typeof parsed !== 'object') continue;

    const snap = parsed as {
      totals?: { attributed_usd?: number; courses_with_data?: number; courses_without_data?: number };
      courses?: { course?: string; dir?: string; cost_usd?: number }[];
      no_data?: { course?: string; dir?: string }[];
    };
    const courses = snap.courses ?? [];
    const noData = snap.no_data ?? [];

    const sumCourses = courses.reduce((acc, c) => acc + (c.cost_usd ?? 0), 0);
    if (typeof snap.totals?.attributed_usd === 'number' && Math.abs(snap.totals.attributed_usd - sumCourses) > 0.005) {
      findings.push({
        level: 'error',
        check: 'cost',
        path: rel,
        message: `totals.attributed_usd (${snap.totals.attributed_usd}) differs from the sum of courses[].cost_usd (${sumCourses}) by more than half a cent`,
      });
    }

    // compared by dir, the unique identity - not by course (the bare basename), which two
    // directories in different domains can legitimately share (docs/specs/cost.md, finding 3)
    const courseDirs = new Set(courses.map((c) => c.dir));
    for (const n of noData) {
      if (n.dir !== undefined && courseDirs.has(n.dir)) {
        findings.push({ level: 'error', check: 'cost', path: rel, message: `dir "${n.dir}" appears in both courses and no_data` });
      }
    }

    if (typeof snap.totals?.courses_with_data === 'number' && snap.totals.courses_with_data !== courses.length) {
      findings.push({
        level: 'error',
        check: 'cost',
        path: rel,
        message: `totals.courses_with_data (${snap.totals.courses_with_data}) does not equal courses.length (${courses.length})`,
      });
    }
    if (typeof snap.totals?.courses_without_data === 'number' && snap.totals.courses_without_data !== noData.length) {
      findings.push({
        level: 'error',
        check: 'cost',
        path: rel,
        message: `totals.courses_without_data (${snap.totals.courses_without_data}) does not equal no_data.length (${noData.length})`,
      });
    }
  }
  return findings;
}

// --- pack-tier checks (community and org content) --------------------------

const SAFETY_ERROR_PATTERNS: [RegExp, string][] = [
  [/<script\b/i, 'script tag'],
  [/<iframe\b/i, 'iframe tag'],
  [/<object\b/i, 'object tag'],
  [/\son\w+\s*=\s*["']/i, 'inline event handler'],
  [/javascript:/i, 'javascript: URL'],
  [/data:text\/html/i, 'data:text/html URL'],
  [/curl[^\n]*\|\s*(sh|bash)\b/, 'curl-pipe-to-shell'],
  [/\b(sk-ant-|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{36})/, 'credential-shaped string'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY/, 'private key block'],
  [/\bprocess\.env\b/, 'environment-variable read'],
  [/~\/\.ssh\b/, 'ssh key path'],
  [/https?:\/\/(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly)\//i, 'URL shortener (hides its destination)'],
];
const SAFETY_WARNING_PATTERNS: [RegExp, string][] = [
  [/ignore (all |any )?(previous|prior|earlier) instructions/i, 'instruction-shaped text'],
  [/you are now\b/i, 'instruction-shaped text'],
  [/\bsystem prompt\b/i, 'instruction-shaped text'],
];
const ANATOMY_HEADINGS = /^##\s+(Before you start|The idea|Worked example|Your turn|Recall|Apply it somewhere new)\b/m;

function loadDomains(): Set<string> {
  const path = join(repoRoot, 'content', 'community', 'DOMAINS.md');
  if (!existsSync(path)) return new Set();
  const out = new Set<string>();
  for (const m of readFileSync(path, 'utf8').matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)) out.add(m[1]);
  return out;
}

/**
 * Attribution for one pack directory. Exported so it can be exercised against a
 * fixture tree: checkPacks scopes packs by their repo-relative path, which no
 * temporary directory can satisfy.
 *
 * Resolution is per unit type, because "does this unit exist" means something
 * different for each: a module is a directory, a note is a file, but a pack
 * ships no lesson bodies, so a lesson is an entry in its module manifest, and a
 * source is a url in that manifest (the key that survives both reordering and
 * re-archiving).
 */
export function checkPackAttribution(packDir: string, rel: string): Finding[] {
  const findings: Finding[] = [];
  const file = join(packDir, 'CONTRIBUTORS.yml');
  if (!existsSync(file)) {
    findings.push({
      level: 'error',
      check: 'pack-attribution',
      path: rel,
      message: 'missing CONTRIBUTORS.yml (who made what, at least one unit: pack record)',
    });
    return findings;
  }
  const relFile = `${rel}/CONTRIBUTORS.yml`;
  const raw = readFileSync(file, 'utf8');
  const validateContributors = loadSchema('contributors.schema.json');
  let parsedYaml: unknown;
  try {
    parsedYaml = parseYaml(raw);
  } catch (e) {
    findings.push({ level: 'error', check: 'pack-attribution', path: relFile, message: (e as Error).message });
    return findings;
  }
  // a schema failure is reported and then the semantic checks still run: they
  // read through the permissive parser, so they cope with a malformed record,
  // and a contributor should not have to fix one defect per run to find the next
  if (!validateContributors(parsedYaml)) {
    for (const err of validateContributors.errors ?? []) {
      findings.push({
        level: 'error',
        check: 'pack-attribution',
        path: relFile,
        message: `${err.instancePath || '/'} ${err.message}`,
      });
    }
  }
  const { doc } = parseContributors(raw);

  if (!doc.contributions.some((c) => c.unit === 'pack')) {
    findings.push({
      level: 'error',
      check: 'pack-attribution',
      path: relFile,
      message: 'no "unit: pack" record - every pack names who made it, and every finer unit inherits from there',
    });
  }

  let previous = '';
  for (const c of doc.contributions) {
    if (c.date < previous) {
      findings.push({
        level: 'error',
        check: 'pack-attribution',
        path: relFile,
        message: `record for "${c.unit}" dated ${c.date} follows ${previous} - the log is append-only and oldest-first`,
      });
      break;
    }
    previous = c.date;
  }

  // what the pack actually contains, read once
  const course = existsSync(join(packDir, 'course.yml')) ? parseYamlFile(join(packDir, 'course.yml'), findings, 'pack-attribution') : null;
  const objectiveIds = new Set(((course?.objectives as { id?: string }[]) ?? []).map((o) => String(o.id)));
  const modules = new Map<string, { lessons: Set<string>; sources: Set<string> }>();
  const modulesDir = join(packDir, 'modules');
  if (existsSync(modulesDir)) {
    for (const entry of readdirSync(modulesDir).sort()) {
      const manifest = join(modulesDir, entry, 'module.yml');
      if (!existsSync(manifest)) continue;
      const mod = parseYamlFile(manifest, findings, 'pack-attribution');
      modules.set(entry, {
        lessons: new Set(((mod?.lessons as { file?: string }[]) ?? []).map((l) => String(l.file))),
        sources: new Set(((mod?.sources as { url?: string }[]) ?? []).map((s) => String(s.url))),
      });
    }
  }

  for (const c of doc.contributions) {
    // a removed record documents that a unit once existed, not that it still does
    if (c.action === 'removed') continue;
    const unit = parseUnit(c.unit);
    if (!unit) {
      findings.push({ level: 'error', check: 'pack-attribution', path: relFile, message: `unit "${c.unit}" is not a unit shape this pack format defines` });
      continue;
    }
    const missing = (what: string): void => {
      findings.push({ level: 'error', check: 'pack-attribution', path: relFile, message: `unit "${c.unit}" names ${what}, which this pack does not have - fix the reference, or mark the record action: removed` });
    };
    switch (unit.kind) {
      case 'pack':
        break;
      case 'objective':
        if (!objectiveIds.has(unit.key!)) missing(`course objective "${unit.key}"`);
        break;
      case 'note':
        if (!existsSync(join(packDir, 'notes', unit.key!))) missing(`reference note "${unit.key}"`);
        break;
      case 'module':
        if (!modules.has(unit.module!)) missing(`module "${unit.module}"`);
        break;
      case 'lesson':
        if (!modules.has(unit.module!)) missing(`module "${unit.module}"`);
        else if (!modules.get(unit.module!)!.lessons.has(unit.key!)) missing(`planned lesson "${unit.key}"`);
        break;
      case 'source':
        if (!modules.has(unit.module!)) missing(`module "${unit.module}"`);
        else if (!modules.get(unit.module!)!.sources.has(unit.key!)) {
          // a source can legitimately be replaced during citation upkeep; the
          // attribution is stale, not wrong, so it must not fail the gate
          findings.push({
            level: 'warning',
            check: 'pack-attribution',
            path: relFile,
            message: `unit "${c.unit}" names a source url this module no longer cites - re-point it or mark it action: removed`,
          });
        }
        break;
    }
  }
  return findings;
}

// Tenant courses sit at <vault>/<domain>/<course-slug>/, the same shape and the same
// closed vocabulary the community tier uses - one grouping, so a course keeps its place
// in the tree whether it is being studied privately or published.
//
// Vault roots are discovered by their home.md rather than by path, because the default
// targets are parents (examples/, content/community/) and a real tenant lives outside
// the repo's tracked tree entirely. home.md is the right marker by definition:
// vault-conventions.md calls it the tenant home note at the vault root, so anything with
// one is a vault and anything without one (a bare course fixture, a golden persona) is not.
export function checkCourseLayout(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const vaultRoots = files
    .filter((f) => f.endsWith('/home.md'))
    .map((f) => f.slice(0, -'/home.md'.length))
    .sort((a, b) => b.length - a.length); // deepest first, so nested fixtures win
  if (vaultRoots.length === 0) return findings;
  const domains = loadDomains();

  for (const file of files) {
    if (!file.endsWith('/course.yml')) continue;
    const dir = file.slice(0, -'/course.yml'.length);
    const root = vaultRoots.find((r) => dir.startsWith(`${r}/`));
    if (!root) continue;
    const rel = relative(repoRoot, dir);
    const parts = relative(root, dir).split('/');
    if (parts.length !== 2) {
      findings.push({
        level: 'error',
        check: 'course-layout',
        path: rel,
        message: `course directory must be <vault>/<domain>/<course-slug> (found ${parts.length} segment(s) below the vault root) - move it under a domain from content/community/DOMAINS.md`,
      });
      continue;
    }
    if (!domains.has(parts[0])) {
      findings.push({
        level: 'error',
        check: 'course-layout',
        path: rel,
        message: `domain "${parts[0]}" is not in content/community/DOMAINS.md (closed vocabulary, shared with the community tier)`,
      });
    }
  }
  return findings;
}

export function checkPacks(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const packFiles = files.filter((f) => {
    const rel = relative(repoRoot, f);
    return rel.startsWith('content/community/') || rel.startsWith('content/org/');
  });
  if (packFiles.length === 0) return findings;
  const domains = loadDomains();
  const validatePack = loadSchema('pack.schema.json');
  const validateNote = loadSchema('reference-note.schema.json');

  // layout + provenance per pack (a pack = a dir with course.yml)
  const packDirs = packFiles.filter((f) => f.endsWith('/course.yml')).map((f) => f.slice(0, -'/course.yml'.length));
  const slugsByDomain = new Map<string, Map<string, string>>();
  const objectivesByDomain = new Map<string, { pack: string; tokens: Set<string> }[]>();
  for (const dir of packDirs) {
    const rel = relative(repoRoot, dir);
    const parts = rel.split('/');
    const underOrg = parts[1] === 'org';
    // content/community/<domain>/<slug> | content/org/<domain>/<slug>
    if (parts.length !== 4) {
      findings.push({ level: 'error', check: 'pack-layout', path: rel, message: `pack directory must be ${underOrg ? 'content/org' : 'content/community'}/<domain>/<slug>` });
      continue;
    }
    const domain = parts[2];
    const slug = parts[3];
    if (!underOrg && !domains.has(domain)) {
      findings.push({ level: 'error', check: 'pack-layout', path: rel, message: `domain "${domain}" is not in content/community/DOMAINS.md (closed vocabulary)` });
    }
    const packMd = join(dir, 'PACK.md');
    if (!existsSync(packMd)) {
      findings.push({ level: 'error', check: 'pack-layout', path: rel, message: 'missing PACK.md (provenance and amendment log)' });
    } else {
      const { frontmatter } = parseFrontmatter(readFileSync(packMd, 'utf8'));
      if (!frontmatter || !validatePack(frontmatter)) {
        for (const err of validatePack.errors ?? []) {
          findings.push({ level: 'error', check: 'pack-layout', path: relative(repoRoot, packMd), message: `${err.instancePath || '/'} ${err.message}` });
        }
        if (!frontmatter) findings.push({ level: 'error', check: 'pack-layout', path: relative(repoRoot, packMd), message: 'missing frontmatter' });
      } else if (frontmatter.pack !== `${domain}/${slug}`) {
        findings.push({ level: 'error', check: 'pack-layout', path: relative(repoRoot, packMd), message: `pack field "${frontmatter.pack}" does not match path "${domain}/${slug}"` });
      }
    }
    const course = parseYamlFile(join(dir, 'course.yml'), findings, 'pack-layout');
    if (course) {
      if (course.status !== 'draft') findings.push({ level: 'error', check: 'pack-layout', path: rel, message: 'a pack course.yml must have status: draft' });
      if ('profile' in course) findings.push({ level: 'error', check: 'pack-layout', path: rel, message: 'a pack course.yml must not have a profile field (packs are pre-contract)' });
      // overlap bookkeeping
      const byDomain = slugsByDomain.get(domain) ?? new Map();
      if (byDomain.has(String(course.slug))) {
        findings.push({ level: 'error', check: 'pack-overlap', path: rel, message: `slug "${course.slug}" collides with ${byDomain.get(String(course.slug))} in the same domain` });
      }
      byDomain.set(String(course.slug), rel);
      slugsByDomain.set(domain, byDomain);
      const tokens = new Set(
        ((course.objectives as { text?: string }[]) ?? [])
          .flatMap((o) => (o.text ?? '').toLowerCase().split(/\W+/))
          .filter((t) => t.length > 3),
      );
      const list = objectivesByDomain.get(domain) ?? [];
      for (const other of list) {
        const inter = [...tokens].filter((t) => other.tokens.has(t)).length;
        const union = new Set([...tokens, ...other.tokens]).size;
        if (union > 0 && inter / union > 0.6) {
          findings.push({ level: 'warning', check: 'pack-overlap', path: rel, message: `objectives overlap heavily with ${other.pack} - amend that pack, or say in PACK.md why this is a different thing` });
        }
      }
      list.push({ pack: rel, tokens });
      objectivesByDomain.set(domain, list);
    }
    findings.push(...checkPackAttribution(dir, rel));
  }

  // reference notes
  for (const f of packFiles.filter((x) => /\/notes\/[^/]+\.md$/.test(x))) {
    const rel = relative(repoRoot, f);
    const text = readFileSync(f, 'utf8');
    const { frontmatter, body } = parseFrontmatter(text);
    if (!frontmatter || !validateNote(frontmatter)) {
      for (const err of validateNote.errors ?? []) {
        findings.push({ level: 'error', check: 'pack-notes', path: rel, message: `${err.instancePath || '/'} ${err.message}` });
      }
      if (!frontmatter) findings.push({ level: 'error', check: 'pack-notes', path: rel, message: 'missing frontmatter (type: reference required)' });
    } else {
      checkSourceRecords((frontmatter.sources as SourceRecord[]) ?? [], rel, findings);
    }
    if (/```meno-check/.test(body)) findings.push({ level: 'error', check: 'pack-notes', path: rel, message: 'reference notes must not contain check blocks' });
    if (/\bTransfer\b/.test(body) && /\[!question\]/.test(body)) findings.push({ level: 'error', check: 'pack-notes', path: rel, message: 'reference notes must not contain transfer prompts' });
    if (ANATOMY_HEADINGS.test(body) || /\*\*You'll be able to:\*\*/.test(body)) {
      findings.push({ level: 'error', check: 'pack-notes', path: rel, message: 'reference notes must not use lesson-anatomy sections (they are ground truth, not pedagogy)' });
    }
  }

  // safety: every file under a pack tree
  for (const f of packFiles) {
    const rel = relative(repoRoot, f);
    if (!/\.(md|yml|yaml)$/.test(f) && !f.endsWith('.gitkeep')) {
      findings.push({ level: 'error', check: 'pack-safety', path: rel, message: 'packs may contain only markdown and YAML files' });
      continue;
    }
    const text = readFileSync(f, 'utf8');
    for (const [re, label] of SAFETY_ERROR_PATTERNS) {
      if (re.test(text)) findings.push({ level: 'error', check: 'pack-safety', path: rel, message: `${label} in community content` });
    }
    for (const [re, label] of SAFETY_WARNING_PATTERNS) {
      if (re.test(text)) findings.push({ level: 'warning', check: 'pack-safety', path: rel, message: `${label} - explain the intent in the pull request` });
    }
    for (const fence of text.matchAll(/```mermaid\n([\s\S]*?)```/g)) {
      if (/\b(click|href)\b/.test(fence[1])) {
        findings.push({ level: 'error', check: 'pack-safety', path: rel, message: 'mermaid click/href directives are not allowed in packs' });
      }
    }
    if (/http:\/\//.test(text)) {
      findings.push({ level: 'warning', check: 'pack-safety', path: rel, message: 'plain-http URL - use https or justify in the pull request' });
    }
  }
  return findings;
}

// --- course groups (tenant-tier, checked wherever a groups.yml is found) -----

export function checkGroups(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files.filter((f) => f.endsWith('/groups.yml'))) {
    const tenantDir = dirname(file);
    const rel = displayPath(file);
    const raw = readFileSync(file, 'utf8');
    const { doc, warnings } = parseGroups(raw);
    // parseGroups is permissive by design (the app must render an edited file
    // inert rather than break); validate is where that permissiveness is
    // reported, since a dropped group is silent data loss from the user's side.
    for (const w of warnings) findings.push({ level: 'error', check: 'groups', path: rel, message: w });

    // courses sit at <vault>/<domain>/<slug>/, and a pre-migration vault still
    // has them at <vault>/<slug>/ - the same two depths lib/course-dirs.ts
    // accepts, so validate and the app can never disagree about what exists.
    // course-layout is what insists on the move; this check only needs to know
    // which slugs are real.
    const slugs: string[] = [];
    for (const courseFile of files) {
      if (!courseFile.startsWith(`${tenantDir}/`) || !courseFile.endsWith('/course.yml')) continue;
      const depth = relative(tenantDir, courseFile).split('/').length;
      if (depth !== 2 && depth !== 3) continue;
      const course = parseYamlFile(courseFile, findings, 'groups');
      if (course) slugs.push(String(course.slug ?? ''));
    }
    const known = new Set(slugs);
    const placed = new Set<string>();
    for (const group of doc.groups) {
      for (const slug of group.courses) {
        if (!known.has(slug)) {
          findings.push({
            level: 'error',
            check: 'groups',
            path: rel,
            message: `group "${group.id}" lists course "${slug}", which is not a course in this tenant`,
          });
          continue;
        }
        placed.add(slug);
      }
    }
    for (const slug of slugs) {
      if (!placed.has(slug)) {
        findings.push({
          level: 'warning',
          check: 'groups',
          path: rel,
          message: `course "${slug}" is in no group - it renders under its domain`,
        });
      }
    }
  }
  return findings;
}

// --- connects (tenant-tier, docs/specs/graph.md) --------------------------

/**
 * The `meno:connects` block in every course hub. `parseConnects` owns the
 * grammar (lib/connects.ts); this only maps its diagnostics onto findings and
 * checks the two rules the parser cannot see on its own: does a target
 * resolve, and does a pair reciprocate.
 *
 * Vault roots are discovered the same way checkCourseLayout does - by the
 * nearest ancestor directory holding a home.md, deepest first - because a hub
 * in a bare course fixture (a pack under content/community/, a golden
 * persona) has no vault above it and skips resolution entirely rather than
 * being reported broken.
 */
export function checkConnects(_target: string, files: string[]): Finding[] {
  const findings: Finding[] = [];
  const vaultRoots = files
    .filter((f) => f.endsWith('/home.md'))
    .map((f) => f.slice(0, -'/home.md'.length))
    .sort((a, b) => b.length - a.length); // deepest first, so nested fixtures win

  const graphCache = new Map<string, VaultGraph>();
  const graphFor = (root: string): VaultGraph => {
    let g = graphCache.get(root);
    if (!g) {
      g = buildVaultGraph(loadVaultFiles(root));
      graphCache.set(root, g);
    }
    return g;
  };

  // per vault root: hub id (vault-relative) -> its file and the set of
  // resolved target ids it names, for the reciprocity pass below
  const outgoingByRoot = new Map<string, Map<string, { file: string; targets: Set<string> }>>();

  for (const file of files.filter((f) => f.endsWith('-hub.md'))) {
    const rel = displayPath(file);
    const block = parseConnects(readFileSync(file, 'utf8'));
    for (const d of block.diagnostics) {
      findings.push({
        level: d.level,
        check: 'connects',
        path: rel,
        message: d.line > 0 ? `line ${d.line}: ${d.message}` : d.message,
      });
    }
    if (block.entries.length === 0) continue;

    const root = vaultRoots.find((r) => file.startsWith(`${r}/`));
    if (!root) continue; // a bare course fixture with no vault root above it skips resolution entirely

    const graph = graphFor(root);
    const hubId = relative(root, file).split('\\').join('/');
    const resolvedTargets = new Set<string>();
    for (const entry of block.entries) {
      const resolved = graph.index.get(entry.target) ?? null;
      if (!resolved) {
        findings.push({
          level: 'error',
          check: 'connects',
          path: rel,
          message: `meno:connects target "${entry.target}" does not resolve to a note in this vault`,
        });
        continue;
      }
      if (resolved === hubId) {
        // a self-targeting bullet parses and resolves; dedupeEdges drops the
        // resulting self-loop from lib/graph.ts silently, so this is the
        // reader's only signal that the bullet did nothing
        findings.push({
          level: 'warning',
          check: 'connects',
          path: rel,
          message: `meno:connects target "${entry.target}" resolves to this hub itself (self-link) - the edge is dropped`,
        });
        continue; // not a real target: excluded from the reciprocity pass below
      }
      resolvedTargets.add(resolved);
    }
    const byHub = outgoingByRoot.get(root) ?? new Map();
    byHub.set(hubId, { file, targets: resolvedTargets });
    outgoingByRoot.set(root, byHub);
  }

  for (const byHub of outgoingByRoot.values()) {
    for (const [hubId, { file, targets }] of byHub) {
      for (const target of targets) {
        const other = byHub.get(target);
        const reciprocal = other ? other.targets.has(hubId) : false;
        if (!reciprocal) {
          findings.push({
            level: 'warning',
            check: 'connects',
            path: displayPath(file),
            message: `meno:connects: "${hubId}" names "${target}" but "${target}" does not name "${hubId}" back`,
          });
        }
      }
    }
  }

  return findings;
}

type Check = (target: string, files: string[]) => Finding[];
const CHECKS: Record<string, Check> = {
  profiles: checkProfiles,
  courses: checkCourses,
  lessons: checkLessons,
  ledger: checkLedgers,
  mastery: checkMastery,
  insights: checkInsights,
  cost: checkCost,
  packs: checkPacks,
  groups: checkGroups,
  'course-layout': checkCourseLayout,
  tenancy: checkTenancy,
  connects: checkConnects,
};

export function runValidation(targets: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const target of targets) {
    if (!existsSync(target)) {
      findings.push({ level: 'error', check: 'cli', path: target, message: 'target does not exist' });
      continue;
    }
    const files = walk(target);
    for (const check of Object.values(CHECKS)) findings.push(...check(target, files));
  }
  return findings;
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop() ?? '');
if (isMain) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const json = args.includes('--json');
  const targets = args.filter((a) => !a.startsWith('--'));
  if (targets.length === 0) {
    targets.push(join(repoRoot, 'examples'), join(repoRoot, 'content', 'community'));
    if (existsSync(join(repoRoot, 'content', 'org'))) targets.push(join(repoRoot, 'content', 'org'));
  }

  const findings = runValidation(targets);
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warning');

  if (json) {
    console.log(JSON.stringify({ errors, warnings }, null, 2));
  } else {
    for (const f of findings) console.log(`${f.level.toUpperCase()} [${f.check}] ${f.path}: ${f.message}`);
    console.log(`\nvalidate: ${errors.length} error(s), ${warnings.length} warning(s)`);
  }
  process.exit(errors.length > 0 ? 1 : warnings.length > 0 && strict ? 2 : 0);
}
