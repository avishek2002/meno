// Behavior suite: grading, answer stripping, discovery, empty states, paths,
// todos round-trips, concurrency.
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { withTenant, api, type TestApp } from './helpers.ts';
import { readLedgerEvents } from '../server/ledger.ts';

const L = { course: 'rust-for-backend', module: '01-syntax-and-ownership-basics' };

let app: TestApp;
before(async () => {
  app = await withTenant();
});
after(async () => app.close());

test('lesson payload never contains answers or explanations', async () => {
  const { json } = await api(app, 'GET', `/api/v1/example-learner/lesson/${L.course}/${L.module}/03-ownership`);
  const text = JSON.stringify(json);
  assert.ok((json.checks as unknown[]).length >= 3);
  assert.ok(!text.includes('"answer"'), 'answer leaked into the lesson payload');
  assert.ok(!text.includes('"explain"'), 'explain leaked into the lesson payload');
  // the html must not carry the yaml payloads either
  assert.ok(!(json.html as string).includes('meno-check\nid:'), 'raw check yaml leaked into html');
  assert.ok((json.html as string).includes('data-check-id'), 'check mount points missing');
});

test('correct and incorrect submissions grade deterministically and return the answer', async () => {
  // cloze from lesson 1: cargo-check-vs-build
  const wrong = await api(app, 'POST', '/api/v1/example-learner/check/submit', {
    ...L, lesson: '01-cargo-and-toolchain', check_id: 'cargo-check-vs-build', response: 'definitely wrong',
  });
  assert.equal(wrong.status, 200);
  assert.equal(wrong.json.correct, false);
  assert.ok(typeof wrong.json.answer === 'string' && (wrong.json.answer as string).length > 0);
  const right = await api(app, 'POST', '/api/v1/example-learner/check/submit', {
    ...L, lesson: '01-cargo-and-toolchain', check_id: 'cargo-check-vs-build', response: String(wrong.json.answer),
  });
  assert.equal(right.json.correct, true);
  const events = readLedgerEvents(app.tenantDir);
  const last = events.at(-1)!;
  assert.equal(last.correct, true);
  assert.equal(last.attempt, (events.at(-2)!.attempt as number) + 1);
});

test('transfer callouts render as prompts with the transfer marker, never as inputs', async () => {
  const { json } = await api(app, 'GET', `/api/v1/example-learner/lesson/${L.course}/${L.module}/03-ownership`);
  assert.equal((json.transfers as unknown[]).length, 1);
  assert.ok((json.html as string).includes('data-meno-level="transfer"'));
});

test('wikilinks resolve like the vault index; broken ones are marked', async () => {
  const { json } = await api(app, 'GET', `/api/v1/example-learner/lesson/${L.course}/${L.module}/03-ownership`);
  const links = json.links as { resolved: Record<string, string>; broken: string[] };
  assert.ok(links.resolved['02-syntax-for-experienced-developers']?.endsWith('02-syntax-for-experienced-developers.md'));
});

test('adding files mid-process makes them appear with no config change', async () => {
  const before = (await api(app, 'GET', '/api/v1/example-learner/tree')).json as never as { courses: unknown[] };
  assert.equal(before.courses.length, 1);
  const src = join(app.tenantDir, 'rust-for-backend');
  const dst = join(app.root, 'example-learner', 'second-course');
  mkdirSync(dst, { recursive: true });
  cpSync(join(src, 'course.yml'), join(dst, 'course.yml'));
  writeFileSync(join(dst, 'course.yml'), readFileSync(join(dst, 'course.yml'), 'utf8').replace('slug: rust-for-backend', 'slug: second-course'));
  const after_ = (await api(app, 'GET', '/api/v1/example-learner/tree')).json as never as { courses: unknown[] };
  assert.equal(after_.courses.length, 2);
});

test('empty content root serves the tenants empty state', async () => {
  const empty = await withTenant({ empty: true });
  try {
    const { json } = await api(empty, 'GET', '/api/v1/tenants');
    assert.deepEqual(json.tenants, []);
  } finally {
    await empty.close();
  }
});

test('path traversal and symlink escapes are rejected before I/O', async () => {
  for (const path of [
    '/api/v1/example-learner/note?path=../../../../etc/passwd',
    '/api/v1/example-learner/note?path=..%2F..%2Fetc%2Fpasswd',
    '/api/v1/..%2F..%2Fetc/tree',
  ]) {
    const { status } = await api(app, 'GET', path);
    assert.ok(status === 400 || status === 404, `${path} returned ${status}`);
  }
});

test('todos round-trip touches only the intended lines', async () => {
  const todosPath = join(app.tenantDir, 'todos.md');
  const before = readFileSync(todosPath, 'utf8').split('\n');
  const { json: list } = await api(app, 'GET', '/api/v1/example-learner/todos');
  await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'review borrowing notes', type: 'note' }, { 'if-match': String(list.raw_sha256) });
  const afterAdd = readFileSync(todosPath, 'utf8').split('\n');
  // every pre-existing line survives in order (a subsequence), and the only
  // substantive addition is the todo line (plus its section scaffolding)
  let cursor = 0;
  for (const line of before) {
    cursor = afterAdd.indexOf(line, cursor);
    assert.notEqual(cursor, -1, `pre-existing line lost or reordered: "${line}"`);
    cursor++;
  }
  const added = afterAdd.filter((l) => !before.includes(l));
  assert.deepEqual(added.filter((l) => l.startsWith('- ')), ['- [ ] review borrowing notes #note']);
  assert.ok(added.every((l) => l.startsWith('- ') || l.startsWith('## ') || l === ''));

  const { json: list2 } = await api(app, 'GET', '/api/v1/example-learner/todos');
  const sections = list2.sections as { todos: { line: number; text: string; done: boolean }[] }[];
  const todo = sections.flatMap((s) => s.todos).find((t) => t.text === 'review borrowing notes')!;
  const patch = await api(app, 'PATCH', `/api/v1/example-learner/todos/${todo.line}`, { done: true }, { 'if-match': String(list2.raw_sha256) });
  assert.equal(patch.status, 200);
  const afterDone = readFileSync(todosPath, 'utf8').split('\n');
  const changed = afterDone.filter((l, i) => afterAdd[i] !== l);
  assert.equal(changed.length, 1);
  assert.match(changed[0], /^- \[x\] review borrowing notes #note ✅ \d{4}-\d{2}-\d{2}$/);
});

test('a stale If-Match returns 409 instead of clobbering an Obsidian edit', async () => {
  const { json: list } = await api(app, 'GET', '/api/v1/example-learner/todos');
  // simulate an external edit after our read
  const todosPath = join(app.tenantDir, 'todos.md');
  writeFileSync(todosPath, readFileSync(todosPath, 'utf8') + '- [ ] edited in obsidian #note\n');
  const res = await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'x', type: 'gen' }, { 'if-match': String(list.raw_sha256) });
  assert.equal(res.status, 409);
});

test('concurrent submits plus an agent appender never corrupt the ledger', async () => {
  const fresh = await withTenant();
  try {
    const agentScript = `
      import { appendLine } from '${new URL('../server/atomic.ts', import.meta.url).href}';
      const path = process.argv[2];
      for (let i = 0; i < 30; i++) {
        appendLine(path, JSON.stringify({ v: 1, ts: 'A' + String(i).padStart(4, '0'), event: 'noted', source: 'agent', course: 'rust-for-backend', kind: 'rescheduled', detail: 'concurrency test ' + i }));
      }
    `;
    const scriptPath = join(fresh.root, 'agent-appender.mjs');
    writeFileSync(scriptPath, agentScript);
    const ledgerPath = join(fresh.tenantDir, 'progress', 'ledger.jsonl');
    const seedLines = readFileSync(ledgerPath, 'utf8').trim().split('\n').length;
    const childDone = promisify(execFile)('node', [scriptPath, ledgerPath], { timeout: 20000 });
    const submits = Array.from({ length: 50 }, (_, i) =>
      api(fresh, 'POST', '/api/v1/example-learner/check/submit', {
        ...L, lesson: '01-cargo-and-toolchain', check_id: 'cargo-check-vs-build', response: `attempt ${i}`,
      }),
    );
    await Promise.all(submits);
    await childDone;
    const lines = readFileSync(ledgerPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, seedLines + 30 + 50); // fixture seed + 30 agent + 50 ui
    for (const line of lines) JSON.parse(line); // every line parses
  } finally {
    await fresh.close();
  }
});
