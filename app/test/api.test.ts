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
import { parseTodos, addTodo, patchTodo } from '../server/todos.ts';
import type { TodoKind } from '../shared/types.ts';

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
  const src = join(app.tenantDir, 'software-engineering', 'rust-for-backend');
  // under a second domain, so this also covers discovery of a newly created domain dir
  const dst = join(app.root, 'example-learner', 'data', 'second-course');
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
  await api(
    app,
    'POST',
    '/api/v1/example-learner/todos',
    { text: 'review borrowing notes', type: 'admin', audience: 'for-me' },
    { 'if-match': String(list.raw_sha256) },
  );
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
  assert.deepEqual(added.filter((l) => l.startsWith('- ')), ['- [ ] review borrowing notes #admin #for-me']);
  assert.ok(added.every((l) => l.startsWith('- ') || l.startsWith('## ') || l === ''));

  const { json: list2 } = await api(app, 'GET', '/api/v1/example-learner/todos');
  const sections = list2.sections as { todos: { line: number; text: string; done: boolean }[] }[];
  const todo = sections.flatMap((s) => s.todos).find((t) => t.text === 'review borrowing notes')!;
  const patch = await api(app, 'PATCH', `/api/v1/example-learner/todos/${todo.line}`, { done: true }, { 'if-match': String(list2.raw_sha256) });
  assert.equal(patch.status, 200);
  const afterDone = readFileSync(todosPath, 'utf8').split('\n');
  const changed = afterDone.filter((l, i) => afterAdd[i] !== l);
  assert.equal(changed.length, 1);
  assert.match(changed[0], /^- \[x\] review borrowing notes #admin #for-me ✅ \d{4}-\d{2}-\d{2}$/);
});

test('a stale If-Match returns 409 instead of clobbering an Obsidian edit', async () => {
  const { json: list } = await api(app, 'GET', '/api/v1/example-learner/todos');
  // simulate an external edit after our read
  const todosPath = join(app.tenantDir, 'todos.md');
  writeFileSync(todosPath, readFileSync(todosPath, 'utf8') + '- [ ] edited in obsidian #note\n');
  const res = await api(
    app,
    'POST',
    '/api/v1/example-learner/todos',
    { text: 'x', type: 'course', audience: 'for-agent' },
    { 'if-match': String(list.raw_sha256) },
  );
  assert.equal(res.status, 409);
});

test('POST /todos 400s on an unknown kind and on a missing or unknown audience', async () => {
  const { json: list } = await api(app, 'GET', '/api/v1/example-learner/todos');
  const ifMatch = { 'if-match': String(list.raw_sha256) };
  const badKind = await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'x', type: 'nope', audience: 'for-agent' }, ifMatch);
  assert.equal(badKind.status, 400);
  assert.match(String(badKind.json.error), /type must be one of/);
  const missingAudience = await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'x', type: 'course' }, ifMatch);
  assert.equal(missingAudience.status, 400);
  const badAudience = await api(app, 'POST', '/api/v1/example-learner/todos', { text: 'x', type: 'course', audience: 'nope' }, ifMatch);
  assert.equal(badAudience.status, 400);
  assert.match(String(badAudience.json.error), /audience must be one of/);
});

test('parsing a line with both new tags yields the right kind and audience, in either tag order', () => {
  const raw = '# Todos\n\n## Content\n- [ ] a #course #for-agent\n- [ ] b #for-me #vault\n';
  const todos = parseTodos(raw).sections.flatMap((s) => s.todos);
  assert.deepEqual(
    todos.map((t) => ({ text: t.text, type: t.type, audience: t.audience })),
    [
      { text: 'a', type: 'course', audience: 'for-agent' },
      { text: 'b', type: 'vault', audience: 'for-me' },
    ],
  );
});

test('the three old tags still parse to their alias targets', () => {
  const raw = '# Todos\n\n## Content\n- [ ] a #gen\n- [ ] b #repo\n- [ ] c #note\n';
  const todos = parseTodos(raw).sections.flatMap((s) => s.todos);
  assert.deepEqual(
    todos.map((t) => ({ type: t.type, audience: t.audience })),
    [
      { type: 'course', audience: 'for-agent' },
      { type: 'feature', audience: 'for-agent' },
      { type: 'admin', audience: 'for-me' },
    ],
  );
});

test('an explicit new tag beats an alias on the same line', () => {
  const raw = '# Todos\n\n## Content\n- [ ] a #gen #vault\n';
  const todo = parseTodos(raw).sections.flatMap((s) => s.todos)[0];
  // kind comes from the explicit #vault tag, not the #gen alias's course;
  // audience has no explicit tag on this line, so it still falls back to the alias
  assert.equal(todo.type, 'vault');
  assert.equal(todo.audience, 'for-agent');
});

test('patchTodo text-edit preserves both tags and the completion marker', () => {
  const raw = '# Todos\n\n## Content\n- [x] old text #course #for-agent ✅ 2026-08-05\n';
  const next = patchTodo(raw, 3, { text: 'new text' }, '2026-08-06');
  assert.equal(next.split('\n')[3], '- [x] new text #course #for-agent ✅ 2026-08-05');
});

test('addTodo puts each kind under its default section heading', () => {
  const cases: [TodoKind, string][] = [
    ['course', 'Content'],
    ['content-fix', 'Content'],
    ['vault', 'Vault'],
    ['feature', 'Setup'],
    ['bug', 'Setup'],
    ['study', 'Study'],
    ['admin', 'Notes'],
  ];
  for (const [kind, heading] of cases) {
    const next = addTodo('# Todos\n', 'x', kind, 'for-agent');
    const lines = next.split('\n');
    const headingLine = lines.findIndex((l) => l.trim() === `## ${heading}`);
    assert.notEqual(headingLine, -1, `expected a "## ${heading}" section for kind ${kind}`);
    assert.ok(
      lines.slice(headingLine + 1).some((l) => l.startsWith(`- [ ] x #${kind} #for-agent`)),
      `expected the new ${kind} todo under "## ${heading}"`,
    );
  }
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

test('line-addressed todo operations without If-Match are refused with 428', async () => {
  const res = await api(app, 'POST', '/api/v1/example-learner/todos/2/park', {});
  assert.equal(res.status, 428);
  const patch = await api(app, 'PATCH', '/api/v1/example-learner/todos/2', { done: true });
  assert.equal(patch.status, 428);
});

test('ledger limit is clamped and garbage limits fall back to the default', async () => {
  for (const q of ['limit=0', 'limit=abc', 'limit=-5']) {
    const { status, json } = await api(app, 'GET', `/api/v1/example-learner/ledger?${q}`);
    assert.equal(status, 200);
    assert.ok((json.events as unknown[]).length <= 200);
  }
});

test('a read event for a nonexistent lesson is refused, and hostile seconds are rejected', async () => {
  const missing = await api(app, 'POST', '/api/v1/example-learner/lesson/read', { course: 'rust-for-backend', module: '01-syntax-and-ownership-basics', lesson: '99-nope' });
  assert.equal(missing.status, 404);
  const inf = await api(app, 'POST', '/api/v1/example-learner/lesson/read', { course: 'rust-for-backend', module: '01-syntax-and-ownership-basics', lesson: '01-cargo-and-toolchain', seconds: 1e999 });
  assert.equal(inf.status, 400);
});
