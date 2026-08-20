// THROWAWAY MIGRATION TOOL - NOT the ongoing mechanism. From now on
// generate-module writes and updates a module's terms.yml alongside its
// lesson bodies (.agents/skills/generate-module/references/terms-format.md
// is the canonical format). This script exists once, to seed terms.yml
// skeletons for lessons that were generated before the glossary feature
// existed. Run it, hand the TODO definitions to a human or an agent to fill
// in following the two-sentence rule, run `npm run validate`, then forget
// this file exists - it is not meant to run again against the same course.
//
// It never authors a real definition. It has no model call and does not try
// to understand a lesson's content beyond pattern-matching candidate terms
// (bold/emphasis introductions, custom headings, and backtick-wrapped code
// identifiers) out of the lesson body's prose. Every emitted definition is
// the literal string "TODO: ..." - replace every one before this output is
// fit to commit.
//
// Deterministic and dependency-free: no model call, network, or new npm
// package - just node:fs, node:path, and the yaml package this repo already
// depends on.
//
// Usage:
//   node tools/backfill-terms.ts <course-dir> [--force] [--dry-run]
//   node tools/backfill-terms.ts --help
//
//   <course-dir>  a directory holding course.yml and modules/*/module.yml
//   --force       overwrite a terms.yml that already exists (default: skip it)
//   --dry-run     print what would be written, write nothing
//
// This tool NEVER modifies a lesson .md file or a module.yml. That is
// asserted at the one place this file ever calls writeFileSync (assertTermsPath
// below), not just claimed in this comment.
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const HELP = `Usage: node tools/backfill-terms.ts <course-dir> [--force] [--dry-run]

Throwaway migration: seeds a terms.yml SKELETON per module, with real term
candidates but TODO definition placeholders. It does not author definitions -
a human or an agent still has to fill in every "TODO: ..." following the
two-sentence rule in .agents/skills/generate-module/references/terms-format.md
before the output is fit to commit. It never touches a lesson .md file or a
module.yml.

  <course-dir>  a directory holding course.yml and modules/*/module.yml
  --force       overwrite a terms.yml that already exists (default: skip it)
  --dry-run     print what would be written to each module; write nothing
  --help        show this message
`;

interface ModuleManifest {
  module: string;
  lessons: { file: string; title?: string }[];
}

/** The one gate every write in this file passes through. */
function assertTermsPath(path: string): void {
  if (!path.endsWith('/terms.yml') && path !== 'terms.yml') {
    throw new Error(`refusing to write "${path}" - this tool only ever writes a terms.yml`);
  }
}

/** Strip fenced code blocks so their contents never look like inline terms. */
function stripCodeFences(body: string): string {
  return body.replace(/```[\s\S]*?```/g, '');
}

const BOLD = /\*\*([^*\n]{2,40})\*\*/g;
const INLINE_CODE = /`([^`\n]{1,40})`/g;
const HEADING = /^##\s+(.+)$/gm;

/** Section headings the nine-part anatomy uses on every lesson - never a term. */
const BOILERPLATE_HEADINGS = new Set([
  'before you start',
  'the idea',
  'worked example',
  'your turn',
  'recall',
  'apply it somewhere new',
]);

/** Bold spans that are the anatomy's own labels, never a term being introduced. */
const BOILERPLATE_BOLD = /^(you'll be able to|worked example|completion problem|full problem|answer|check yourself|contrast \d)/i;

/**
 * Candidate terms out of one lesson body: bold/emphasis introductions, custom
 * (non-anatomy) headings, and short backtick-wrapped identifiers. Heuristic
 * and over-inclusive on purpose - a human or agent prunes and defines what
 * survives, this only saves them from starting with a blank file.
 */
/**
 * Whether a matched string is worth offering as a term at all.
 *
 * Pattern-matching a lesson body catches real vocabulary and the example
 * code's local variables in the same pass, and `s1`/`s2` from a worked
 * ownership example are not terms - they are the names that example happened
 * to pick. A skeleton row costs a human one deletion, but a page of them costs
 * the review that makes this tool worth running, so the bar is: at least two
 * characters, containing a letter, and not a bare identifier-plus-digit.
 *
 * Deliberately conservative in the other direction too - it cannot tell a real
 * term from a stray emphasis, and it is not supposed to. Every row it emits is
 * still a TODO for a human or an agent to accept, reword, or delete.
 */
function isPlausibleTerm(term: string): boolean {
  if (term.length < 2) return false;
  if (!/[\p{L}]/u.test(term)) return false;
  // s1, x2, n3: one letter then digits is a worked example's variable name
  if (/^[\p{L}]\d+$/u.test(term)) return false;
  return true;
}

function candidateTerms(markdown: string): string[] {
  const withoutFrontmatter = markdown.replace(/^---\n[\s\S]*?\n---\n/, '');
  const body = stripCodeFences(withoutFrontmatter);
  const found: string[] = [];

  for (const m of body.matchAll(BOLD)) {
    const text = m[1].trim();
    if (!text || BOILERPLATE_BOLD.test(text)) continue;
    found.push(text);
  }
  for (const m of body.matchAll(HEADING)) {
    const text = m[1].trim();
    if (!text || BOILERPLATE_HEADINGS.has(text.toLowerCase())) continue;
    found.push(text);
  }
  for (const m of body.matchAll(INLINE_CODE)) {
    const text = m[1].trim();
    // a single word/symbol/short path only - not a whole expression or command line
    if (!text || /[\n;{}]/.test(text) || text.split(/\s+/).length > 4) continue;
    found.push(text);
  }

  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const raw of found) {
    // Trailing sentence punctuation is an artifact of the pattern that caught
    // the phrase (a bold lead-in like **Variables.** is one), never part of the
    // term - left on, it becomes the literal glossary heading "Variables.".
    const term = raw.replace(/[.,;:!?]+$/, '').trim();
    if (!isPlausibleTerm(term)) continue;
    const key = term.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(term);
  }
  return deduped;
}

interface TermsSkeleton {
  schema_version: 1;
  terms: { term: string; lesson: string; definition: string }[];
}

function buildSkeleton(mod: ModuleManifest, modDir: string): TermsSkeleton | null {
  const terms: TermsSkeleton['terms'] = [];
  let anyLessonOnDisk = false;

  for (const lesson of mod.lessons) {
    const lessonPath = join(modDir, lesson.file);
    if (!existsSync(lessonPath)) continue;
    anyLessonOnDisk = true;

    const candidates = candidateTerms(readFileSync(lessonPath, 'utf8')).slice(0, 5);
    if (candidates.length === 0) {
      // Still seed one placeholder row so the lesson is not silently
      // uncovered - a human either defines it or moves the file into
      // no_terms by hand, but they will not get an unexplained validate
      // error with no starting point.
      terms.push({
        term: 'TODO: name a term this lesson introduces',
        lesson: lesson.file,
        definition: 'TODO: two sentences - what it is, then what breaks or changes without it.',
      });
      continue;
    }
    for (const term of candidates) {
      terms.push({
        term,
        lesson: lesson.file,
        definition: 'TODO: two sentences - what it is, then what breaks or changes without it.',
      });
    }
  }

  if (!anyLessonOnDisk) return null;
  return { schema_version: 1, terms };
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.length === 0) {
    console.log(HELP);
    process.exit(args.includes('--help') ? 0 : 1);
  }

  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const courseArg = args.find((a) => !a.startsWith('--'));
  if (!courseArg) {
    console.error(HELP);
    process.exit(1);
  }

  const courseDir = resolve(courseArg);
  const modulesDir = join(courseDir, 'modules');
  if (!existsSync(join(courseDir, 'course.yml')) || !existsSync(modulesDir)) {
    console.error(`"${courseArg}" does not look like a course directory (no course.yml or modules/)`);
    process.exit(1);
  }

  let wrote = 0;
  let skipped = 0;

  for (const entry of readdirSync(modulesDir).sort()) {
    const modDir = join(modulesDir, entry);
    const manifestPath = join(modDir, 'module.yml');
    if (!existsSync(manifestPath)) continue;

    const mod = parseYaml(readFileSync(manifestPath, 'utf8')) as ModuleManifest;
    const skeleton = buildSkeleton(mod, modDir);
    if (!skeleton) continue; // no lesson body on disk yet - nothing to seed

    const termsPath = join(modDir, 'terms.yml');
    assertTermsPath(termsPath);

    if (existsSync(termsPath) && !force) {
      console.log(`skip  ${termsPath} (already exists - pass --force to overwrite)`);
      skipped += 1;
      continue;
    }

    const yamlText = stringifyYaml(skeleton);
    if (dryRun) {
      console.log(`--- would write ${termsPath} ---`);
      console.log(yamlText);
    } else {
      writeFileSync(termsPath, yamlText);
      console.log(`wrote ${termsPath} (${skeleton.terms.length} term row(s), all TODO)`);
    }
    wrote += 1;
  }

  console.log(
    `\n${dryRun ? 'would write' : 'wrote'} ${wrote} module(s), skipped ${skipped}. ` +
      'Every definition is a TODO placeholder - fill each one in following ' +
      '.agents/skills/generate-module/references/terms-format.md before running ' +
      '`npm run validate`.',
  );
}

main();
