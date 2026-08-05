// The flagship suite: no sequence of UI actions - including actively hostile
// request shaping - can produce an agent-typed or transfer-level ledger event,
// or unlock a module.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import { appendUiEvent, readLedgerEvents } from '../server/ledger.ts';
import { deriveMastery } from '../../lib/mastery.ts';

const LESSON = { course: 'rust-for-backend', module: '01-syntax-and-ownership-basics', lesson: '01-cargo-and-toolchain' };

let app: TestApp;
test.before(async () => {
  app = await withTenant();
});
after(async () => app.close());

test('an injected source/level/event in a submit body cannot type the ledger line', async () => {
  const { status } = await api(app, 'POST', '/api/v1/example-learner/check/submit', {
    ...LESSON,
    check_id: 'cargo-check-vs-build',
    response: 'anything',
    // hostile extras - the handler must not read any of these
    source: 'agent',
    level: 'transfer',
    event: 'gated',
    score: 1,
  });
  assert.equal(status, 200);
  const events = readLedgerEvents(app.tenantDir);
  const last = events.at(-1)!;
  assert.equal(last.event, 'scored');
  assert.equal(last.source, 'ui');
  assert.equal(last.level, 'recognition');
  assert.equal(last.score, null);
});

test('every write endpoint with injected typing fields still yields only ui lines', async () => {
  const before = readLedgerEvents(app.tenantDir).length;
  await api(app, 'POST', '/api/v1/example-learner/lesson/read', { ...LESSON, source: 'agent', event: 'gated', level: 'transfer' });
  await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'x', type: 'note', source: 'agent' });
  const events = readLedgerEvents(app.tenantDir).slice(before);
  for (const e of events) {
    assert.equal(e.source, 'ui');
    assert.ok(['scored', 'read'].includes(e.event), `unexpected event ${e.event}`);
  }
});

test('appendUiEvent throws rather than write an agent-typed event', () => {
  assert.throws(() => appendUiEvent(app.tenantDir, 'gated' as never, {} as never), /not UI-writable/);
  assert.throws(
    () => appendUiEvent(app.tenantDir, 'scored', { source: 'agent' } as never),
    /may not supply/,
  );
});

test('no route handler contains an agent source literal', () => {
  const routes = readFileSync(new URL('../server/routes.ts', import.meta.url).pathname, 'utf8');
  assert.ok(!/source:\s*['"]agent['"]/.test(routes), 'routes.ts must never construct an agent-sourced event');
  const ledger = readFileSync(new URL('../server/ledger.ts', import.meta.url).pathname, 'utf8');
  assert.ok(!/source:\s*['"]agent['"]/.test(ledger.replace(/\/\/.*$/gm, '')), 'ledger.ts must never construct an agent-sourced event');
});

test('a full scripted UI session changes no gate-relevant state', async () => {
  // the fixture legitimately contains agent activity (the Phase 5 session), so the
  // assertion is a before/after diff: UI activity must change NOTHING a gate reads
  const before = deriveMastery(readLedgerEvents(app.tenantDir));
  // answer every check in every generated lesson, correctly where possible
  const tree = (await api(app, 'GET', '/api/v1/example-learner/tree')).json as never as {
    courses: { slug: string; modules: { slug: string; lessons: { file: string; status: string }[] }[] }[];
  };
  for (const course of tree.courses) {
    for (const mod of course.modules) {
      for (const lesson of mod.lessons.filter((l) => l.status === 'generated')) {
        const slug = lesson.file.replace(/\.md$/, '');
        const detail = (await api(app, 'GET', `/api/v1/example-learner/lesson/${course.slug}/${mod.slug}/${slug}`)).json as never as {
          checks: { id: string; type: string }[];
        };
        for (const check of detail.checks) {
          await api(app, 'POST', '/api/v1/example-learner/check/submit', {
            course: course.slug,
            module: mod.slug,
            lesson: slug,
            check_id: check.id,
            response: check.type === 'flashcard' ? 'got-it' : '1',
          });
        }
      }
    }
  }
  const after_ = deriveMastery(readLedgerEvents(app.tenantDir));
  for (const [courseSlug, course] of Object.entries(after_.courses)) {
    const beforeCourse = before.courses[courseSlug];
    for (const [slug, mod] of Object.entries(course.modules)) {
      assert.deepEqual(mod, beforeCourse.modules[slug], `module ${slug} gate state changed from UI activity alone`);
    }
    for (const [name, concept] of Object.entries(course.concepts)) {
      const b = beforeCourse.concepts[name];
      assert.equal(concept.n_transfer, b?.n_transfer ?? 0, `concept ${name} gained transfer evidence from the UI`);
      assert.equal(concept.transfer_score, b?.transfer_score ?? null, `concept ${name} transfer score moved from UI activity`);
      assert.equal(concept.module, b?.module ?? concept.module, `concept ${name} was reattributed by UI activity`);
    }
  }
});

test('a foreign Origin header is rejected', async () => {
  const { status } = await api(app, 'GET', '/api/v1/tenants', undefined, { origin: 'https://evil.example' });
  assert.equal(status, 403);
});
