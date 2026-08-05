import { fileURLToPath } from 'node:url';
// The Phase 7 end-to-end drill, automated against a file:// bare remote: fresh
// clone, init, leakage-hook block, mirror push, wipe, restore, byte-identical
// tree. What this deliberately cannot exercise (real GitHub visibility) is
// stated in docs/specs/durability.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

function sh(cwd: string, cmd: string, args: string[]): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' } });
}

// a minimal fresh meno clone built from the WORKING TREE (git clone would only
// see committed history, which breaks the gate on uncommitted tool changes)
function makeFreshMeno(work: string): string {
  const clone = join(work, 'meno');
  mkdirSync(join(clone, 'tools'), { recursive: true });
  sh(work, 'git', ['init', '-q', 'meno']);
  for (const f of ['meno-init', 'meno-mirror']) {
    writeFileSync(join(clone, 'tools', f), readFileSync(join(repoRoot, 'tools', f), 'utf8'), { mode: 0o755 });
  }
  writeFileSync(join(clone, '.gitignore'), readFileSync(join(repoRoot, '.gitignore'), 'utf8'));
  sh(clone, 'git', ['add', '-A']);
  sh(clone, 'git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'seed']);
  return clone;
}

function contentTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string): void => {
    for (const entry of readdirSync(d)) {
      if (entry === '.git') continue;
      const p = join(d, entry);
      if (statSync(p).isDirectory()) walk(p);
      else out.set(relative(dir, p), readFileSync(p, 'utf8'));
    }
  };
  walk(dir);
  return out;
}

test('the full durability drill: init, hook block, push, wipe, restore byte-identical', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-mirror-drill-'));

  const clone = makeFreshMeno(work);

  // meno-init: hook installed, tenant created
  const initOut = sh(clone, 'sh', ['tools/meno-init', 'drill-tenant']);
  assert.match(initOut, /leakage guard: installed/);
  assert.ok(existsSync(join(clone, 'content', 'drill-tenant')));
  // idempotent
  assert.match(sh(clone, 'sh', ['tools/meno-init', 'drill-tenant']), /already installed/);

  // generate some tenant content
  const tenant = join(clone, 'content', 'drill-tenant');
  mkdirSync(join(tenant, 'rust-notes'), { recursive: true });
  writeFileSync(join(tenant, 'home.md'), '# Home\n\nNow learning: [[rust-notes]]\n');
  writeFileSync(join(tenant, 'todos.md'), '# Todos\n\n- [ ] first review #note\n');
  writeFileSync(join(tenant, 'rust-notes', 'ownership.md'), 'moves, not copies ✅\n');

  // the leakage hook blocks a force-added tenant file
  sh(clone, 'git', ['add', '-f', 'content/drill-tenant/home.md']);
  assert.throws(
    () => sh(clone, 'git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'leak']),
    /refusing to commit tenant content/,
  );
  sh(clone, 'git', ['restore', '--staged', 'content/drill-tenant/home.md']);

  // a private mirror stand-in: a local bare repo (file:// - no visibility concept)
  const bare = join(work, 'mirror.git');
  sh(work, 'git', ['init', '-q', '--bare', 'mirror.git']);

  // mirror init + verify + push
  const initMirror = sh(clone, 'sh', ['tools/meno-mirror', 'init', 'drill-tenant', bare]);
  assert.match(initMirror, /local-path remote .* allowed/);
  const pushOut = sh(clone, 'sh', ['tools/meno-mirror', 'push', 'drill-tenant']);
  assert.match(pushOut, /pushed content\/drill-tenant/);

  // the outer repo stays ignorant: no tenant paths tracked, no mirror URL anywhere
  const status = sh(clone, 'git', ['status', '--porcelain']);
  assert.ok(!status.includes('content/'), `outer repo saw tenant content:\n${status}`);
  const outerConfig = readFileSync(join(clone, '.git', 'config'), 'utf8');
  assert.ok(!outerConfig.includes('mirror.git'), 'outer repo config learned the mirror URL');

  // change something, push again (idempotent sync)
  writeFileSync(join(tenant, 'rust-notes', 'borrowing.md'), 'one mutable xor many immutable\n');
  sh(clone, 'sh', ['tools/meno-mirror', 'push', 'drill-tenant']);
  const statusOut = sh(clone, 'sh', ['tools/meno-mirror', 'status', 'drill-tenant']);
  assert.match(statusOut, /unsnapshotted changes: 0/);

  const beforeWipe = contentTree(tenant);

  // the disaster: wipe the tenant
  rmSync(tenant, { recursive: true, force: true });
  assert.ok(!existsSync(tenant));

  // restore refuses a non-empty destination
  mkdirSync(tenant, { recursive: true });
  writeFileSync(join(tenant, 'stray.md'), 'x');
  assert.throws(() => sh(clone, 'sh', ['tools/meno-mirror', 'restore', bare, 'drill-tenant']), /refusing to overwrite/);
  rmSync(tenant, { recursive: true, force: true });

  // restore on the "fresh machine"
  const restoreOut = sh(clone, 'sh', ['tools/meno-mirror', 'restore', bare, 'drill-tenant']);
  assert.match(restoreOut, /restored content\/drill-tenant/);

  // byte-identical content tree
  const afterRestore = contentTree(tenant);
  assert.deepEqual([...afterRestore.keys()].sort(), [...beforeWipe.keys()].sort());
  for (const [path, data] of beforeWipe) {
    assert.equal(afterRestore.get(path), data, `content differs after restore: ${path}`);
  }

  rmSync(work, { recursive: true, force: true });
});

test('verify refuses an unverifiable remote', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-verify-'));
  const clone = makeFreshMeno(work);
  sh(clone, 'sh', ['tools/meno-init', 't']);
  const tenant = join(clone, 'content', 't');
  writeFileSync(join(tenant, 'home.md'), 'x\n');
  sh(clone, 'sh', ['tools/meno-mirror', 'init', 't', join(work, 'ok.git')]);
  sh(work, 'git', ['init', '-q', '--bare', 'ok.git']);
  // repoint at an unverifiable remote by hand
  sh(join(tenant), 'git', ['-c', 'core.hooksPath=', 'remote', 'set-url', 'origin', 'https://gitlab.example.com/x/y.git']);
  assert.throws(() => sh(clone, 'sh', ['tools/meno-mirror', 'verify', 't']), /cannot assert privacy, refusing/);
  rmSync(work, { recursive: true, force: true });
});

test('verify refuses when pushurl diverges from the fetch url', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-pushurl-'));
  const clone = makeFreshMeno(work);
  sh(clone, 'sh', ['tools/meno-init', 't']);
  writeFileSync(join(clone, 'content', 't', 'home.md'), 'x\n');
  const bare = join(work, 'ok.git');
  sh(work, 'git', ['init', '-q', '--bare', 'ok.git']);
  sh(clone, 'sh', ['tools/meno-mirror', 'init', 't', bare]);
  // a divergent pushurl is exactly the exfiltration foot-gun verify must catch
  sh(join(clone, 'content', 't'), 'git', ['-c', 'core.hooksPath=', 'config', 'remote.origin.pushUrl', 'https://github.com/evil/leak.git']);
  assert.throws(() => sh(clone, 'sh', ['tools/meno-mirror', 'verify', 't']), /push url .* differs from fetch url/);
  rmSync(work, { recursive: true, force: true });
});

test('the leakage guard survives a hostile global core.hooksPath', () => {
  const work = mkdtempSync(join(tmpdir(), 'meno-hookpath-'));
  const clone = makeFreshMeno(work);
  // a global hooksPath that does NOT chain to repo hooks - the environment that
  // silently disabled the guard before the fix
  const globalHooks = join(work, 'personal-hooks');
  mkdirSync(globalHooks, { recursive: true });
  const globalConfig = join(work, 'gitconfig');
  writeFileSync(globalConfig, `[core]\n\thooksPath = ${globalHooks}\n`);
  const env = { ...process.env, GIT_CONFIG_GLOBAL: globalConfig, GIT_CONFIG_SYSTEM: '/dev/null' };
  const shEnv = (cwd: string, cmd: string, args: string[]): string =>
    execFileSync(cmd, args, { cwd, encoding: 'utf8', env });

  const initOut = shEnv(clone, 'sh', ['tools/meno-init', 't']);
  assert.match(initOut, /WARNING: git is configured with core\.hooksPath/);
  // apply the printed remediation
  shEnv(clone, 'git', ['config', '--local', 'core.hooksPath', '.githooks']);
  writeFileSync(join(clone, 'content', 't', 'home.md'), 'secret vault content\n');
  shEnv(clone, 'git', ['add', '-f', 'content/t/home.md']);
  assert.throws(
    () => shEnv(clone, 'git', ['-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-m', 'leak']),
    /refusing to commit tenant content/,
  );
  rmSync(work, { recursive: true, force: true });
});

test('no source file resolves repo paths via URL.pathname (breaks on spaces)', () => {
  const roots = ['lib', 'tools', 'app'].map((d) => join(repoRoot, d));
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === 'dist') continue;
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(entry) && readFileSync(p, 'utf8').includes('import.meta.url)' + '.pathname')) offenders.push(p);
    }
  };
  for (const r of roots) walk(r);
  assert.deepEqual(offenders, []);
});
