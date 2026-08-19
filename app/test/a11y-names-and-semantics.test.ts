// Source-grep coverage for the a11y-names-and-semantics pass: every unnamed
// interactive element and table in the study app now has a correct
// accessible name, and no full-page empty state swallows the page `h1`.
//
// This repository has no jsdom and no DOM (see rendered-html.test.ts's
// comment for why), so these are source assertions, not rendered-output
// assertions - narrow on purpose, aimed at the specific attribute an
// innocent-looking edit could silently drop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function read(relPath: string): string {
  return readFileSync(fileURLToPath(new URL(relPath, import.meta.url)), 'utf8');
}

// --- Fix 1: the todo checkbox has no accessible name -----------------------

test('TodosPage: the done checkbox carries aria-label={t.text}', () => {
  const source = read('../client/src/pages/TodosPage.tsx');
  assert.match(
    source,
    /checked=\{t\.done\}\s*\n\s*disabled=\{busy === t\.line\}\s*\n\s*onChange=\{\(\) => void toggleDone\(t\.line, !t\.done\)\}\s*\n\s*aria-label=\{t\.text\}/,
    'the per-todo checkbox must be named from the raw t.text string, not left to compute an empty name',
  );
});

// --- Fix 2: the cloze input is labelled only by placeholder -----------------

test('CheckWidget: the check-prompt paragraph carries a deterministic id keyed on check.id', () => {
  const source = read('../client/src/components/CheckWidget.tsx');
  assert.match(
    source,
    /<p className="check-prompt" id=\{`meno-check-prompt-\$\{check\.id\}`\}>\{check\.prompt\}<\/p>/,
    'the prompt paragraph must expose a stable id so the cloze input can be labelled by it',
  );
});

test('CheckWidget: the cloze input is aria-labelledby the check-prompt id, and keeps its placeholder', () => {
  const source = read('../client/src/components/CheckWidget.tsx');
  assert.match(
    source,
    /className="check-cloze-input"[\s\S]{0,200}?aria-labelledby=\{`meno-check-prompt-\$\{check\.id\}`\}/,
    'the cloze <input> must be named via aria-labelledby pointing at the prompt paragraph',
  );
  assert.match(source, /className="check-cloze-input"[\s\S]{0,200}?placeholder="Your answer"/, 'placeholder must stay as a visible affordance');
});

// --- Fix 3: InfoTip pollutes ancestor accessible names ----------------------

test('TenantCoursesPage: the Courses h1 is aria-labelledby a span holding just the heading text', () => {
  const source = read('../client/src/pages/TenantCoursesPage.tsx');
  assert.match(source, /<h1 aria-labelledby="courses-heading">/, 'the h1 must not compute its name from InfoTip content');
  assert.match(source, /<span id="courses-heading">Courses<\/span>/);
});

test('InsightsPage: the Insights h1 is aria-labelledby a span holding just the heading text', () => {
  const source = read('../client/src/pages/InsightsPage.tsx');
  assert.match(source, /<h1 aria-labelledby="insights-heading">/);
  assert.match(source, /<span id="insights-heading">Insights<\/span>/);
});

test('TodosPage: the Todos h1 is aria-labelledby a span holding just the heading text', () => {
  const source = read('../client/src/pages/TodosPage.tsx');
  assert.match(source, /<h1 aria-labelledby="todos-heading">/);
  assert.match(source, /<span id="todos-heading">Todos<\/span>/);
});

test('GraphPage: the Graph h1 is aria-labelledby a span holding just the heading text', () => {
  const source = read('../client/src/pages/GraphPage.tsx');
  assert.match(source, /<h1 aria-labelledby="graph-heading">/);
  assert.match(source, /<span id="graph-heading">Graph<\/span>/);
});

test('ProgressPage: the "Due for review" h2 is aria-labelledby a span holding just the heading text', () => {
  const source = read('../client/src/pages/ProgressPage.tsx');
  assert.match(source, /<h2 aria-labelledby="due-for-review-heading">/);
  assert.match(source, /<span id="due-for-review-heading">Due for review<\/span>/);
});

test('ProgressPage: the four mastery-table th cells with an InfoTip are each aria-labelledby a per-course span id', () => {
  const source = read('../client/src/pages/ProgressPage.tsx');
  for (const [key, text] of [
    ['level', 'Level'],
    ['transfer', 'Transfer score'],
    ['recognition', 'Recognition rate'],
    ['nextreview', 'Next review'],
  ] as const) {
    const thRe = new RegExp(`<th scope="col" aria-labelledby=\\{\`mastery-th-${key}-\\$\\{course\\}\`\\}>`);
    assert.match(source, thRe, `mastery-th-${key} th must be aria-labelledby its own per-course span id`);
    const spanRe = new RegExp(`<span id=\\{\`mastery-th-${key}-\\$\\{course\\}\`\\}>${text}</span>`);
    assert.match(source, spanRe, `mastery-th-${key} span must carry the matching id and hold only "${text}"`);
  }
});

test('TodosPage: the Kind and Audience selects carry an explicit aria-label, not the InfoTip-polluted label text', () => {
  const source = read('../client/src/pages/TodosPage.tsx');
  assert.match(
    source,
    /aria-label="Kind"\s*\n\s*value=\{newKind\}/,
    'the Kind select must have its own aria-label rather than inherit the wrapping label (which contains the InfoTip text)',
  );
  assert.match(
    source,
    /aria-label="Audience"\s*\n\s*value=\{newAudience\}/,
    'the Audience select must have its own aria-label rather than inherit the wrapping label (which contains the InfoTip text)',
  );
});

// --- Fix 4: full-page empty states render no h1 -----------------------------

test('EmptyState: headingLevel defaults to h2, so every unchanged call site is untouched', () => {
  const source = read('../client/src/components/EmptyState.tsx');
  assert.match(source, /headingLevel = 'h2'/, 'default heading level must stay h2 for nested call sites');
  assert.match(source, /const Heading = headingLevel;/);
  assert.match(source, /<Heading>\{title\}<\/Heading>/);
});

for (const [file, marker] of [
  ['../client/src/pages/ProgressPage.tsx', '<EmptyState headingLevel="h1" title={`No progress yet for ${tenant}`}'],
  ['../client/src/pages/TenantCoursesPage.tsx', '<EmptyState headingLevel="h1" title={`No courses yet for ${tenant}`}'],
  ['../client/src/pages/TenantsPage.tsx', 'headingLevel="h1"'],
] as const) {
  test(`${file.split('/').pop()}: full-page empty state passes headingLevel="h1"`, () => {
    const source = read(file);
    assert.ok(source.includes(marker), `expected to find ${marker} in ${file}`);
  });
}

test('InsightsPage: the no-ledger-lines full-page empty state passes headingLevel="h1"', () => {
  const source = read('../client/src/pages/InsightsPage.tsx');
  assert.match(source, /if \(data\.basis\.ledger_lines === 0\) \{\s*\n\s*return \(\s*\n\s*<EmptyState\s*\n\s*headingLevel="h1"/);
});

test('GraphPage: "No graph yet" is a full-page empty state with headingLevel="h1"; "No groups selected" stays nested (no headingLevel prop)', () => {
  const source = read('../client/src/pages/GraphPage.tsx');
  assert.match(
    source,
    /<EmptyState\s*\n\s*headingLevel="h1"\s*\n\s*title=\{`No graph yet for \$\{tenant\}`\}/,
    'the full-page "no graph yet" early return must render an h1',
  );
  const nestedMatch = source.match(/<EmptyState\s*\n\s*title="No groups selected"[\s\S]{0,150}/);
  assert.ok(nestedMatch, 'expected to find the nested "No groups selected" EmptyState call');
  assert.ok(!nestedMatch![0].includes('headingLevel'), 'the nested "No groups selected" empty state must keep the default h2, since GraphPage already rendered its own h1');
});

test('TodosPage: the nested "No todos yet" empty state keeps the default h2 (no headingLevel prop)', () => {
  const source = read('../client/src/pages/TodosPage.tsx');
  const match = source.match(/<EmptyState title=\{`No todos yet for \$\{tenant\}`\}[^\n]*/);
  assert.ok(match, 'expected to find the "No todos yet" EmptyState call');
  assert.ok(!match![0].includes('headingLevel'), 'this call site is nested under the page h1 and must not override the default h2');
});

test('CostPage: the hand-rolled empty state is replaced by the shared EmptyState at headingLevel="h1", preserving its content', () => {
  const source = read('../client/src/pages/CostPage.tsx');
  assert.ok(!/<div className="empty-state" data-meno-empty>/.test(source), 'CostPage must no longer hand-roll the empty-state markup');
  assert.match(source, /<EmptyState\s*\n\s*headingLevel="h1"\s*\n\s*title=\{`No cost snapshot yet for \$\{tenant\}`\}/);
  assert.match(source, /To generate one, run:/);
  assert.match(source, /<code>\{data\.how_to_generate\}<\/code>/);
});

// --- Fix 5: the 9 authored tables have no accessible name and no th scope --

const TABLES: Array<{ file: string; label: string; thCount: number }> = [
  { file: '../client/src/pages/InsightsPage.tsx', label: 'Overdue reviews', thCount: 4 },
  { file: '../client/src/pages/InsightsPage.tsx', label: 'Unrepaid overrides', thCount: 4 },
  { file: '../client/src/pages/InsightsPage.tsx', label: 'Concepts mastered on old evidence', thCount: 3 },
  { file: '../client/src/pages/InsightsPage.tsx', label: 'Weak concepts', thCount: 5 },
  { file: '../client/src/pages/InsightsPage.tsx', label: 'Planned lessons not yet generated', thCount: 3 },
  { file: '../client/src/pages/CoursePage.tsx', label: 'Concept mastery', thCount: 5 },
  { file: '../client/src/pages/CostPage.tsx', label: 'Course costs', thCount: 3 },
];

for (const { file, label, thCount } of TABLES) {
  test(`${file.split('/').pop()}: table "${label}" has an aria-label and ${thCount} scope="col" th cells`, () => {
    const source = read(file);
    const tableRe = new RegExp(`<table[^>]*aria-label="${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[\\s\\S]{0,600}?</thead>`);
    const match = source.match(tableRe);
    assert.ok(match, `expected a <table aria-label="${label}"> whose thead is within 600 chars`);
    const scopedThCount = (match![0].match(/<th scope="col"/g) ?? []).length;
    assert.equal(scopedThCount, thCount, `expected ${thCount} th[scope=col] cells in the "${label}" table's thead`);
  });
}

test('ProgressPage: the per-course due table is aria-label={`Concepts due for review in ${courseTitle(course)}`} with 3 scope="col" th cells', () => {
  const source = read('../client/src/pages/ProgressPage.tsx');
  assert.match(source, /<table aria-label=\{`Concepts due for review in \$\{courseTitle\(course\)\}`\}>/);
  const section = source.split('aria-label={`Concepts due for review')[1]?.slice(0, 300) ?? '';
  assert.equal((section.match(/<th scope="col"/g) ?? []).length, 3);
});

test('ProgressPage: the per-course mastery table is aria-label={`Concept mastery in ${courseTitle(course)}`} with 5 scope="col" th cells', () => {
  const source = read('../client/src/pages/ProgressPage.tsx');
  assert.match(source, /<table className="mastery-table" aria-label=\{`Concept mastery in \$\{courseTitle\(course\)\}`\}>/);
  const section = source.split('className="mastery-table" aria-label')[1]?.slice(0, 900) ?? '';
  assert.equal((section.match(/<th scope="col"/g) ?? []).length, 5);
});
