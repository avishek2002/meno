// Exercises collectWorkspace + computeWorkspaceScan over the committed fixture tree
// (examples/workspace-fixture/, docs/specs/subject-finder.md's "examples/workspace-fixture/"
// row) with a fixed as_of date and the injected fixtureGit probe, so nothing here depends on
// the clock or on real git. This is the "golden comparison" invariant 8 names: two runs are
// JSON.stringify-identical to each other and to a committed golden snapshot.
//
// The three secret-named placeholder files (.env, credentials.json, id_rsa) are not committed
// (examples/workspace-fixture/README.md, "What is here") - a public repository must not ship
// files named like real credentials. Instead, materializeFixture below copies the whole
// committed tree into a fresh os.tmpdir() directory and writes the three files into the copy,
// so the scan still observes exactly what the golden snapshot expects without any of those
// filenames ever touching git. verbatimSymlinks keeps cpSync from dereferencing
// fx-payments-api/link-to-shared - dereferencing it would turn a skipped symlink into a
// followed file and break the symlinks_skipped assertion below.
//
// Regenerate the golden after any change to this fixture tree or to workspace-scan's behavior:
//
//   WRITE_GOLDEN=1 node --test tools/test/workspace-fixture.test.ts
//
// then re-run without the flag to confirm green, and review the diff before committing it. The
// golden is portable across checkout locations: root_id is sha256(label), not sha256(realpath)
// (docs/specs/subject-finder.md, "Identifiers"), so this file needs regenerating only when the
// fixture tree or the scanner's behavior actually changes, never merely because it was cloned,
// checked out, or copied into a temporary directory somewhere else.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocBundle, computeWorkspaceScan, DEFAULT_BUDGETS, type ScanMeta } from '../../lib/workspace-scan.ts';
import { collectWorkspace, fixtureGit, type ApprovedRoot } from '../../lib/workspace-scan-io.ts';

const FIXTURE_ROOT = fileURLToPath(new URL('../../examples/workspace-fixture/', import.meta.url));
const GOLDEN_PATH = fileURLToPath(new URL('../../examples/workspace-fixture/expected-snapshot.json', import.meta.url));

const AS_OF = '2026-08-12';
const META: ScanMeta = { generated_at: `${AS_OF}T09:00:00+10:00`, as_of: AS_OF, budgets: DEFAULT_BUDGETS, scanner_version: 1 };

// Distinctive sentinels, one per placeholder file, so "this content never reaches the snapshot
// or the doc bundle" has something real (and unique to this test run) to assert against, even
// though the walker skips these files by name before ever opening them.
const ENV_SENTINEL = 'MENO-FIXTURE-ENV-SENTINEL-7f3a';
const CREDENTIALS_SENTINEL = 'MENO-FIXTURE-CREDENTIALS-SENTINEL-2c1d';
const ID_RSA_SENTINEL = 'MENO-FIXTURE-ID-RSA-SENTINEL-9b4e';

/** Copies the committed fixture tree into a fresh os.tmpdir() directory and writes the three
 *  secret-named placeholder files into the copy's fx-payments-api/, so nothing named like a
 *  real credential is ever committed to this public repository. Called once per scan() so every
 *  test sees a clean copy. */
function materializeFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), 'meno-workspace-fixture-'));
  cpSync(FIXTURE_ROOT, dir, { recursive: true, verbatimSymlinks: true });
  const paymentsDir = join(dir, 'fx-payments-api');
  writeFileSync(join(paymentsDir, '.env'), `NOT_A_REAL_SECRET=placeholder-${ENV_SENTINEL}\n`); // pragma: allowlist secret
  writeFileSync(join(paymentsDir, 'credentials.json'), `{ "note": "NOT_A_REAL_SECRET, placeholder seeded for the secret-denylist fixture", "sentinel": "${CREDENTIALS_SENTINEL}" }\n`);
  writeFileSync(join(paymentsDir, 'id_rsa'), `NOT_A_REAL_PRIVATE_KEY - placeholder text only, seeded for the secret-denylist fixture - ${ID_RSA_SENTINEL}\n`);
  return dir;
}

function scan() {
  const fixtureRoot = materializeFixture();
  const roots: ApprovedRoot[] = [
    {
      label: 'fixture-workspace',
      path: fixtureRoot,
      approved_children: ['fx-infra', 'fx-notes-cli', 'fx-payments-api', 'fx-untracked-scripts'],
    },
  ];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  return { obs, snapshot: computeWorkspaceScan(obs, META), fixtureRoot };
}

function findRepo(repos: ReturnType<typeof scan>['snapshot']['repos'], name: string) {
  const repo = repos.find((r) => r.name === name);
  assert.ok(repo, `expected a scanned repo named "${name}"`);
  return repo!;
}

// --- regeneration (opt-in via WRITE_GOLDEN=1) --------------------------------------------------

if (process.env.WRITE_GOLDEN === '1') {
  test('write golden snapshot (WRITE_GOLDEN=1)', () => {
    const { snapshot } = scan();
    writeFileSync(GOLDEN_PATH, JSON.stringify(snapshot, null, 2) + '\n');
  });
}

// --- determinism: two runs are JSON.stringify-identical ----------------------------------------

test('two scans of examples/workspace-fixture/ are JSON.stringify-identical', () => {
  const a = scan().snapshot;
  const b = scan().snapshot;
  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// --- golden comparison: byte for byte against the committed snapshot ---------------------------

test('the scan matches the committed golden snapshot byte for byte', () => {
  const { snapshot } = scan();
  const actual = JSON.stringify(snapshot, null, 2) + '\n';
  const golden = readFileSync(GOLDEN_PATH, 'utf8');
  assert.equal(actual, golden);
});

// --- fx-payments-api: secrets skipped, none named -----------------------------------------------

test('fx-payments-api: .env, id_rsa, and credentials.json are skipped by name and counted, never opened', () => {
  const { obs, snapshot } = scan();
  const bundle = buildDocBundle(obs);
  const json = JSON.stringify(snapshot);
  const bundleJson = JSON.stringify(bundle);
  const repo = findRepo(snapshot.repos, 'fx-payments-api');

  assert.equal(repo.secrets_skipped, 3);
  assert.ok(!json.includes('.env'));
  assert.ok(!json.includes('id_rsa'));
  assert.ok(!json.includes('credentials.json'));

  // Each placeholder file's distinctive sentinel is real, materialized content - proof the
  // walker skips these files by name before ever opening them, not just that their filenames
  // are absent (a file it opened and then merely failed to name would still fail this check).
  for (const sentinel of [ENV_SENTINEL, CREDENTIALS_SENTINEL, ID_RSA_SENTINEL]) {
    assert.ok(!json.includes(sentinel), `snapshot must never carry a secret file's content (${sentinel})`);
    assert.ok(!bundleJson.includes(sentinel), `doc bundle must never carry a secret file's content (${sentinel})`);
  }
});

// --- fx-payments-api: symlink skipped, never followed -------------------------------------------

test('fx-payments-api: the symlink to ../fx-notes-cli/FIXTURE.md is skipped, never followed', () => {
  const { snapshot } = scan();
  const repo = findRepo(snapshot.repos, 'fx-payments-api');
  assert.equal(repo.symlinks_skipped, 1);
});

// --- no source body anywhere; an allowlisted README body appears only in the doc bundle --------

test('no .ts or .py source body appears anywhere; the clean fx-notes-cli README body appears only in the doc bundle', () => {
  const { obs, snapshot } = scan();
  const bundle = buildDocBundle(obs);
  const snapJson = JSON.stringify(snapshot);
  const bundleJson = JSON.stringify(bundle);

  for (const marker of ['ts-body-should-never-leak', 'py-body-should-never-leak']) {
    assert.ok(!snapJson.includes(marker), `snapshot must never carry a source body (${marker})`);
    assert.ok(!bundleJson.includes(marker), `doc bundle must never carry a source body (${marker})`);
  }

  assert.ok(!snapJson.includes('the strongest gap signal'), 'the snapshot never carries any doc body, allowlisted or not');
  const notesReadme = bundle.find((d) => d.repo_id === findRepo(snapshot.repos, 'fx-notes-cli').repo_id && d.path === 'README.md');
  assert.ok(notesReadme, 'expected fx-notes-cli/README.md in the doc bundle');
  assert.ok(notesReadme!.body.includes('the strongest gap signal'), 'the clean README body should appear verbatim in the doc bundle');
});

// --- redaction: the fake AKIA key in fx-payments-api/README.md is redacted ----------------------

test('fx-payments-api/README.md: the fake AKIA-shaped key is redacted in the doc bundle', () => {
  const { obs, snapshot } = scan();
  const bundle = buildDocBundle(obs);
  const repo = findRepo(snapshot.repos, 'fx-payments-api');
  const readme = bundle.find((d) => d.repo_id === repo.repo_id && d.path === 'README.md');

  assert.ok(readme, 'expected fx-payments-api/README.md in the doc bundle');
  assert.ok(!readme!.body.includes('AKIA0000000000000000')); // pragma: allowlist secret
  assert.ok(readme!.body.includes('[REDACTED:token]'));
});

// --- non-allowlisted remote collapses to self-hosted ---------------------------------------------

test('fx-notes-cli: a remote on a non-allowlisted host collapses to self-hosted', () => {
  const { snapshot } = scan();
  const repo = findRepo(snapshot.repos, 'fx-notes-cli');
  assert.equal(repo.remote_host, 'self-hosted');
});

test('fx-payments-api: a github.com remote is recorded verbatim', () => {
  const { snapshot } = scan();
  const repo = findRepo(snapshot.repos, 'fx-payments-api');
  assert.equal(repo.remote_host, 'github.com');
});

// --- marker absence: fx-notes-cli has no tests directory and no CI config -----------------------

test('fx-notes-cli: markers.tests and markers.ci are both false (no tests directory, no CI config)', () => {
  const { snapshot } = scan();
  const repo = findRepo(snapshot.repos, 'fx-notes-cli');
  assert.equal(repo.markers.tests, false);
  assert.equal(repo.markers.ci, false);
  assert.equal(repo.markers.readme, true);
});

test('fx-payments-api: markers.tests and markers.ci are both true', () => {
  const { snapshot } = scan();
  const repo = findRepo(snapshot.repos, 'fx-payments-api');
  assert.equal(repo.markers.tests, true);
  assert.equal(repo.markers.ci, true);
});

// --- fx-untracked-scripts: the non-repository path contributes nothing --------------------------

test('fx-untracked-scripts has no FIXTURE-git.json and contributes no repo to the scan', () => {
  const { snapshot } = scan();
  assert.ok(!snapshot.repos.some((r) => r.name === 'fx-untracked-scripts'));
});

// --- privacy guards: no absolute path, home-directory prefix, or the fixture's own path ---------

test('the snapshot carries no absolute path, home-directory prefix, or the fixture root itself', () => {
  const { snapshot, fixtureRoot } = scan();
  const json = JSON.stringify(snapshot);

  assert.doesNotMatch(json, /\/Users\//);
  assert.doesNotMatch(json, /\/home\//);
  assert.doesNotMatch(json, /^[A-Za-z]:\\/m);
  assert.ok(!json.includes(homedir()));
  assert.ok(!json.includes(FIXTURE_ROOT));
  // root_id is sha256(label), never sha256(realpath) (docs/specs/subject-finder.md,
  // "Identifiers"), so the materialized copy's own tmpdir path must not leak either.
  assert.ok(!json.includes(fixtureRoot));
  assert.ok(!json.includes('/Users/example/payments-notebook'), 'the fake absolute path seeded in fx-payments-api/README.md must never reach the snapshot');
});
