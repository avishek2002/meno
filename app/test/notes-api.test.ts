// GET/PUT /api/v1/:tenant/notes/:course - every status code, the conflict
// path, write authority, and the first-write-creates-the-file-and-a-todo
// property (docs/specs/notes.md).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import { readLedgerEvents } from '../server/ledger.ts';

// rust-for-backend already carries a committed notes fixture (BACKEND's own
// module-boundary fixture edit, docs/specs/notes.md); the "no file yet"
// properties need a course that starts with none, so those tests use
// git-fundamentals instead. Everything else below uses COURSE.
const COURSE = 'rust-for-backend';
const LESSON = { module: '01-syntax-and-ownership-basics', lesson: '03-ownership' };
const NEW_COURSE = 'git-fundamentals';

let app: TestApp;
test.before(async () => {
  app = await withTenant();
});
after(async () => app.close());

function notesFile(a: TestApp, course = COURSE): string {
  return join(a.tenantDir, 'software-engineering', course, `${course}-notes.md`);
}

test('GET on a course with no notes file yet is 200 with blocks: [], exists: false, and a stable seed hash', async () => {
  const { status, json } = await api(app, 'GET', `/api/v1/example-learner/notes/${NEW_COURSE}`);
  assert.equal(status, 200);
  assert.equal(json.exists, false);
  assert.deepEqual(json.blocks, []);
  assert.ok(typeof json.raw_sha256 === 'string' && (json.raw_sha256 as string).length === 64);
  const again = await api(app, 'GET', `/api/v1/example-learner/notes/${NEW_COURSE}`);
  assert.equal(again.json.raw_sha256, json.raw_sha256, 'the seed hash must be stable across reads');
});

test('GET on an unknown course is 404', async () => {
  const { status } = await api(app, 'GET', '/api/v1/example-learner/notes/no-such-course');
  assert.equal(status, 404);
});

test('PUT with no If-Match is 428 and writes nothing', async () => {
  const before = existsSync(notesFile(app, NEW_COURSE));
  const { status } = await api(app, 'PUT', `/api/v1/example-learner/notes/${NEW_COURSE}`, {
    page: 'course',
    section: 'whole-course',
    text: 'no if-match',
  });
  assert.equal(status, 428);
  assert.equal(existsSync(notesFile(app, NEW_COURSE)), before);
});

test('first write creates the file from the seed, appends exactly one hub-link todo, and a second write adds no second todo', async () => {
  const { json: get1 } = await api(app, 'GET', `/api/v1/example-learner/notes/${NEW_COURSE}`);
  const put1 = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${NEW_COURSE}`,
    { page: 'course', section: 'whole-course', text: 'the first note' },
    { 'if-match': String(get1.raw_sha256) },
  );
  assert.equal(put1.status, 200);
  assert.ok(existsSync(notesFile(app, NEW_COURSE)));
  const raw = readFileSync(notesFile(app, NEW_COURSE), 'utf8');
  assert.ok(raw.startsWith('# Git fundamentals'), 'the created file must start from the seed');

  const { json: todos1 } = await api(app, 'GET', '/api/v1/example-learner/todos');
  const linkTodos1 = (todos1.sections as { todos: { text: string }[] }[])
    .flatMap((s) => s.todos)
    .filter((t) => t.text === `Link ${NEW_COURSE}-notes into the course hub`);
  assert.equal(linkTodos1.length, 1);

  // a second write (still page=course, editing the same block) must not file a second todo
  const put2 = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${NEW_COURSE}`,
    { page: 'course', section: 'whole-course', text: 'an edit, not a fresh create' },
    { 'if-match': String(put1.json.raw_sha256) },
  );
  assert.equal(put2.status, 200);
  const { json: todos2 } = await api(app, 'GET', '/api/v1/example-learner/todos');
  const linkTodos2 = (todos2.sections as { todos: { text: string }[] }[])
    .flatMap((s) => s.todos)
    .filter((t) => t.text === `Link ${NEW_COURSE}-notes into the course hub`);
  assert.equal(linkTodos2.length, 1, 'the hub-link todo must be filed only once per course');
});

test('If-Match conflict: 409 with code notes-conflict and a current matching a fresh GET; re-sending with current.raw_sha256 then succeeds', async () => {
  const { json: get1 } = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  // mutate the file out of band
  const file = notesFile(app);
  const outOfBand = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const mutated = existsSync(file) ? outOfBand + '\nHand-typed out of band.\n' : '# Rust for backend developers - notes\n\nedited out of band\n';
  const { writeFileSync } = await import('node:fs');
  writeFileSync(file, mutated);

  const stale = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'lost update' },
    { 'if-match': String(get1.raw_sha256) },
  );
  assert.equal(stale.status, 409);
  assert.equal(stale.json.code, 'notes-conflict');
  const fresh = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  assert.deepEqual(stale.json.current, fresh.json);
  assert.equal(readFileSync(file, 'utf8'), mutated, 'a rejected write must not touch the file on disk');

  const current = stale.json.current as { raw_sha256: string };
  const retry = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'overwrite wins' },
    { 'if-match': current.raw_sha256 },
  );
  assert.equal(retry.status, 200);
});

test('status-code table: one 400 per rejected shape, and 404 for a lesson file that does not exist', async () => {
  const { json: list } = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  const ifMatch = { 'if-match': String(list.raw_sha256) };

  const badPage = await api(app, 'PUT', `/api/v1/example-learner/notes/${COURSE}`, { page: 'nope', section: 'whole-course', text: 'x' }, ifMatch);
  assert.equal(badPage.status, 400);

  const badSection = await api(app, 'PUT', `/api/v1/example-learner/notes/${COURSE}`, { page: 'course', section: 'Not Valid!', text: 'x' }, ifMatch);
  assert.equal(badSection.status, 400);

  const missingLessonFields = await api(app, 'PUT', `/api/v1/example-learner/notes/${COURSE}`, { page: 'lesson', section: 'whole-lesson', text: 'x' }, ifMatch);
  assert.equal(missingLessonFields.status, 400);

  const lessonFieldsOnCoursePage = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', module: LESSON.module, lesson: LESSON.lesson, section: 'whole-course', text: 'x' },
    ifMatch,
  );
  assert.equal(lessonFieldsOnCoursePage.status, 400);

  const tooLong = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'x'.repeat(32769) },
    ifMatch,
  );
  assert.equal(tooLong.status, 400);

  const forgesAMarker = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'look: <!-- meno:note page=course section=whole-course -->' },
    ifMatch,
  );
  assert.equal(forgesAMarker.status, 400);

  const unknownCourse = await api(app, 'PUT', '/api/v1/example-learner/notes/no-such-course', { page: 'course', section: 'whole-course', text: 'x' }, ifMatch);
  assert.equal(unknownCourse.status, 404);

  const badModuleCharset = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'lesson', module: 'has space', lesson: LESSON.lesson, section: 'whole-lesson', text: 'x' },
    ifMatch,
  );
  assert.equal(badModuleCharset.status, 400, 'a module value outside the parser\'s charset must be rejected, not silently write an unmatchable block');

  const badLessonCharset = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'lesson', module: LESSON.module, lesson: 'extra/slash', section: 'whole-lesson', text: 'x' },
    ifMatch,
  );
  assert.equal(badLessonCharset.status, 400, 'a lesson value containing an extra "/" must be rejected, not silently write an unmatchable block');

  const noSuchLesson = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'lesson', module: LESSON.module, lesson: 'no-such-lesson', section: 'whole-lesson', text: 'x' },
    ifMatch,
  );
  assert.equal(noSuchLesson.status, 404);

  const oversized = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'x'.repeat(70000) },
    ifMatch,
  );
  assert.equal(oversized.status, 413, 'a request body over 64 KB must be rejected (docs/specs/notes.md status-code table)');
});

test('anatomy-key anchoring survives a rewording: a note saved under 4-worked-example is still returned for that section after the heading is reworded', async () => {
  const { json: list } = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  const put = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'lesson', ...LESSON, section: '4-worked-example', text: 'anchored to the anatomy key' },
    { 'if-match': String(list.raw_sha256) },
  );
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.block, {
    page: 'lesson',
    module: LESSON.module,
    lesson: LESSON.lesson,
    section: '4-worked-example',
    text: 'anchored to the anatomy key',
  });
  assert.ok(typeof put.json.raw_sha256 === 'string' && (put.json.raw_sha256 as string).length === 64);
  assert.deepEqual(put.json.warnings, []);

  // reword the heading on disk, exactly as a learner would in Obsidian
  const lessonPath = join(app.tenantDir, 'software-engineering', COURSE, 'modules', LESSON.module, `${LESSON.lesson}.md`);
  const lessonText = readFileSync(lessonPath, 'utf8');
  const { writeFileSync } = await import('node:fs');
  writeFileSync(lessonPath, lessonText.replace('## Worked example', '## Worked example: two moves'));

  const lessonResp = await api(app, 'GET', `/api/v1/example-learner/lesson/${COURSE}/${LESSON.module}/${LESSON.lesson}`);
  const sections = lessonResp.json.sections as { key: string; title: string }[];
  const reworded = sections.find((s) => s.key === '4-worked-example');
  assert.ok(reworded, 'the reworded heading must still resolve to the 4-worked-example key');
  assert.equal(reworded!.title, 'Worked example: two moves');
  assert.match(lessonResp.json.html as string, /data-meno-section="4-worked-example"/);

  const notesAfter = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  const block = (notesAfter.json.blocks as { section: string; text: string }[]).find((b) => b.section === '4-worked-example');
  assert.equal(block?.text, 'anchored to the anatomy key');
});

test('write authority holds: a notes PUT with source/level/event appends no ledger line and the file gains no such text', async () => {
  const { json: list } = await api(app, 'GET', `/api/v1/example-learner/notes/${COURSE}`);
  const before = readLedgerEvents(app.tenantDir).length;
  const res = await api(
    app,
    'PUT',
    `/api/v1/example-learner/notes/${COURSE}`,
    { page: 'course', section: 'whole-course', text: 'plain note', source: 'agent', level: 'transfer', event: 'gated' },
    { 'if-match': String(list.raw_sha256) },
  );
  assert.equal(res.status, 200);
  assert.equal(readLedgerEvents(app.tenantDir).length, before, 'a notes write must never append a ledger line');
  const raw = readFileSync(notesFile(app), 'utf8');
  assert.ok(!/source=agent|level=transfer|event=gated/.test(raw));
});
