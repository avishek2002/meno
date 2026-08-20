// The glossary core: one parser for a module's `terms.yml` sidecar, the merge
// that turns every module's file into one ordered glossary per course, and the
// deterministic counters the format's rules are stated in. The app server reads
// through these functions and tools/validate.ts checks with them, so "what a
// definition says" and "is that definition legal" can never be answered twice
// (docs/specs/app.md invariant 8, the same rule lib/groups.ts holds).
//
// Everything here is pure: no filesystem, no network, no clock. A caller reads
// the files and hands the parsed documents in; this module only decides shape
// and order. That is what lets `node --test` cover it the way it covers
// lib/groups.ts and lib/connects.ts.
//
// **Terms are inert, and that is a design constraint, not an accident.** A
// manifest's `concepts:` list is mastery-bearing - lib/mastery.ts gives every
// concept a review state and a share of a gate - so it is tempting to reach for
// the same wiring here, and every field below would support it. Do not. A term
// is display vocabulary: it never becomes a review item, never moves a gate,
// never appears in a due computation, and nothing in this file or its consumers
// reads the ledger. The glossary is a reference surface over generated lesson
// bodies, and making it evidence would quietly change what a learner's mastery
// numbers mean.
//
// The prose definition of the format (who writes it, when, and in what voice)
// belongs to .agents/skills/generate-module/references/terms-format.md;
// schemas/terms.schema.json is the field-level half. This file owns only the
// machine-checkable rules those two point at.
import { parse as parseYaml } from 'yaml';

export const SCHEMA_VERSION = 1;

/** A definition is exactly two sentences: what it is, then what breaks without it. */
export const DEFINITION_SENTENCES = 2;

/**
 * The word cap. Deliberately a soft ceiling - two sentences that earn their
 * length are better than two that were truncated - so tools/validate.ts reports
 * crossing it as a warning while a wrong sentence count is an error.
 */
export const MAX_DEFINITION_WORDS = 45;

/**
 * Jaccard similarity below which two definitions of the same term count as
 * materially different wording. 0.6 is chosen to sit above ordinary
 * paraphrase (same nouns, reordered clauses, a swapped verb) and below a
 * genuine re-explanation, which shares little more than its function words.
 */
export const DEFINITION_SIMILARITY_FLOOR = 0.6;

/** One authored row of a module's terms.yml. */
export interface TermEntry {
  /** The term as its lesson body spells it. Display only - merge identity is termKey(). */
  term: string;
  /** A lessons[].file value from this module's own module.yml, suffix included. */
  lesson: string;
  definition: string;
  /** Other terms in the same course worth reading beside this one. */
  see_also?: string[];
}

/** A parsed terms.yml. `no_terms` defaults to empty; absent is the same as none. */
export interface TermsDoc {
  schema_version: number;
  terms: TermEntry[];
  /**
   * Lessons that deliberately introduce no new vocabulary. Coverage can only be
   * required if a lesson has a way to say "nothing here" that is not an invented
   * filler term, and silence cannot be that way - silence is also what a
   * forgotten lesson looks like.
   */
  no_terms: string[];
}

/**
 * One module's file plus the identity a merge needs. The caller supplies this
 * from the tree walk; nothing here goes looking for it.
 */
export interface ModuleTerms {
  /** course slug, as course.yml declares it */
  course: string;
  course_title: string;
  /** the course's domain directory, or null for a course still at the vault root */
  domain: string | null;
  /** module slug, as module.yml declares it */
  module: string;
  /** the module's manifest title - the client groups entries under it */
  module_title: string;
  /** this module's lessons in manifest order - the within-module display order */
  lessons: { file: string; title: string }[];
  doc: TermsDoc;
}

/** Where a term was introduced or reused. The client builds the href (see docs). */
export interface GlossaryBacklink {
  course: string;
  module: string;
  /**
   * The module's manifest title. Carried on the backlink rather than looked up
   * client-side because the client has no module list to look it up in - the
   * glossary response is the only thing it fetches, and a page that groups by
   * module (which is what makes the order legible as curriculum order rather
   * than an arbitrary sequence) needs a human-readable heading for each run.
   */
  module_title: string;
  /** lesson file with its .md suffix, exactly as module.yml spells it */
  file: string;
  /** the lesson's manifest title, or the file name when the manifest does not list it */
  title: string;
}

/** One merged glossary row: one per distinct term key within a course. */
export interface GlossaryEntry {
  /** termKey(term) - the merge identity, and a stable anchor id for the client */
  key: string;
  /** display spelling, taken from the first entry encountered in curriculum order */
  term: string;
  /** the canonical definition: the first one encountered in curriculum order */
  definition: string;
  introduced_by: GlossaryBacklink;
  /** every later lesson that defined the same term again, in curriculum order */
  reused_by: GlossaryBacklink[];
  /** merged see_also, as term keys, deduplicated and sorted; self-references dropped */
  see_also: string[];
}

export interface GlossaryCourse {
  course: string;
  title: string;
  domain: string | null;
  /** curriculum order: module sequence, then lesson sequence within a module */
  entries: GlossaryEntry[];
}

export interface MergedGlossary {
  courses: GlossaryCourse[];
  /** Degraded-path notes (unknown lesson, divergent duplicate). Never an error. */
  warnings: string[];
}

/**
 * A term key that is a plain word phrase: letters, digits, spaces, hyphens and
 * apostrophes only. Anything outside that - angle brackets, colons, `::`,
 * parentheses - is code-shaped, and code-shaped spellings keep their case.
 */
const PROSE_PHRASE = /^[\p{L}\p{N}][\p{L}\p{N} '’-]*$/u;

/**
 * The merge identity of a term, and the one rule that decides whether two
 * spellings are the same term.
 *
 * Normalize to NFC, collapse whitespace runs, trim. Then fold case **only** for
 * a multi-word prose phrase: capitalization inside a single token is the
 * identifier's own spelling and is load-bearing (Rust's `Copy` trait is not the
 * verb `copy`, `Result` is not `result`), while capitalization across a phrase
 * is only sentence or title case ("Context Window" and "context window" are one
 * term). A hyphen counts as a word separator for the same reason: identifiers
 * cannot contain one, so a hyphenated spelling is prose.
 *
 * Rejected alternative: fold case always, and let the divergent-definition
 * warning catch `Copy` merged with `copy`. That silently ships one wrong
 * glossary row to the learner whenever the two definitions happen to be worded
 * alike, which is the failure this rule exists to make impossible.
 */
export function termKey(term: string): string {
  const normalized = term.normalize('NFC').replace(/\s+/g, ' ').trim();
  const isPhrase = /[ -]/.test(normalized) && PROSE_PHRASE.test(normalized);
  return isPhrase ? normalized.toLowerCase() : normalized;
}

const CODE_SPAN = /`[^`]*`/g;

/**
 * Abbreviations whose trailing period is followed by a space and so would
 * otherwise read as a sentence end. Kept deliberately short and technical: a
 * word wrongly listed here hides a real terminator (a missed error), which is
 * worse than the false error a missing one causes. `no.` and the personal
 * titles are excluded for exactly that reason - "the answer is no." is a real
 * sentence end.
 */
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|cf|approx|al|fig)\./gi;

/**
 * A period is a sentence terminator only when whitespace or end-of-string
 * follows it. That single rule covers decimals (3.1416), dotted names
 * (node.js, Array.prototype), URLs, and interior initials (U.S.A) without a
 * list, and it is why the abbreviation list above needs only the cases where a
 * space genuinely does follow.
 */
const INLINE_PERIOD = /\.(?!\s|$)/g;

/** The stand-in a masked period becomes: never whitespace, never a terminator. */
const MASKED = '';

/**
 * The one preprocessing pass both counters and the divergence predicate share,
 * so all three agree about what a word and a sentence are. A code span
 * collapses to the single word `code` - its contents are not prose, and its
 * periods are certainly not sentence ends.
 */
function maskDefinition(definition: string): string {
  return definition
    .normalize('NFC')
    .replace(CODE_SPAN, 'code')
    .replace(ABBREVIATIONS, (match) => match.replaceAll('.', MASKED))
    .replace(INLINE_PERIOD, MASKED);
}

/**
 * Sentences in a definition. A run of `.`, `!` or `?` followed by whitespace or
 * end-of-string closes one sentence; trailing text after the last terminator
 * counts as one more, so a definition missing its final period still counts as
 * the two sentences it reads as rather than one.
 */
export function countSentences(definition: string): number {
  const text = maskDefinition(definition).trim();
  if (text === '') return 0;
  let count = 0;
  let end = 0;
  for (const match of text.matchAll(/[.!?]+(?=\s|$)/g)) {
    count += 1;
    end = (match.index ?? 0) + match[0].length;
  }
  if (text.slice(end).trim() !== '') count += 1;
  return count;
}

/** Words in a definition: whitespace-separated tokens holding a letter or digit. */
export function countWords(definition: string): number {
  return maskDefinition(definition)
    .split(/\s+/)
    .filter((token) => /[\p{L}\p{N}]/u.test(token)).length;
}

function definitionTokens(definition: string): Set<string> {
  return new Set(
    maskDefinition(definition)
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token !== ''),
  );
}

/**
 * Whether two definitions of the same term are materially different wording -
 * the drift signal, and never an error: two lessons legitimately introduce a
 * term from two angles, and only a human can say which reading is wanted.
 *
 * Jaccard similarity over the normalized token sets, below
 * DEFINITION_SIMILARITY_FLOOR. Set-based and dependency-free on purpose: an
 * edit-distance or embedding comparison would be either a new dependency or a
 * model call, and validate is offline and deterministic by charter. Function
 * words are kept rather than stripped, which makes the measure forgiving - the
 * right bias for a warning.
 */
export function definitionsDiverge(a: string, b: string): boolean {
  const left = definitionTokens(a);
  const right = definitionTokens(b);
  let shared = 0;
  for (const token of left) if (right.has(token)) shared += 1;
  const union = left.size + right.size - shared;
  if (union === 0) return false;
  return shared / union < DEFINITION_SIMILARITY_FLOOR;
}

/** A fresh empty document, never a shared constant - callers mutate what they read. */
const emptyDoc = (): TermsDoc => ({ schema_version: SCHEMA_VERSION, terms: [], no_terms: [] });

/**
 * Permissive read, the same degraded-path rule parseGroups follows: anything
 * that does not match the shape is dropped with a warning rather than rejected
 * wholesale, so one bad hand edit costs one term and not the whole page.
 * tools/validate.ts is where those warnings become findings, because a dropped
 * term is silent data loss from the author's side.
 */
export function parseTerms(raw: string): { doc: TermsDoc; warnings: string[] } {
  const warnings: string[] = [];
  if (raw.trim() === '') return { doc: emptyDoc(), warnings };

  let parsed: unknown;
  try {
    parsed = parseYaml(raw);
  } catch (e) {
    return { doc: emptyDoc(), warnings: [`terms.yml: ${(e as Error).message}`] };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { doc: emptyDoc(), warnings: ['terms.yml: not a YAML mapping'] };
  }

  const rawTerms = (parsed as { terms?: unknown }).terms;
  if (rawTerms !== undefined && !Array.isArray(rawTerms)) {
    return { doc: emptyDoc(), warnings: ['terms.yml: "terms" is not a list'] };
  }

  const terms: TermEntry[] = [];
  for (const entry of (rawTerms as unknown[]) ?? []) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      warnings.push('terms.yml: a term entry is not a mapping - dropped');
      continue;
    }
    const { term, lesson, definition, see_also: seeAlso } = entry as {
      term?: unknown;
      lesson?: unknown;
      definition?: unknown;
      see_also?: unknown;
    };
    if (typeof term !== 'string' || term.trim() === '') {
      warnings.push('terms.yml: a term entry has no "term" - dropped');
      continue;
    }
    if (typeof lesson !== 'string' || !lesson.endsWith('.md')) {
      warnings.push(`terms.yml: term "${term}" names no lesson file - dropped`);
      continue;
    }
    if (typeof definition !== 'string' || definition.trim() === '') {
      warnings.push(`terms.yml: term "${term}" has no definition - dropped`);
      continue;
    }
    // A scalar here (`see_also: mutable borrow` instead of `[mutable borrow]`)
    // is the likeliest hand-edit typo in this format, and dropping it in silence
    // broke this parser's own rule that a dropped field always warns. It matters
    // more than it looks: app/server/glossary.ts calls parseTerms and never the
    // schema, so without this the field vanished from a served page leaving no
    // trace in GlossaryResponse.warnings until someone happened to run validate.
    if (seeAlso !== undefined && !Array.isArray(seeAlso)) {
      warnings.push(`terms.yml: term "${term}" has a see_also that is not a list - ignored`);
    }
    const kept: string[] = [];
    for (const related of Array.isArray(seeAlso) ? seeAlso : []) {
      if (typeof related !== 'string' || related.trim() === '') {
        warnings.push(`terms.yml: term "${term}" has an empty see_also entry - dropped`);
        continue;
      }
      kept.push(related);
    }
    // lesson is trimmed for the same reason term is: " 01-alpha.md" clears both
    // .endsWith('.md') and the schema's unanchored pattern, so nothing upstream
    // rejects it, and untrimmed it reaches the client as a dead lessonHref with
    // the padding baked into the URL.
    terms.push({ term: term.normalize('NFC').replace(/\s+/g, ' ').trim(), lesson: lesson.trim(), definition: definition.trim(), see_also: kept });
  }

  const rawNoTerms = (parsed as { no_terms?: unknown }).no_terms;
  if (rawNoTerms !== undefined && !Array.isArray(rawNoTerms)) {
    warnings.push('terms.yml: "no_terms" is not a list - ignored');
  }
  const noTerms: string[] = [];
  for (const file of Array.isArray(rawNoTerms) ? rawNoTerms : []) {
    if (typeof file !== 'string' || !file.endsWith('.md')) {
      warnings.push('terms.yml: a no_terms entry is not a lesson file - dropped');
      continue;
    }
    noTerms.push(file);
  }

  const version = (parsed as { schema_version?: unknown }).schema_version;
  return {
    doc: {
      schema_version: typeof version === 'number' ? version : SCHEMA_VERSION,
      terms,
      no_terms: noTerms,
    },
    warnings,
  };
}

/** A backlink is one lesson; the same lesson never appears twice in one entry. */
const backlinkId = (link: GlossaryBacklink): string => `${link.course}\u0000${link.module}\u0000${link.file}`;

/**
 * Merge every module's terms.yml into one glossary per course.
 *
 * **The caller supplies curriculum order and this function preserves it**:
 * `modules` arrives in module sequence per course, and each module's `lessons`
 * arrives in manifest order. Ordering is deliberately not alphabetical - a
 * glossary read alongside a course is read in the order the course teaches, and
 * an alphabetical list separates a term from the lesson that motivates it.
 *
 * One entry per term key per course. The first definition encountered wins and
 * becomes canonical, its lesson becomes `introduced_by`, and every later lesson
 * that defines the same term again becomes a `reused_by` backlink; `see_also`
 * unions across all of them. A later definition that is materially different
 * wording (definitionsDiverge) is reported as a warning and otherwise ignored -
 * this function never picks a winner on content.
 *
 * Courses appear in first-seen order, so the caller decides that too.
 */
export function mergeTerms(modules: ModuleTerms[]): MergedGlossary {
  const warnings: string[] = [];
  const courses = new Map<string, GlossaryCourse>();
  const byKey = new Map<string, Map<string, GlossaryEntry>>();
  // raw see_also strings held per entry until the whole course is merged, so a
  // forward reference to a term a later module introduces still resolves
  const relatedRaw = new Map<string, string[]>();
  const backlinksSeen = new Map<string, Set<string>>();

  for (const mod of modules) {
    // Course identity is domain plus slug, never the slug alone. Two courses in
    // two domains can carry the same slug on disk (nothing in validate forbids
    // it), and keying on the slug alone silently folded them into one glossary
    // course: the second course's title and domain vanished, and its terms read
    // as re-definitions of the first's, emitting a "defined differently"
    // warning that attributed one course's wording to another. The rest of the
    // app does resolve a course by slug alone (routes.ts's tree.courses.find),
    // so that assumption is real elsewhere - but a wrong lesson route 404s
    // where a wrong glossary row just quietly lies, so this does not inherit it.
    const courseId = `${mod.domain ?? ''}\u0000${mod.course}`;
    let course = courses.get(courseId);
    if (!course) {
      course = { course: mod.course, title: mod.course_title, domain: mod.domain, entries: [] };
      courses.set(courseId, course);
      byKey.set(courseId, new Map());
    }
    const entriesByKey = byKey.get(courseId) as Map<string, GlossaryEntry>;

    // lesson order within the module comes from the manifest, not from the
    // order the author happened to write the terms in; an entry naming a lesson
    // the manifest does not list sorts last rather than disappearing
    const rank = new Map(mod.lessons.map((l, i) => [l.file, i]));
    const titles = new Map(mod.lessons.map((l) => [l.file, l.title]));
    const ordered = mod.doc.terms
      .map((entry, index) => ({ entry, index, rank: rank.get(entry.lesson) ?? Number.MAX_SAFE_INTEGER }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index);

    for (const { entry } of ordered) {
      if (!titles.has(entry.lesson)) {
        warnings.push(`terms.yml: ${mod.course}/${mod.module}: term "${entry.term}" names "${entry.lesson}", which this module does not list`);
      }
      const link: GlossaryBacklink = {
        course: mod.course,
        module: mod.module,
        module_title: mod.module_title,
        file: entry.lesson,
        title: titles.get(entry.lesson) ?? entry.lesson,
      };
      const key = termKey(entry.term);
      const existing = entriesByKey.get(key);
      if (!existing) {
        const merged: GlossaryEntry = {
          key,
          term: entry.term,
          definition: entry.definition,
          introduced_by: link,
          reused_by: [],
          see_also: [],
        };
        entriesByKey.set(key, merged);
        course.entries.push(merged);
        relatedRaw.set(`${courseId}\u0000${key}`, [...(entry.see_also ?? [])]);
        backlinksSeen.set(`${courseId}\u0000${key}`, new Set([backlinkId(link)]));
        continue;
      }
      if (definitionsDiverge(existing.definition, entry.definition)) {
        warnings.push(`terms.yml: ${mod.course}: "${entry.term}" is defined differently in ${mod.module}/${entry.lesson} than in ${existing.introduced_by.module}/${existing.introduced_by.file}`);
      }
      const seen = backlinksSeen.get(`${courseId}\u0000${key}`) as Set<string>;
      if (!seen.has(backlinkId(link))) {
        seen.add(backlinkId(link));
        existing.reused_by.push(link);
      }
      (relatedRaw.get(`${courseId}\u0000${key}`) as string[]).push(...(entry.see_also ?? []));
    }
  }

  // see_also resolves to term keys, deduplicated and sorted, with the entry's
  // own key dropped. A key with no entry in this course is kept: the client
  // renders an unresolved reference as plain text, and validate is what reports
  // it (a term a later module has not been generated yet is normal, not broken).
  for (const [courseId, course] of courses) {
    for (const entry of course.entries) {
      const raw = relatedRaw.get(`${courseId}\u0000${entry.key}`) ?? [];
      entry.see_also = [...new Set(raw.map(termKey))].filter((k) => k !== entry.key).sort();
    }
  }

  return { courses: [...courses.values()], warnings };
}
