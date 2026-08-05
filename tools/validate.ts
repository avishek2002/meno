import { fileURLToPath } from 'node:url';
// Deterministic, offline validation of every content format Meno defines.
// Usage: node tools/validate.ts [targetDir ...] [--strict] [--json]
//   targets default to examples/ - every course tree found under each target
//   is checked. Exit codes: 0 clean (or warnings without --strict), 1 errors,
//   2 warnings-only under --strict.
//
// Checks grow phase by phase; docs/specs/validation.md is the spec.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsExport from 'ajv-formats';

// ajv-formats ships CommonJS; under Node ESM the callable lands on .default
const addFormats = ((addFormatsExport as unknown as { default?: unknown }).default ??
  addFormatsExport) as (ajv: Ajv2020) => void;
import { parse as parseYaml } from 'yaml';
import { parseFrontmatter } from '../lib/frontmatter.ts';
import { parseLesson, anatomyOf } from '../lib/lesson.ts';
import { parseLedger, deriveMastery, serializeMastery, type LedgerEvent } from '../lib/mastery.ts';

export interface Finding {
  level: 'error' | 'warning';
  check: string;
  path: string;
  message: string;
}

const repoRoot = fileURLToPath(new URL('..', import.meta.url));

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
      for (const lesson of (mod.lessons as { file?: string; concept?: string; status?: string }[]) ?? []) {
        if (lesson.concept && !concepts.includes(lesson.concept)) {
          findings.push({ level: 'error', check: 'refs', path: relMod, message: `lesson ${lesson.file} concept "${lesson.concept}" not in the module's concepts list` });
        }
        const lessonPath = join(courseDir, 'modules', dirSlug, lesson.file ?? '');
        if (lesson.status && lesson.status !== 'planned' && !existsSync(lessonPath)) {
          findings.push({ level: 'error', check: 'refs', path: relMod, message: `lesson ${lesson.file} has status "${lesson.status}" but the file does not exist` });
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

type Check = (target: string, files: string[]) => Finding[];
const CHECKS: Record<string, Check> = {
  profiles: checkProfiles,
  courses: checkCourses,
  lessons: checkLessons,
  ledger: checkLedgers,
  mastery: checkMastery,
  insights: checkInsights,
  packs: checkPacks,
  tenancy: checkTenancy,
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
