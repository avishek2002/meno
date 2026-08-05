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
import { parseFrontmatter } from '../lib/frontmatter.ts';

export interface Finding {
  level: 'error' | 'warning';
  check: string;
  path: string;
  message: string;
}

const repoRoot = new URL('..', import.meta.url).pathname;

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
  if (!/^content\/$/m.test(gitignore)) {
    findings.push({
      level: 'error',
      check: 'tenancy',
      path: '.gitignore',
      message: 'missing the content/ tenancy rule',
    });
  }
  return findings;
}

type Check = (target: string, files: string[]) => Finding[];
const CHECKS: Record<string, Check> = {
  profiles: checkProfiles,
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
  if (targets.length === 0) targets.push(join(repoRoot, 'examples'));

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
