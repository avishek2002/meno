// tools/org-sync.sh acceptance: the refusal is the tool's entire value, so it
// gets its own drill against a tiny upstream+downstream repo pair in tmp -
// same GIT_CONFIG_GLOBAL=/dev/null isolation as tools/test/mirror.test.ts's
// makeFreshMeno pattern, adapted for a fetch-only (never push) relationship.
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function sh(cwd: string, cmd: string, args: string[], extraEnv: Record<string, string> = {}): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', ...extraEnv },
  });
}

function commit(dir: string, msg: string): void {
  sh(dir, 'git', ['add', '-A']);
  sh(dir, 'git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', msg]);
}

// A plain (non-bare) upstream repo - org-sync.sh only ever fetches from it,
// never pushes, so a checked-out working tree is fine (unlike meno-mirror's
// bare drill remote, which exists for push testing).
function makePair(work: string): { upstream: string; downstream: string } {
  const upstream = join(work, 'upstream');
  mkdirSync(upstream, { recursive: true });
  sh(upstream, 'git', ['init', '-q', '-b', 'main']);
  writeFileSync(join(upstream, 'README.md'), '# upstream\n');
  commit(upstream, 'seed');

  sh(work, 'git', ['clone', '-q', upstream, 'downstream']);
  const downstream = join(work, 'downstream');
  sh(downstream, 'git', ['remote', 'rename', 'origin', 'upstream']);
  mkdirSync(join(downstream, 'tools'), { recursive: true });
  writeFileSync(join(downstream, 'tools', 'org-sync.sh'), readFileSync(join(repoRoot, 'tools', 'org-sync.sh'), 'utf8'), { mode: 0o755 });
  return { upstream, downstream };
}

test('org-sync.sh refuses a merge that would touch content/org/', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-refuse-'));
  const { upstream, downstream } = makePair(work);

  mkdirSync(join(upstream, 'content', 'org'), { recursive: true });
  writeFileSync(join(upstream, 'content', 'org', 'x.md'), 'private org content\n');
  commit(upstream, 'add content/org/x.md upstream (should never happen)');

  const beforeHead = sh(downstream, 'git', ['rev-parse', 'HEAD']).trim();
  assert.throws(
    () => sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' }),
    /refusing to merge.*content\/org\/x\.md/s,
  );
  const afterHead = sh(downstream, 'git', ['rev-parse', 'HEAD']).trim();
  assert.equal(afterHead, beforeHead, 'HEAD moved despite the refusal - a blind merge landed');

  rmSync(work, { recursive: true, force: true });
});

test('org-sync.sh refuses a merge that would touch content/tenants/', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-refuse-tenants-'));
  const { upstream, downstream } = makePair(work);

  mkdirSync(join(upstream, 'content', 'tenants'), { recursive: true });
  writeFileSync(join(upstream, 'content', 'tenants', 'y.md'), 'a tenant file (should never happen)\n');
  commit(upstream, 'add content/tenants/y.md upstream (should never happen)');

  assert.throws(
    () => sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' }),
    /refusing to merge.*content\/tenants\/y\.md/s,
  );

  rmSync(work, { recursive: true, force: true });
});

test('org-sync.sh refuses a reserved-path change with a non-ASCII filename', () => {
  // core.quotePath C-quotes such paths in porcelain output, which would evade a
  // plain grep - the script reads null-delimited raw bytes so this still refuses
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-refuse-unicode-'));
  const { upstream, downstream } = makePair(work);

  mkdirSync(join(upstream, 'content', 'tenants'), { recursive: true });
  writeFileSync(join(upstream, 'content', 'tenants', 'josé.md'), 'a tenant file (should never happen)\n');
  commit(upstream, 'add content/tenants/josé.md upstream (should never happen)');

  assert.throws(
    () => sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' }),
    /refusing to merge/,
  );

  rmSync(work, { recursive: true, force: true });
});

test('org-sync.sh merges an upstream change to content/community/ (community packs land upstream by design)', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-merge-community-'));
  const { upstream, downstream } = makePair(work);

  mkdirSync(join(upstream, 'content', 'community'), { recursive: true });
  writeFileSync(join(upstream, 'content', 'community', 'INDEX.md'), '# packs\n');
  commit(upstream, 'add a community pack upstream (legitimate)');
  const upstreamHead = sh(upstream, 'git', ['rev-parse', 'HEAD']).trim();

  const out = sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' });
  assert.match(out, /merging upstream\/main/);

  const downstreamHead = sh(downstream, 'git', ['rev-parse', 'HEAD']).trim();
  assert.equal(downstreamHead, upstreamHead, 'downstream did not advance to the merged commit');

  rmSync(work, { recursive: true, force: true });
});

test('org-sync.sh merges an upstream change that touches neither content/tenants/ nor content/org/', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-merge-'));
  const { upstream, downstream } = makePair(work);

  writeFileSync(join(upstream, 'README.md'), '# upstream\n\na real improvement\n');
  commit(upstream, 'improve README');
  const upstreamHead = sh(upstream, 'git', ['rev-parse', 'HEAD']).trim();

  const out = sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' });
  assert.match(out, /merging upstream\/main/);
  assert.match(out, /MENO_SYNC_SKIP_GATE=1 set, skipping npm run gate/);

  const downstreamHead = sh(downstream, 'git', ['rev-parse', 'HEAD']).trim();
  assert.equal(downstreamHead, upstreamHead, 'downstream did not advance to the merged commit');

  rmSync(work, { recursive: true, force: true });
});

test('org-sync.sh reports cleanly when already up to date', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-org-sync-uptodate-'));
  const { downstream } = makePair(work);

  const out = sh(downstream, 'sh', ['tools/org-sync.sh'], { MENO_SYNC_SKIP_GATE: '1' });
  assert.match(out, /already up to date/);

  rmSync(work, { recursive: true, force: true });
});
