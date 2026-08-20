import { fileURLToPath } from 'node:url';
// The eval gate: does a change to a generation skill degrade what it generates?
// Two halves, reported separately, never averaged (docs/specs/quality.md):
//   checklist - deterministic, zero model calls, reuses the same shared
//               implementations the app and validate use. These gate a PR.
//   judged    - rubric scoring by a pinned claude judge (median of 3 on the
//               quantized grid). Gates only under an identical judge
//               (model + prompt hash) to the fixture's established_with.
// The auditor drill is judged-half machinery too: it runs the generate-module
// self-audit prompt against the seeded accuracy fixture and scores whether the
// auditor catches the plants, gated only under an identical auditor
// (model + audit-prompt hash). --no-judge skips it along with the judge.
// Usage: node tools/eval.ts [--skill interview|curriculum|lessons|audit] [--no-judge] [--rebaseline]
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { parseFrontmatter } from '../lib/frontmatter.ts';
import { parseLesson, anatomyOf } from '../lib/lesson.ts';
import { parseTerms, countSentences, countWords, DEFINITION_SENTENCES, MAX_DEFINITION_WORDS } from '../lib/terms.ts';
import { runValidation } from './validate.ts';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const JUDGE_MODEL = 'claude-sonnet-5';
const GRID = [0, 0.25, 0.5, 0.75, 1];

interface ChecklistItem { name: string; pass: boolean; detail?: string }
interface FixtureResult {
  fixture: string;
  skill: string;
  checklist: ChecklistItem[];
  judged: number | null;
  judged_detail?: unknown;
}

const check = (name: string, pass: boolean, detail?: string): ChecklistItem => ({ name, pass, ...(detail ? { detail } : {}) });

// --- deterministic checklists -------------------------------------------------

function profileChecklist(path: string, expected: Record<string, unknown>): ChecklistItem[] {
  const { frontmatter } = parseFrontmatter(readFileSync(join(repoRoot, path), 'utf8'));
  const items: ChecklistItem[] = [check('profile parses', frontmatter !== null)];
  if (!frontmatter) return items;
  for (const [field, want] of Object.entries(expected)) {
    items.push(check(`${field} = ${String(want)}`, frontmatter[field] === want, `got ${String(frontmatter[field])}`));
  }
  items.push(check('question budget 5-7', (frontmatter.questions_asked as number) >= 5 && (frontmatter.questions_asked as number) <= 7));
  return items;
}

function curriculumChecklist(courseDir: string, budget: number, ceiling: string[]): ChecklistItem[] {
  const abs = join(repoRoot, courseDir);
  const findings = runValidation([abs]);
  const items: ChecklistItem[] = [
    check('validate clean', findings.filter((f) => f.level === 'error').length === 0),
  ];
  const course = parseYaml(readFileSync(join(abs, 'course.yml'), 'utf8')) as {
    objectives: { bloom: string }[];
    modules: { est_hours: number }[];
  };
  const total = course.modules.reduce((a, m) => a + m.est_hours, 0);
  items.push(check(`module hours ${total} within budget +10% (${budget * 1.1})`, total <= budget * 1.1));
  items.push(check('every objective at or below the ceiling', course.objectives.every((o) => ceiling.includes(o.bloom))));
  const sources = readFileSync(join(abs, 'course.yml'), 'utf8'); // count archives across manifests instead:
  void sources;
  const moduleFiles = execFileSync('find', [join(abs, 'modules'), '-name', 'module.yml'], { encoding: 'utf8' }).trim().split('\n');
  let archived = 0;
  let webTotal = 0;
  for (const mf of moduleFiles) {
    const mod = parseYaml(readFileSync(mf, 'utf8')) as { sources: { source_type: string; archived_url: string }[] };
    for (const s of mod.sources) {
      if (s.source_type === 'web') {
        webTotal++;
        if (/^https:\/\/web\.archive\.org\/web\//.test(s.archived_url)) archived++;
      }
    }
  }
  items.push(check(`every web source archived (${archived}/${webTotal})`, archived === webTotal && webTotal > 0));
  return items;
}

/**
 * Does the module a lesson belongs to carry the vocabulary that lesson
 * introduced?
 *
 * generate-module owns terms.yml as of v1.17, and the glossary is only as good
 * as that habit. tools/validate.ts already refuses a terms.yml that skips a
 * written lesson, but validate cannot see the failure that actually matters
 * here: the skill quietly stopping emitting the file at all, which validate
 * downgrades to a warning so existing vaults keep passing on upgrade. The eval
 * gate is where that regression has to be an outright fail, because this is the
 * one gate that asks "did the generation skill get worse".
 */
function termsChecklist(lessonPaths: string[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
  const byModule = new Map<string, string[]>();
  for (const p of lessonPaths) {
    const modDir = p.slice(0, p.lastIndexOf('/'));
    byModule.set(modDir, [...(byModule.get(modDir) ?? []), p.split('/').at(-1) as string]);
  }
  for (const [modDir, files] of byModule) {
    const short = modDir.split('/').at(-1);
    const termsFile = join(repoRoot, modDir, 'terms.yml');
    if (!existsSync(termsFile)) {
      items.push(check(`${short}: module has a terms.yml`, false, 'generate-module must emit one alongside the lesson bodies'));
      continue;
    }
    items.push(check(`${short}: module has a terms.yml`, true));
    const { doc, warnings } = parseTerms(readFileSync(termsFile, 'utf8'));
    items.push(check(`${short}: terms.yml parses cleanly`, warnings.length === 0, warnings.join('; ')));
    const covered = new Set([...doc.terms.map((t) => t.lesson), ...doc.no_terms]);
    const missing = files.filter((f) => !covered.has(f));
    items.push(check(`${short}: every generated lesson is covered or declared in no_terms`, missing.length === 0, missing.join(', ')));
    const badSentences = doc.terms.filter((t) => countSentences(t.definition) !== DEFINITION_SENTENCES).map((t) => t.term);
    items.push(check(`${short}: every definition is exactly ${DEFINITION_SENTENCES} sentences`, badSentences.length === 0, badSentences.join(', ')));
    const tooLong = doc.terms.filter((t) => countWords(t.definition) > MAX_DEFINITION_WORDS).map((t) => t.term);
    items.push(check(`${short}: no definition exceeds ${MAX_DEFINITION_WORDS} words`, tooLong.length === 0, tooLong.join(', ')));
  }
  return items;
}

function lessonsChecklist(lessonPaths: string[]): ChecklistItem[] {
  const items: ChecklistItem[] = [...termsChecklist(lessonPaths)];
  for (const p of lessonPaths) {
    const lesson = parseLesson(readFileSync(join(repoRoot, p), 'utf8'));
    const anatomy = anatomyOf(lesson);
    const short = p.split('/').at(-1);
    items.push(check(`${short}: anatomy 9/9`, anatomy.score === 9, JSON.stringify(anatomy.parts)));
    const ids = lesson.checks.map((c) => c.id).filter(Boolean);
    items.push(check(`${short}: every check has a unique authored id`, ids.length === lesson.checks.length && new Set(ids).size === ids.length));
    items.push(check(`${short}: exactly one transfer prompt`, lesson.transfers.length === 1));
  }
  return items;
}

// --- the judge ----------------------------------------------------------------

function judgePrompt(rubricName: string, criteria: string[], content: string): string {
  return [
    `You are a strict educational-content judge scoring a ${rubricName}.`,
    `Score each criterion on exactly this grid: 0, 0.25, 0.5, 0.75, 1.`,
    `Criteria:`,
    ...criteria.map((c, i) => `${i + 1}. ${c}`),
    `Respond with ONLY a JSON object, no prose, no code fences:`,
    `{"criteria":[{"id":1,"score":0.75,"why":"..."}],"overall":0.8}`,
    `overall is the mean of the criterion scores rounded to 2 decimals.`,
    `--- CONTENT TO JUDGE ---`,
    content,
  ].join('\n');
}

function runJudge(prompt: string): { overall: number; raw: unknown } {
  // judge runs OUTSIDE the repo with project-only settings so no repo entry
  // point, user memory, or hook output can contaminate its stdout
  const out = execFileSync('claude', ['-p', prompt, '--model', JUDGE_MODEL, '--output-format', 'json', '--setting-sources', 'project'], {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
    cwd: process.env.TMPDIR ?? '/tmp',
  });
  // tolerate stray non-JSON lines before the envelope
  const jsonStart = out.indexOf('{');
  if (jsonStart === -1) throw new Error(`judge produced no JSON envelope: ${out.slice(0, 120)}`);
  const envelope = JSON.parse(out.slice(jsonStart)) as { result?: string };
  const text = (envelope.result ?? '').trim().replace(/^```(json)?\n?|```$/g, '');
  const parsed = JSON.parse(text) as { overall: number; criteria: { score: number }[] };
  if (typeof parsed.overall !== 'number') throw new Error('judge returned no overall score');
  for (const c of parsed.criteria ?? []) {
    if (!GRID.includes(c.score)) throw new Error(`judge score ${c.score} off the quantized grid`);
  }
  return { overall: parsed.overall, raw: parsed };
}

function median3(prompt: string): { overall: number; samples: number[] } {
  const samples = [runJudge(prompt).overall, runJudge(prompt).overall, runJudge(prompt).overall].sort((a, b) => a - b);
  return { overall: samples[1], samples };
}

const LESSON_RUBRIC = [
  'The explanation is concrete-before-abstract with at least two contrasting examples a beginner can follow.',
  'The worked example annotates WHY at each step, not just what.',
  'Practice fades genuinely: from guided to unaided, with answer reveals that teach.',
  'The misconception trap names a wrong model a real learner would hold and shows where it breaks.',
  'Retrieval checks demand production over recognition and the transfer prompt displaces the concept into a truly novel context.',
];
const CURRICULUM_RUBRIC = [
  'Course objectives are outcome-shaped (what the learner will DO), not topic lists.',
  'Module sequencing respects genuine prerequisite structure.',
  'Module sizing and count honestly fit the stated hour budget.',
  'Source choices are primary and load-bearing for what each module teaches.',
];

// --- fixture registry ---------------------------------------------------------

interface Fixture {
  name: string;
  skill: 'interview' | 'curriculum' | 'lessons';
  checklist: () => ChecklistItem[];
  judged?: () => { overall: number; samples: number[] };
}

const FIXTURES: Fixture[] = [
  {
    name: 'interview-sam',
    skill: 'interview',
    checklist: () =>
      profileChecklist('examples/example-learner/software-engineering/rust-for-backend/profile.md', {
        goal_category: 'build', prior_level: 'vocabulary', probe_result: 'confirmed-at-level',
        depth: 'build', bloom_ceiling: 'apply', hours_per_week: 4, total_weeks: 6,
        budget_hours: 24, user_sources: false, status: 'confirmed',
      }),
  },
  {
    name: 'interview-priya',
    skill: 'interview',
    checklist: () =>
      profileChecklist('examples/golden-personas/priya-nair/understanding-llm-agents/profile.md', {
        goal_category: 'understand', prior_level: 'none', probe_result: 'confirmed-at-level',
        depth: 'orient', bloom_ceiling: 'understand', hours_per_week: 2, total_weeks: 4,
        budget_hours: 8, user_sources: false, status: 'confirmed',
      }),
  },
  {
    name: 'curriculum-rust',
    skill: 'curriculum',
    checklist: () => curriculumChecklist('examples/example-learner/software-engineering/rust-for-backend', 24, ['remember', 'understand', 'apply']),
    judged: () =>
      median3(judgePrompt('course skeleton (objectives and module plan)', CURRICULUM_RUBRIC,
        readFileSync(join(repoRoot, 'examples/example-learner/software-engineering/rust-for-backend/course.yml'), 'utf8'))),
  },
  {
    name: 'lessons-module1',
    skill: 'lessons',
    checklist: () =>
      lessonsChecklist([
        'examples/example-learner/software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/01-cargo-and-toolchain.md',
        'examples/example-learner/software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/02-syntax-for-experienced-developers.md',
        'examples/example-learner/software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md',
        'examples/example-learner/software-engineering/rust-for-backend/modules/02-borrowing-in-practice/01-borrowing.md',
        'examples/example-learner/software-engineering/rust-for-backend/modules/02-borrowing-in-practice/02-lifetimes.md',
      ]),
    judged: () =>
      median3(judgePrompt('lesson', LESSON_RUBRIC,
        readFileSync(join(repoRoot, 'examples/example-learner/software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md'), 'utf8'))),
  },
];

// anchors: three reference lessons at known quality; the judged half is trusted
// only while it still RANKS them correctly with real separation
const ANCHORS = [
  { name: 'good', path: 'examples/example-learner/software-engineering/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md' },
  { name: 'mediocre', path: 'evals/anchors/lesson-mediocre.md' },
  { name: 'bad', path: 'evals/anchors/lesson-bad.md' },
];

// --- the auditor drill --------------------------------------------------------
// Drills the generate-module blocking self-audit against the seeded-fault tree
// at examples/seeded-faults/accuracy-fixture/: run the audit prompt over each
// seeded lesson and score whether it catches the planted faults named in
// ANSWER-KEY.md. This measures the audit PROMPT, not a live generate-module run
// (the skill executes in an agent loop the eval cannot reproduce); it is the
// closest measurable proxy. See docs/specs/quality.md.

const AUDITOR_MODEL = 'claude-sonnet-5';
const ACCURACY_FIXTURE = 'examples/seeded-faults/accuracy-fixture';
const DRILL_NAME = 'auditor-accuracy';

interface Plant {
  lesson: string;
  type: 'uncited-claim' | 'wrong-key';
  quote?: string;
  check_id?: string;
  marked?: string;
  correct?: string;
}
interface AnswerKey { plants: Plant[]; controls: string[] }
interface AuditFinding { type?: string; quote?: string; check_id?: string; authored?: string; resolved?: string }

// the ANSWER-KEY.md frontmatter is the scoring contract; field names are binding
function loadAnswerKey(): AnswerKey {
  const { frontmatter } = parseFrontmatter(readFileSync(join(repoRoot, ACCURACY_FIXTURE, 'ANSWER-KEY.md'), 'utf8'));
  const plants = frontmatter?.plants;
  const controls = frontmatter?.controls;
  if (!Array.isArray(plants) || plants.length === 0 || !Array.isArray(controls) || controls.length === 0) {
    throw new Error(`${ACCURACY_FIXTURE}/ANSWER-KEY.md frontmatter is missing plants or controls`);
  }
  for (const p of plants as Plant[]) {
    const shaped =
      p.type === 'uncited-claim' ? typeof p.quote === 'string'
      : p.type === 'wrong-key' ? typeof p.check_id === 'string'
      : false;
    if (typeof p.lesson !== 'string' || !shaped) throw new Error(`malformed plant in ANSWER-KEY.md: ${JSON.stringify(p)}`);
  }
  return { plants: plants as Plant[], controls: controls as string[] };
}

// operationalizes the generate-module self-audit: claim audit + check re-solve
function auditPrompt(lessonContent: string): string {
  return [
    `You are the blocking self-audit a lesson generator runs against its own freshly drafted lesson.`,
    `Audit the lesson below in two passes and report every failure you find.`,
    `PASS A - claim audit. Extract the lesson's factual claims. A claim passes only if it either`,
    `(1) is explicitly attributed to one of the lesson's cited sources (the frontmatter sources list), or`,
    `(2) is level-appropriate common knowledge - something a competent reader at this lesson's level would accept without looking it up. A claim that is surprising, quantitative, version-specific, or safety-relevant NEVER passes as common knowledge.`,
    `Report each failing claim as {"type":"uncited-claim","quote":"<the exact sentence, copied verbatim from the lesson>"}.`,
    `PASS B - check re-solve. For every meno-check code block, answer its prompt fresh, WITHOUT looking at the authored answer or explain fields, then compare your answer with the authored one. For mcq checks answer with the 1-based index of the correct option, as a string. For cloze checks the text inside {{double braces}} in the prompt is the authored fill - blank it out and solve for the fill yourself. For flashcard and other free-text checks, report a disagreement only when the authored answer is factually wrong, not merely worded differently.`,
    `Report each disagreement as {"type":"wrong-key","check_id":"<the check's id field>","authored":"<the authored answer>","resolved":"<your independent answer>"}.`,
    `Respond with ONLY a JSON object, no prose, no code fences:`,
    `{"findings":[{"type":"uncited-claim","quote":"..."},{"type":"wrong-key","check_id":"...","authored":"...","resolved":"..."}]}`,
    `An empty findings array means the lesson passed both passes. Never report a claim or check that passes.`,
    `--- LESSON TO AUDIT ---`,
    lessonContent,
  ].join('\n');
}

function runAuditor(prompt: string): AuditFinding[] {
  // same isolation as the judge: outside the repo, project-only settings
  const out = execFileSync('claude', ['-p', prompt, '--model', AUDITOR_MODEL, '--output-format', 'json', '--setting-sources', 'project'], {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 10 * 1024 * 1024,
    cwd: process.env.TMPDIR ?? '/tmp',
  });
  const jsonStart = out.indexOf('{');
  if (jsonStart === -1) throw new Error(`auditor produced no JSON envelope: ${out.slice(0, 120)}`);
  const envelope = JSON.parse(out.slice(jsonStart)) as { result?: string };
  const text = (envelope.result ?? '').trim().replace(/^```(json)?\n?|```$/g, '');
  // a non-parsing auditor response is an eval ERROR, never a zero
  const parsed = JSON.parse(text) as { findings?: unknown };
  if (!Array.isArray(parsed.findings)) throw new Error('auditor returned no findings array');
  for (const f of parsed.findings as AuditFinding[]) {
    if (f.type !== 'uncited-claim' && f.type !== 'wrong-key') throw new Error(`auditor finding type "${String(f.type)}" outside the contract`);
  }
  return parsed.findings as AuditFinding[];
}

const normalizeText = (s: string): string => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();

// fuzzy quote match: normalized containment either way, else 0.6 token overlap
// (an auditor that quotes a fragment or lightly paraphrases still gets credit)
function quoteMatches(planted: string, reported: string): boolean {
  const a = normalizeText(planted);
  const b = normalizeText(reported);
  if (!a || !b) return false;
  if (b.includes(a)) return true;
  // fragment credit (planted contains reported) needs a real fragment - three
  // tokens minimum, or a stopword-sized report would match every plant
  if (a.includes(b) && b.split(' ').length >= 3) return true;
  const aTokens = new Set(a.split(' '));
  const bTokens = b.split(' ');
  const overlap = bTokens.filter((t) => aTokens.has(t)).length;
  return overlap / Math.max(aTokens.size, bTokens.length) >= 0.6;
}

function plantCaught(plant: Plant, findings: AuditFinding[]): boolean {
  return findings.some((f) => {
    if (f.type !== plant.type) return false;
    if (plant.type === 'uncited-claim') return quoteMatches(plant.quote ?? '', f.quote ?? '');
    return normalizeText(f.check_id ?? '') === normalizeText(plant.check_id ?? '');
  });
}

interface DrillPass { recall: number; caught: number; falseAlarms: number; missed: string[] }

function runDrillPass(key: AnswerKey): DrillPass {
  const lessons = [...new Set([...key.plants.map((p) => p.lesson), ...key.controls])];
  const findingsByLesson = new Map<string, AuditFinding[]>();
  for (const lesson of lessons) {
    const content = readFileSync(join(repoRoot, ACCURACY_FIXTURE, lesson), 'utf8');
    findingsByLesson.set(lesson, runAuditor(auditPrompt(content)));
  }
  let caught = 0;
  const missed: string[] = [];
  for (const plant of key.plants) {
    if (plantCaught(plant, findingsByLesson.get(plant.lesson) ?? [])) caught++;
    else missed.push(`${plant.lesson}: ${plant.type === 'wrong-key' ? plant.check_id : `"${(plant.quote ?? '').slice(0, 60)}"`}`);
  }
  // false alarms on the clean control lesson(s): informational, never gating.
  // findings on seeded lessons that match no plant are unscored either way -
  // the control is the drill's only precision sample (docs/specs/quality.md)
  const falseAlarms = key.controls.reduce((n, c) => n + (findingsByLesson.get(c)?.length ?? 0), 0);
  return { recall: Math.round((caught / key.plants.length) * 100) / 100, caught, falseAlarms, missed };
}

// --- main ---------------------------------------------------------------------

const args = process.argv.slice(2);
const skillFilter = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null;
const noJudge = args.includes('--no-judge');
const rebaseline = args.includes('--rebaseline');

const judgePromptSha = createHash('sha256').update(judgePrompt('X', LESSON_RUBRIC, '')).digest('hex').slice(0, 16);
const auditPromptSha = createHash('sha256').update(auditPrompt('')).digest('hex').slice(0, 16);
const baselinesPath = join(repoRoot, 'evals', 'baselines.json');
interface BaselineEntry {
  judged_min?: number | null;
  recall_min?: number | null; // the auditor drill's baseline (plants-caught recall)
  established_with?: {
    judge_model?: string;
    judge_prompt_sha256?: string;
    auditor_model?: string;
    audit_prompt_sha256?: string;
  };
}
const baselines = existsSync(baselinesPath)
  ? (JSON.parse(readFileSync(baselinesPath, 'utf8')) as Record<string, BaselineEntry>)
  : {};

const claudeAvailable = ((): boolean => {
  try { execFileSync('which', ['claude'], { encoding: 'utf8' }); return true; } catch { return false; }
})();
const judging = !noJudge && claudeAvailable;

let failed = false;
const results: FixtureResult[] = [];

for (const fixture of FIXTURES) {
  if (skillFilter && fixture.skill !== skillFilter) continue;
  const checklist = fixture.checklist();
  const checklistPass = checklist.every((c) => c.pass);
  if (!checklistPass) failed = true;

  let judged: number | null = null;
  let judgedDetail: unknown;
  if (fixture.judged && judging) {
    const r = fixture.judged();
    judged = r.overall;
    judgedDetail = r.samples;
    const base = baselines[fixture.name];
    const sameJudge = base?.established_with?.judge_model === JUDGE_MODEL && base?.established_with?.judge_prompt_sha256 === judgePromptSha;
    if (base?.judged_min != null) {
      if (!sameJudge) {
        console.log(`  ~ ${fixture.name}: judge differs from baseline's established_with - judged half informational only`);
      } else if (judged < base.judged_min) {
        console.log(`  ✗ ${fixture.name}: judged ${judged} below baseline ${base.judged_min}`);
        failed = true;
      }
    }
  }
  results.push({ fixture: fixture.name, skill: fixture.skill, checklist, judged, judged_detail: judgedDetail });
  const badge = checklistPass ? '✓' : '✗';
  console.log(`${badge} ${fixture.name}: checklist ${checklist.filter((c) => c.pass).length}/${checklist.length}${judged !== null ? `, judged ${judged}` : ''}`);
  for (const c of checklist.filter((x) => !x.pass)) console.log(`    ✗ ${c.name}${c.detail ? ` (${c.detail})` : ''}`);
}

// anchor ranking - the drift alarm for the judged half
let anchorScores: Record<string, number> | null = null;
if (judging && (!skillFilter || skillFilter === 'lessons')) {
  anchorScores = {};
  for (const a of ANCHORS) {
    anchorScores[a.name] = runJudge(judgePrompt('lesson', LESSON_RUBRIC, readFileSync(join(repoRoot, a.path), 'utf8'))).overall;
  }
  const { good, mediocre, bad } = anchorScores as { good: number; mediocre: number; bad: number };
  const ranked = good > mediocre && mediocre > bad;
  const separated = good - bad >= 0.5;
  console.log(`anchors: good ${good}, mediocre ${mediocre}, bad ${bad} - ${ranked && separated ? 'ranking holds' : 'RANKING BROKEN (rubric rot - rebaseline before trusting judged scores)'}`);
  if (!ranked || !separated) failed = true;
}

// auditor drill - judged-half machinery, so it runs only when judging
// (skipped under --no-judge and when the claude CLI is unavailable)
let drill: { recall: number; recalls: number[]; falseAlarms: number[]; missed: string[] } | null = null;
if (judging && (!skillFilter || skillFilter === 'audit')) {
  const key = loadAnswerKey();
  const passes = [runDrillPass(key), runDrillPass(key), runDrillPass(key)];
  const medianPass = [...passes].sort((a, b) => a.recall - b.recall)[1];
  drill = {
    recall: medianPass.recall,
    recalls: passes.map((p) => p.recall),
    falseAlarms: passes.map((p) => p.falseAlarms),
    missed: medianPass.missed,
  };
  const base = baselines[DRILL_NAME];
  const sameAuditor = base?.established_with?.auditor_model === AUDITOR_MODEL && base?.established_with?.audit_prompt_sha256 === auditPromptSha;
  let drillFailed = false;
  if (base?.recall_min != null) {
    if (!sameAuditor) {
      console.log(`  ~ ${DRILL_NAME}: auditor differs from baseline's established_with - drill informational only`);
    } else if (drill.recall < base.recall_min) {
      drillFailed = true;
      failed = true;
    }
  }
  console.log(`${drillFailed ? '✗' : '✓'} ${DRILL_NAME}: plants-caught recall ${drill.recall} (samples ${drill.recalls.join('/')}, median pass caught ${medianPass.caught}/${key.plants.length}), control false alarms ${drill.falseAlarms.join('/')} - informational`);
  if (drillFailed) console.log(`    ✗ recall ${drill.recall} below baseline ${base?.recall_min}`);
  for (const m of medianPass.missed) console.log(`    missed plant: ${m}`);
}

if (rebaseline) {
  for (const r of results) {
    // a 0.1 guard band under the observed median: judge medians vary a little
    // run to run on identical content, and a gate that flakes gets ignored
    baselines[r.fixture] = {
      judged_min: r.judged === null ? null : Math.max(0, Math.round((r.judged - 0.1) * 100) / 100),
      ...(r.judged !== null ? { established_with: { judge_model: JUDGE_MODEL, judge_prompt_sha256: judgePromptSha } } : {}),
    };
  }
  if (drill) {
    // same 0.1 guard band as judged scores: recall varies a little run to run
    baselines[DRILL_NAME] = {
      recall_min: Math.max(0, Math.round((drill.recall - 0.1) * 100) / 100),
      established_with: { auditor_model: AUDITOR_MODEL, audit_prompt_sha256: auditPromptSha },
    };
  }
  writeFileSync(baselinesPath, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`rebaselined ${results.length + (drill ? 1 : 0)} fixture(s) -> evals/baselines.json (review the diff deliberately)`);
}

appendFileSync(
  join(repoRoot, 'evals', 'runs.jsonl'),
  JSON.stringify({
    ts: new Date().toISOString(),
    judge_model: judging ? JUDGE_MODEL : null,
    judge_prompt_sha256: judging ? judgePromptSha : null,
    results: results.map((r) => ({ fixture: r.fixture, checklist_pass: r.checklist.every((c) => c.pass), judged: r.judged })),
    anchors: anchorScores,
    auditor: drill
      ? { model: AUDITOR_MODEL, prompt_sha256: auditPromptSha, recall: drill.recall, recall_samples: drill.recalls, control_false_alarms: drill.falseAlarms }
      : null,
  }) + '\n',
);

console.log(failed ? '\neval: FAIL' : '\neval: pass');
process.exit(failed ? 1 : 0);
