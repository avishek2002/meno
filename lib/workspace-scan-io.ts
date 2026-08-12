// All filesystem and process reads for the workspace-scan subsystem, kept out of the pure
// computeWorkspaceScan (docs/specs/subject-finder.md). Mirrors lib/cost-io.ts and
// lib/insights-io.ts's split: this file makes no decisions about what a count MEANS, it only
// makes decisions about what is safe to open at all - the secret denylist, the doc-body
// allowlist, and the symlink/prune rules are checked here, before any read, exactly once.
//
// GitProbe is injectable so a committed test fixture never needs a nested .git directory (which
// git itself would treat as a submodule boundary, breaking checkout of this repo). fixtureGit
// reads a small FIXTURE-git.json sidecar instead of shelling out to git at all.
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync, mkdtempSync, type Dirent } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { writeFileAtomic } from '../app/server/atomic.ts';
import {
  PRUNE_DIRS,
  isSecretDir,
  isSecretFile,
  isAllowlistedDoc,
  classifyCommit,
  classifyDependencyName,
  classifyRemoteHost,
  redactSecrets,
  computeWorkspaceScan,
  type DocBundleEntry,
  type RepoDocObserved,
  type RepoManifest,
  type RepoMarkers,
  type RepoObservation,
  type RootObservation,
  type ScanBudgets,
  type WorkspaceObservation,
  type WorkspaceScanSnapshot,
} from './workspace-scan.ts';

// --- Identifiers ---------------------------------------------------------------------------
// spec, "Identifiers": root_id = sha256(label).slice(0,12) - derived from the user-authored
// label in workspace/roots.yml, never from the filesystem path, so a snapshot is portable
// across machines and checkout locations rather than pinned to one. repo_id =
// sha256(root_id + relative_path).slice(0,12) - never the intermediate path segments, and
// never an absolute component, since relative_path is always root-relative.
// loadApprovedRoots (below) enforces label uniqueness for exactly this reason: two roots
// sharing a label would otherwise collide on one root_id.

function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function computeRootId(label: string): string {
  return sha256(label).slice(0, 12);
}

export function computeRepoId(rootId: string, relPath: string): string {
  return sha256(rootId + relPath).slice(0, 12);
}

// --- roots.yml -------------------------------------------------------------------------------

export interface ApprovedRoot {
  label: string;
  /** Absolute, local-machine path. Lives only in roots.yml (gitignored tenant content) and in
   *  memory here - never copied into a WorkspaceObservation or the snapshot. */
  path: string;
  /** Directory names present under `path` at the moment the user approved it, sorted. The drift
   *  check compares this against a fresh listing on every --read. */
  approved_children: string[];
}

export interface LoadRootsResult {
  roots: ApprovedRoot[];
  errors: string[];
}

/** Reads content/tenants/<tenant>/workspace/roots.yml. Never throws: a missing file or
 *  malformed entry becomes an error string, not an exception - the CLI decides what a
 *  zero-roots or partial-errors result means for its exit code. A label is the unique key for
 *  a root in this file, and root_id (computeRootId, above) now derives from the label alone,
 *  so a duplicate label is rejected as an error here rather than silently colliding two roots'
 *  ids - the second (and any later) entry carrying a repeated label is dropped, not loaded. */
export function loadApprovedRoots(tenantDir: string): LoadRootsResult {
  const file = join(tenantDir, 'workspace', 'roots.yml');
  if (!existsSync(file)) {
    return { roots: [], errors: ['no workspace/roots.yml found: approve at least one root before --read'] };
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(file, 'utf8'));
  } catch (err) {
    return { roots: [], errors: [`workspace/roots.yml is not valid YAML: ${(err as Error).message}`] };
  }
  // Two shapes used to slip through here as a silent, valid-looking zero-roots result rather than
  // an error - quietly dropping part of a consent record is the worst available behaviour this
  // module's own header comment names, and an empty roots.yml is otherwise indistinguishable from
  // a genuinely wrong-shaped one. A bare top-level list (no "roots:" wrapper) is caught first,
  // since Array.isArray(raw) is true for it and the object-shaped check below would otherwise
  // just find `roots` absent and fall through silently. A "roots" key present but not itself a
  // list (`roots: not-a-list`) is caught second. A list of plain values (`roots: ["a", "b"]`)
  // already errors correctly per-entry below, so it needs no special case here.
  if (Array.isArray(raw)) {
    return {
      roots: [],
      errors: ['workspace/roots.yml must be a mapping with a top-level "roots:" key holding a list of entries, not a bare list at the top level'],
    };
  }
  const rootsValue = raw && typeof raw === 'object' ? (raw as { roots?: unknown }).roots : undefined;
  if (rootsValue !== undefined && !Array.isArray(rootsValue)) {
    return {
      roots: [],
      errors: [`workspace/roots.yml's "roots" key must be a list of entries (each with label, path, approved_children), not ${rootsValue === null ? 'null' : typeof rootsValue}`],
    };
  }
  const list: unknown[] = Array.isArray(rootsValue) ? rootsValue : [];
  const roots: ApprovedRoot[] = [];
  const errors: string[] = [];
  const seenLabels = new Set<string>();
  list.forEach((entry, i) => {
    const e = entry as Record<string, unknown>;
    if (!e || typeof e !== 'object' || typeof e.label !== 'string' || typeof e.path !== 'string') {
      errors.push(`workspace/roots.yml entry ${i} is missing label or path`);
      return;
    }
    if (seenLabels.has(e.label)) {
      errors.push(`workspace/roots.yml entry ${i} has duplicate label "${e.label}": labels must be unique, since root_id is derived from the label`);
      return;
    }
    seenLabels.add(e.label);
    const approvedChildren = Array.isArray(e.approved_children) ? e.approved_children.map(String) : [];
    roots.push({ label: e.label, path: e.path, approved_children: approvedChildren });
  });
  return { roots, errors };
}

// --- GitProbe --------------------------------------------------------------------------------

export interface GitLogEntry {
  date: string; // %cs, YYYY-MM-DD
  author: string;
  subject: string;
}

export interface GitProbe {
  /** Whether `dir` is itself a repository boundary (not merely inside one). */
  isRepo(dir: string): boolean;
  /** Newest-first, capped to maxCommits. Null on any failure - never throws. */
  log(dir: string, maxCommits: number): GitLogEntry[] | null;
  /** The origin remote URL, raw (classifyRemoteHost collapses it before it reaches an
   *  observation field). Null when there is no remote or the read failed. */
  remoteUrl(dir: string): string | null;
}

// GIT_CONFIG_NOSYSTEM suppresses only /etc/gitconfig (the system config); it does nothing about
// the user's own ~/.gitconfig, which git still reads by default. GIT_CONFIG_GLOBAL points git at
// a replacement "global" config file instead - /dev/null reads as empty - so a setting a user
// happens to carry there (log.mailmap = true, or a mailmap.file pointing outside the repo) cannot
// change what a scan observes on one machine versus another (Determinism item 5).
const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', LC_ALL: 'C' };

/** The real git(1) probe. Exactly the invocation docs/specs/subject-finder.md's Determinism
 *  item 5 specifies for the log; a failure (not a repo, no git on PATH, a corrupt object) yields
 *  null rather than throwing, per the same item. */
export const gitCli: GitProbe = {
  isRepo(dir) {
    try {
      return existsSync(join(dir, '.git'));
    } catch {
      return false;
    }
  },
  log(dir, maxCommits) {
    try {
      const out = execFileSync(
        'git',
        ['--no-pager', '-c', 'log.showSignature=false', 'log', '--format=%cs%x09%an%x09%s', '-n', String(maxCommits)],
        { cwd: dir, env: { ...process.env, ...GIT_ENV }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
      );
      return out
        .split('\n')
        .filter((line) => line.length > 0)
        .map((line) => {
          const [date, author, ...rest] = line.split('\t');
          return { date, author, subject: rest.join('\t') };
        });
    } catch {
      return null;
    }
  },
  remoteUrl(dir) {
    try {
      const out = execFileSync('git', ['config', '--get', 'remote.origin.url'], {
        cwd: dir,
        env: { ...process.env, ...GIT_ENV },
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      return out.length > 0 ? out : null;
    } catch {
      return null;
    }
  },
};

interface FixtureGitFile {
  commits?: GitLogEntry[];
  remote?: string | null;
}

function readFixture(dir: string): FixtureGitFile | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'FIXTURE-git.json'), 'utf8')) as FixtureGitFile;
  } catch {
    return null;
  }
}

/** Reads a FIXTURE-git.json sidecar instead of shelling out to git. A committed test fixture
 *  cannot contain a nested .git directory (git would treat it as a submodule boundary and the
 *  checkout of this repo would break), so this is the only way a golden fixture can carry commit
 *  history. isRepo() looks for the sidecar itself, not a .git directory. */
export const fixtureGit: GitProbe = {
  isRepo(dir) {
    try {
      return existsSync(join(dir, 'FIXTURE-git.json'));
    } catch {
      return false;
    }
  },
  log(dir, maxCommits) {
    const data = readFixture(dir);
    if (!data) return null;
    return (data.commits ?? []).slice(0, maxCommits);
  },
  remoteUrl(dir) {
    return readFixture(dir)?.remote ?? null;
  },
};

// --- Shared directory-listing helpers --------------------------------------------------------

/** Determinism item 1: sorted by Buffer.compare on the raw name, never localeCompare. */
function sortEntries(entries: Dirent[]): Dirent[] {
  return [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
}

function safeIsSymlink(e: Dirent): boolean {
  try {
    return e.isSymbolicLink();
  } catch {
    return true; // an entry whose type cannot be determined is treated as unsafe to follow
  }
}

function safeIsDirectory(e: Dirent): boolean {
  try {
    return e.isDirectory();
  } catch {
    return false;
  }
}

/** Immediate child directory names only (no recursion), used for both the approval-drift check
 *  and enumerateRoots. Never follows a symlink, so a symlinked directory never counts as a
 *  candidate child. */
function immediateChildDirNames(dir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return sortEntries(entries)
    .filter((e) => !safeIsSymlink(e) && safeIsDirectory(e))
    .map((e) => e.name);
}

export interface RootDrift {
  /** Sorted directory names present now that were not part of the approval. */
  pending_approval: string[];
}

/** spec invariant 5: a root whose immediate children changed since approval is not scanned;
 *  its new children are surfaced here instead. Reads only directory names, opens no file. */
export function checkRootDrift(root: ApprovedRoot): RootDrift {
  let real: string;
  try {
    real = realpathSync(root.path);
  } catch {
    return { pending_approval: [] }; // an unreadable/missing root has nothing to scan either way
  }
  const approved = new Set(root.approved_children);
  return { pending_approval: immediateChildDirNames(real).filter((name) => !approved.has(name)) };
}

// --- Repo file walk ----------------------------------------------------------------------------

interface WalkStats {
  files_walked: number;
  symlinks_skipped: number;
  secrets_skipped: number;
  unreadable_dirs: number;
  capped_dirs: number;
  /** Set true the moment the walk actually finds an entry beyond max_files and stops - see
   *  RepoObservation.files_truncated in workspace-scan.ts for why this can't be inferred from
   *  files_walked after the fact. */
  files_truncated: boolean;
  /** Set true the moment an allowlisted doc beyond max_doc_files_per_repo is found and left
   *  unread - see RepoObservation.docs_truncated. */
  docs_truncated: boolean;
}

/** Cross-repo state for the max_doc_files budget, shared by every call into walkRepoTree across
 *  an entire collectWorkspace run (spec: max_doc_files bounds "what a sub-agent reads in full"
 *  across the whole workspace, not per repo). A plain mutable object rather than a return value,
 *  since it has to be threaded through discoverRepos' recursion and walkOneRepo alike. */
interface DocBudgetState {
  count: number;
  truncated: boolean;
}

const LOCKFILE_NAMES: ReadonlySet<string> = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'Cargo.lock', 'poetry.lock', 'go.sum']);

/**
 * Reads a manifest file as text, rejecting invalid UTF-8 the same way tryReadDoc does for a doc
 * body (`Buffer.from(text, 'utf8').equals(raw)`). A manifest that fails this check is treated as
 * malformed by every reader below: it throws here, the reader's own try/catch turns that into
 * parse_failed, and a shallow line/regex scanner is not trusted to have found real names in
 * corrupted bytes anyway.
 */
function readManifestText(path: string): string {
  const raw = readFileSync(path);
  const text = raw.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(raw)) throw new Error('manifest is not valid UTF-8');
  return text;
}

/** True only for a plain object (not an array, not null) - the shape `dependencies`/
 *  `devDependencies` must have for Object.keys to yield dependency names. A string value
 *  (`"dependencies": "react"`) would otherwise pass Object.keys' own arity check and yield
 *  the string's character indices ("0", "1", "2", ...) as spurious dependency names - DEFECT
 *  5. Treated as malformed rather than silently iterated. */
function isDepsObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readNpmManifest(path: string): RepoManifest {
  try {
    const json = JSON.parse(readManifestText(path)) as { dependencies?: unknown; devDependencies?: unknown };
    if ((json.dependencies !== undefined && !isDepsObject(json.dependencies)) || (json.devDependencies !== undefined && !isDepsObject(json.devDependencies))) {
      return { kind: 'npm', deps: [], dev_deps: [], parse_failed: true };
    }
    const deps = json.dependencies ? Object.keys(json.dependencies as Record<string, unknown>).map(classifyDependencyName) : [];
    const devDeps = json.devDependencies ? Object.keys(json.devDependencies as Record<string, unknown>).map(classifyDependencyName) : [];
    return { kind: 'npm', deps, dev_deps: devDeps, parse_failed: false };
  } catch {
    return { kind: 'npm', deps: [], dev_deps: [], parse_failed: true };
  }
}

// --- Shallow TOML/PEP 508 helpers for the non-npm manifest kinds -------------------------------
// spec, "Support more than npm": each parser below is deliberately shallow - a bounded regex or a
// hand-rolled line scanner, never a TOML library, matching the repo's zero-dependency-tooling
// preference. Every reader wraps its work in try/catch and reports parse_failed rather than
// throwing; readManifestText's UTF-8 check is what makes "malformed input" a real, testable case
// for formats (TOML, go.mod) that have no strict grammar of their own to reject garbage with.

/** Strips a leading/trailing single- or double-quote pair, if present - used to unquote a TOML
 *  table key written as `"some-key" = ...`. */
function stripQuotes(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && ((t[0] === '"' && t[t.length - 1] === '"') || (t[0] === "'" && t[t.length - 1] === "'"))) {
    return t.slice(1, -1);
  }
  return t;
}

/**
 * Extracts the base package name from a PEP 508 requirement string - "requests[security]>=2.28;
 * python_version>='3.8'" -> "requests". Misses: extras and environment markers are discarded
 * entirely rather than recorded, and anything that doesn't start with a plain identifier (a
 * VCS/URL requirement, for instance) yields null and is silently skipped.
 */
function pep508Name(spec: string): string | null {
  const m = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)/.exec(spec);
  return m ? m[1] : null;
}

/** Strips a `#` comment from one line of TOML, respecting single- and double-quoted strings so a
 *  `#` inside a quoted value is never mistaken for a comment start. Used before extracting quoted
 *  literals so a commented-out array entry (`# "legacy-dep>=1", removed 2024`) is never read as a
 *  real one - DEFECT: extractQuotedList used to run over raw, uncommented text. */
function stripTomlLineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === '#' && !inSingle && !inDouble) return line.slice(0, i);
  }
  return line;
}

/** All double- or single-quoted string literals in `raw`, in order - used to pull requirement
 *  strings out of a TOML array once its bracketed text has been isolated. Comments are stripped
 *  line by line first (see stripTomlLineComment), so a quoted string inside a `#` comment never
 *  contributes a spurious dependency name. */
function extractQuotedList(raw: string): string[] {
  const out: string[] = [];
  const withoutComments = raw.split('\n').map(stripTomlLineComment).join('\n');
  const re = /"([^"]*)"|'([^']*)'/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutComments))) {
    const v = m[1] ?? m[2];
    if (v) out.push(v);
  }
  return out;
}

/** [start, end) line range of a top-level TOML section, exclusive of the `[header]` line itself
 *  and of the next `[...]` header. Returns null when the section is absent. Matches a trailing
 *  `#` comment on the header line (`[dependencies] # runtime deps`) - DEFECT: an exact-text match
 *  against `[header]` used to silently drop the whole table (deps: [], parse_failed: false) the
 *  moment a header carried a comment, which is a miss reported as success, the worst outcome the
 *  spec names. Misses: this still does not understand inline tables (`project = { ... }`) or
 *  TOML's array-of-tables syntax (`[[...]]`). */
function tomlSectionBounds(lines: string[], header: string): [number, number] | null {
  const escapedHeader = header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const headerRe = new RegExp(`^\\[${escapedHeader}\\]\\s*(#.*)?$`);
  const idx = lines.findIndex((l) => headerRe.test(l.trim()));
  if (idx === -1) return null;
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return [idx + 1, end];
}

/** Finds `key = [ ... ]` inside `lines[start, end)`, handling a value that spans multiple lines
 *  by counting bracket depth, and returns the raw joined text (brackets included), or null if the
 *  key never appears. An array that never closes before `end` still returns whatever text was
 *  accumulated - extractQuotedList only pulls out complete quoted strings, so a truncated tail
 *  just yields fewer names rather than a thrown error. */
function findBracketedValue(lines: string[], start: number, end: number, key: string): string | null {
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = start; i < end; i++) {
    if (!keyRe.test(lines[i])) continue;
    let depth = 0;
    let started = false;
    let raw = '';
    for (let j = i; j < end; j++) {
      raw += lines[j] + '\n';
      for (const ch of lines[j]) {
        if (ch === '[') {
          depth++;
          started = true;
        } else if (ch === ']') {
          depth--;
        }
      }
      if (started && depth <= 0) return raw;
    }
    return raw;
  }
  return null;
}

/** Collects every `key = [ ... ]` assignment inside `lines[start, end)`, concatenating all their
 *  quoted string values - used for [project.optional-dependencies], whose keys are extras group
 *  names (test, dev, ...) rather than one fixed key. */
function collectAllBracketedValues(lines: string[], start: number, end: number): string[] {
  const out: string[] = [];
  let i = start;
  while (i < end) {
    const eq = lines[i].indexOf('=');
    if (eq === -1 || !lines[i].slice(eq + 1).includes('[')) {
      i++;
      continue;
    }
    let depth = 0;
    let started = false;
    let raw = '';
    let j = i;
    for (; j < end; j++) {
      raw += lines[j] + '\n';
      for (const ch of lines[j]) {
        if (ch === '[') {
          depth++;
          started = true;
        } else if (ch === ']') {
          depth--;
        }
      }
      if (started && depth <= 0) break;
    }
    out.push(...extractQuotedList(raw));
    i = j + 1;
  }
  return out;
}

/** Collects the top-level keys of a TOML table (`key = value` lines, one per dependency) inside
 *  `lines[start, end)`, skipping any name in `skip`. Used for [tool.poetry.dependencies], whose
 *  `python` entry is a language constraint, not a dependency, and for Cargo's [dependencies] /
 *  [dev-dependencies] tables. Tracks inline-table (`{ ... }`) brace depth across lines and only
 *  matches a key while depth is zero - DEFECT: this used to be purely line-based, so a Poetry
 *  dependency whose inline-table value spans multiple lines (`requests = {\n  version = "^2.28",\n
 *  optional = true\n}`) had its inner TOML keys ("version", "optional") reported as dependency
 *  names in their own right, alongside the real one ("requests"). Misses: an array value that
 *  spans multiple lines is not tracked the same way (only brace depth is), so a bracketed value
 *  after an inline table closes on the same line as it opens could still misparse in principle;
 *  no case like that has been observed in a real manifest. */
function collectTableKeys(lines: string[], start: number, end: number, skip: ReadonlySet<string>): string[] {
  const out: string[] = [];
  let braceDepth = 0;
  for (let i = start; i < end; i++) {
    const line = lines[i];
    if (braceDepth === 0) {
      const m = /^\s*([A-Za-z0-9_.-]+|"[^"]+"|'[^']+')\s*=/.exec(line);
      if (m) {
        const key = stripQuotes(m[1]);
        if (!skip.has(key)) out.push(key);
      }
    }
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      else if (ch === '}') braceDepth = Math.max(0, braceDepth - 1);
    }
  }
  return out;
}

/**
 * pyproject.toml: PEP 621 `[project].dependencies` (an array) as deps,
 * `[project.optional-dependencies]` (a table of arrays, one per extras group) as dev_deps, and
 * poetry's `[tool.poetry.dependencies]` (a table of name = version) merged into deps. Misses:
 * poetry dependency groups other than the main table (`[tool.poetry.group.dev.dependencies]`),
 * PEP 735 dependency-groups, and any `dependencies` computed dynamically by a build backend
 * rather than listed literally.
 */
function readPyprojectManifest(path: string): RepoManifest {
  try {
    const lines = readManifestText(path).split('\n');
    const deps: string[] = [];
    const devDeps: string[] = [];

    const project = tomlSectionBounds(lines, 'project');
    if (project) {
      const raw = findBracketedValue(lines, project[0], project[1], 'dependencies');
      if (raw) {
        for (const spec of extractQuotedList(raw)) {
          const name = pep508Name(spec);
          if (name) deps.push(name);
        }
      }
    }

    const optional = tomlSectionBounds(lines, 'project.optional-dependencies');
    if (optional) {
      for (const spec of collectAllBracketedValues(lines, optional[0], optional[1])) {
        const name = pep508Name(spec);
        if (name) devDeps.push(name);
      }
    }

    const poetry = tomlSectionBounds(lines, 'tool.poetry.dependencies');
    if (poetry) deps.push(...collectTableKeys(lines, poetry[0], poetry[1], new Set(['python'])));

    return { kind: 'pyproject', deps: deps.map(classifyDependencyName), dev_deps: devDeps.map(classifyDependencyName), parse_failed: false };
  } catch {
    return { kind: 'pyproject', deps: [], dev_deps: [], parse_failed: true };
  }
}

/**
 * requirements.txt: one requirement per line. Misses: option lines (-r, -e, --index-url, ...) are
 * skipped outright rather than followed, a VCS/URL requirement (containing '://') is skipped
 * rather than named, and environment markers/extras are discarded like the pyproject parser
 * above.
 */
function readRequirementsManifest(path: string): RepoManifest {
  try {
    const lines = readManifestText(path).split('\n');
    const deps: string[] = [];
    for (const rawLine of lines) {
      const line = rawLine.split('#')[0].trim(); // strip a trailing or whole-line comment
      if (!line || line.startsWith('-') || line.includes('://')) continue;
      const name = pep508Name(line);
      if (name) deps.push(name);
    }
    return { kind: 'requirements', deps: deps.map(classifyDependencyName), dev_deps: [], parse_failed: false };
  } catch {
    return { kind: 'requirements', deps: [], dev_deps: [], parse_failed: true };
  }
}

/**
 * go.mod `require (...)` blocks and single-line `require module version` statements. Misses:
 * replace/exclude directives are not consulted, so a module still lists as a dependency even when
 * it is replaced with a local path, and `// indirect` dependencies are not distinguished from
 * direct ones - both land in the same deps list. A module path is host-shaped
 * (host/org/repo), so classifyDependencyName (below, via `.map(classifyDependencyName)`) applies
 * the same privacy guard here it applies to an npm scope: a host outside PUBLIC_MODULE_HOSTS
 * collapses to PRIVATE_MODULE_PLACEHOLDER before the raw module path ever reaches a RepoManifest.
 */
/** Strips a trailing `//` comment from every line, before the block-bounds regex ever sees the
 *  text - DEFECT: blockRe used to run non-greedily over raw, uncommented content, so a `)`
 *  appearing inside a same-line comment (`github.com/a/b v1.0.0 // indirect (vendored)`) matched
 *  as the block's own closing paren and ended it early, silently losing every later require in
 *  that block. Line-based, like the rest of this shallow parser: a module path never legitimately
 *  contains "//", so this cannot mistake real content for a comment. */
function stripGoLineComments(content: string): string {
  return content
    .split('\n')
    .map((line) => line.split('//')[0])
    .join('\n');
}

function readGoModManifest(path: string): RepoManifest {
  try {
    const content = stripGoLineComments(readManifestText(path));
    const deps: string[] = [];
    const blockRe = /require\s*\(([\s\S]*?)\)/g;
    let m: RegExpExecArray | null;
    while ((m = blockRe.exec(content))) {
      for (const rawLine of m[1].split('\n')) {
        const line = rawLine.trim();
        if (!line) continue;
        const modulePath = line.split(/\s+/)[0];
        if (modulePath) deps.push(modulePath);
      }
    }
    // [ \t] rather than \s here deliberately: \s includes \n, and the block form above starts
    // with the exact text "require (" followed by a newline, which \s+\S+ would otherwise happily
    // cross to grab "require" + "(" as a spurious single-line match with the next real line's
    // first token trailing after it.
    const singleRe = /^[ \t]*require[ \t]+(\S+)[ \t]+\S+/gm;
    while ((m = singleRe.exec(content))) deps.push(m[1]);
    return { kind: 'go', deps: deps.map(classifyDependencyName), dev_deps: [], parse_failed: false };
  } catch {
    return { kind: 'go', deps: [], dev_deps: [], parse_failed: true };
  }
}

/**
 * Cargo.toml `[dependencies]` and `[dev-dependencies]`. Misses: target-specific tables
 * (`[target.'cfg(windows)'.dependencies]`) are not recognised as a dependency source at all, and
 * a workspace-inherited dependency (`name = { workspace = true }`) still yields the crate name -
 * this parser never records version information regardless, so that case is no different from any
 * other entry. No module-host guard is applied here: collectTableKeys only ever reads a table's
 * *keys* (the crate name a manifest declares, e.g. `serde = "1.0"`), never a value, so a private
 * git/registry URL that might appear as a value (`serde = { git = "https://git.acme-corp.internal/..." }`)
 * is never read in the first place - there is no raw host for a guard to intercept.
 */
function readCargoManifest(path: string): RepoManifest {
  try {
    const lines = readManifestText(path).split('\n');
    const deps: string[] = [];
    const devDeps: string[] = [];
    const main = tomlSectionBounds(lines, 'dependencies');
    if (main) deps.push(...collectTableKeys(lines, main[0], main[1], new Set()));
    const dev = tomlSectionBounds(lines, 'dev-dependencies');
    if (dev) devDeps.push(...collectTableKeys(lines, dev[0], dev[1], new Set()));
    return { kind: 'cargo', deps: deps.map(classifyDependencyName), dev_deps: devDeps.map(classifyDependencyName), parse_failed: false };
  } catch {
    return { kind: 'cargo', deps: [], dev_deps: [], parse_failed: true };
  }
}

/** Reads and redacts one allowlisted doc body. Null on any failure, oversize (>256 KB), or
 *  invalid UTF-8 - `Buffer.from(text, 'utf8').equals(raw)` catches what a plain toString('utf8')
 *  would silently paper over with replacement characters. */
function tryReadDoc(full: string, relPath: string): RepoDocObserved | null {
  let size: number;
  try {
    size = statSync(full).size;
  } catch {
    return null;
  }
  if (size > 256 * 1024) return null;
  let raw: Buffer;
  try {
    raw = readFileSync(full);
  } catch {
    return null;
  }
  const text = raw.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(raw)) return null; // not valid UTF-8
  return { path: relPath, bytes: raw.byteLength, body: redactSecrets(text) };
}

/**
 * Walks one repository's internal file tree, filling extensions/markers/manifests/docs and the
 * per-repo counters. `depth` here is relative to the repo's own root (0 at the repo root),
 * independent of how deep the repo itself sits under its approved root - the two are separate
 * applications of the same max_depth budget (conventional nesting either way).
 */
function walkRepoTree(
  dir: string,
  repoRoot: string,
  depth: number,
  budgets: ScanBudgets,
  stats: WalkStats,
  extensions: Record<string, number>,
  docs: RepoDocObserved[],
  markers: RepoMarkers,
  manifests: RepoManifest[],
  docBudget: DocBudgetState,
): void {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    stats.unreadable_dirs++;
    return;
  }
  let sorted = sortEntries(entries);
  if (sorted.length > budgets.max_dir_entries) {
    stats.capped_dirs++;
    sorted = sorted.slice(0, budgets.max_dir_entries);
  }

  for (const entry of sorted) {
    // Checked before processing this entry, not after: reaching this branch means the walk found
    // one more entry than max_files already allowed through, which is real proof of truncation -
    // unlike checking files_walked >= max_files once the whole walk is done, which looks
    // identical whether the repo had exactly max_files files or many more (DEFECT 4).
    if (stats.files_walked >= budgets.max_files) {
      stats.files_truncated = true;
      return;
    }
    if (safeIsSymlink(entry)) {
      stats.symlinks_skipped++;
      continue; // never followed, contributes zero files
    }
    const full = join(dir, entry.name);
    const relPath = relative(repoRoot, full).split(sep).join('/');

    if (safeIsDirectory(entry)) {
      if (PRUNE_DIRS.has(entry.name) || isSecretDir(entry.name, basename(dir))) continue;
      if (relPath === 'docs') markers.docs_dir = true;
      if (relPath === '.github/workflows' || entry.name === '.circleci') markers.ci = true;
      if (/^(test|tests|__tests__)$/i.test(entry.name)) markers.tests = true;
      if (entry.name === 'terraform') markers.iac = true;
      if (depth + 1 <= budgets.max_depth) {
        walkRepoTree(full, repoRoot, depth + 1, budgets, stats, extensions, docs, markers, manifests, docBudget);
      }
      continue;
    }

    if (isSecretFile(entry.name)) {
      stats.secrets_skipped++; // never opened; no filename or location recorded past this count
      continue;
    }

    stats.files_walked++;
    const ext = extname(entry.name).toLowerCase();
    if (ext) extensions[ext] = (extensions[ext] ?? 0) + 1;

    if (depth === 0 && /^readme/i.test(entry.name)) markers.readme = true;
    if (depth === 0 && /^license/i.test(entry.name)) markers.license = true;
    if (entry.name === 'Dockerfile') markers.dockerfile = true;
    if (/\.tf$/i.test(entry.name)) markers.iac = true;
    if (LOCKFILE_NAMES.has(entry.name)) markers.lockfile = true;
    if (/\.(test|spec)\.[a-z0-9]+$/i.test(entry.name)) markers.tests = true;
    if (relPath.startsWith('.github/workflows/')) markers.ci = true;
    if (entry.name === '.gitlab-ci.yml') markers.ci = true;

    // Manifests: recognised at repo root only, one manifest kind per matched filename. Names,
    // not just counts - dependency identity is the strongest signal this subsystem has for what
    // a person actually works with (docs/specs/subject-finder.md, "Record dependency names
    // again"), guarded by classifyDependencyName (called inside each reader above) so a private
    // npm scope never survives past this file.
    if (depth === 0) {
      if (entry.name === 'package.json') manifests.push(readNpmManifest(full));
      else if (entry.name === 'pyproject.toml') manifests.push(readPyprojectManifest(full));
      else if (entry.name === 'requirements.txt') manifests.push(readRequirementsManifest(full));
      else if (entry.name === 'go.mod') manifests.push(readGoModManifest(full));
      else if (entry.name === 'Cargo.toml') manifests.push(readCargoManifest(full));
    }

    // Two independent budgets gate a doc read: the per-repo cap (docs.length) and the
    // workspace-wide cap (docBudget.count, shared across every repo this collectWorkspace call
    // scans). A candidate that matches the allowlist but loses to either cap sets that cap's own
    // truncated flag rather than being silently dropped (DEFECT 3: max_doc_files used to be
    // declared and never enforced at all).
    if (isAllowlistedDoc(relPath)) {
      const underRepoCap = docs.length < budgets.max_doc_files_per_repo;
      const underGlobalCap = docBudget.count < budgets.max_doc_files;
      if (underRepoCap && underGlobalCap) {
        const doc = tryReadDoc(full, relPath);
        if (doc) {
          docs.push(doc);
          docBudget.count++;
        }
      } else {
        if (!underRepoCap) stats.docs_truncated = true;
        if (!underGlobalCap) docBudget.truncated = true;
      }
    }
  }
}

function emptyMarkers(): RepoMarkers {
  return { tests: false, ci: false, dockerfile: false, iac: false, readme: false, docs_dir: false, lockfile: false, license: false };
}

function walkOneRepo(repoDir: string, name: string, depth: number, rootLabel: string, repoId: string, budgets: ScanBudgets, git: GitProbe, docBudget: DocBudgetState): RepoObservation {
  const stats: WalkStats = { files_walked: 0, symlinks_skipped: 0, secrets_skipped: 0, unreadable_dirs: 0, capped_dirs: 0, files_truncated: false, docs_truncated: false };
  const extensions: Record<string, number> = {};
  const docs: RepoDocObserved[] = [];
  const markers = emptyMarkers();
  const manifests: RepoManifest[] = [];
  walkRepoTree(repoDir, repoDir, 0, budgets, stats, extensions, docs, markers, manifests, docBudget);

  // Asks git for one more commit than the budget allows, purely so a real commit beyond the
  // budget can be told apart from the budget being reached naturally (DEFECT 4: commit_days.length
  // is always <= max_commits_per_repo by construction once sliced, so it can never itself prove
  // truncation happened - only the raw, unsliced response can).
  const rawLog = git.log(repoDir, budgets.max_commits_per_repo + 1) ?? [];
  const commitsTruncated = rawLog.length > budgets.max_commits_per_repo;
  const log = commitsTruncated ? rawLog.slice(0, budgets.max_commits_per_repo) : rawLog;
  const commitDays: string[] = [];
  const commitTypes: Record<string, number> = {};
  const keywordHits: Record<string, number> = {};
  const authors = new Set<string>();
  for (const entry of log) {
    commitDays.push(entry.date);
    authors.add(entry.author);
    const cls = classifyCommit(entry.subject); // subject discarded immediately after this call
    if (cls.type) commitTypes[cls.type] = (commitTypes[cls.type] ?? 0) + 1;
    for (const kw of cls.keywords) keywordHits[kw] = (keywordHits[kw] ?? 0) + 1;
  }

  return {
    repo_id: repoId,
    name,
    depth,
    root_label: rootLabel,
    remote_host: classifyRemoteHost(git.remoteUrl(repoDir)),
    commit_days: commitDays,
    commit_types: commitTypes,
    keyword_hits: keywordHits,
    authors: authors.size,
    extensions,
    manifests,
    markers,
    docs,
    files_walked: stats.files_walked,
    symlinks_skipped: stats.symlinks_skipped,
    secrets_skipped: stats.secrets_skipped,
    unreadable_dirs: stats.unreadable_dirs,
    capped_dirs: stats.capped_dirs,
    files_truncated: stats.files_truncated,
    docs_truncated: stats.docs_truncated,
    commits_truncated: commitsTruncated,
  };
}

/** Shared, mutable per-root state threaded through discoverRepos' recursion: once either flag is
 *  set, discovery has already proven truncation and stops looking any further (there is nothing
 *  more a caller needs from continuing). */
interface RepoDiscoveryState {
  repos_truncated: boolean;
  depth_truncated: boolean;
}

/**
 * Finds repositories under one approved root. A directory that is itself a repo (git.isRepo)
 * is walked and never recursed into further looking for nested repos - a workspace of ordinary
 * shape does not nest one repository inside another, and treating a vendored subtree as a
 * second repo would misattribute its history to the wrong project.
 *
 * Continues a cheap, walkOneRepo-free search past max_repos_per_root and past max_depth once
 * either budget is reached, purely to tell a genuinely truncated scan apart from one that simply
 * ran out of repositories exactly at the cap (DEFECT 4) - it stops for good the moment either is
 * proven, so the extra cost is bounded to "one more directory listing," never a full re-walk.
 */
function discoverRepos(
  rootRealpath: string,
  dir: string,
  depth: number,
  rootId: string,
  rootLabel: string,
  budgets: ScanBudgets,
  git: GitProbe,
  out: RepoObservation[],
  docBudget: DocBudgetState,
  state: RepoDiscoveryState,
): void {
  if (state.repos_truncated) return; // already proven; nothing left to learn by continuing

  if (git.isRepo(dir)) {
    if (out.length < budgets.max_repos_per_root) {
      const relPath = relative(rootRealpath, dir).split(sep).join('/');
      out.push(walkOneRepo(dir, basename(dir), depth, rootLabel, computeRepoId(rootId, relPath), budgets, git, docBudget));
    } else {
      state.repos_truncated = true; // this repo itself is the proof: one more than the budget
    }
    return;
  }

  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // unreadable during discovery, before any repo exists to attribute the failure to
  }
  for (const entry of sortEntries(entries)) {
    if (state.repos_truncated) return;
    if (safeIsSymlink(entry) || !safeIsDirectory(entry)) continue;
    if (PRUNE_DIRS.has(entry.name) || isSecretDir(entry.name, basename(dir))) continue;
    if (depth + 1 > budgets.max_depth) {
      state.depth_truncated = true; // a subtree exists here that was never searched
      continue;
    }
    discoverRepos(rootRealpath, join(dir, entry.name), depth + 1, rootId, rootLabel, budgets, git, out, docBudget, state);
  }
}

// --- collectWorkspace --------------------------------------------------------------------------

/**
 * Performs every filesystem and git read for a scan and returns the raw WorkspaceObservation
 * (docs/specs/subject-finder.md, "How it behaves" item 1). Makes no cross-repo decisions - the
 * per-repo classification it does apply (secret/prune matching, doc redaction, remote-host and
 * commit-subject collapsing) exists because the observation contract itself has no field for a
 * raw remote URL or a raw commit subject to pass through unredacted; every genuinely
 * cross-repo derivation (language shares, the 90-day bucket, aggregate coverage, truncation)
 * stays in computeWorkspaceScan.
 *
 * A root with pending approval (checkRootDrift) is not scanned at all - its repos list comes
 * back empty and its drift is surfaced by the caller (tools/scan.ts), which is what decides the
 * process exit code.
 */
export function collectWorkspace(roots: ApprovedRoot[], budgets: ScanBudgets, git: GitProbe = gitCli): WorkspaceObservation {
  // max_roots is enforced here, for real, before any of the excess roots are so much as
  // realpath'd (DEFECT 3: this budget used to be emitted without ever being enforced). The exact
  // pre-truncation count survives as total_roots_requested, since it costs nothing to keep - it's
  // simply roots.length before the slice.
  const totalRootsRequested = roots.length;
  const cappedRoots = roots.slice(0, budgets.max_roots);
  // One counter for the whole scan, shared by every repo the loop below walks - max_doc_files is
  // a cross-repo, workspace-wide budget, not a per-repo one (DEFECT 3, same as max_roots above).
  const docBudget: DocBudgetState = { count: 0, truncated: false };

  const rootObs: RootObservation[] = [];
  for (const root of cappedRoots) {
    const id = computeRootId(root.label);
    let real: string;
    try {
      real = realpathSync(root.path);
    } catch {
      // Absent entirely: a rename, a deletion, or a checkout that never happened on this
      // machine. Distinct from 'not-a-directory' below - both used to collapse into the same
      // repos: [] result an empty-but-present root also produces (Finding 2: a missing root and
      // a root that is a file were indistinguishable from an empty one).
      rootObs.push({ root_id: id, label: root.label, repos: [], pending_approval: [], repos_truncated: false, depth_truncated: false, status: 'missing' });
      continue;
    }
    let rootStat;
    try {
      rootStat = statSync(real);
    } catch {
      // realpathSync succeeded but the path vanished before stat could run - a genuine race, not
      // the common case; treated the same as never having existed.
      rootObs.push({ root_id: id, label: root.label, repos: [], pending_approval: [], repos_truncated: false, depth_truncated: false, status: 'missing' });
      continue;
    }
    if (!rootStat.isDirectory()) {
      // realpathSync resolves a path whether it names a file or a directory, so an approved
      // root that was replaced with a plain file (or always was one) still passes it - only
      // stat's isDirectory() catches this.
      rootObs.push({ root_id: id, label: root.label, repos: [], pending_approval: [], repos_truncated: false, depth_truncated: false, status: 'not-a-directory' });
      continue;
    }
    // real (the resolved absolute path) is still used here for traversal confinement and drift
    // detection - discoverRepos resolves every candidate's relative_path against it and
    // checkRootDrift lists its immediate children - never for the id, which is label-derived.
    const drift = checkRootDrift({ ...root, path: real });
    const repos: RepoObservation[] = [];
    const discoveryState: RepoDiscoveryState = { repos_truncated: false, depth_truncated: false };
    if (drift.pending_approval.length === 0) {
      discoverRepos(real, real, 0, id, root.label, budgets, git, repos, docBudget, discoveryState);
    }
    rootObs.push({
      root_id: id,
      label: root.label,
      repos,
      pending_approval: drift.pending_approval,
      repos_truncated: discoveryState.repos_truncated,
      depth_truncated: discoveryState.depth_truncated,
      status: 'ok',
    });
  }
  return { roots: rootObs, total_roots_requested: totalRootsRequested, doc_files_truncated: docBudget.truncated };
}

// --- enumerateRoots ----------------------------------------------------------------------------

export interface EnumeratedCandidate {
  /** Directory name under the given base path - never an absolute path; enumerate output is
   *  shown to the user directly and is not part of any written contract, but staying
   *  path-shape-free here too keeps the guard uniform. */
  name: string;
  file_count: number;
  truncated: boolean;
}

function countFiles(dir: string, depth: number, budgets: ScanBudgets, acc: { files: number; truncated: boolean }): void {
  if (acc.files >= budgets.max_files) {
    acc.truncated = true;
    return;
  }
  if (depth > budgets.max_depth) return;
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  let sorted = sortEntries(entries);
  if (sorted.length > budgets.max_dir_entries) {
    sorted = sorted.slice(0, budgets.max_dir_entries);
    acc.truncated = true;
  }
  for (const entry of sorted) {
    if (acc.files >= budgets.max_files) {
      acc.truncated = true;
      return;
    }
    if (safeIsSymlink(entry)) continue;
    if (safeIsDirectory(entry)) {
      if (PRUNE_DIRS.has(entry.name) || isSecretDir(entry.name, basename(dir))) continue;
      countFiles(join(dir, entry.name), depth + 1, budgets, acc);
    } else if (!isSecretFile(entry.name)) {
      acc.files++;
    }
  }
}

/** The --enumerate path: for each given base path, its immediate child directories become
 *  candidate roots, each with a recursive, budget-capped file COUNT. Opens no file - a name and
 *  a number is everything a consent decision needs. */
export function enumerateRoots(paths: string[], budgets: ScanBudgets): EnumeratedCandidate[] {
  const out: EnumeratedCandidate[] = [];
  for (const base of paths) {
    let real: string;
    try {
      real = realpathSync(base);
    } catch {
      continue;
    }
    for (const name of immediateChildDirNames(real)) {
      const acc = { files: 0, truncated: false };
      countFiles(join(real, name), 1, budgets, acc);
      out.push({ name, file_count: acc.files, truncated: acc.truncated });
    }
  }
  return out;
}

// --- Writers -------------------------------------------------------------------------------

/** Vault-relative filename of a day's snapshot. */
export function scanSnapshotPath(tenantDir: string, asOf: string): string {
  return join(tenantDir, 'workspace', `${asOf}-scan.json`);
}

/** The only writer of content/tenants/<tenant>/workspace/YYYY-MM-DD-scan.json. */
export function writeScanSnapshot(tenantDir: string, snapshot: WorkspaceScanSnapshot): string {
  const path = scanSnapshotPath(tenantDir, snapshot.as_of);
  mkdirSync(dirname(path), { recursive: true });
  writeFileAtomic(path, JSON.stringify(snapshot, null, 2) + '\n');
  return path;
}

/** The mkdtempSync prefix every doc-body bundle directory carries - shared with
 *  cleanupStaleDocBundles below so the two stay in lockstep. */
const DOC_BUNDLE_PREFIX = 'meno-scan-bundle-';

/** Writes the redacted doc-body bundle OUTSIDE content/, in a fresh os.tmpdir() directory, and
 *  returns its path. tools/scan.ts is the only writer; find-subjects is the only reader, and
 *  deletes it when it finishes (docs/specs/subject-finder.md, "How it behaves" item 3). */
export function writeDocBundle(entries: DocBundleEntry[]): string {
  const dir = mkdtempSync(join(tmpdir(), DOC_BUNDLE_PREFIX));
  const path = join(dir, 'docs.json');
  writeFileSync(path, JSON.stringify(entries, null, 2) + '\n');
  return path;
}

/** Removes any doc-body bundle directory left behind by a previous run that aborted before the
 *  find-subjects skill reached its own cleanup step - the bundle's only other deletion path
 *  (docs/specs/subject-finder.md, Limits: "an abort in between leaves redacted documentation
 *  bodies on local disk"). tools/scan.ts calls this at the start of every `--read`, so an abort
 *  self-heals on the very next invocation instead of the bundle accumulating indefinitely.
 *  Never throws: an unreadable tmpdir, or a directory another process removes mid-scan, is not
 *  fatal to the scan itself - best-effort cleanup, not a guarantee. Returns the paths actually
 *  removed, so the CLI can report what it did. */
export function cleanupStaleDocBundles(): string[] {
  const base = tmpdir();
  let entries: Dirent[];
  try {
    entries = readdirSync(base, { withFileTypes: true });
  } catch {
    return [];
  }
  const removed: string[] = [];
  for (const entry of entries) {
    if (!entry.name.startsWith(DOC_BUNDLE_PREFIX)) continue;
    if (!safeIsDirectory(entry)) continue;
    const full = join(base, entry.name);
    try {
      rmSync(full, { recursive: true, force: true });
      removed.push(full);
    } catch {
      // left in place; a bundle another process is using right now, or one that already
      // vanished, is not this run's problem to solve
    }
  }
  return removed;
}
