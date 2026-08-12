import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, symlinkSync, cpSync, existsSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDocBundle, computeWorkspaceScan, DEFAULT_BUDGETS, redactSecrets, type ScanBudgets, type ScanMeta } from '../../lib/workspace-scan.ts';
import { cleanupStaleDocBundles, collectWorkspace, fixtureGit, gitCli, loadApprovedRoots, type ApprovedRoot, type GitLogEntry } from '../../lib/workspace-scan-io.ts';

const PURE_MODULE = fileURLToPath(new URL('../../lib/workspace-scan.ts', import.meta.url));
const IO_MODULE = fileURLToPath(new URL('../../lib/workspace-scan-io.ts', import.meta.url));
const SCAN_CLI = fileURLToPath(new URL('../../tools/scan.ts', import.meta.url));

const AS_OF = '2026-08-12';
const META: ScanMeta = { generated_at: `${AS_OF}T09:00:00+10:00`, as_of: AS_OF, budgets: DEFAULT_BUDGETS, scanner_version: 1 };

/** Strips both comment styles so a source grep never trips on the file's own prose explaining
 *  the rule it enforces (this module's header comment names node:fs and node:child_process by
 *  name, same reasoning as tools/test/insights.test.ts's purity test). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** A fixture "repo": a directory carrying FIXTURE-git.json instead of a real .git directory, so
 *  the committed test tree never needs a nested .git (which git would treat as a submodule
 *  boundary). fixtureGit.isRepo() looks for exactly this sidecar. */
function mkFixtureRepo(baseDir: string, name: string, opts: { commits?: GitLogEntry[]; remote?: string | null } = {}): string {
  const dir = join(baseDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'FIXTURE-git.json'), JSON.stringify({ commits: opts.commits ?? [], remote: opts.remote ?? null }));
  return dir;
}

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'meno-workspace-scan-'));
}

/** A tiny seeded PRNG (mulberry32) - Math.random() is banned in this repo's lib/tools/test code
 *  for determinism, and the statistical redaction test below needs a reproducible sample run to
 *  run rather than an occasionally-flaky one. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A pseudo-random hex string of the given length, drawn from the seeded generator above - stands
 *  in for a realistic secret token (an API key, a hash), as opposed to the old test's
 *  '0123456789abcdef0123456789abcdef01234567', which deliberately used all sixteen hex digits and
 *  was the single best case for a distinct-character diversity rule (DEFECT 2). */
function randomHexToken(rand: () => number, length: number): string {
  const alphabet = '0123456789abcdef';
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

// --- 1. purity: no node:fs, no node:child_process, no clock -----------------------------------

test('lib/workspace-scan.ts imports neither node:fs nor node:child_process and never reads the clock', () => {
  const code = stripComments(readFileSync(PURE_MODULE, 'utf8'));
  assert.ok(!code.includes("'node:fs'") && !code.includes('"node:fs"'), 'must not import node:fs');
  assert.ok(!code.includes("'node:child_process'") && !code.includes('"node:child_process"'), 'must not import node:child_process');
  assert.ok(!code.includes('Date.now('), 'must not call Date.now()');
  assert.ok(!/new Date\(\s*\)/.test(code), 'must not call new Date() with no argument');
});

test('neither workspace-scan module uses localeCompare (Buffer.compare only, per Determinism item 1)', () => {
  for (const f of [PURE_MODULE, IO_MODULE]) {
    const code = stripComments(readFileSync(f, 'utf8'));
    assert.ok(!code.includes('localeCompare'), `${f} must not use localeCompare`);
  }
});

// --- 2. secret denylist ------------------------------------------------------------------------

test('a repo with .env, id_rsa, credentials.json produces a snapshot and doc bundle naming and containing none of them, secrets_skipped === 3', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  // Distinctive content, not just a distinctive filename: the old version of this test asserted
  // only `!json.includes('.env')`, which is near-vacuous since no filename is ever recorded in
  // the first place. The real property under test is that the secret file's BYTES never reach any
  // written artifact, because the file is skipped by name before it is ever opened at all.
  writeFileSync(join(repo, '.env'), 'ENV_SENTINEL_1a2b3c=should-never-leak');
  writeFileSync(join(repo, 'id_rsa'), 'RSA_SENTINEL_4d5e6f private key material');
  writeFileSync(join(repo, 'credentials.json'), '{"CREDS_SENTINEL_7g8h9i": "should-never-leak"}');
  writeFileSync(join(repo, 'index.js'), 'console.log(1)');
  writeFileSync(join(repo, 'README.md'), 'a clean readme with no secret content');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const bundle = buildDocBundle(obs);
  const json = JSON.stringify(snapshot);
  const bundleJson = JSON.stringify(bundle);

  for (const sentinel of ['ENV_SENTINEL_1a2b3c', 'RSA_SENTINEL_4d5e6f', 'CREDS_SENTINEL_7g8h9i', 'should-never-leak', 'private key material']) {
    assert.ok(!json.includes(sentinel), `snapshot must never carry secret-file content (${sentinel})`);
    assert.ok(!bundleJson.includes(sentinel), `doc bundle must never carry secret-file content (${sentinel})`);
  }
  assert.ok(!json.includes('.env'), 'snapshot must not name .env');
  assert.ok(!json.includes('id_rsa'), 'snapshot must not name id_rsa');
  assert.ok(!json.includes('credentials.json'), 'snapshot must not name credentials.json');
  assert.equal(snapshot.repos.length, 1);
  assert.equal(snapshot.repos[0].secrets_skipped, 3);
});

// DEFECT 5: denylist gaps - serviceAccount.json (the real Google default filename has no hyphen;
// the old *service-account*.json glob only matched the hyphenated form), plus a batch of common
// credential-bearing filenames the denylist previously missed entirely.
test('the newly-added secret-file denylist entries are skipped by name and never opened', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  const names = [
    'serviceAccount.json',
    '.pypirc',
    '.dockercfg',
    '.my.cnf',
    '.s3cfg',
    'kubeconfig',
    'auth.json',
    'local.settings.json',
    'secrets.yaml',
    'secrets.yml',
    'wp-config.php',
    'profile.mobileprovision',
    '.Renviron',
  ];
  for (const name of names) writeFileSync(join(repo, name), 'DENYLIST_SENTINEL_SHOULD_NEVER_LEAK');
  writeFileSync(join(repo, 'index.js'), 'console.log(1)');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const json = JSON.stringify(snapshot);

  assert.equal(snapshot.repos[0].secrets_skipped, names.length, 'every newly-added name must be skipped, not opened');
  for (const name of names) assert.ok(!json.includes(name), `snapshot must not name ${name}`);
  assert.ok(!json.includes('DENYLIST_SENTINEL_SHOULD_NEVER_LEAK'));
});

// --- 3. no absolute path anywhere, including a README that quotes one --------------------------

test('the snapshot carries no absolute path, home-directory prefix, or the fixture root itself, even with an absolute path in a README', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'README.md'), `See /Users/example/secret-project or ${homedir()} for details.`);

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const json = JSON.stringify(snapshot);

  assert.doesNotMatch(json, /\/Users\//);
  assert.doesNotMatch(json, /\/home\//);
  assert.doesNotMatch(json, /^[A-Za-z]:\\/m);
  assert.ok(!json.includes(homedir()));
  assert.ok(!json.includes(base));
  assert.ok(!json.includes(repo));
});

// --- 4. --read against an unapproved root ------------------------------------------------------

test('--read against an unapproved root exits non-zero and never prints a snapshot', () => {
  const tenantDir = tmpRoot();
  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  writeFileSync(
    join(tenantDir, 'workspace', 'roots.yml'),
    'roots:\n  - label: other\n    path: /tmp/some-other-approved-root\n    approved_children: []\n',
  );

  const result = spawnSync('node', [SCAN_CLI, tenantDir, '--read', 'not-approved'], { encoding: 'utf8' });

  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /"type":\s*"workspace-scan"/);
});

test('--read exits non-zero, having read zero roots, when workspace/roots.yml does not exist at all', () => {
  const tenantDir = tmpRoot();
  const result = spawnSync('node', [SCAN_CLI, tenantDir, '--read'], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(result.stdout, /"type":\s*"workspace-scan"/);
});

// --- 5. child drift -----------------------------------------------------------------------------

test('a root whose immediate children gained a directory since approval yields it in pending_approval, not in the scanned repos', () => {
  const base = tmpRoot();
  mkFixtureRepo(base, 'proj');
  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  // drift happens after approval was recorded
  mkdirSync(join(base, 'new-dir'));

  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  assert.deepEqual(obs.roots[0].pending_approval, ['new-dir']);
  assert.deepEqual(obs.roots[0].repos, []);

  const snapshot = computeWorkspaceScan(obs, META);
  assert.deepEqual(snapshot.roots[0].pending_approval, ['new-dir']);
  assert.equal(snapshot.repos.length, 0);
});

// --- 6. symlinks never followed ------------------------------------------------------------------

test('a symlinked directory inside a repo contributes zero files and increments symlinks_skipped', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  const outsideTarget = tmpRoot();
  writeFileSync(join(outsideTarget, 'secret.js'), 'x');
  symlinkSync(outsideTarget, join(repo, 'linked'), 'dir');
  writeFileSync(join(repo, 'real.js'), 'y');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const repoObs = obs.roots[0].repos[0];

  assert.equal(repoObs.symlinks_skipped, 1);
  // The real assertion the title makes: a symlinked directory contributes ZERO files. The old
  // version of this test only checked `!extensions.includes('secret')`, which is vacuous -
  // extensions only ever holds entries shaped like {'.js': 3}, so it could never contain that
  // string regardless of whether the symlink was followed or not.
  assert.equal(repoObs.files_walked, 2, 'only real.js and the FIXTURE-git.json sidecar should be walked; nothing from the symlink target');
});

// --- 7. body allowlist ---------------------------------------------------------------------------

test('.js/.ts/.py bodies never appear anywhere; an allowlisted README body appears only in the doc bundle', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'app.js'), 'const SENTINEL = "js-body-marker";');
  writeFileSync(join(repo, 'app.ts'), 'const SENTINEL = "ts-body-marker";');
  writeFileSync(join(repo, 'app.py'), 'SENTINEL = "py-body-marker"');
  writeFileSync(join(repo, 'README.md'), 'This project does readme-body-marker things.');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const bundle = buildDocBundle(obs);
  const snapJson = JSON.stringify(snapshot);
  const bundleJson = JSON.stringify(bundle);

  for (const marker of ['js-body-marker', 'ts-body-marker', 'py-body-marker']) {
    assert.ok(!snapJson.includes(marker), `snapshot must never carry a source body (${marker})`);
    assert.ok(!bundleJson.includes(marker), `doc bundle must never carry a source body (${marker})`);
  }
  assert.ok(!snapJson.includes('readme-body-marker'), 'the snapshot never carries any doc body, allowlisted or not');
  assert.ok(bundleJson.includes('readme-body-marker'), 'the ephemeral doc bundle does carry the allowlisted README body');
});

// --- 8. redaction ----------------------------------------------------------------------------
// DEFECT 1: the entropy redactor barely fired (a random hex token rarely uses all sixteen hex
// digits, which the old 16-distinct-character bar required) and several credential shapes were
// missed entirely. DEFECT 2: the old test's hexToken
// ('0123456789abcdef0123456789abcdef01234567') used every hex digit exactly once each - the
// single best case for a distinct-character rule, and wildly unrepresentative of a real token.

test('a README with credential-shaped content across every redaction rule emits [REDACTED:token]/[REDACTED:credential] and none of the original bytes', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  const rand = mulberry32(42);
  const akiaKey = 'AKIA0000000000000000'; // pragma: allowlist secret
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'; // pragma: allowlist secret
  // A realistic pseudo-random hex token (see DEFECT 2 above), not the all-sixteen-digits best case.
  const hexToken = randomHexToken(rand, 32); // pragma: allowlist secret
  const connectionStringSecret = 'hunter2';
  const connectionString = `postgres://admin:${connectionStringSecret}@db.example.com/prod`;
  const basicToken = 'YWRtaW46aHVudGVyMg=='; // pragma: allowlist secret
  const basicAuth = `Authorization: Basic ${basicToken}`;
  const bearerToken = 'abc123def456ghi789jkl012'; // pragma: allowlist secret
  const bearerAuth = `Authorization: Bearer ${bearerToken}`;
  const genericPassword = 'password: hunter2'; // pragma: allowlist secret
  const genericApiKey = 'api_key = abc12345'; // pragma: allowlist secret
  const splitValue = 'SupersecretValue1234';
  const splitAcrossNewline = `token:\n${splitValue}`;

  writeFileSync(
    join(repo, 'README.md'),
    [`key=${akiaKey}`, `token=${jwt}`, `hex=${hexToken}`, connectionString, basicAuth, bearerAuth, genericPassword, genericApiKey, splitAcrossNewline, ''].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const bundle = buildDocBundle(obs);
  const body = bundle.find((d) => d.path === 'README.md')!.body;

  for (const secret of [akiaKey, jwt, hexToken, connectionStringSecret, basicToken, bearerToken, 'abc12345', splitValue]) {
    assert.ok(!body.includes(secret), `original secret bytes must not survive redaction (${secret})`);
  }
  assert.ok(body.includes('postgres://[REDACTED:credential]@db.example.com/prod'), 'the connection string keeps its scheme and host, only the credential is redacted');
  assert.ok(body.includes('Basic [REDACTED:token]'), 'a Basic auth header is redacted');
  assert.ok(body.includes('Bearer [REDACTED:token]'), 'a Bearer auth header is redacted');
  assert.ok(body.includes('password: [REDACTED:token]'), 'a generic "password:" assignment is redacted');
  assert.ok(body.includes('api_key = [REDACTED:token]'), 'a generic "api_key =" assignment is redacted');
  assert.ok(body.includes('token:\n[REDACTED:token]'), 'a value on the line after its key is still redacted');
});

test('a statistical sample of 200 seeded pseudo-random 32-character and 200 40-character hex tokens are all redacted (DEFECT 1/2: the old entropy bar required all sixteen hex digits to appear, which a random draw rarely does)', () => {
  const rand = mulberry32(20260812);
  const SAMPLE = 200;
  const failures: string[] = [];
  for (const length of [32, 40]) {
    for (let i = 0; i < SAMPLE; i++) {
      const token = randomHexToken(rand, length); // pragma: allowlist secret
      if (redactSecrets(token) !== '[REDACTED:token]') failures.push(`${length}-char token not redacted: ${token}`);
    }
  }
  assert.equal(failures.length, 0, `${failures.length} of ${SAMPLE * 2} tokens were not redacted:\n${failures.slice(0, 5).join('\n')}`);
});

// --- 9. determinism -------------------------------------------------------------------------

test('two scans of the same fixture are JSON.stringify-identical', () => {
  const base = tmpRoot();
  const repoA = mkFixtureRepo(base, 'alpha', {
    commits: [
      { date: '2026-08-01', author: 'a', subject: 'feat: add auth' },
      { date: '2026-06-01', author: 'b', subject: 'fix: bug' },
    ],
    remote: 'git@github.com:example/alpha.git',
  });
  writeFileSync(join(repoA, 'README.md'), 'alpha readme');
  writeFileSync(join(repoA, 'index.js'), '1');
  mkFixtureRepo(base, 'beta', { commits: [{ date: '2026-07-01', author: 'c', subject: 'chore: tidy' }] });

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['alpha', 'beta'] }];
  const a = computeWorkspaceScan(collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit), META);
  const b = computeWorkspaceScan(collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit), META);

  assert.deepEqual(a, b);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

// --- 9b. portability: root_id/repo_id must not depend on the checkout's absolute path ----------

test('scanning the same fixture tree from two different absolute paths under the same label yields JSON.stringify-identical snapshots', () => {
  const baseA = tmpRoot();
  const repoA = mkFixtureRepo(baseA, 'proj', {
    commits: [
      { date: '2026-08-01', author: 'a', subject: 'feat: add auth' },
      { date: '2026-06-01', author: 'b', subject: 'fix: bug' },
    ],
    remote: 'git@github.com:example/proj.git',
  });
  writeFileSync(join(repoA, 'README.md'), 'portable readme');
  writeFileSync(join(repoA, 'index.js'), '1');

  // A fresh, differently-named directory under os.tmpdir() - simulates a different machine's
  // checkout location for the exact same tree, same label, same approved_children.
  const baseB = mkdtempSync(join(tmpdir(), 'meno-workspace-scan-portable-'));
  cpSync(baseA, baseB, { recursive: true });
  assert.notEqual(baseA, baseB);

  const rootsA: ApprovedRoot[] = [{ label: 'work', path: baseA, approved_children: ['proj'] }];
  const rootsB: ApprovedRoot[] = [{ label: 'work', path: baseB, approved_children: ['proj'] }];

  const snapA = computeWorkspaceScan(collectWorkspace(rootsA, DEFAULT_BUDGETS, fixtureGit), META);
  const snapB = computeWorkspaceScan(collectWorkspace(rootsB, DEFAULT_BUDGETS, fixtureGit), META);

  assert.deepEqual(snapA, snapB);
  assert.equal(JSON.stringify(snapA), JSON.stringify(snapB));
});

// --- 10. truncation: every cap, exactly at the budget vs one over it -------------------------
// DEFECT 4: computeWorkspaceScan used '>=' where it needed '>' at every one of these checks - a
// collection that landed exactly on a budget, with nothing beyond it, still emitted a truncation
// event and a limits line claiming the true total was unknown, which is a false disclosure. The
// old version of this test set every budget to 1 and expected an event for every cap regardless,
// which is exactly the bug: none of those budgets were actually exceeded, only met.
//
// DEFECT 3: max_roots and max_doc_files were declared in budgets and emitted as events, but
// nothing ever enforced them - collectWorkspace and walkRepoTree read straight past both caps.
// The tests below assert the caps are enforced for real (the collected counts genuinely stop),
// not merely that an event is emitted.
//
// Fixing the false disclosure required more than swapping the comparison operator: several of
// these observation fields (root.repos.length, repo.depth, repo.commit_days.length,
// repo.docs.length) are capped at the budget by construction once the walker enforces it, so they
// can never actually exceed it - the *value* alone cannot distinguish "exactly at the cap" from
// "truncated at the cap". Each check below now reads an explicit boolean the io layer only sets
// when it found real evidence of truncation (see RepoObservation/RootObservation/
// WorkspaceObservation's *_truncated fields in lib/workspace-scan.ts).

test('max_roots: two approved roots against a budget of one truncates, reports the exact total, and scans only the first; one root against the same budget does not', () => {
  const baseA = tmpRoot();
  mkFixtureRepo(baseA, 'proj');
  const baseB = tmpRoot();
  mkFixtureRepo(baseB, 'proj');
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_roots: 1 };
  const meta: ScanMeta = { ...META, budgets };

  const twoRoots: ApprovedRoot[] = [
    { label: 'first', path: baseA, approved_children: ['proj'] },
    { label: 'second', path: baseB, approved_children: ['proj'] },
  ];
  const truncated = computeWorkspaceScan(collectWorkspace(twoRoots, budgets, fixtureGit), meta);
  const ev = truncated.truncation.events.find((e) => e.cap === 'max_roots');
  assert.ok(ev, 'expected a max_roots truncation event');
  assert.equal(ev!.observed, 2, 'the true total is exact and known here, unlike most other caps');
  assert.equal(truncated.roots.length, 1, 'only the first root was actually scanned - the budget is enforced, not merely disclosed');
  assert.ok(truncated.limits.some((l) => l.startsWith('max_roots')));

  const oneRoot: ApprovedRoot[] = [{ label: 'first', path: baseA, approved_children: ['proj'] }];
  const exact = computeWorkspaceScan(collectWorkspace(oneRoot, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_roots'), 'exactly at the cap, with no more roots, must not report truncation');
});

test('max_repos_per_root: two repos under one root against a budget of one truncates and scans only the first; one repo against the same budget does not', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_repos_per_root: 1 };
  const meta: ScanMeta = { ...META, budgets };

  const baseTwo = tmpRoot();
  mkFixtureRepo(baseTwo, 'alpha');
  mkFixtureRepo(baseTwo, 'beta');
  const twoRepos: ApprovedRoot[] = [{ label: 'work', path: baseTwo, approved_children: ['alpha', 'beta'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(twoRepos, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_repos_per_root'));
  assert.equal(truncated.repos.length, 1, 'the second repo was never walked - the budget is enforced, not merely disclosed');

  const baseOne = tmpRoot();
  mkFixtureRepo(baseOne, 'alpha');
  const oneRepo: ApprovedRoot[] = [{ label: 'work', path: baseOne, approved_children: ['alpha'] }];
  const exact = computeWorkspaceScan(collectWorkspace(oneRepo, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_repos_per_root'));
});

test('max_depth: a repository one level below the depth budget is never discovered and is disclosed; a repository at the root of the budget is found with no truncation', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_depth: 0 };
  const meta: ScanMeta = { ...META, budgets };

  const baseNested = tmpRoot();
  mkFixtureRepo(baseNested, 'proj'); // one level below the root itself
  const nestedRoots: ApprovedRoot[] = [{ label: 'work', path: baseNested, approved_children: ['proj'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(nestedRoots, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_depth'));
  assert.equal(truncated.repos.length, 0, 'proj sits below the depth budget and was never discovered at all');

  const baseAtRoot = tmpRoot();
  writeFileSync(join(baseAtRoot, 'FIXTURE-git.json'), JSON.stringify({ commits: [], remote: null })); // the root itself is the repo
  const rootIsRepo: ApprovedRoot[] = [{ label: 'work', path: baseAtRoot, approved_children: [] }];
  const exact = computeWorkspaceScan(collectWorkspace(rootIsRepo, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_depth'));
  assert.equal(exact.repos.length, 1, 'the root itself, at depth 0, is within the budget and is found');
});

test('max_commits_per_repo: two commits against a budget of one truncates and surfaces only one; one commit against the same budget does not', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_commits_per_repo: 1 };
  const meta: ScanMeta = { ...META, budgets };

  const baseTwo = tmpRoot();
  mkFixtureRepo(baseTwo, 'proj', {
    commits: [
      { date: '2026-08-01', author: 'a', subject: 'feat: x' },
      { date: '2026-07-01', author: 'b', subject: 'fix: y' },
    ],
  });
  const twoCommits: ApprovedRoot[] = [{ label: 'work', path: baseTwo, approved_children: ['proj'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(twoCommits, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_commits_per_repo'));
  assert.equal(truncated.repos[0].commits_total, 1, 'only one commit surfaces even though two exist - the budget is enforced');

  const baseOne = tmpRoot();
  mkFixtureRepo(baseOne, 'proj', { commits: [{ date: '2026-08-01', author: 'a', subject: 'feat: x' }] });
  const oneCommit: ApprovedRoot[] = [{ label: 'work', path: baseOne, approved_children: ['proj'] }];
  const exact = computeWorkspaceScan(collectWorkspace(oneCommit, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_commits_per_repo'));
});

test('max_doc_files_per_repo: two allowlisted docs against a budget of one truncates and reads only one; one doc against the same budget does not', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_doc_files_per_repo: 1 };
  const meta: ScanMeta = { ...META, budgets };

  const baseTwo = tmpRoot();
  const repoTwo = mkFixtureRepo(baseTwo, 'proj');
  writeFileSync(join(repoTwo, 'README.md'), 'a');
  writeFileSync(join(repoTwo, 'AGENTS.md'), 'b');
  const twoDocs: ApprovedRoot[] = [{ label: 'work', path: baseTwo, approved_children: ['proj'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(twoDocs, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_doc_files_per_repo'));
  assert.equal(truncated.repos[0].docs.length, 1, 'only one doc was read even though two matched - the budget is enforced');

  const baseOne = tmpRoot();
  const repoOne = mkFixtureRepo(baseOne, 'proj');
  writeFileSync(join(repoOne, 'README.md'), 'a');
  const oneDoc: ApprovedRoot[] = [{ label: 'work', path: baseOne, approved_children: ['proj'] }];
  const exact = computeWorkspaceScan(collectWorkspace(oneDoc, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_doc_files_per_repo'));
});

test('max_doc_files: docs across two repos exceeding the workspace-wide budget truncates and stops reading further docs; matching the budget exactly does not', () => {
  const base = tmpRoot();
  const repoA = mkFixtureRepo(base, 'alpha');
  writeFileSync(join(repoA, 'README.md'), 'a');
  const repoB = mkFixtureRepo(base, 'beta');
  writeFileSync(join(repoB, 'README.md'), 'b');
  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['alpha', 'beta'] }];

  // max_doc_files_per_repo is set well above 1 so only the workspace-wide cap can bind here.
  const overBudgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_doc_files_per_repo: 5, max_doc_files: 1 };
  const truncated = computeWorkspaceScan(collectWorkspace(roots, overBudgets, fixtureGit), { ...META, budgets: overBudgets });
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_doc_files'));
  const readUnderCap = truncated.repos.reduce((n, r) => n + r.docs.length, 0);
  assert.equal(readUnderCap, 1, "only alpha's doc was actually read - the workspace-wide budget is enforced, not merely disclosed");

  const exactBudgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_doc_files_per_repo: 5, max_doc_files: 2 };
  const exact = computeWorkspaceScan(collectWorkspace(roots, exactBudgets, fixtureGit), { ...META, budgets: exactBudgets });
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_doc_files'));
  const readAtCap = exact.repos.reduce((n, r) => n + r.docs.length, 0);
  assert.equal(readAtCap, 2);
});

test('max_files: a repo with more countable files than the budget truncates and stops walking; exactly at the budget does not', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_files: 2 };
  const meta: ScanMeta = { ...META, budgets };
  // FIXTURE-git.json itself is a countable file (nothing filters it out of the walk), so
  // mkFixtureRepo alone already contributes one - each case below accounts for it explicitly.

  const baseOver = tmpRoot();
  const repoOver = mkFixtureRepo(baseOver, 'proj');
  writeFileSync(join(repoOver, 'a.txt'), '1');
  writeFileSync(join(repoOver, 'b.txt'), '2'); // FIXTURE-git.json + a.txt + b.txt = 3, over the budget of 2
  const overRoot: ApprovedRoot[] = [{ label: 'work', path: baseOver, approved_children: ['proj'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(overRoot, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_files'));
  assert.equal(truncated.repos[0].files_walked, 2, 'the walk stopped exactly at the budget');

  const baseExact = tmpRoot();
  const repoExact = mkFixtureRepo(baseExact, 'proj');
  writeFileSync(join(repoExact, 'a.txt'), '1'); // FIXTURE-git.json + a.txt = 2, exactly the budget
  const exactRoot: ApprovedRoot[] = [{ label: 'work', path: baseExact, approved_children: ['proj'] }];
  const exact = computeWorkspaceScan(collectWorkspace(exactRoot, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_files'));
  assert.equal(exact.repos[0].files_walked, 2);
});

test('max_dir_entries: a directory with more entries than the budget is only partially listed and disclosed; exactly at the budget is not', () => {
  const budgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_dir_entries: 1 };
  const meta: ScanMeta = { ...META, budgets };

  const baseOver = tmpRoot();
  const repoOver = mkFixtureRepo(baseOver, 'proj');
  writeFileSync(join(repoOver, 'a.txt'), '1'); // FIXTURE-git.json + a.txt = 2 entries, over the budget of 1
  const overRoot: ApprovedRoot[] = [{ label: 'work', path: baseOver, approved_children: ['proj'] }];
  const truncated = computeWorkspaceScan(collectWorkspace(overRoot, budgets, fixtureGit), meta);
  assert.ok(truncated.truncation.events.some((e) => e.cap === 'max_dir_entries'));

  const baseExact = tmpRoot();
  mkFixtureRepo(baseExact, 'proj'); // FIXTURE-git.json alone = 1 entry, exactly the budget
  const exactRoot: ApprovedRoot[] = [{ label: 'work', path: baseExact, approved_children: ['proj'] }];
  const exact = computeWorkspaceScan(collectWorkspace(exactRoot, budgets, fixtureGit), meta);
  assert.ok(!exact.truncation.events.some((e) => e.cap === 'max_dir_entries'));
});

// --- 11. dependency names ------------------------------------------------------------------

test('a package.json with a public scoped dep, a private scoped dep, and an unscoped dep names the public ones and collapses the private scope', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({
      dependencies: { react: '^18.0.0', '@acme-corp/secret-thing': '1.2.3' },
      devDependencies: { '@types/node': '^20.0.0' },
    }),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const json = JSON.stringify(snapshot);

  const manifest = snapshot.repos[0].manifests.find((m) => m.kind === 'npm')!;
  assert.ok(manifest.deps.includes('react'));
  assert.ok(manifest.deps.includes('@private-scope'));
  assert.ok(manifest.dev_deps.includes('@types/node'));
  assert.ok(!json.includes('acme-corp'), 'the private scope name must never appear anywhere in the snapshot');
  assert.ok(!json.includes('secret-thing'));
});

test('pyproject.toml (PEP 621 dependencies, optional-dependencies, and poetry dependencies) yields dependency names', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'pyproject.toml'),
    [
      '[project]',
      'name = "demo"',
      'dependencies = [',
      '    "requests>=2.28",',
      '    "flask",',
      ']',
      '',
      '[project.optional-dependencies]',
      'test = ["pytest", "pytest-cov"]',
      '',
      '[tool.poetry.dependencies]',
      'python = "^3.11"',
      'numpy = "^1.26"',
      '',
    ].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'pyproject')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps.sort(), ['flask', 'numpy', 'requests']);
  assert.deepEqual(manifest.dev_deps.sort(), ['pytest', 'pytest-cov']);
});

test('requirements.txt yields dependency names, skipping comments, blank lines, and option/VCS lines', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'requirements.txt'),
    ['django==4.2.11', '# a comment', '', 'requests>=2.28', '-e git+https://example.com/foo.git#egg=foo', '-r other.txt'].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'requirements')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps.sort(), ['django', 'requests']);
});

test('go.mod require blocks and single-line requires yield module paths', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'go.mod'),
    [
      'module example.com/demo',
      '',
      'go 1.21',
      '',
      'require (',
      '\tgithub.com/gin-gonic/gin v1.9.0',
      '\tgithub.com/stretchr/testify v1.8.0 // indirect',
      ')',
      '',
      'require golang.org/x/text v0.10.0',
      '',
    ].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'go')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps.sort(), ['github.com/gin-gonic/gin', 'github.com/stretchr/testify', 'golang.org/x/text']);
});

test('Cargo.toml [dependencies] and [dev-dependencies] yield crate names', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'Cargo.toml'),
    [
      '[package]',
      'name = "demo"',
      'version = "0.1.0"',
      '',
      '[dependencies]',
      'serde = "1.0"',
      'tokio = { version = "1", features = ["full"] }',
      '',
      '[dev-dependencies]',
      'criterion = "0.5"',
      '',
    ].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'cargo')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps.sort(), ['serde', 'tokio']);
  assert.deepEqual(manifest.dev_deps, ['criterion']);
});

test('a malformed package.json (invalid JSON) sets parse_failed and yields no dependency names, without throwing', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'package.json'), '{ this is not valid json');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'npm')!;

  assert.equal(manifest.parse_failed, true);
  assert.deepEqual(manifest.deps, []);
  assert.deepEqual(manifest.dev_deps, []);
});

test('a manifest with invalid UTF-8 bytes sets parse_failed for pyproject.toml, requirements.txt, go.mod, and Cargo.toml, none of them throwing', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  const garbage = Buffer.from([0xff, 0xfe, 0x00, 0xff, 0xff]);
  writeFileSync(join(repo, 'pyproject.toml'), garbage);
  writeFileSync(join(repo, 'requirements.txt'), garbage);
  writeFileSync(join(repo, 'go.mod'), garbage);
  writeFileSync(join(repo, 'Cargo.toml'), garbage);

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifests = obs.roots[0].repos[0].manifests;

  for (const kind of ['pyproject', 'requirements', 'go', 'cargo']) {
    const m = manifests.find((x) => x.kind === kind)!;
    assert.equal(m.parse_failed, true, `${kind} should be parse_failed`);
    assert.deepEqual(m.deps, []);
    assert.deepEqual(m.dev_deps, []);
  }
});

test('aggregate.dependency_frequency is ordered deterministically across two runs, and max_dependency_names caps it with a TruncationEvent and a limits line', () => {
  const base = tmpRoot();
  const repoA = mkFixtureRepo(base, 'alpha');
  writeFileSync(join(repoA, 'package.json'), JSON.stringify({ dependencies: { react: '1.0.0', zod: '1.0.0' } }));
  const repoB = mkFixtureRepo(base, 'beta');
  writeFileSync(join(repoB, 'package.json'), JSON.stringify({ dependencies: { react: '1.0.0' } }));

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['alpha', 'beta'] }];
  const a = computeWorkspaceScan(collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit), META);
  const b = computeWorkspaceScan(collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit), META);

  assert.deepEqual(a.aggregate.dependency_frequency, b.aggregate.dependency_frequency);
  assert.deepEqual(Object.keys(a.aggregate.dependency_frequency), ['react', 'zod']); // react (2 repos) outranks zod (1)

  const cappedBudgets: ScanBudgets = { ...DEFAULT_BUDGETS, max_dependency_names: 1 };
  const cappedMeta: ScanMeta = { ...META, budgets: cappedBudgets };
  const capped = computeWorkspaceScan(collectWorkspace(roots, cappedBudgets, fixtureGit), cappedMeta);

  assert.equal(Object.keys(capped.aggregate.dependency_frequency).length, 1);
  assert.ok(capped.truncation.events.some((e) => e.cap === 'max_dependency_names'));
  assert.ok(capped.limits.some((l) => l.startsWith('max_dependency_names')));
});

test('a go.mod requiring github.com/spf13/cobra and an internal module path names the public one and collapses the internal one', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'go.mod'),
    ['module example.com/demo', '', 'go 1.21', '', 'require (', '\tgithub.com/spf13/cobra v1.8.0', '\tgit.acme-corp.internal/team/billing v0.1.0', ')', ''].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const json = JSON.stringify(snapshot);

  const manifest = snapshot.repos[0].manifests.find((m) => m.kind === 'go')!;
  assert.ok(manifest.deps.includes('github.com/spf13/cobra'));
  assert.ok(manifest.deps.includes('private-module'));
  assert.ok(!json.includes('acme-corp'), 'the internal host and org must never appear anywhere in the snapshot');
});

test('golang.org/x/sync and go.uber.org/zap survive verbatim: allowlisted hosts other than github.com', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'go.mod'), ['module example.com/demo', '', 'require (', '\tgolang.org/x/sync v0.5.0', '\tgo.uber.org/zap v1.26.0', ')', ''].join('\n'));

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'go')!;

  assert.deepEqual(manifest.deps.sort(), ['go.uber.org/zap', 'golang.org/x/sync']);
});

test('a collapsed module path produces the matching limits line; a scan with no collapse produces none', () => {
  const base = tmpRoot();
  const repoA = mkFixtureRepo(base, 'alpha');
  writeFileSync(join(repoA, 'go.mod'), ['module example.com/demo', '', 'require (', '\tgit.acme-corp.internal/team/billing v0.1.0', ')', ''].join('\n'));
  const repoB = mkFixtureRepo(base, 'beta');
  writeFileSync(join(repoB, 'go.mod'), ['module example.com/demo', '', 'require (', '\tgithub.com/spf13/cobra v1.8.0', ')', ''].join('\n'));

  const rootsWithCollapse: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['alpha', 'beta'] }];
  const collapsed = computeWorkspaceScan(collectWorkspace(rootsWithCollapse, DEFAULT_BUDGETS, fixtureGit), META);
  assert.ok(collapsed.limits.some((l) => l.includes('private-module')));

  const baseNoCollapse = tmpRoot();
  const repoC = mkFixtureRepo(baseNoCollapse, 'gamma');
  writeFileSync(join(repoC, 'go.mod'), ['module example.com/demo', '', 'require (', '\tgithub.com/spf13/cobra v1.8.0', ')', ''].join('\n'));
  const rootsNoCollapse: ApprovedRoot[] = [{ label: 'work', path: baseNoCollapse, approved_children: ['gamma'] }];
  const clean = computeWorkspaceScan(collectWorkspace(rootsNoCollapse, DEFAULT_BUDGETS, fixtureGit), META);
  assert.ok(!clean.limits.some((l) => l.includes('private-module')));
});

test('a scoped npm dependency name (starts with @, contains a slash) is classified by the npm branch, never the module-path branch', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ dependencies: { '@acme-corp.io/billing': '1.0.0' } }));

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'npm')!;

  // '@acme-corp.io/billing' has a dot in its first segment too (@acme-corp.io), so it would also
  // match the module-path shape if the npm branch didn't take priority - it must still collapse to
  // the npm placeholder, not the module placeholder, proving the two classifiers don't fight.
  assert.deepEqual(manifest.deps, ['@private-scope']);
});

// --- 12. the documented CLI command actually persists the snapshot ---------------------------
// Regression for an adversarial-review finding: SKILL.md step 3 documents
// `node tools/scan.ts <tenant-dir> --read`, but the CLI used to only call writeScanSnapshot
// when --write was also passed, and --write appeared in no documentation anywhere. Runs the
// real command-line interface (never the library functions directly) against a roots.yml
// written in exactly the shape SKILL.md step 2 documents (label, path, approved_children), so
// this binds the documented protocol to the actual behavior rather than to an internal call.

test('the documented `node tools/scan.ts <tenant-dir> --read` command writes a parseable snapshot to workspace/YYYY-MM-DD-scan.json', () => {
  const tenantDir = tmpRoot();
  const base = tmpRoot();
  mkdirSync(join(base, 'proj'), { recursive: true });
  writeFileSync(join(base, 'proj', 'index.js'), 'console.log(1);');

  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  // Exactly the shape SKILL.md step 2 documents: label, path, approved_children.
  writeFileSync(
    join(tenantDir, 'workspace', 'roots.yml'),
    `roots:\n  - label: primary-projects\n    path: ${base}\n    approved_children: [proj]\n`,
  );

  const workspaceDir = join(tenantDir, 'workspace');
  assert.ok(existsSync(workspaceDir), 'workspace dir should exist before the run');

  execFileSync('node', [SCAN_CLI, tenantDir, '--read'], { encoding: 'utf8' });

  const snapshotFiles = readdirSync(workspaceDir).filter((f) => /^\d{4}-\d{2}-\d{2}-scan\.json$/.test(f));
  assert.equal(snapshotFiles.length, 1, 'exactly one dated snapshot file should have been written');

  const snapshotPath = join(workspaceDir, snapshotFiles[0]);
  assert.ok(existsSync(snapshotPath), 'the snapshot file must exist on disk');
  const written = JSON.parse(readFileSync(snapshotPath, 'utf8'));
  assert.equal(written.type, 'workspace-scan');
});

test('--no-write runs a read without persisting a snapshot file', () => {
  const tenantDir = tmpRoot();
  const base = tmpRoot();
  mkdirSync(join(base, 'proj'), { recursive: true });
  writeFileSync(join(base, 'proj', 'index.js'), 'console.log(1);');

  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  writeFileSync(
    join(tenantDir, 'workspace', 'roots.yml'),
    `roots:\n  - label: primary-projects\n    path: ${base}\n    approved_children: [proj]\n`,
  );

  execFileSync('node', [SCAN_CLI, tenantDir, '--read', '--no-write'], { encoding: 'utf8' });

  const snapshotFiles = readdirSync(join(tenantDir, 'workspace')).filter((f) => /^\d{4}-\d{2}-\d{2}-scan\.json$/.test(f));
  assert.equal(snapshotFiles.length, 0, '--no-write must not persist a snapshot file');
});

test('no version string appears anywhere in the snapshot for a manifest whose deps carry versions', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ dependencies: { react: '18.2.7-canary.super-specific-string' } }));
  writeFileSync(join(repo, 'requirements.txt'), 'django==4.2.11\n');

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const snapshot = computeWorkspaceScan(obs, META);
  const json = JSON.stringify(snapshot);

  assert.ok(!json.includes('18.2.7'));
  assert.ok(!json.includes('canary'));
  assert.ok(!json.includes('4.2.11'));
});

// --- 13. parsers that LIE, not just miss (final correctness round) ---------------------------
// The spec distinguishes a parser that MISSES (disclosed, acceptable) from one that reports
// something WRONG (a defect). Each test below uses the exact input an adversarial review found
// lying, and asserts the correct names with no spurious ones.

test('DEFECT: a commented-out dependency inside a pyproject.toml array is no longer reported as a real one', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'pyproject.toml'),
    ['[project]', 'name = "demo"', 'dependencies = [', '  # "legacy-dep>=1", removed 2024', '  "requests",', ']', ''].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'pyproject')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps, ['requests']);
  assert.ok(!manifest.deps.includes('legacy-dep'), 'a commented-out dependency must never be reported as real');
});

test('DEFECT: a Poetry multi-line inline table no longer leaks its inner TOML keys as dependency names', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'pyproject.toml'),
    ['[tool.poetry.dependencies]', 'python = "^3.11"', 'requests = {', '  version = "^2.28",', '  optional = true', '}', ''].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'pyproject')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps, ['requests'], '"version" and "optional" are TOML keys inside the inline table, never dependency names');
});

test('DEFECT: a TOML section header carrying a trailing comment is recognised, not silently dropped', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'Cargo.toml'), ['[package]', 'name = "demo"', '', '[dependencies] # runtime deps', 'serde = "1.0"', ''].join('\n'));

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'cargo')!;

  assert.equal(manifest.parse_failed, false, 'a header with a trailing comment must still be found, not silently yield deps: [] with parse_failed: false');
  assert.deepEqual(manifest.deps, ['serde']);
});

test('DEFECT: a go.mod require-block comment containing a closing paren no longer truncates the block early', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(
    join(repo, 'go.mod'),
    ['module example.com/demo', '', 'require (', '\tgithub.com/a/b v1.0.0 // indirect (vendored)', '\tgithub.com/c/d v2.0.0', ')', ''].join('\n'),
  );

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'go')!;

  assert.equal(manifest.parse_failed, false);
  assert.deepEqual(manifest.deps.sort(), ['github.com/a/b', 'github.com/c/d'], 'the require after the commented-out ")" must not be lost');
});

test('DEFECT 5: a package.json whose "dependencies" is a string, not an object, sets parse_failed rather than iterating the string as character indices', () => {
  const base = tmpRoot();
  const repo = mkFixtureRepo(base, 'proj');
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ dependencies: 'react' }));

  const roots: ApprovedRoot[] = [{ label: 'work', path: base, approved_children: ['proj'] }];
  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  const manifest = obs.roots[0].repos[0].manifests.find((m) => m.kind === 'npm')!;

  assert.equal(manifest.parse_failed, true);
  assert.deepEqual(manifest.deps, [], 'must not yield ["0","1","2","3","4"] from iterating the string\'s indices');
  assert.deepEqual(manifest.dev_deps, []);
});

// --- 14. the consent record accepts a wrong-shaped file silently ------------------------------
// PART B: loadApprovedRoots used to return {roots: [], errors: []} for these two shapes - a
// valid-looking empty result indistinguishable from "no roots approved yet" - which tools/scan.ts
// then treats as success and writes a valid, empty snapshot. Quietly dropping part of a consent
// record is the worst available behaviour this module's own header comment names.

test('PART B: workspace/roots.yml with "roots" set to a non-list value errors, naming the expected shape, instead of silently loading zero roots', () => {
  const tenantDir = tmpRoot();
  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  writeFileSync(join(tenantDir, 'workspace', 'roots.yml'), 'roots: not-a-list\n');

  const { roots, errors } = loadApprovedRoots(tenantDir);

  assert.deepEqual(roots, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /roots/i);
  assert.match(errors[0], /list/i, 'the error must name the expected shape');
});

test('PART B: a bare top-level list in workspace/roots.yml (missing the "roots:" wrapper) errors, naming the expected shape, instead of silently loading zero roots', () => {
  const tenantDir = tmpRoot();
  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  writeFileSync(join(tenantDir, 'workspace', 'roots.yml'), '- label: a\n  path: /tmp/some-root\n  approved_children: []\n');

  const { roots, errors } = loadApprovedRoots(tenantDir);

  assert.deepEqual(roots, []);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /roots/i);
  assert.match(errors[0], /list/i, 'the error must name the expected shape');
});

// --- 14b. root status: a missing root and a file-shaped root are distinct from an empty one ----
// Finding: repos_found: 0, pending_approval: [], exit 0 used to be produced identically by a
// genuinely empty root, a root whose approved path was renamed or deleted, and a root whose
// approved path is a regular file - a user whose approved path was renamed got a clean, empty,
// confident report. status distinguishes all three.

test('a root whose approved path does not exist on disk gets status "missing", not an empty scan indistinguishable from a real one', () => {
  const base = tmpRoot();
  const missingPath = join(base, 'does-not-exist');
  const roots: ApprovedRoot[] = [{ label: 'ghost', path: missingPath, approved_children: [] }];

  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  assert.equal(obs.roots[0].status, 'missing');
  assert.deepEqual(obs.roots[0].repos, []);

  const snapshot = computeWorkspaceScan(obs, META);
  assert.equal(snapshot.roots[0].status, 'missing');
  assert.equal(snapshot.roots[0].repos_found, 0);
  assert.ok(snapshot.limits.some((l) => l.includes("root 'ghost'") && l.includes('no longer exists')));
});

test('a root whose approved path is a regular file, not a directory, gets status "not-a-directory"', () => {
  const base = tmpRoot();
  const filePath = join(base, 'not-a-dir.txt');
  writeFileSync(filePath, 'this is a file, not a workspace directory');
  const roots: ApprovedRoot[] = [{ label: 'oops', path: filePath, approved_children: [] }];

  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  assert.equal(obs.roots[0].status, 'not-a-directory');
  assert.deepEqual(obs.roots[0].repos, []);

  const snapshot = computeWorkspaceScan(obs, META);
  assert.equal(snapshot.roots[0].status, 'not-a-directory');
  assert.equal(snapshot.roots[0].repos_found, 0);
  assert.ok(snapshot.limits.some((l) => l.includes("root 'oops'") && l.includes('is not a directory')));
});

test('a genuinely empty but real root directory still gets status "ok", not conflated with a missing or file-shaped root', () => {
  const base = tmpRoot();
  const emptyDir = join(base, 'truly-empty');
  mkdirSync(emptyDir, { recursive: true });
  const roots: ApprovedRoot[] = [{ label: 'empty', path: emptyDir, approved_children: [] }];

  const obs = collectWorkspace(roots, DEFAULT_BUDGETS, fixtureGit);
  assert.equal(obs.roots[0].status, 'ok');

  const snapshot = computeWorkspaceScan(obs, META);
  assert.equal(snapshot.roots[0].status, 'ok');
  assert.equal(snapshot.roots[0].repos_found, 0);
  assert.ok(!snapshot.limits.some((l) => l.includes("root 'empty'")));
});

// --- 14c. stale doc-body bundle self-heals on the next --read -----------------------------------
// Finding: the ephemeral doc-body bundle tools/scan.ts writes is only ever deleted by the
// find-subjects skill's own cleanup step - an abort between the scan and that step left it on
// disk indefinitely. The CLI now removes any stale bundle from a previous run before writing a
// new one.

test('a stale doc bundle directory from a previous run is removed by the next `node tools/scan.ts --read`, and one line reports it', () => {
  const tenantDir = tmpRoot();
  const base = tmpRoot();
  mkdirSync(join(base, 'proj'), { recursive: true });
  writeFileSync(join(base, 'proj', 'README.md'), 'a doc body worth bundling');

  mkdirSync(join(tenantDir, 'workspace'), { recursive: true });
  writeFileSync(join(tenantDir, 'workspace', 'roots.yml'), `roots:\n  - label: primary-projects\n    path: ${base}\n    approved_children: [proj]\n`);

  // Simulate an abandoned bundle from an earlier, aborted run - written with the exact prefix
  // writeDocBundle uses, so cleanupStaleDocBundles recognizes it.
  const staleBundleDir = mkdtempSync(join(tmpdir(), 'meno-scan-bundle-'));
  writeFileSync(join(staleBundleDir, 'docs.json'), '[]');
  assert.ok(existsSync(staleBundleDir));

  const result = spawnSync('node', [SCAN_CLI, tenantDir, '--read'], { encoding: 'utf8' });

  assert.equal(result.status, 0);
  assert.ok(!existsSync(staleBundleDir), 'the stale bundle from the previous run must be gone');
  assert.match(result.stderr, /cleaned up 1 stale doc bundle\(s\) left by a previous run/);
});

test('cleanupStaleDocBundles never throws and leaves an unrelated tmpdir entry alone', () => {
  const unrelated = mkdtempSync(join(tmpdir(), 'not-a-meno-bundle-'));
  writeFileSync(join(unrelated, 'keep-me.txt'), 'unrelated tmp content');
  assert.doesNotThrow(() => cleanupStaleDocBundles());
  assert.ok(existsSync(unrelated), 'a directory outside the doc-bundle prefix must never be touched');
});

// --- 15. git can differ across machines ---------------------------------------------------------
// PART C: GIT_CONFIG_NOSYSTEM suppresses only /etc/gitconfig, never the user's own ~/.gitconfig.
// A concrete, verified case: `i18n.logOutputEncoding` re-encodes a non-ASCII author name from
// the repository's UTF-8 commit encoding into whatever encoding the config names, so a user
// carrying that setting globally gets different raw bytes out of the exact same commit than a
// user without it - contradicting Determinism item 5's promise of byte-identical output.
// (`log.mailmap` was checked too and does not apply here: git's %an placeholder is documented to
// never honor a mailmap - only the uppercase %aN does, and this invocation uses %an - so a global
// mailmap.file setting was confirmed by experiment to have no effect on this exact command and is
// not the case demonstrated below.) Sets up a real git repository (not the FIXTURE-git.json
// sidecar, since this exercises gitCli itself) with a non-ASCII commit author, and a fake $HOME
// carrying a global .gitconfig that would corrupt it if the global config were consulted at all.

test('PART C: gitCli ignores a global i18n.logOutputEncoding setting in the caller\'s HOME/.gitconfig, thanks to GIT_CONFIG_GLOBAL=/dev/null', () => {
  const fakeHome = tmpRoot();
  writeFileSync(join(fakeHome, '.gitconfig'), ['[i18n]', '\tlogOutputEncoding = ISO-8859-1', ''].join('\n'));

  const repoDir = tmpRoot();
  const setupEnv = { ...process.env, HOME: fakeHome, GIT_CONFIG_NOSYSTEM: '1' };
  execFileSync('git', ['init', '-q'], { cwd: repoDir, env: setupEnv });
  execFileSync('git', ['config', 'user.name', 'Real Name'], { cwd: repoDir, env: setupEnv });
  execFileSync('git', ['config', 'user.email', 'real@example.com'], { cwd: repoDir, env: setupEnv });
  execFileSync('git', ['commit', '--allow-empty', '-q', '-m', 'test', '--author=Réal Ñame <real@example.com>'], { cwd: repoDir, env: setupEnv });

  const originalHome = process.env.HOME;
  process.env.HOME = fakeHome;
  try {
    const entries = gitCli.log(repoDir, 10);
    assert.ok(entries, 'gitCli.log must not fail against a real repository');
    assert.equal(entries!.length, 1);
    assert.equal(entries![0].author, 'Réal Ñame', 'the global i18n.logOutputEncoding setting must not re-encode (and thereby corrupt) the author name');
  } finally {
    process.env.HOME = originalHome;
  }
});
