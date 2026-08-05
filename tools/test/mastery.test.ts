import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveMastery, serializeMastery, type LedgerEvent } from '../../lib/mastery.ts';

const C = 'demo-course';
const M = '01-first';

function ev(partial: Record<string, unknown>): LedgerEvent {
  return { v: 1, course: C, source: 'agent', ...partial } as LedgerEvent;
}

const GENERATED = ev({ ts: 'T1', event: 'generated', module: M, lesson: '01-a', concepts: ['alpha'], review_after: '2026-08-07' });

test('generated-only concept is introduced with a next_review', () => {
  const m = deriveMastery([GENERATED]);
  const c = m.courses[C].concepts.alpha;
  assert.equal(c.level, 'introduced');
  assert.equal(c.next_review, '2026-08-07');
  assert.equal(c.n_transfer, 0);
});

test('recognition results alone make a concept practiced, never mastered', () => {
  const m = deriveMastery([
    GENERATED,
    ev({ ts: 'T2', event: 'scored', source: 'ui', level: 'recognition', module: M, lesson: '01-a', concepts: ['alpha'], item: '01-a#q1', item_type: 'mcq', correct: true, score: null, attempt: 1 }),
    ev({ ts: 'T3', event: 'scored', source: 'ui', level: 'recognition', module: M, lesson: '01-a', concepts: ['alpha'], item: '01-a#q2', item_type: 'cloze', correct: true, score: null, attempt: 1 }),
  ]);
  const c = m.courses[C].concepts.alpha;
  assert.equal(c.level, 'practiced');
  assert.equal(c.recognition_rate, 1);
  assert.equal(c.transfer_score, null);
});

test('a ui-sourced transfer line never moves mastery (decision 14 in the fold)', () => {
  const m = deriveMastery([
    GENERATED,
    // corrupt line a buggy writer might produce - the fold must ignore it
    ev({ ts: 'T2', event: 'scored', source: 'ui', level: 'transfer', module: M, lesson: '01-a', concepts: ['alpha'], item: '01-a#transfer', item_type: 'transfer', correct: null, score: 1, attempt: 1 }),
  ]);
  assert.equal(m.courses[C].concepts.alpha.n_transfer, 0);
  assert.equal(m.courses[C].concepts.alpha.level, 'introduced');
});

test('agent transfer scores use latest-per-item and gate at 0.8', () => {
  const scored = (ts: string, item: string, score: number) =>
    ev({ ts, event: 'scored', level: 'transfer', module: M, lesson: '01-a', concepts: ['alpha'], item, item_type: 'transfer', correct: null, score, attempt: 1 });
  const shaky = deriveMastery([GENERATED, scored('T2', 'i1', 0.5), scored('T3', 'i2', 0.75)]);
  assert.equal(shaky.courses[C].concepts.alpha.level, 'shaky');
  // the latest score for i1 replaces the old one
  const mastered = deriveMastery([GENERATED, scored('T2', 'i1', 0.5), scored('T3', 'i2', 0.75), scored('T4', 'i1', 1)]);
  const c = mastered.courses[C].concepts.alpha;
  assert.equal(c.transfer_score, 0.88);
  assert.equal(c.level, 'mastered');
});

test('a failed gate locks the module; a matching override unlocks and reinjects', () => {
  const base = [
    GENERATED,
    ev({ ts: 'T2', event: 'scored', level: 'transfer', module: M, lesson: '01-a', concepts: ['alpha'], item: 'i1', item_type: 'transfer', correct: null, score: 0.5, attempt: 1 }),
    ev({ ts: 'T3', event: 'gated', level: 'transfer', module: '02-next', gate: 'module_entry', result: 'fail', score: 0.5, threshold: 0.8, basis: { window: 'latest_per_item', items: ['i1'], n: 1, of: 1 }, unlocks: '02-next' }),
  ];
  const locked = deriveMastery(base);
  assert.deepEqual(locked.courses[C].modules['02-next'], { gate: 'fail', score: null, locked: true, overridden: false });

  const overridden = deriveMastery([
    ...base,
    ev({ ts: 'T4', event: 'overridden', module: '02-next', gate_ts: 'T3', reason: 'deadline', weak_concepts: ['alpha'], reinject_after: '2026-08-09' }),
  ]);
  const mod = overridden.courses[C].modules['02-next'];
  assert.equal(mod.locked, false);
  assert.equal(mod.overridden, true);
  const c = overridden.courses[C].concepts.alpha;
  assert.equal(c.next_review, '2026-08-09');
  assert.equal(c.weak_until, '2026-08-09');
  assert.equal(c.level, 'shaky');
});

test('an override with a non-matching gate_ts does not unlock', () => {
  const m = deriveMastery([
    ev({ ts: 'T3', event: 'gated', level: 'transfer', module: '02-next', gate: 'module_entry', result: 'fail', score: 0.5, threshold: 0.8, basis: { window: 'latest_per_item', items: [] }, unlocks: '02-next' }),
    ev({ ts: 'T4', event: 'overridden', module: '02-next', gate_ts: 'WRONG', reason: 'x', weak_concepts: [], reinject_after: '2026-08-09' }),
  ]);
  assert.equal(m.courses[C]?.modules['02-next']?.locked ?? true, true);
});

test('a module with any unproved concept has score null (insufficient evidence is not a pass)', () => {
  const m = deriveMastery([
    ev({ ts: 'T1', event: 'generated', module: M, lesson: '01-a', concepts: ['alpha', 'beta'], review_after: '2026-08-07' }),
    ev({ ts: 'T2', event: 'scored', level: 'transfer', module: M, lesson: '01-a', concepts: ['alpha'], item: 'i1', item_type: 'transfer', correct: null, score: 1, attempt: 1 }),
  ]);
  assert.equal(m.courses[C].modules[M].score, null);
});

test('answering an interleaved check never reattributes a concept to the quizzing module', () => {
  const events = [
    GENERATED, // alpha taught in module 01-first
    ev({ ts: 'T2', event: 'scored', level: 'transfer', module: M, lesson: '01-a', concepts: ['alpha'], item: 'i1', item_type: 'transfer', correct: null, score: 1, attempt: 1 }),
    // an interleaved recognition check for alpha living inside a module-2 lesson,
    // answered in the app - must not move alpha out of module 01-first
    ev({ ts: 'T3', event: 'scored', source: 'ui', level: 'recognition', module: '02-next', lesson: '01-b', concepts: ['alpha'], item: '01-b#alpha-callback', item_type: 'cloze', correct: true, score: null, attempt: 1 }),
  ];
  const m = deriveMastery(events);
  assert.equal(m.courses[C].concepts.alpha.module, M);
  assert.equal(m.courses[C].modules[M].score, 1, 'module score must still include the interleaved concept');
});

test('rebuild is deterministic: same lines, byte-identical serialization', () => {
  const events = [
    GENERATED,
    ev({ ts: 'T2', event: 'scored', source: 'ui', level: 'recognition', module: M, lesson: '01-a', concepts: ['alpha'], item: 'q1', item_type: 'mcq', correct: false, score: null, attempt: 1 }),
    ev({ ts: 'T3', event: 'noted', kind: 'stale', concepts: ['alpha'], detail: 'sweep', review_after: '2026-09-01' }),
  ];
  const a = serializeMastery(deriveMastery(events));
  const b = serializeMastery(deriveMastery(events.map((e) => ({ ...e }))));
  assert.equal(a, b);
  assert.ok(!/\d{2}:\d{2}/.test(a), 'no timestamp-like content in mastery.yml');
});
