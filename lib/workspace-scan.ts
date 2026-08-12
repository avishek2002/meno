// The workspace-scan subsystem's one pure derivation, plus the identifier/redaction contracts
// the walker (lib/workspace-scan-io.ts) needs to stay honest. docs/specs/subject-finder.md is
// the governing spec. Pure by contract, mirroring lib/insights.ts and lib/cost.ts: no
// node:fs, no node:child_process, no clock (generated_at/as_of are always parameters), no
// localeCompare (locale-dependent ordering is the likeliest cross-machine diff - see the
// spec's Determinism section).
//
// Why some "derivation-looking" logic lives here instead of in the io layer: commit subjects
// are never stored (Privacy guards) - the closest a raw subject ever gets to persisting is the
// io layer calling classifyCommit() below and keeping only the returned counts. Putting the
// classifier itself in the pure module keeps it independently testable and reusable without
// letting a raw subject leak into WorkspaceObservation, which the io layer builds and this
// module's computeWorkspaceScan (the only consumer) would otherwise have to trust blindly.
// Same reasoning for classifyRemoteHost (collapses a raw remote URL to the closed vocabulary
// before it ever reaches an observation field), redactSecrets (the redaction the spec
// requires "at emit, not after"), and classifyDependencyName (collapses a scoped dependency
// name outside the public allowlist before it ever reaches a RepoManifest).

import type { Rate } from './insights.ts';

// --- Budgets ---------------------------------------------------------------------------------

export interface ScanBudgets {
  max_roots: number;
  max_repos_per_root: number;
  max_depth: number;
  max_dir_entries: number;
  max_files: number;
  max_commits_per_repo: number;
  max_doc_files: number;
  max_doc_files_per_repo: number;
  /** Caps aggregate.dependency_frequency's ranked list, once sorted, so a workspace with an
   *  unusually large dependency surface doesn't produce an unbounded artifact. */
  max_dependency_names: number;
}

// Values from docs/specs/subject-finder.md's Budgets table.
export const DEFAULT_BUDGETS: ScanBudgets = {
  max_roots: 8,
  max_repos_per_root: 100,
  max_depth: 6,
  max_dir_entries: 2000,
  max_files: 50000,
  max_commits_per_repo: 200,
  max_doc_files: 40,
  max_doc_files_per_repo: 3,
  max_dependency_names: 200,
};

export interface TruncationEvent {
  cap: keyof ScanBudgets;
  limit: number;
  /** The true total, when it happens to still be knowable. Null when the walker stopped
   *  counting at the cap, which is the common case - see at_least. */
  observed: number | null;
  /** The walker stopped here, so this is a floor, never the true total. */
  at_least: number;
  /** Where the cap bound: a root label, a repo name, or 'workspace' for a cross-repo cap. */
  scope: string;
}

export interface ScanMeta {
  generated_at: string;
  as_of: string;
  budgets: ScanBudgets;
  scanner_version: number;
}

// --- Prune list, secret denylist, doc allowlist -----------------------------------------------
// docs/specs/subject-finder.md, "Traversal confinement" and "Privacy guards". Committed here
// (not io) so the walker and any test can both import one source of truth for what a name
// matches, without the pure module ever seeing which directory it matched in.

/** Directories the walker never descends into (Determinism item 4: .gitignore is deliberately
 *  not consulted; this deterministic list stands in for it). */
export const PRUNE_DIRS: ReadonlySet<string> = new Set([
  '.git',
  'node_modules',
  '.venv',
  'venv',
  'vendor',
  '.terraform',
  'dist',
  'build',
  'target',
  '__pycache__',
  '.next',
]);

const SECRET_FILE_PATTERNS: readonly string[] = [
  '.env',
  '.env.*',
  '*.env',
  '.envrc',
  'credentials',
  'credentials.json',
  'token.json',
  '*.pem',
  '*.key',
  '*.p12',
  '*.pfx',
  '*.jks',
  '*.keystore',
  '*.ppk',
  'id_rsa*',
  'id_dsa*',
  'id_ecdsa*',
  'id_ed25519*',
  '.npmrc',
  '.netrc',
  '_netrc',
  '.pgpass',
  '.htpasswd',
  '.git-credentials',
  '*service-account*.json',
  '*serviceAccount*.json', // the real Google default filename has no hyphen; *service-account* alone misses it
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
  '*.mobileprovision',
  '.Renviron',
  '*.tfvars',
  'terraform.tfstate*',
  '*.keychain',
];

/** Directory names that are secrets by themselves (never descended into, no file inside is ever
 *  opened even to check its own name). '.config/gh' is the one two-segment entry; handled by
 *  the parentName parameter below rather than a made-up single-segment name. */
const SECRET_DIR_NAMES: ReadonlySet<string> = new Set(['.ssh', '.aws', '.gnupg', '.docker', '.kube', '.vercel', '.netlify']);

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Matched case-insensitively, checked before any open (spec: "Secret-file denylist"). */
export function isSecretFile(name: string): boolean {
  return SECRET_FILE_PATTERNS.some((p) => globToRegExp(p).test(name));
}

/** True for a directory the walker must prune outright: .ssh/, .aws/, .gnupg/, .docker/,
 *  .kube/, .vercel/, .netlify/, and .config/gh/ (the one entry that needs its parent name). */
export function isSecretDir(name: string, parentName?: string): boolean {
  const lower = name.toLowerCase();
  if (SECRET_DIR_NAMES.has(lower)) return true;
  if (lower === 'gh' && parentName?.toLowerCase() === '.config') return true;
  return false;
}

/**
 * A file must positively match to be read at all (spec: "Doc-body allowlist"): README*,
 * AGENTS.md, CLAUDE.md, CONTRIBUTING.md, PROGRESS*.md, *.md at repository root, and
 * docs/**\/*.md to depth 3. `relPath` is repository-relative, forward-slash separated.
 */
export function isAllowlistedDoc(relPath: string): boolean {
  const segments = relPath.split('/');
  const base = segments[segments.length - 1];
  if (segments.length === 1) {
    if (/^readme/i.test(base)) return true;
    if (base === 'AGENTS.md' || base === 'CLAUDE.md' || base === 'CONTRIBUTING.md') return true;
    if (/^progress.*\.md$/i.test(base)) return true;
    return base.toLowerCase().endsWith('.md');
  }
  if (segments[0] === 'docs' && base.toLowerCase().endsWith('.md')) {
    // depth inside docs/: docs/a.md is 1, docs/a/b.md is 2, docs/a/b/c.md is 3 (the cap)
    return segments.length - 1 <= 3;
  }
  return false;
}

// --- Commit classification --------------------------------------------------------------------
// spec: "Commit subjects are never stored. Only conventional-commit type counts and hit counts
// against a keyword vocabulary committed in this repository - the vocabulary is our data, not
// the user's." The io layer calls classifyCommit() once per commit and keeps only the result;
// the subject string itself never reaches WorkspaceObservation.

export const CONVENTIONAL_TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor', 'test', 'style', 'perf', 'build', 'ci', 'revert'] as const;
export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

const CONVENTIONAL_PREFIX = new RegExp(`^(${CONVENTIONAL_TYPES.join('|')})(\\([^)]*\\))?!?:\\s`, 'i');

/**
 * Our data, not the user's (spec, "Commit subjects are never stored"): a fixed vocabulary of
 * words whose presence in a commit subject is a behavioural signal ("this repo touches
 * infrastructure", "this repo touches auth"), never a quote of what the user actually wrote.
 * Deliberately plain, common engineering nouns - broad recall over precision, since a false hit
 * only nudges a count, it never surfaces the subject that produced it.
 */
export const KEYWORD_VOCAB: readonly string[] = [
  'test',
  'testing',
  'ci',
  'pipeline',
  'docker',
  'kubernetes',
  'terraform',
  'infra',
  'infrastructure',
  'deploy',
  'deployment',
  'migration',
  'api',
  'graphql',
  'grpc',
  'auth',
  'oauth',
  'security',
  'encryption',
  'performance',
  'cache',
  'caching',
  'queue',
  'streaming',
  'websocket',
  'ml',
  'model',
  'llm',
  'agent',
  'schema',
  'database',
  'sql',
  'monitoring',
  'logging',
  'serverless',
];

export interface CommitClassification {
  type: ConventionalType | null;
  /** Distinct KEYWORD_VOCAB entries found, in vocabulary order. */
  keywords: readonly string[];
}

export function classifyCommit(subject: string): CommitClassification {
  const m = CONVENTIONAL_PREFIX.exec(subject);
  const type = m ? (m[1].toLowerCase() as ConventionalType) : null;
  const lower = subject.toLowerCase();
  const keywords: string[] = [];
  for (const kw of KEYWORD_VOCAB) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(lower)) keywords.push(kw);
  }
  return { type, keywords };
}

// --- Remote host -------------------------------------------------------------------------------

export type RemoteHost = 'github.com' | 'gitlab.com' | 'bitbucket.org' | 'codeberg.org' | 'self-hosted' | null;

const KNOWN_HOSTS: readonly RemoteHost[] = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org'];

/** Collapses a raw remote URL (https, ssh, or scp-like git@host:owner/repo.git) to the closed
 *  vocabulary the spec requires: "an internal git host name is an employer identifier". */
export function classifyRemoteHost(url: string | null): RemoteHost {
  if (!url) return null;
  let host: string | null = null;
  const scp = /^[^@\s]+@([^:/\s]+):/.exec(url);
  if (scp) {
    host = scp[1];
  } else {
    try {
      host = new URL(url).hostname || null;
    } catch {
      host = null;
    }
  }
  if (!host) return null;
  const lower = host.toLowerCase();
  for (const known of KNOWN_HOSTS) if (lower === known) return known;
  return 'self-hosted';
}

// --- Dependency name privacy -------------------------------------------------------------------
// spec, "Privacy guards". An unscoped package name (react, django, terraform) is a public
// registry identifier, not user data. A scoped npm name (@scope/name) can carry one: the scope is
// commonly an organization or client slug, e.g. @acme-corp/billing names the employer. This
// collapses any scope outside a committed allowlist of well-known public library/tooling scopes
// to a fixed placeholder, still counted but never named - applied by the io layer at collection
// time (same pattern as classifyRemoteHost above and classifyCommit below: the raw value never
// reaches WorkspaceObservation, only the classified result does).

/** Well-known public npm scopes: official SDKs, frameworks, and tooling orgs whose scope itself
 *  names the tool, not a private organization. Deliberately a starting set - extend it as real
 *  scans surface more, never widen it to "assume public unless proven private". */
export const PUBLIC_NPM_SCOPES: ReadonlySet<string> = new Set([
  '@types',
  '@anthropic-ai',
  '@openai',
  '@aws-sdk',
  '@azure',
  '@google-cloud',
  '@angular',
  '@vue',
  '@nestjs',
  '@sveltejs',
  '@tanstack',
  '@testing-library',
  '@eslint',
  '@babel',
  '@vitejs',
  '@playwright',
  '@prisma',
  '@sentry',
  '@storybook',
  '@radix-ui',
  '@emotion',
  '@mui',
  '@reduxjs',
  '@apollo',
  '@grpc',
  '@octokit',
  '@slack',
  '@stripe',
  '@supabase',
  '@trpc',
  '@typescript-eslint',
  '@vercel',
]);

/** The literal string every non-allowlisted scope collapses to. It is recorded and counted like
 *  any other dependency name - it can legitimately appear more than once in
 *  aggregate.dependency_frequency, coming from different real scopes - but the scope itself never
 *  survives past this function. */
export const PRIVATE_SCOPE_PLACEHOLDER = '@private-scope';

/** Hosts that genuinely serve public Go modules - the module path's own host segment is the only
 *  signal we have, so this is deliberately a starting set of hosts known to be general-purpose
 *  public forges or well-known publisher domains (golang.org/x/*, go.uber.org, k8s.io, ...), same
 *  posture as PUBLIC_NPM_SCOPES: extend it as real scans surface more, never widen it to "assume
 *  public unless proven private". A self-hosted or internal host (git.acme-corp.internal,
 *  gitlab.mycompany.io) is deliberately absent - that is exactly the case this guard exists to
 *  catch. */
export const PUBLIC_MODULE_HOSTS: ReadonlySet<string> = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
  'golang.org',
  'gopkg.in',
  'go.uber.org',
  'k8s.io',
  'sigs.k8s.io',
  'cloud.google.com',
  'google.golang.org',
  'googlemaps.github.io',
  'go.opentelemetry.io',
  'gotest.tools',
  'honnef.co',
  'rsc.io',
  'modernc.org',
  'filippo.io',
]);

/** The literal string a non-allowlisted module path's host collapses the whole path to - same
 *  counted-but-never-named treatment as PRIVATE_SCOPE_PLACEHOLDER above. */
export const PRIVATE_MODULE_PLACEHOLDER = 'private-module';

/**
 * Classifies one raw dependency name for the privacy guard above. Two independent shapes can name
 * an employer or client, so this checks each in turn and never lets one shadow the other:
 *
 * 1. A scoped npm name (@scope/pkg): passes through verbatim only if @scope is in
 *    PUBLIC_NPM_SCOPES; every other scope collapses to PRIVATE_SCOPE_PLACEHOLDER. Checked first and
 *    unconditionally on the leading '@', so a scoped npm name can never fall into branch 2 below
 *    even though it also contains a '/'.
 * 2. A Go-style module path (host/org/repo, e.g. github.com/acme-corp/billing or
 *    git.acme-corp.internal/team/billing): a module path embeds its hosting organisation directly
 *    in the name itself, the same class of employer identifier the npm scope guard exists to
 *    suppress. Detected structurally - contains a '/' and the text before the first '/' contains a
 *    '.', which is what makes it look like a hostname rather than an ordinary package name - then
 *    passes through verbatim only if that host is in PUBLIC_MODULE_HOSTS; every other host
 *    collapses to PRIVATE_MODULE_PLACEHOLDER. Deliberately host-based, not blanket: almost every Go
 *    dependency is github.com/org/repo, so collapsing every module path would destroy the entire
 *    Go dependency signal for the overwhelming common case, the same mistake the npm guard already
 *    made once (widening PUBLIC_NPM_SCOPES) and had to reverse.
 *
 * Known limit, stated plainly rather than implied: this catches a self-hosted or internal host. It
 * does NOT catch a *private* repository on a *public* host - github.com/acme-corp/billing is
 * structurally indistinguishable, offline, from a public module on the same host, and is recorded
 * verbatim. Closing that gap would need a live registry/API lookup, which this offline classifier
 * deliberately does not do.
 *
 * Ecosystems without either shape (Python, Rust's plain crate names) never hit branch 2, because
 * none of their manifest parsers ever produce a name starting with '@' or shaped like a host path -
 * they are recorded verbatim by default (spec, "Record dependency names again").
 */
export function classifyDependencyName(name: string): string {
  if (name.startsWith('@')) {
    const scope = name.split('/')[0];
    return PUBLIC_NPM_SCOPES.has(scope) ? name : PRIVATE_SCOPE_PLACEHOLDER;
  }
  const slash = name.indexOf('/');
  if (slash === -1) return name; // no '/' at all: not module-path-shaped
  const host = name.slice(0, slash);
  if (!host.includes('.')) return name; // first segment isn't host-shaped either
  return PUBLIC_MODULE_HOSTS.has(host.toLowerCase()) ? name : PRIVATE_MODULE_PLACEHOLDER;
}

// --- Redaction -----------------------------------------------------------------------------
// spec: "Redaction happens at emit, not after" and "Content redaction before emit". Applied by
// the io layer to a doc body right before it is written into the ephemeral bundle - this module
// only supplies the pure transform, never touches the filesystem.

const CREDENTIAL_PATTERNS: RegExp[] = [
  /sk-ant-[A-Za-z0-9_-]+/g,
  /\bsk-[A-Za-z0-9_-]{10,}\b/g,
  /\b(AKIA|ASIA)[A-Z0-9]{16}\b/g,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // ghp_ gho_ ghu_ ghs_ ghr_
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bAIza[A-Za-z0-9_-]{20,}\b/g,
  /\bya29\.[A-Za-z0-9_-]+\b/g,
  /\bglpat-[A-Za-z0-9_-]{15,}\b/g,
  /\bnpm_[A-Za-z0-9]{20,}\b/g,
  /\bdop_v1_[a-f0-9]{40,}\b/g,
  /\bSG\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\b/g,
  /\b(sk|pk|rk)_live_[A-Za-z0-9]{10,}\b/g,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  // JSON Web Token shape: three base64url segments separated by dots
  /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*\b/g,
];

const RFC1918_PATTERN = /\b(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})\b/g;
const INTERNAL_HOST_PATTERN = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(local|internal|corp)\b/gi;

// A `://user:password@host` connection-string credential. Only the credential portion is
// replaced, so the scheme and host shape survive - the observation stays useful ("a postgres
// connection string" rather than nothing at all).
const CONNECTION_STRING_CREDENTIAL = /([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/\s:@]+):([^/\s@]+)@/g;

// HTTP Basic/Bearer auth headers. The scheme word is left in place; only the credential material
// is replaced, so a redacted header still reads as "this was an auth header" in a summary.
const BASIC_AUTH_PATTERN = /\bBasic [A-Za-z0-9+/=]{16,}/g;
const BEARER_AUTH_PATTERN = /\bBearer [A-Za-z0-9._~+/=-]{16,}/g;

/**
 * A key whose name smells like a secret, followed by ':' or '=' and 6 or more non-whitespace
 * characters. 6, not 8: the worked example this rule exists to catch ("password: hunter2") is
 * itself only 7 characters, and the cost asymmetry (spec: "a false positive here costs one
 * redacted word ... a false negative costs a credential") argues for the lower bar anyway. The
 * optional `\n?` between the delimiter and the value covers a value that starts on the line
 * after its key rather than the same line.
 */
const GENERIC_ASSIGNMENT_PATTERN = /\b(api[_-]?key|secret|token|password|passwd|pwd|credential|private[_-]?key)(\s*[:=]\s*\n?\s*)(\S{6,})/gi;

// A bare 32- or 40-character hex run - the exact length of an MD5 or SHA-1 hex digest, and the
// overwhelmingly common shape for a hex-encoded API key or hash. Unconditional: unlike the
// general high-entropy run below, no diversity check gates this one, matching the spec's
// deliberately over-eager posture for this class of match.
const BARE_HEX_PATTERN = /\b[0-9a-fA-F]{40}\b|\b[0-9a-fA-F]{32}\b/g;

/**
 * Approximation of Shannon entropy over the run's own alphabet richness (distinct characters
 * used, not frequency-weighted). A frequency-weighted computation over a *specific* string is
 * bounded well below 4.0 bits/char for any realistic short hex run (16-symbol alphabet, a few
 * dozen samples) - the theoretical maximum for 40 samples over 16 categories is ~3.97, so a
 * strict frequency-weighted formula could never flag a hex-alphabet secret at all, which would
 * make half of "base64/hex-alphabet" in the spec's rule vacuous. Using distinct-character count
 * instead reaches exactly log2(16) = 4.0 for a hex run that uses all sixteen digits and up to
 * log2(64) = 6.0 for a rich base64 run.
 *
 * The bar itself is deliberately lower than the spec's original 16-distinct/4.0-bit threshold:
 * measured empirically, requiring all sixteen hex digits to appear meant 1829 of 2000 random
 * 32-character hex tokens and 1516 of 2000 40-character tokens were never redacted at all (a
 * random 32-draw sample from a 16-symbol alphabet has an expected distinct count of only ~14).
 * MIN_ENTROPY_DISTINCT_CHARS lowers the bar to 12 of 16 possible hex digits, which a random hex
 * token clears in practice (see the statistical test in tools/test/workspace-scan.test.ts),
 * while a genuinely low-diversity run (a repeated separator, a run of 2-3 characters) still
 * correctly falls below it.
 */
function runEntropy(run: string): number {
  const distinct = new Set(run).size;
  return Math.log2(Math.max(distinct, 1));
}

const MIN_ENTROPY_DISTINCT_CHARS = 12;
const ENTROPY_THRESHOLD = Math.log2(MIN_ENTROPY_DISTINCT_CHARS);
const HIGH_ENTROPY_RUN = /[A-Za-z0-9+/=_-]{24,}/g;

/** Redacts known credential-shaped tokens, connection-string credentials, Basic/Bearer auth
 *  headers, generic key=value secrets, bare hex hashes/keys, high-entropy runs, and internal host
 *  names. Applied once, at emit, before a doc body ever leaves the io layer (spec, "Content
 *  redaction"). Deliberately over-eager throughout (spec: "the cost of a false positive is one
 *  redacted word ... the cost of a false negative is a credential in a public pull request"). */
export function redactSecrets(text: string): string {
  let out = text;
  for (const pattern of CREDENTIAL_PATTERNS) out = out.replace(pattern, '[REDACTED:token]');
  out = out.replace(CONNECTION_STRING_CREDENTIAL, (_m, scheme: string) => `${scheme}[REDACTED:credential]@`);
  out = out.replace(BASIC_AUTH_PATTERN, 'Basic [REDACTED:token]');
  out = out.replace(BEARER_AUTH_PATTERN, 'Bearer [REDACTED:token]');
  out = out.replace(GENERIC_ASSIGNMENT_PATTERN, (_m, key: string, sep: string) => `${key}${sep}[REDACTED:token]`);
  out = out.replace(BARE_HEX_PATTERN, '[REDACTED:token]');
  out = out.replace(HIGH_ENTROPY_RUN, (run) => (runEntropy(run) >= ENTROPY_THRESHOLD ? '[REDACTED:token]' : run));
  out = out.replace(RFC1918_PATTERN, '[internal-host]');
  out = out.replace(INTERNAL_HOST_PATTERN, '[internal-host]');
  return out;
}

// --- Observation contract (filled by lib/workspace-scan-io.ts) -------------------------------

export interface RepoManifest {
  /** Kind of manifest recognised: 'npm' (package.json), 'pyproject' (pyproject.toml - both PEP
   *  621 and poetry tables), 'requirements' (requirements.txt), 'go' (go.mod), or 'cargo'
   *  (Cargo.toml). lib/workspace-scan-io.ts's per-parser comments say what each one misses. */
  kind: string;
  /** Dependency names only, never version strings - a version range is noise and occasionally a
   *  private registry URL (spec, "Record dependency names again"). A scoped npm name outside
   *  PUBLIC_NPM_SCOPES already arrived collapsed to PRIVATE_SCOPE_PLACEHOLDER; see
   *  classifyDependencyName above. */
  deps: string[];
  dev_deps: string[];
  parse_failed: boolean;
}

/** Repository-relative path plus byte size only - no body. This is the snapshot shape; the
 *  observation carries RepoDocObserved (below) instead, and computeWorkspaceScan strips the
 *  body when it builds the snapshot, so even a walker bug that left a body on the observation
 *  cannot make it into the written artifact. */
export interface RepoDoc {
  path: string;
  bytes: number;
}

/** The observation-only shape: a doc found by the walker, already redacted (spec: "Redaction
 *  happens at emit"). buildDocBundle() below is the only consumer of `body` - it never reaches
 *  WorkspaceScanSnapshot. */
export interface RepoDocObserved extends RepoDoc {
  body: string;
}

export interface RepoMarkers {
  tests: boolean;
  ci: boolean;
  dockerfile: boolean;
  iac: boolean;
  readme: boolean;
  docs_dir: boolean;
  lockfile: boolean;
  license: boolean;
}

export interface RepoObservation {
  repo_id: string;
  name: string;
  depth: number;
  root_label: string;
  remote_host: RemoteHost;
  /** Raw %cs strings, newest first, capped to max_commits_per_repo by the git invocation
   *  itself. Never filtered by date here - computeWorkspaceScan buckets against meta.as_of. */
  commit_days: string[];
  commit_types: Record<string, number>;
  keyword_hits: Record<string, number>;
  authors: number;
  extensions: Record<string, number>;
  manifests: RepoManifest[];
  markers: RepoMarkers;
  docs: RepoDocObserved[];
  files_walked: number;
  symlinks_skipped: number;
  secrets_skipped: number;
  unreadable_dirs: number;
  /** Directories whose entry count reached max_dir_entries and were only partially listed - a
   *  distinct signal from unreadable_dirs (a permissions failure), needed so computeWorkspaceScan
   *  can emit a max_dir_entries truncation event purely from the observation. */
  capped_dirs: number;
  /** True only when the walker actually found a file beyond max_files and stopped there - never
   *  inferred after the fact from files_walked alone, because files_walked reaching the cap looks
   *  identical whether the repo had exactly that many files or many more (the off-by-one false
   *  disclosure an adversarial review found: docs/specs/subject-finder.md's DEFECT 4). */
  files_truncated: boolean;
  /** True only when an allowlisted doc beyond max_doc_files_per_repo was actually found and left
   *  unread - same false-disclosure fix as files_truncated, applied to the per-repo doc cap. */
  docs_truncated: boolean;
  /** True only when git actually returned a commit beyond max_commits_per_repo (the io layer asks
   *  for one more than the budget precisely so this can be known, rather than inferred from
   *  commit_days.length, which is always capped at the budget by construction and so can never by
   *  itself prove truncation happened). */
  commits_truncated: boolean;
}

/** Whether an approved root was actually scannable this run. 'missing' and 'not-a-directory'
 *  used to be indistinguishable from a genuinely empty, fully-scanned root - all three produced
 *  repos_found: 0 and pending_approval: [] with a clean exit, so a user whose approved path was
 *  renamed or replaced with a file got a confident, empty report rather than an error. */
export type RootStatus = 'ok' | 'missing' | 'not-a-directory';

export interface RootObservation {
  root_id: string;
  label: string;
  repos: RepoObservation[];
  /** Immediate child directory names that appeared since approval - present but not scanned
   *  (spec invariant 5). Empty when the root matches its approval exactly. */
  pending_approval: string[];
  /** Approved child directory names that no longer exist on disk this run - a renamed or deleted
   *  approved path, distinct from pending_approval (which names a child that is present but was
   *  never approved). Mirrors RootStatus's own reasoning at the per-child scale: without this, an
   *  approved directory that vanished was indistinguishable from one that was simply never
   *  present among the root's children. Always empty when the root itself is a repository, since
   *  there are no children to check. */
  missing_children: string[];
  /** True only when repo discovery actually found a repository beyond max_repos_per_root and
   *  stopped there - same false-disclosure fix as RepoObservation.files_truncated, applied to
   *  repo discovery under one root. */
  repos_truncated: boolean;
  /** True only when repo discovery actually found a directory beyond max_depth that it declined
   *  to search - never inferred from a found repo's own depth, which can never exceed max_depth
   *  by construction (a repo deeper than that is never discovered in the first place, so it can
   *  never prove anything about truncation on its own). */
  depth_truncated: boolean;
  /** 'ok' unless the approved path itself could not be scanned - see RootStatus. A non-'ok'
   *  status always carries repos: [] and pending_approval: [], since nothing was walked. */
  status: RootStatus;
}

export interface WorkspaceObservation {
  roots: RootObservation[];
  /** Count of approved roots collectWorkspace was given, before any max_roots truncation - exact,
   *  not a floor, since it is simply the length of the already-loaded roots.yml list, unlike
   *  every other truncation signal here which the walker can only bound from below. */
  total_roots_requested: number;
  /** True only when an allowlisted doc beyond the workspace-wide max_doc_files was actually found
   *  and left unread, tracked by a counter collectWorkspace shares across every root and repo it
   *  scans - same false-disclosure fix as RepoObservation.docs_truncated, applied to the
   *  cross-repo budget instead of the per-repo one. */
  doc_files_truncated: boolean;
}

// --- Snapshot contract (schemas/workspace-scan.schema.json) ----------------------------------

export interface SnapshotRoot {
  root_id: string;
  label: string;
  repos_found: number;
  pending_approval: string[];
  /** Same signal as RootObservation.missing_children, carried straight through. */
  missing_children: string[];
  /** 'ok' unless the approved path itself was missing or not a directory this run - see
   *  RootStatus. Carried straight through from the observation: computeWorkspaceScan derives
   *  nothing further from it beyond the matching limits line below. */
  status: RootStatus;
}

export interface SnapshotRepo {
  repo_id: string;
  name: string;
  depth: number;
  root_label: string;
  remote_host: RemoteHost;
  commits_total: number;
  commits_90d: number;
  commit_types: Record<string, number>;
  keyword_hits: Record<string, number>;
  authors: number;
  extensions: Record<string, number>;
  /** Each extension's share of this repo's counted files, rounded to two decimal places. */
  language_shares: Record<string, number>;
  manifests: RepoManifest[];
  markers: RepoMarkers;
  docs: RepoDoc[];
  files_walked: number;
  symlinks_skipped: number;
  secrets_skipped: number;
  unreadable_dirs: number;
}

export interface WorkspaceScanSnapshot {
  schema_version: 1;
  type: 'workspace-scan';
  generated_at: string;
  as_of: string;
  scanner_version: number;
  budgets: ScanBudgets;
  roots: SnapshotRoot[];
  repos: SnapshotRepo[];
  aggregate: {
    total_roots: number;
    total_repos: number;
    /** Dependency name -> count of repositories carrying it (deps and dev_deps combined, deduped
     *  per repo so a repo never counts a name twice), sorted by descending count then by
     *  ascending name (Buffer.compare, never localeCompare), capped at max_dependency_names. A
     *  scoped npm name outside PUBLIC_NPM_SCOPES already arrived as '@private-scope'. */
    dependency_frequency: Record<string, number>;
    /** Manifest kind -> count of repos carrying at least one manifest of that kind. The old
     *  dependency_frequency semantics, renamed once dependency_frequency started naming
     *  dependencies instead of manifest kinds. */
    manifest_coverage: Record<string, number>;
    marker_coverage: Record<string, Rate>;
  };
  truncation: { events: TruncationEvent[] };
  limits: string[];
}

const MARKER_NAMES: readonly (keyof RepoMarkers)[] = ['tests', 'ci', 'dockerfile', 'iac', 'readme', 'docs_dir', 'lockfile', 'license'];

const rate = (n: number, of: number): Rate => (of === 0 ? { value: null, n, of, reason: 'insufficient_data' } : { value: Math.round((n / of) * 100) / 100, n, of });

// Same shape as lib/insights.ts's daysBetween, duplicated rather than imported: this module may
// import Rate's *type* from insights.ts (erased before Node runs), but importing a runtime value
// from there would pull insights.ts's own imports (mastery.ts, vault.ts, both fs-backed) into a
// module whose whole contract is "never touches the filesystem".
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000);
}

/**
 * The one pure derivation (docs/specs/subject-finder.md, invariant 1). Given the same
 * observation and meta, always returns byte-identical JSON: no clock, no filesystem, no
 * localeCompare. Derives, per repo, commits_90d (bucketed against meta.as_of, never against the
 * observation's own collection time) and language_shares (extensions normalized to proportions);
 * across the whole observation, aggregate.dependency_frequency, aggregate.marker_coverage, the
 * truncation block, and the limits disclosures.
 */
export function computeWorkspaceScan(obs: WorkspaceObservation, meta: ScanMeta): WorkspaceScanSnapshot {
  const b = meta.budgets;
  const events: TruncationEvent[] = [];

  // max_roots is exact, not a floor (see WorkspaceObservation.total_roots_requested): the io
  // layer already knows the full approved-root count before it truncates to the budget, so
  // observed carries the real total rather than null, same treatment as max_dependency_names
  // below. Strictly '>' (not '>='): a workspace with exactly max_roots approved roots and not one
  // more was never truncated (DEFECT 4 - the off-by-one false-disclosure an adversarial review
  // found here and at every other cap in this function).
  if (obs.total_roots_requested > b.max_roots) {
    events.push({ cap: 'max_roots', limit: b.max_roots, observed: obs.total_roots_requested, at_least: b.max_roots, scope: 'workspace' });
  }

  const snapRoots: SnapshotRoot[] = [];
  const snapRepos: SnapshotRepo[] = [];

  for (const root of obs.roots) {
    snapRoots.push({
      root_id: root.root_id,
      label: root.label,
      repos_found: root.repos.length,
      pending_approval: root.pending_approval,
      missing_children: root.missing_children,
      status: root.status,
    });
    // repos_truncated / depth_truncated are booleans the io layer only sets when it actually
    // found evidence of truncation (one more repo than the budget, or a subtree beyond max_depth
    // it declined to search) - never inferred from root.repos.length or a found repo's own depth,
    // both of which are capped at the budget by construction and so look identical whether the
    // true total was exactly at the cap or well beyond it.
    if (root.repos_truncated) {
      events.push({ cap: 'max_repos_per_root', limit: b.max_repos_per_root, observed: null, at_least: b.max_repos_per_root, scope: root.label });
    }
    if (root.depth_truncated) {
      events.push({ cap: 'max_depth', limit: b.max_depth, observed: null, at_least: b.max_depth, scope: root.label });
    }

    for (const repo of root.repos) {
      if (repo.files_truncated) {
        events.push({ cap: 'max_files', limit: b.max_files, observed: null, at_least: b.max_files, scope: repo.name });
      }
      if (repo.commits_truncated) {
        events.push({ cap: 'max_commits_per_repo', limit: b.max_commits_per_repo, observed: null, at_least: b.max_commits_per_repo, scope: repo.name });
      }
      if (repo.docs_truncated) {
        events.push({ cap: 'max_doc_files_per_repo', limit: b.max_doc_files_per_repo, observed: null, at_least: b.max_doc_files_per_repo, scope: repo.name });
      }
      if (repo.capped_dirs > 0) {
        events.push({ cap: 'max_dir_entries', limit: b.max_dir_entries, observed: null, at_least: b.max_dir_entries, scope: repo.name });
      }

      const commits90d = repo.commit_days.filter((d) => {
        const age = daysBetween(d, meta.as_of);
        return age >= 0 && age <= 90;
      }).length;

      const totalExt = Object.values(repo.extensions).reduce((acc, n) => acc + n, 0);
      const languageShares: Record<string, number> = {};
      for (const [ext, n] of Object.entries(repo.extensions)) {
        languageShares[ext] = totalExt > 0 ? Math.round((n / totalExt) * 100) / 100 : 0;
      }

      snapRepos.push({
        repo_id: repo.repo_id,
        name: repo.name,
        depth: repo.depth,
        root_label: repo.root_label,
        remote_host: repo.remote_host,
        commits_total: repo.commit_days.length,
        commits_90d: commits90d,
        commit_types: repo.commit_types,
        keyword_hits: repo.keyword_hits,
        authors: repo.authors,
        extensions: repo.extensions,
        language_shares: languageShares,
        manifests: repo.manifests,
        markers: repo.markers,
        // strip body: RepoDocObserved -> RepoDoc. Even if a walker bug left a body on the
        // observation, it cannot reach the written snapshot from here.
        docs: repo.docs.map((d) => ({ path: d.path, bytes: d.bytes })),
        files_walked: repo.files_walked,
        symlinks_skipped: repo.symlinks_skipped,
        secrets_skipped: repo.secrets_skipped,
        unreadable_dirs: repo.unreadable_dirs,
      });
    }
  }

  // doc_files_truncated: same false-disclosure fix as the per-repo docs_truncated above, applied
  // to the cross-repo max_doc_files budget (DEFECT 3: this budget used to be emitted without ever
  // being enforced at all - the io layer now shares one counter across the whole scan).
  if (obs.doc_files_truncated) {
    events.push({ cap: 'max_doc_files', limit: b.max_doc_files, observed: null, at_least: b.max_doc_files, scope: 'workspace' });
  }

  // aggregate.manifest_coverage: manifest kind -> count of repos carrying at least one manifest
  // of that kind. This is the old dependency_frequency semantics, renamed now that
  // dependency_frequency itself carries dependency names (see below).
  const manifestCoverage: Record<string, number> = {};
  for (const repo of snapRepos) {
    for (const kind of new Set(repo.manifests.map((m) => m.kind))) {
      manifestCoverage[kind] = (manifestCoverage[kind] ?? 0) + 1;
    }
  }

  // aggregate.dependency_frequency: dependency name -> count of repositories carrying it (spec,
  // "aggregate.dependency_frequency becomes what the spec says"). A scoped npm name outside
  // PUBLIC_NPM_SCOPES has already arrived collapsed to PRIVATE_SCOPE_PLACEHOLDER - by the time
  // this function sees a manifest, the raw scope is already gone (classifyDependencyName runs in
  // the io layer at collection time, same pattern as classifyCommit/classifyRemoteHost).
  const depCounts = new Map<string, number>();
  let anyPrivateScopeCollapsed = false;
  let anyPrivateModuleCollapsed = false;
  for (const repo of snapRepos) {
    const names = new Set<string>();
    for (const m of repo.manifests) {
      for (const n of m.deps) names.add(n);
      for (const n of m.dev_deps) names.add(n);
    }
    if (names.has(PRIVATE_SCOPE_PLACEHOLDER)) anyPrivateScopeCollapsed = true;
    if (names.has(PRIVATE_MODULE_PLACEHOLDER)) anyPrivateModuleCollapsed = true;
    for (const n of names) depCounts.set(n, (depCounts.get(n) ?? 0) + 1);
  }
  const depEntries = [...depCounts.entries()].sort((x, y) => {
    if (x[1] !== y[1]) return y[1] - x[1]; // descending count
    return Buffer.compare(Buffer.from(x[0]), Buffer.from(y[0])); // ascending name, never localeCompare
  });
  if (depEntries.length > b.max_dependency_names) {
    // Unlike the walker-stopped caps above, the full list is already known here - the true
    // total is exact, not a floor, so observed carries it instead of null.
    events.push({ cap: 'max_dependency_names', limit: b.max_dependency_names, observed: depEntries.length, at_least: depEntries.length, scope: 'workspace' });
  }
  const dependencyFrequency: Record<string, number> = {};
  for (const [name, count] of depEntries.slice(0, b.max_dependency_names)) dependencyFrequency[name] = count;

  const markerCoverage: Record<string, Rate> = {};
  for (const marker of MARKER_NAMES) {
    const hits = snapRepos.filter((r) => r.markers[marker]).length;
    markerCoverage[marker] = rate(hits, snapRepos.length);
  }

  const limits: string[] = [
    '.gitignore is not consulted: the committed prune list is deterministic instead, so generated output outside that list is counted as ordinary files',
    'commit subjects are discarded immediately after classification: only conventional-commit type counts and keyword hit counts against the committed vocabulary survive',
  ];
  // A root whose approved path was renamed, deleted, or replaced with a file used to be
  // indistinguishable from a genuinely empty root - all three produced repos_found: 0 with a
  // clean exit. status (above) now carries the distinction through to the snapshot; this is
  // where it becomes a disclosure a report actually renders, rather than a field the report can
  // silently ignore.
  for (const root of snapRoots) {
    if (root.status === 'missing') {
      limits.push(`root '${root.label}' could not be scanned: the approved path no longer exists`);
    } else if (root.status === 'not-a-directory') {
      limits.push(`root '${root.label}' could not be scanned: the approved path is not a directory`);
    }
    if (root.missing_children.length > 0) {
      limits.push(`root '${root.label}': approved director${root.missing_children.length === 1 ? 'y' : 'ies'} not found on disk: ${root.missing_children.join(', ')}`);
    }
  }
  if (anyPrivateScopeCollapsed) {
    limits.push(
      'one or more scoped dependency names were outside the public-scope allowlist and were recorded as "@private-scope" rather than by name, because a private scope commonly names an employer or client',
    );
  }
  if (anyPrivateModuleCollapsed) {
    limits.push(
      'one or more module-path dependency names were hosted outside the public-module-host allowlist and were recorded as "private-module" rather than by name, because a self-hosted or internal host commonly names an employer or client; a private repository on a public host such as github.com is not caught by this guard and is still recorded verbatim',
    );
  }
  for (const ev of events) {
    const totalPhrase = ev.observed !== null ? `exactly ${ev.observed} exist` : `at least ${ev.at_least} exist, the true total is unknown`;
    limits.push(`${ev.cap} reached its budget of ${ev.limit} at ${ev.scope}: ${totalPhrase}`);
  }

  return {
    schema_version: 1,
    type: 'workspace-scan',
    generated_at: meta.generated_at,
    as_of: meta.as_of,
    scanner_version: meta.scanner_version,
    budgets: b,
    roots: snapRoots,
    repos: snapRepos,
    aggregate: {
      total_roots: obs.roots.length,
      total_repos: snapRepos.length,
      dependency_frequency: dependencyFrequency,
      manifest_coverage: manifestCoverage,
      marker_coverage: markerCoverage,
    },
    truncation: { events },
    limits,
  };
}

// --- Doc bundle --------------------------------------------------------------------------------
// spec: "the ephemeral doc-body bundle ... which the skill deletes when it finishes". Reshapes
// the observation's redacted bodies into a flat list keyed by repo_id + path; the io layer is
// what writes this to disk (tools/scan.ts's job, outside content/), never the snapshot.

export interface DocBundleEntry {
  repo_id: string;
  path: string;
  body: string;
}

/** Flattens every repo's docs (already redacted at collection time) into one bundle, sorted by
 *  repo_id then path for determinism. Pure: takes the same observation computeWorkspaceScan
 *  takes, never the snapshot, since the snapshot has already stripped the bodies out. */
export function buildDocBundle(obs: WorkspaceObservation): DocBundleEntry[] {
  const out: DocBundleEntry[] = [];
  for (const root of obs.roots) {
    for (const repo of root.repos) {
      for (const doc of repo.docs) out.push({ repo_id: repo.repo_id, path: doc.path, body: doc.body });
    }
  }
  out.sort((a, b) => {
    if (a.repo_id !== b.repo_id) return a.repo_id < b.repo_id ? -1 : 1;
    return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
  });
  return out;
}
