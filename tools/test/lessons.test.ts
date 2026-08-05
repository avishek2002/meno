import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseLesson, anatomyOf } from '../../lib/lesson.ts';
import { checkLessons, checkLedgers } from '../validate.ts';

const LESSON = `---
schema_version: 1
id: demo-course/01-first/01-alpha
title: Alpha
module: 01-first
type: lesson
objectives: [M1-1]
concepts: [alpha]
prerequisites: []
estimated_minutes: 30
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: Anchor
    url: https://example.org/docs
    archived_url: https://web.archive.org/web/20260805000000/https://example.org/docs
    accessed: 2026-08-05
    source_type: web
    why: anchors alpha
tags: []
---
# Alpha

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is the method working.

**You'll be able to:** apply alpha to a small case.

## Before you start
1. What is a variable? ([[00-basics]])

## The idea
Alpha is a thing [contrast one] versus [contrast two].

## Worked example
Step 1 does X because Y.

## Your turn
<details><summary>Answer + why</summary>because</details>

> [!warning] Common wrong model
> "Alpha is just beta." Here is where that breaks: ...

## Recall

\`\`\`meno-check
id: alpha-cloze
type: cloze
concept: alpha
prompt: |
  Alpha always {{binds}} before it runs.
answer: binds
explain: |
  Binding precedes evaluation.
\`\`\`

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> Use alpha in a context the lesson never showed.
`;

test('the fixture lesson parses and scores 9/9 anatomy', () => {
  const parsed = parseLesson(LESSON);
  assert.equal(parsed.checks.length, 1);
  assert.equal(parsed.checks[0].id, 'alpha-cloze');
  assert.equal(parsed.transfers.length, 1);
  assert.ok(parsed.wikilinks.includes('00-basics'));
  const anatomy = anatomyOf(parsed);
  assert.equal(anatomy.score, 9, JSON.stringify(anatomy.parts));
});

const MODULE = `schema_version: 1
module: 01-first
title: First
status: generated
serves: [O1]
prerequisites: []
est_hours: 4
concepts: [alpha, beta]
objectives:
  - id: M1-1
    text: Apply alpha
    bloom: apply
sources:
  - title: A
    url: https://example.org/a
    archived_url: https://web.archive.org/web/20260805000000/https://example.org/a
    accessed: 2026-08-05
    source_type: web
    why: a
  - title: B
    url: https://example.org/b
    archived_url: https://web.archive.org/web/20260805000000/https://example.org/b
    accessed: 2026-08-05
    source_type: web
    why: b
lessons:
  - file: 01-alpha.md
    title: Alpha
    concept: alpha
    status: generated
`;

const COURSE = `schema_version: 1
slug: demo-course
title: Demo
created: 2026-08-05
status: active
hub: ./demo-course-hub.md
objectives:
  - id: O1
    text: Apply the topic
    bloom: apply
    assessed_by: transfer
modules:
  - n: 1
    slug: 01-first
    title: First
    status: generated
    est_hours: 4
    serves: [O1]
`;

function makeTree(lesson: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-lessons-'));
  const c = join(dir, 'demo-course');
  mkdirSync(join(c, 'modules', '01-first'), { recursive: true });
  writeFileSync(join(c, 'course.yml'), COURSE);
  writeFileSync(join(c, 'modules', '01-first', 'module.yml'), MODULE);
  writeFileSync(join(c, 'modules', '01-first', '01-alpha.md'), lesson);
  return dir;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

test('a complete lesson produces no errors', () => {
  const dir = makeTree(LESSON);
  assert.deepEqual(checkLessons(dir, walk(dir)).filter((f) => f.level === 'error'), []);
});

test('a missing section fails anatomy naming the part', () => {
  const dir = makeTree(LESSON.replace('## Worked example\nStep 1 does X because Y.\n\n', ''));
  const findings = checkLessons(dir, walk(dir));
  assert.ok(findings.some((f) => f.message.includes('4-worked-example')));
});

test('a check without an id is an error', () => {
  const dir = makeTree(LESSON.replace('id: alpha-cloze\n', ''));
  const findings = checkLessons(dir, walk(dir));
  assert.ok(findings.some((f) => f.check === 'checks' && f.message.includes('missing required "id"')));
});

test('a second transfer callout fails anatomy', () => {
  const dir = makeTree(LESSON + '\n> [!question] Transfer again\n> another\n');
  const findings = checkLessons(dir, walk(dir));
  assert.ok(findings.some((f) => f.message.includes('9-transfer-prompt')));
});

test('ledger: a ui gated line and out-of-order ts are both errors', () => {
  const dir = mkdtempSync(join(tmpdir(), 'meno-ledger-'));
  mkdirSync(join(dir, 'progress'));
  const lines = [
    '{"v":1,"ts":"2026-08-05T10:00:00+10:00","event":"generated","source":"agent","course":"c","module":"01-m","lesson":"01-a","concepts":["alpha"],"review_after":"2026-08-07"}',
    '{"v":1,"ts":"2026-08-05T09:00:00+10:00","event":"gated","source":"ui","course":"c","level":"transfer","module":"02-m","gate":"module_entry","result":"fail","score":0.5,"threshold":0.8,"basis":{"window":"latest_per_item","items":[]},"unlocks":"02-m"}',
  ].join('\n');
  writeFileSync(join(dir, 'progress', 'ledger.jsonl'), lines + '\n');
  const findings = checkLedgers(dir, walk(dir));
  assert.ok(findings.some((f) => f.message.includes('decision 14')));
  assert.ok(findings.some((f) => f.message.includes('not strictly after')));
});
