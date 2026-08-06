import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ancestorsOf, attributionFor, contributorsOf, parseContributors } from '../../lib/attribution.ts';
import { checkPackAttribution, checkPacks } from '../validate.ts';

const DOC = parseContributors(`schema_version: 1
contributions:
  - unit: pack
    by: "@first"
    date: 2026-08-05
    action: created
  - unit: modules/03-remotes-and-forks
    by: "@second"
    date: 2026-08-20
    action: created
  - unit: modules/03-remotes-and-forks/sources/https://example.com/a
    by: "@third"
    date: 2026-08-21
    action: amended
`).doc;

// --- the ancestor chain ---

test('a source unit walks up through its module to the pack', () => {
  assert.deepEqual(ancestorsOf('modules/01-x/sources/https://example.com/a?b=1'), [
    'modules/01-x/sources/https://example.com/a?b=1',
    'modules/01-x',
    'pack',
  ]);
});

test('a lesson unit walks up through its module to the pack', () => {
  assert.deepEqual(ancestorsOf('modules/01-x/lessons/01-y.md'), ['modules/01-x/lessons/01-y.md', 'modules/01-x', 'pack']);
});

test('objectives and notes hang directly off the pack', () => {
  assert.deepEqual(ancestorsOf('objectives/O1'), ['objectives/O1', 'pack']);
  assert.deepEqual(ancestorsOf('notes/fork-vs-clone.md'), ['notes/fork-vs-clone.md', 'pack']);
});

test('the pack is its own root', () => {
  assert.deepEqual(ancestorsOf('pack'), ['pack']);
});

// --- nearest-ancestor resolution: one record must attribute the whole pack ---

test('a unit with no record of its own inherits the nearest ancestor that has one', () => {
  const solo = parseContributors('schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@only"\n    date: 2026-08-05\n    action: created\n').doc;
  const got = attributionFor('modules/02-anything/sources/https://example.com/z', solo);
  assert.deepEqual(got.by, ['@only']);
  assert.equal(got.inherited_from, 'pack');
});

test('a finer record overrides the pack-level one for that unit only', () => {
  const module = attributionFor('modules/03-remotes-and-forks', DOC);
  assert.deepEqual(module.by, ['@second']);
  assert.equal(module.inherited_from, 'modules/03-remotes-and-forks');

  const sibling = attributionFor('modules/01-something-else', DOC);
  assert.deepEqual(sibling.by, ['@first'], 'a sibling module still inherits from the pack');
});

test('a source record overrides its module', () => {
  const got = attributionFor('modules/03-remotes-and-forks/sources/https://example.com/a', DOC);
  assert.deepEqual(got.by, ['@third']);
});

test('an author is the created record; everyone recorded on a unit is a contributor', () => {
  const two = parseContributors(`schema_version: 1
contributions:
  - unit: pack
    by: "@author"
    date: 2026-08-05
    action: created
  - unit: pack
    by: "@helper"
    date: 2026-08-06
    action: amended
`).doc;
  const got = attributionFor('pack', two);
  assert.deepEqual(got.authors, ['@author']);
  assert.deepEqual(got.by, ['@author', '@helper']);
});

test('the pack roll-up is every distinct handle, in first-seen order', () => {
  assert.deepEqual(contributorsOf(DOC), ['@first', '@second', '@third']);
});

test('a removed record does not attribute anything but is not dropped', () => {
  const doc = parseContributors(`schema_version: 1
contributions:
  - unit: pack
    by: "@a"
    date: 2026-08-05
    action: created
  - unit: modules/09-gone
    by: "@b"
    date: 2026-08-06
    action: removed
`).doc;
  assert.deepEqual(attributionFor('modules/09-gone', doc).by, ['@a'], 'a removed unit falls back to its ancestor');
  assert.deepEqual(contributorsOf(doc), ['@a', '@b']);
});

// --- the validate check ---

interface PackOpts {
  contributors?: string | null;
  sourceUrl?: string;
  lessonFile?: string;
}

function packTree(opts: PackOpts = {}): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'meno-attr-')), 'demo-pack');
  mkdirSync(join(dir, 'modules', '01-basics'), { recursive: true });
  writeFileSync(
    join(dir, 'course.yml'),
    `schema_version: 1\nslug: demo-pack\ntitle: Demo pack\ncreated: 2026-08-05\nstatus: draft\nhub: ./demo-pack-hub.md\nobjectives:\n  - id: O1\n    text: Apply the thing\n    bloom: apply\n    assessed_by: a thing\nmodules:\n  - n: 1\n    slug: 01-basics\n    title: Basics\n    status: skeleton\n    est_hours: 3\n    serves: [O1]\n`,
  );
  writeFileSync(
    join(dir, 'PACK.md'),
    `---\nschema_version: 1\npack: software-engineering/demo-pack\ntitle: Demo pack\nmaintainers: []\naudience: testers\nhours: 3\ncreated: 2026-08-05\n---\n\n# Demo\n\n## Amendment log\n\n- 2026-08-05 - created.\n`,
  );
  writeFileSync(join(dir, 'demo-pack-hub.md'), '# Demo pack hub\n');
  writeFileSync(
    join(dir, 'modules', '01-basics', 'module.yml'),
    `schema_version: 1\nmodule: 01-basics\ntitle: Basics\nstatus: skeleton\nserves: [O1]\nprerequisites: []\nest_hours: 3\nconcepts: [one, two]\nobjectives:\n  - id: M1-1\n    text: Apply one\n    bloom: apply\nsources:\n  - title: A source\n    url: ${opts.sourceUrl ?? 'https://example.com/a'}\n    archived_url: https://web.archive.org/web/2026/https://example.com/a\n    accessed: 2026-08-05\n    source_type: web\n    why: because\n  - title: B source\n    url: https://example.com/b\n    archived_url: https://web.archive.org/web/2026/https://example.com/b\n    accessed: 2026-08-05\n    source_type: web\n    why: because\nlessons:\n  - file: ${opts.lessonFile ?? '01-one.md'}\n    title: One\n    concept: one\n    status: planned\n`,
  );
  if (opts.contributors !== null) {
    writeFileSync(
      join(dir, 'CONTRIBUTORS.yml'),
      opts.contributors ??
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@someone"\n    date: 2026-08-05\n    action: created\n',
    );
  }
  return dir;
}

function attributionFindings(packDir: string): { level: string; check: string; message: string }[] {
  return checkPackAttribution(packDir, 'content/community/software-engineering/demo-pack');
}

test('a pack with a single pack-level record passes attribution', () => {
  assert.deepEqual(attributionFindings(packTree()), []);
});

test('a pack with no CONTRIBUTORS.yml is an error', () => {
  const findings = attributionFindings(packTree({ contributors: null }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].level, 'error');
  assert.match(findings[0].message, /CONTRIBUTORS\.yml/);
});

test('a CONTRIBUTORS.yml with no pack-level record is an error', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: modules/01-basics\n    by: "@someone"\n    date: 2026-08-05\n    action: created\n',
    }),
  );
  assert.equal(findings.filter((f) => f.level === 'error').length, 1);
  assert.match(findings[0].message, /unit: pack/);
});

test('an email or a real name in the by field fails the schema', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "someone@example.com"\n    date: 2026-08-05\n    action: created\n',
    }),
  );
  assert.ok(findings.some((f) => f.level === 'error'));
});

test('a record pointing at a module that does not exist is an error', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/07-ghost\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.equal(findings.filter((f) => f.level === 'error').length, 1);
  assert.match(findings[0].message, /07-ghost/);
});

test('the same record marked removed is exempt from resolution', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/07-ghost\n    by: "@b"\n    date: 2026-08-06\n    action: removed\n',
    }),
  );
  assert.deepEqual(findings, []);
});

test('a lesson unit resolves against module.yml lessons, not against disk', () => {
  const clean = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/01-basics/lessons/01-one.md\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.deepEqual(clean, [], 'packs ship no lesson bodies, so the manifest entry is what must exist');

  const broken = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/01-basics/lessons/99-nope.md\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.equal(broken.filter((f) => f.level === 'error').length, 1);
});

test('a source unit keys on the url, so reordering the list cannot orphan it', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/01-basics/sources/https://example.com/b\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.deepEqual(findings, [], 'the second source in the list resolves by url, not by index');
});

test('a source unit whose url is gone warns rather than failing the gate', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: modules/01-basics/sources/https://example.com/moved\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.equal(findings.filter((f) => f.level === 'error').length, 0);
  assert.equal(findings.filter((f) => f.level === 'warning').length, 1);
});

test('an objective unit resolves against course.yml objective ids', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-05\n    action: created\n  - unit: objectives/O9\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.equal(findings.filter((f) => f.level === 'error').length, 1);
  assert.match(findings[0].message, /O9/);
});

test('a malformed record does not hide the independent problems in the same file', () => {
  // schema failure used to return early, so a contributor fixed one defect per run
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: modules/01-basics\n    by: "@a"\n    date: 2026-08-05\n    action: invented\n',
    }),
  );
  const messages = findings.map((f) => f.message).join('\n');
  assert.match(messages, /action/, 'the schema error is reported');
  assert.match(messages, /unit: pack/, 'and so is the missing pack-level record');
});

test('a record with no by field never reaches the roll-up as an empty name', () => {
  const doc = parseContributors(
    'schema_version: 1\ncontributions:\n  - unit: pack\n    date: 2026-08-05\n    action: created\n  - unit: pack\n    by: "@real"\n    date: 2026-08-06\n    action: amended\n',
  ).doc;
  assert.deepEqual(contributorsOf(doc), ['@real']);
  assert.deepEqual(attributionFor('pack', doc).by, ['@real']);
});

test('records out of date order are an error - the log is oldest-first', () => {
  const findings = attributionFindings(
    packTree({
      contributors:
        'schema_version: 1\ncontributions:\n  - unit: pack\n    by: "@a"\n    date: 2026-08-20\n    action: created\n  - unit: modules/01-basics\n    by: "@b"\n    date: 2026-08-06\n    action: amended\n',
    }),
  );
  assert.equal(findings.filter((f) => f.level === 'error').length, 1);
  assert.match(findings[0].message, /oldest-first/);
});
