import { fileURLToPath } from 'node:url';
// The eval gate: does a change to a generation skill degrade what it generates?
// Two halves, reported separately, never averaged (docs/specs/quality.md):
//   checklist - deterministic, zero model calls, reuses the same shared
//               implementations the app and validate use. These gate a PR.
//   judged    - rubric scoring by a pinned claude judge (median of 3 on the
//               quantized grid). Gates only under an identical judge
//               (model + prompt hash) to the fixture's established_with.
// Usage: node tools/eval.ts [--skill interview|curriculum|lessons] [--no-judge] [--rebaseline]
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { parseFrontmatter } from '../lib/frontmatter.ts';
import { parseLesson, anatomyOf } from '../lib/lesson.ts';
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

function lessonsChecklist(lessonPaths: string[]): ChecklistItem[] {
  const items: ChecklistItem[] = [];
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
      profileChecklist('examples/example-learner/rust-for-backend/profile.md', {
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
    checklist: () => curriculumChecklist('examples/example-learner/rust-for-backend', 24, ['remember', 'understand', 'apply']),
    judged: () =>
      median3(judgePrompt('course skeleton (objectives and module plan)', CURRICULUM_RUBRIC,
        readFileSync(join(repoRoot, 'examples/example-learner/rust-for-backend/course.yml'), 'utf8'))),
  },
  {
    name: 'lessons-module1',
    skill: 'lessons',
    checklist: () =>
      lessonsChecklist([
        'examples/example-learner/rust-for-backend/modules/01-syntax-and-ownership-basics/01-cargo-and-toolchain.md',
        'examples/example-learner/rust-for-backend/modules/01-syntax-and-ownership-basics/02-syntax-for-experienced-developers.md',
        'examples/example-learner/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md',
        'examples/example-learner/rust-for-backend/modules/02-borrowing-in-practice/01-borrowing.md',
        'examples/example-learner/rust-for-backend/modules/02-borrowing-in-practice/02-lifetimes.md',
      ]),
    judged: () =>
      median3(judgePrompt('lesson', LESSON_RUBRIC,
        readFileSync(join(repoRoot, 'examples/example-learner/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md'), 'utf8'))),
  },
];

// anchors: three reference lessons at known quality; the judged half is trusted
// only while it still RANKS them correctly with real separation
const ANCHORS = [
  { name: 'good', path: 'examples/example-learner/rust-for-backend/modules/01-syntax-and-ownership-basics/03-ownership.md' },
  { name: 'mediocre', path: 'evals/anchors/lesson-mediocre.md' },
  { name: 'bad', path: 'evals/anchors/lesson-bad.md' },
];

// --- main ---------------------------------------------------------------------

const args = process.argv.slice(2);
const skillFilter = args.includes('--skill') ? args[args.indexOf('--skill') + 1] : null;
const noJudge = args.includes('--no-judge');
const rebaseline = args.includes('--rebaseline');

const judgePromptSha = createHash('sha256').update(judgePrompt('X', LESSON_RUBRIC, '')).digest('hex').slice(0, 16);
const baselinesPath = join(repoRoot, 'evals', 'baselines.json');
const baselines = existsSync(baselinesPath)
  ? (JSON.parse(readFileSync(baselinesPath, 'utf8')) as Record<string, { judged_min: number | null; established_with?: { judge_model: string; judge_prompt_sha256: string } }>)
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

if (rebaseline) {
  for (const r of results) {
    // a 0.1 guard band under the observed median: judge medians vary a little
    // run to run on identical content, and a gate that flakes gets ignored
    baselines[r.fixture] = {
      judged_min: r.judged === null ? null : Math.max(0, Math.round((r.judged - 0.1) * 100) / 100),
      ...(r.judged !== null ? { established_with: { judge_model: JUDGE_MODEL, judge_prompt_sha256: judgePromptSha } } : {}),
    };
  }
  writeFileSync(baselinesPath, JSON.stringify(baselines, null, 2) + '\n');
  console.log(`rebaselined ${results.length} fixture(s) -> evals/baselines.json (review the diff deliberately)`);
}

appendFileSync(
  join(repoRoot, 'evals', 'runs.jsonl'),
  JSON.stringify({
    ts: new Date().toISOString(),
    judge_model: judging ? JUDGE_MODEL : null,
    judge_prompt_sha256: judging ? judgePromptSha : null,
    results: results.map((r) => ({ fixture: r.fixture, checklist_pass: r.checklist.every((c) => c.pass), judged: r.judged })),
    anchors: anchorScores,
  }) + '\n',
);

console.log(failed ? '\neval: FAIL' : '\neval: pass');
process.exit(failed ? 1 : 0);
