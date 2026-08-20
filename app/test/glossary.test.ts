// GET /api/v1/:tenant/glossary over the real committed example tenant, mutated
// in a throwaway tmp copy (never examples/ itself, never content/tenants/):
// curriculum order and first-definition-wins across two modules' terms.yml, a
// module with none at all, a malformed one, and that no read/due/mastery
// field ever reaches the wire (.claude/CONTRACT-glossary.md, lib/terms.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { withTenant, api, type TestApp } from './helpers.ts';
import type { GlossaryResponse } from '../shared/types.ts';

const T = 'example-learner';
const COURSE_DIR = 'software-engineering/rust-for-backend';
const MOD1 = '01-syntax-and-ownership-basics';
const MOD2 = '02-borrowing-in-practice';
const MOD3 = '03-error-handling'; // will hold the malformed file
const MOD4 = '04-modeling-the-domain'; // deliberately left with no terms.yml

async function readGlossary(app: TestApp): Promise<{ status: number; body: GlossaryResponse }> {
  const res = await api(app, 'GET', `/api/v1/${T}/glossary`);
  return { status: res.status, body: res.json as unknown as GlossaryResponse };
}

function modulePath(app: TestApp, mod: string): string {
  return join(app.tenantDir, COURSE_DIR, 'modules', mod);
}

const OWNERSHIP_DEFINITION =
  "Ownership is Rust's rule that each value has exactly one binding responsible for freeing it. Without it the compiler could not guarantee memory safety without a garbage collector.";

test('curriculum order, first-definition-wins, and a reused_by backlink across two modules', async () => {
  const app = await withTenant();
  try {
    writeFileSync(
      join(modulePath(app, MOD1), 'terms.yml'),
      [
        'schema_version: 1',
        'terms:',
        '  - term: ownership',
        '    lesson: 03-ownership.md',
        `    definition: >-`,
        `      ${OWNERSHIP_DEFINITION}`,
      ].join('\n'),
    );
    writeFileSync(
      join(modulePath(app, MOD2), 'terms.yml'),
      [
        'schema_version: 1',
        'terms:',
        '  - term: borrow',
        '    lesson: 01-borrowing.md',
        '    definition: >-',
        '      A borrow is a reference that lets code read or write a value without taking',
        '      ownership of it. Without borrowing, passing a value to a function would move',
        '      it and the caller could never use it again.',
        '    see_also: [ownership]',
        '  - term: ownership',
        '    lesson: 02-lifetimes.md',
        `    definition: >-`,
        `      ${OWNERSHIP_DEFINITION}`,
      ].join('\n'),
    );

    const { status, body } = await readGlossary(app);
    assert.equal(status, 200);
    const course = body.courses.find((c) => c.course === 'rust-for-backend');
    assert.ok(course, 'the rust-for-backend course is present');

    // module order, never alphabetical: "ownership" (module 1) before "borrow" (module 2)
    assert.deepEqual(course!.entries.map((e) => e.key), ['ownership', 'borrow']);

    const ownership = course!.entries.find((e) => e.key === 'ownership')!;
    assert.equal(ownership.introduced_by.module, MOD1);
    assert.equal(ownership.introduced_by.file, '03-ownership.md');
    assert.equal(ownership.definition, OWNERSHIP_DEFINITION);
    assert.equal(ownership.reused_by.length, 1);
    assert.equal(ownership.reused_by[0].module, MOD2);
    assert.equal(ownership.reused_by[0].file, '02-lifetimes.md');
    assert.equal(ownership.reused_by[0].title, 'Lifetimes');

    const borrow = course!.entries.find((e) => e.key === 'borrow')!;
    assert.deepEqual(borrow.see_also, ['ownership']);
  } finally {
    await app.close();
  }
});

test('a module with no terms.yml contributes nothing and is never an error', async () => {
  const app = await withTenant();
  try {
    // MOD4 deliberately has no terms.yml written for it
    const { status, body } = await readGlossary(app);
    assert.equal(status, 200);
    const course = body.courses.find((c) => c.course === 'rust-for-backend');
    if (course) {
      for (const entry of course.entries) {
        assert.notEqual(entry.introduced_by.module, MOD4);
        for (const back of entry.reused_by) assert.notEqual(back.module, MOD4);
      }
    }
    for (const w of body.warnings) assert.ok(!w.includes(MOD4), `unexpected warning for a module with no terms.yml: ${w}`);
  } finally {
    await app.close();
  }
});

test('a malformed terms.yml surfaces as a warning and the response still answers 200', async () => {
  const app = await withTenant();
  try {
    // "terms" must be a list per lib/terms.ts's parseTerms - this is a mapping
    writeFileSync(join(modulePath(app, MOD3), 'terms.yml'), 'schema_version: 1\nterms: not-a-list\n');

    const { status, body } = await readGlossary(app);
    assert.equal(status, 200);
    assert.ok(body.warnings.some((w) => w.includes('terms.yml')), 'the malformed file is reported in warnings');
    // the malformed module still contributes no entries anywhere - never a throw
    for (const course of body.courses) {
      for (const entry of course.entries) {
        assert.notEqual(entry.introduced_by.module, MOD3);
      }
    }
  } finally {
    await app.close();
  }
});

test('the glossary response carries no read, due, or mastery field, and the endpoint is read-only', async () => {
  const app = await withTenant();
  try {
    const { status, body } = await readGlossary(app);
    assert.equal(status, 200);
    const text = JSON.stringify(body);
    for (const forbidden of ['"next_review"', '"mastery"', '"due"', '"event_ts"', '"read"', '"recent"']) {
      assert.ok(!text.includes(forbidden), `glossary response leaked ${forbidden}`);
    }

    // exactly one route mentions the glossary endpoint, and it is a GET - no
    // POST/PATCH/DELETE counterpart
    const { readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const routes = readFileSync(fileURLToPath(new URL('../server/routes.ts', import.meta.url)), 'utf8');
    const glossaryRows = routes.split('\n').filter((l) => /^\s*\[['"]\w+['"],.*\/glossary\$/.test(l));
    assert.equal(glossaryRows.length, 1, 'exactly one route mentions the glossary endpoint');
    assert.match(glossaryRows[0], /^\s*\['GET'/, 'the glossary route is a GET');
  } finally {
    await app.close();
  }
});
