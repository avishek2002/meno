# Subject finder spec

*Status: new subsystem (2026-08-12). Canonical formats owned elsewhere: vault conventions
(wikilinks, hub notes) in
[second-brain/references/vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md);
todo syntax in
[second-brain/references/todo-format.md](../../.agents/skills/second-brain/references/todo-format.md);
the learning contract in
[elicit-needs/references/profile-format.md](../../.agents/skills/elicit-needs/references/profile-format.md);
pack layout in [content/community/README.md](../../content/community/README.md); narrative
report format in
[find-subjects/references/report-format.md](../../.agents/skills/find-subjects/references/report-format.md).
This spec owns the workspace-scan snapshot contract, the consent model, the privacy
guards, and the candidate-routing rules. The machine contract for the snapshot is
`schemas/workspace-scan.schema.json`; for the narrative report,
`schemas/subjects.schema.json`.*

## Purpose

Meno's front door assumes the learner already knows what they want to learn. `elicit-needs`
opens with "when this works, what will you be able to DO", which is the right question for
someone who arrived with a subject in mind and the wrong one for someone who suspects they
are under-using their own tools but cannot name the gap. That person is exactly who Meno's
namesake paradox describes: they cannot search for what they do not know to look for.

A workspace is evidence about that person. The repositories they commit to, the
dependencies they pull, the markers they never adopted (no tests directory, no continuous
integration config, no lockfile) are behavioural facts, not self-report - and
`elicit-needs` already holds that behavioural evidence outranks self-assessment, which is
why it runs a live probe rather than trusting a menu answer. This subsystem gathers that
evidence at breadth, turns it into observations that cite themselves, and proposes course
candidates routed either to an existing community pack or to a fresh interview.

It is deliberately not an autonomous recommender. It reads only what the user approved, it
is invoked only by the user, and it hands off to `elicit-needs` rather than generating a
course, because a contract the learner confirmed is what every downstream skill depends on.

## Boundaries

- **This subsystem owns topic candidates.** Candidate generation moved out of
  `study-insights` in this same change (AGENTS.md: each canonical format has one owner).
  `study-insights` keeps observations, stuck points, and suggestions derived from study
  data; it no longer proposes subjects.
- **It does not read the ledger.** It has no view of study history, mastery, or reviews.
  Two signals that only `computeInsights` can see - `vault.referenced_but_untaught` and
  `usage.planned_debt` - stay in `study-insights` as an observation and a suggestion
  respectively, because find-subjects structurally cannot act on either.
- **It does not write a course, a profile, or a ledger line.** Write authority (decision
  14) is unchanged.

## How it behaves

1. `collectWorkspace(roots, budgets, git)` (`lib/workspace-scan-io.ts`) performs every
   filesystem read and returns raw observations - counts, enumerations, git log fields. It
   makes no decisions and derives nothing.
2. `computeWorkspaceScan(observation, meta)` (`lib/workspace-scan.ts`) is pure: given the
   same observation and meta it returns byte-identical JSON. It imports no `node:fs`, no
   `node:child_process`, and never reads the clock - `as_of` is a parameter, mirroring the
   rule `lib/mastery.ts` and `lib/insights.ts` already hold to.
3. **The scanner is the only reader.** The skill never opens a workspace file itself. Doc
   bodies the report needs are emitted by the scanner, already redacted, into an ephemeral
   bundle outside `content/` which the skill deletes when it finishes. This is the load
   bearing guard: it is what makes "no source code bodies", "read depth capped", and "no
   raw paths in the report" deterministic rather than advisory. See Limits for the part of
   it that remains advisory.
4. **Consent precedes reading, and binds per child, not per root.** `node tools/scan.ts
   <tenant-dir> --enumerate` lists candidate roots with file counts and reads no file
   contents. `--read` refuses any root absent from `workspace/roots.yml` outright. For a root
   present in `workspace/roots.yml`, every approved child directory is scanned individually;
   a child directory that is new since approval, or was never approved, is skipped on its own
   and surfaced as `pending_approval`, never treated as a veto over the rest of the root.
   Approving a subset of a root's children is expected, not an edge case: it is exactly what a
   workspace holding client or employer repositories alongside the user's own requires. An
   approved child directory that no longer exists on disk (renamed or deleted since approval)
   is skipped without error and named separately, in `missing_children`, distinct from
   `pending_approval` because it was approved and is simply gone rather than present-but-never-
   approved. Approval binds what was approved, not the root forever. `--read` writes
   `workspace/YYYY-MM-DD-scan.json` by default (`--no-write` skips persisting it, for
   inspection only).

   `workspace/roots.yml` (`lib/workspace-scan-io.ts`'s `loadApprovedRoots`) holds one entry
   per approved root, each with three required fields: `label` (the user-authored name every
   downstream artifact carries instead of a path), `path` (the root's absolute local path),
   and `approved_children` (the sorted directory names present directly under `path` at
   approval time, which a fresh `--read` diffs against to find `pending_approval` drift). An
   entry missing `label` or `path` is dropped as a load error, not silently scanned around.
   `path` is the one field in this whole subsystem that legitimately carries an absolute
   path - the file itself is gitignored tenant content, never committed, which is exactly what
   keeps every artifact this subsystem writes downstream (the snapshot, the report, the
   evidence packet) carrying only the label.
5. **Secrets are skipped by name, never opened.** A denylist (below) is checked before any
   open. Doc-body reading is additionally an allowlist, so a file must be positively
   recognised as documentation to be read at all. The snapshot records
   `secrets_skipped: <integer>` per root with no filenames and no locations, because "there
   is a `credentials.json` under `clients/acme`" is itself a location fact.
6. **Redaction happens at emit, not after.** Known credential prefixes, high-entropy runs,
   and internal host names are replaced in doc bodies before they leave the scanner, so no
   agent ever holds the original bytes.
7. **Budgets are declared and truncation is reported.** Every cap that binds appends a
   `TruncationEvent` carrying the cap name, its limit, and `at_least` (the walker stops, so
   the true total is honestly unknown), plus a plain-language line in `limits`. The
   subsystem never silently caps. Truncation itself is detected by explicit boolean flags
   the walker sets (`files_truncated`, `docs_truncated`, `commits_truncated`,
   `repos_truncated`, `depth_truncated`, `doc_files_truncated`) the moment it actually finds
   one item past a cap and stops - never inferred from a count after the fact, because a
   count that is capped by construction (`root.repos.length` can never exceed
   `max_repos_per_root` once the walker enforces it, for instance) looks identical whether
   the true total landed exactly on the cap or well beyond it. This distinction is why an
   earlier version of this scanner emitted false disclosures: a collection that landed
   exactly on a budget, with nothing beyond it, still reported truncation and an unknown
   true total.
8. The `find-subjects` skill (user-invoked only, never automatic) writes a dated narrative
   report interpreting the snapshot. Every structural fact in the report must appear in the
   snapshot; the skill quotes, it never computes and never infers a fact the scan did not
   observe.
9. An accepted candidate produces an evidence packet that `elicit-needs` reads to
   pre-answer `prior_level` and `user_sources` with observed anchors. The learner still
   confirms them, and the live probe still outranks them.
10. **A root that cannot be scanned is distinguished from one that scanned clean and empty.**
    `collectWorkspace` resolves each approved root's path once per run and records a `status` of
    `ok`, `missing` (the path no longer exists), or `not-a-directory` (the path resolves to a
    file) on that root's entry in both the observation and the snapshot. A non-`ok` status always
    carries `repos_found: 0`, `pending_approval: []`, and `missing_children: []`, since nothing
    was walked - before this field existed, a renamed or replaced approved root produced exactly
    the same snapshot as a
    genuinely empty one, silently confident. `tools/scan.ts`'s summary and the snapshot's own
    `limits` array both name a non-`ok` status by root label.
11. **A workspace with too little evidence does not get a confident report.** Below a minimum
    bar - fewer than two repositories across every scanned root, or zero repositories carrying
    any manifest and zero carrying any allowlisted documentation file - the `find-subjects` skill
    says plainly that the workspace does not carry enough evidence to propose a candidate, rather
    than writing observations and candidates from almost nothing, and offers a fresh
    `elicit-needs` interview instead: naming a topic directly never needed this subsystem. See
    [find-subjects/SKILL.md](../../.agents/skills/find-subjects/SKILL.md)'s thin-evidence check.

## Architecture

```mermaid
graph TD
    subgraph ws [User workspace - outside the repo]
        R1[approved root]
    end
    RY[workspace/roots.yml<br/>consent record] --> IO
    R1 --> IO[lib/workspace-scan-io.ts<br/>collectWorkspace - all IO]
    IO -->|raw observations| C[lib/workspace-scan.ts<br/>computeWorkspaceScan - pure]
    C --> SNAP[workspace/YYYY-MM-DD-scan.json<br/>structural, paste-safe]
    IO -->|redacted bodies| BUN[scratch bundle<br/>outside content/, ephemeral]
    SNAP --> SK[find-subjects skill]
    BUN --> SUB[doc-reading sub-agent<br/>returns findings, not quotes]
    SUB --> SK
    SK --> NOTE[subjects/YYYY-MM-DD-subjects.md]
    SK --> PKT[subjects/evidence-packet.json]
    PKT --> EN[elicit-needs]
    NOTE --> HUB[subjects/subjects-hub.md] --> HOME[home.md]
    SNAP -.checked by.-> VAL[validate's workspace-scan<br/>and subjects checks]
    NOTE -.checked by.-> VAL
    PKT -.checked by.-> VAL
    HUB -.checked by.-> VAL
```

- `lib/workspace-scan.ts` - `computeWorkspaceScan`, the one pure derivation.
- `lib/workspace-scan-io.ts` - the walker, the consent loader, the redactor, and an
  injectable `GitProbe` so the committed fixture needs no nested `.git` directory.
- `tools/scan.ts` - the CLI (`npm run scan`), the only caller that reads the clock.
- `schemas/workspace-scan.schema.json` - the snapshot contract.
- `schemas/subjects.schema.json` - narrative report frontmatter contract.
- `.agents/skills/find-subjects/` - the skill; report format owned by
  `references/report-format.md`.
- `tools/validate.ts`'s `workspace-scan`, `subjects`, and `workspace-fixture` checks.
- `examples/workspace-fixture/` - the committed fixture workspace and its golden snapshot.

**No app endpoint.** Every route the localhost server exposes today is confined to the
content root; a handler that walks arbitrary user directories would be a new class of
traversal surface on a long-running daemon, for a snapshot consulted once when choosing a
course. If a page is wanted later it reads the written snapshot file and never scans in the
request path.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `content/tenants/<tenant>/workspace/roots.yml` | read, and write on approval | `find-subjects` skill | this spec |
| approved workspace roots | read only, consent-gated, depth-capped | `lib/workspace-scan-io.ts` | this spec |
| `content/tenants/<tenant>/workspace/YYYY-MM-DD-scan.json` | write (CLI) | `tools/scan.ts` | workspace-scan.schema.json |
| `content/tenants/<tenant>/subjects/YYYY-MM-DD-subjects.md` | write (agent, `find-subjects` only) | `find-subjects` skill | report-format.md |
| `content/tenants/<tenant>/subjects/subjects-hub.md` | write (agent, `find-subjects` only) | `find-subjects` skill | vault-conventions.md hub anatomy |
| `content/tenants/<tenant>/subjects/evidence-packet.json` | write (`find-subjects`), read (`elicit-needs`) | `find-subjects` skill | this spec |
| `content/tenants/<tenant>/home.md` | amend derived block, link only | `find-subjects` skill | vault-conventions.md |
| ephemeral doc-body bundle (outside `content/`) | write (CLI), read (skill), deleted at skill exit or by the next `--read` | `tools/scan.ts` | this spec |
| `content/tenants/<tenant>/progress/**` | never read, never written by this subsystem | - | progress.md |

## Privacy guards

**Identifiers.** The snapshot carries no absolute path. A root is identified by the label
the user chose at approval time; `root_id = sha256(label).slice(0, 12)` derives from that
label alone, never from the filesystem path, so the id is stable across machines and
checkout locations, not merely across repeated runs on one machine - a golden snapshot or a
scan artifact stays byte-identical no matter where the workspace or this repository happen
to be checked out. `workspace/roots.yml`'s loader enforces the uniqueness this depends on: a
label repeated across two entries is a load error, not a silent `root_id` collision. A
repository carries its basename, an integer `depth`, and
`repo_id = sha256(root_id + relative_path).slice(0, 12)` - never intermediate path segments
and never an absolute component, since `relative_path` is always root-relative. Doc files
carry repository-relative paths in the snapshot and are banned from the narrative report,
because the snapshot is gitignored tenant content and the report is the artifact that
travels.

**Git remotes** collapse to a closed vocabulary (`github.com`, `gitlab.com`,
`bitbucket.org`, `codeberg.org`, `self-hosted`, `null`). An internal git host name is an
employer identifier.

**Dependency names** are recorded verbatim when unscoped (`react`, `django`, `terraform` are
public registry identifiers, not user data). A scoped npm name (`@scope/name`) is recorded
verbatim only if `@scope` is in a committed allowlist of well-known public scopes
(`lib/workspace-scan.ts`'s `PUBLIC_NPM_SCOPES`); every other scope collapses to the literal
`@private-scope`, still counted but never named, because a private scope commonly names an
employer or client. Version strings are never recorded, only names.

**Module paths carry the same risk and get the same treatment.** A dependency name that is
a module path (it contains a slash and its first segment contains a dot, so that segment is
a host) is recorded verbatim only when its host is in `PUBLIC_MODULE_HOSTS`; every other
host collapses to `private-module`. This catches a self-hosted or internal module server.
It deliberately does not blanket-collapse module paths: almost every Go dependency is
`github.com/org/repo`, so collapsing all of them would erase the dependency signal for an
entire ecosystem, which is the mistake an earlier iteration of this scanner made and had to
reverse. What it cannot catch is recorded in Limits.

**Commit subjects are never stored.** Only conventional-commit type counts and hit counts
against a keyword vocabulary committed in this repository - the vocabulary is our data, not
the user's.

**Secret-file denylist** (checked before any open; matched case-insensitively):
`.env`, `.env.*`, `*.env`, `.envrc`, `credentials`, `credentials.json`, `token.json`,
`*.pem`, `*.key`, `*.p12`, `*.pfx`, `*.jks`, `*.keystore`, `*.ppk`, `id_rsa*`, `id_dsa*`,
`id_ecdsa*`, `id_ed25519*`, `.npmrc`, `.netrc`, `_netrc`, `.pgpass`, `.htpasswd`,
`.git-credentials`, `*service-account*.json`, `*serviceAccount*.json` (the real Google
default filename has no hyphen; the hyphenated glob alone misses it), `.pypirc`,
`.dockercfg`, `.my.cnf`, `.s3cfg`, `kubeconfig`, `auth.json`, `local.settings.json`,
`secrets.yaml`, `secrets.yml`, `wp-config.php`, `*.mobileprovision`, `.Renviron`,
`*.tfvars`, `terraform.tfstate*`, `*.keychain`; and the directories `.ssh/`, `.aws/`,
`.gnupg/`, `.docker/`, `.kube/`, `.config/gh/`, `.vercel/`, `.netlify/`.

**Doc-body allowlist** (a file must match to be read at all): `README*`, `AGENTS.md`,
`CLAUDE.md`, `CONTRIBUTING.md`, `PROGRESS*.md`, `*.md` at repository root, and `docs/**/*.md`
to depth 3 - each at most 256 KB and valid UTF-8.

**Content redaction before emit**, applied in this order:

1. Known credential prefixes (`sk-ant-`, `sk-`, `AKIA`/`ASIA` plus 16 uppercase
   alphanumerics, `ghp_`/`gho_`/`ghu_`/`ghs_`/`ghr_`, `github_pat_`,
   `xoxb-`/`xoxa-`/`xoxp-`/`xoxr-`/`xoxs-`, `AIza`, `ya29.`, `glpat-`, `npm_`, `dop_v1_`,
   `SG.`, `sk_live_`/`pk_live_`/`rk_live_`, PEM private-key headers, and JSON Web Token
   shapes) become `[REDACTED:token]`.
2. A connection-string credential (`scheme://user:pass@host`) has only its credential
   portion replaced - `postgres://admin:hunter2@db.example.com` becomes
   `postgres://[REDACTED:credential]@db.example.com` - so the scheme and host survive as a
   useful observation ("a postgres connection string") rather than disappearing entirely.
3. An HTTP `Basic` or `Bearer` auth header has its credential material replaced
   (`Basic [REDACTED:token]`, `Bearer [REDACTED:token]`); the scheme word is left in place
   for the same reason.
4. A generic `key: value` or `key=value` assignment redacts when the key name matches
   `api_key|secret|token|password|passwd|pwd|credential|private_key` (case-insensitive,
   `_`/`-` interchangeable) and the value is 6 or more non-whitespace characters, including
   a value on the line after its key. 6, not 8: the worked example this rule exists to
   catch ("password: hunter2") is itself only 7 characters, and the cost asymmetry below
   argues for the lower bar anyway.
5. A bare 32- or 40-character hexadecimal run - the exact length of an MD5 or SHA-1 hex
   digest, and the overwhelmingly common shape for a hex-encoded API key or hash - becomes
   `[REDACTED:token]` unconditionally, with no diversity gate, unlike rule 6 below.
6. Any other run of 24 or more base64/hex-alphabet characters carrying at least
   log2(12) bits of alphabet diversity - measured as the base-2 logarithm of the count of
   distinct characters used in that run, not frequency-weighted Shannon entropy - becomes
   `[REDACTED:token]`.
7. RFC1918 addresses and `.local`/`.internal`/`.corp` host names become `[internal-host]`.

The distinct-character measure in rule 6 matters and an earlier draft of this spec got it
wrong. Frequency-weighted Shannon entropy over a 16-symbol hexadecimal alphabet cannot
exceed 4.0 bits per character and real strings score below it, so a threshold of "Shannon
entropy at or above 4.0" would never have fired on a hexadecimal secret - a guard that
reads as present and does nothing. Distinct-character diversity fires as intended, and the
bar itself is deliberately lower than requiring every one of the sixteen hex digits to
appear: measured empirically, requiring all sixteen meant the large majority of random
32- and 40-character hex tokens were never redacted at all, because a random 32-character
draw from a 16-symbol alphabet has an expected distinct count of only around 14. Requiring
12 of 16 possible hex digits instead is what a random hex token clears in practice.

**Traversal confinement:** the approved root's own path is resolved with `realpath` once,
at the start of a walk; there is no per-candidate `realpath` call and no check that a
descendant escaped the root. The actual guard is that symbolic links are never followed
(counted as `symlinks_skipped`), so nothing the walker visits can lead it outside the root
without a real, non-symlink boundary; the walker also prunes `.git/`, `node_modules/`,
`.venv/`, `venv/`, `vendor/`, `.terraform/`, `dist/`, `build/`, `target/`, `__pycache__/`,
`.next/`.

## Budgets

Whether a cap actually bound during a scan is decided by the walker's own boolean flags, set
the moment it finds one item past the cap, never inferred from a count after the fact - see
"How it behaves" item 7 for why the distinction is load-bearing.

| Cap | Default | Why |
|---|---|---|
| `max_roots` | 8 | More than a handful of approved roots is a sign the user approved a home directory rather than a workspace |
| `max_repos_per_root` | 100 | Covers a heavy development machine |
| `max_depth` | 6 | Deeper than any conventional project nesting once the prune list applies |
| `max_dir_entries` | 2000 | A single directory larger than this is generated output |
| `max_files` | 50000 | Comfortably covers a real workspace once the prune list applies; without pruning one `node_modules` alone exceeds 30000 |
| `max_commits_per_repo` | 200 | Roughly a 90 day window at typical commit rates, which is what the recency bucket needs |
| `max_doc_files` | 40 | The bound on what a sub-agent reads in full |
| `max_doc_files_per_repo` | 3 | Prevents one documentation-heavy repository consuming the whole budget |
| `max_dependency_names` | 200 | Caps `aggregate.dependency_frequency`'s ranked list so a workspace with an unusually large dependency surface doesn't produce an unbounded artifact |

## Determinism

1. Directory entries are sorted with `Buffer.compare` on the raw name, never
   `localeCompare` - locale-dependent ordering is the likeliest cross-machine diff.
2. Recursion is per-directory, so one unreadable subtree degrades to `unreadable_dirs`
   rather than erasing the scan.
3. No modification times anywhere: a fresh checkout rewrites them.
4. `.gitignore` is deliberately not implemented - `git check-ignore` consults the user's
   global ignore file, which is machine-dependent by construction. The committed prune list
   is deterministic instead, and the residue is disclosed in `limits`.
5. Git runs as `git --no-pager -c log.showSignature=false log --format=%cs%x09%an%x09%s -n
   <max>` with `GIT_OPTIONAL_LOCKS=0`, `GIT_CONFIG_NOSYSTEM=1`, `GIT_CONFIG_GLOBAL=/dev/null`,
   `LC_ALL=C`, and a failure yields `null` rather than throwing. `GIT_CONFIG_NOSYSTEM`
   suppresses only the system-wide config (`/etc/gitconfig`); it does nothing about the
   invoking user's own `~/.gitconfig`, which git otherwise still reads. `GIT_CONFIG_GLOBAL=
   /dev/null` closes that gap by pointing git at an empty file in place of it, so a setting
   the user happens to carry globally - `i18n.logOutputEncoding` re-encoding a non-ASCII
   author name into different raw bytes is a verified case - cannot make the same commit
   scan differently on one machine than another.

## Report structure

Three tiers, deliberately unequal in how much they are allowed to claim.

- **Observations** state only what the scan proves, each citing the snapshot field it came
  from. The workspace is the source; no web citation is needed or wanted.
- **Alternatives** are capped at five in total. Every named tool carries a verified live
  source per `source.schema.json`, so `audit-citations` can re-check it later. Scarcity is
  the design: an uncited tool recommendation is the exact failure mode Meno's own
  `limits-of-agent-generated-content` pack teaches.
- **Candidates** are phrased as outcome statements with the observed evidence that
  motivates them, never bare topic names - "a topic name is not a goal" is `elicit-needs`'
  rule and it binds here. Each is routed: to a community pack when
  `content/community/INDEX.md` covers it, otherwise to a fresh `elicit-needs` interview.

## Invariants

1. `computeWorkspaceScan` is pure: identical inputs produce byte-identical output, and
   `lib/workspace-scan.ts` imports neither `node:fs` nor `node:child_process` and never
   reads the clock.
2. No absolute path, home-directory prefix, or approved-root path appears anywhere in the
   serialized snapshot, the narrative report, or the evidence packet.
3. No file matching the secret denylist is ever opened, and no denylisted filename appears
   in the snapshot - only a per-root `secrets_skipped` count.
4. Only allowlisted documentation files have their bodies read; no source file body is ever
   emitted.
5. `--read` against a root absent from `workspace/roots.yml` exits non-zero having read
   zero files. Within an approved root, a child directory that is new since approval, or was
   never approved, yields `pending_approval` and is never scanned, while every other,
   approved sibling is scanned normally - approving a subset of a root's children never
   silently scans nothing.
6. Symbolic links are never followed; a symlinked directory contributes zero files and
   increments `symlinks_skipped`.
7. Every cap that binds appears in `truncation.events` and produces a `limits` line.
8. Two scans of the fixture are `JSON.stringify`-identical to each other and to the
   committed golden snapshot.
9. Redaction happens before emit: a documentation body containing a credential-shaped token
   yields `[REDACTED:token]` and none of the original bytes.
10. The subsystem never appends a ledger event, writes `mastery.yml`, or creates a
    `profile.md`; `elicit-needs` remains the only owner of the learning contract.
11. Every structural fact in a narrative report traces to a field in that day's snapshot.
12. A root whose approved path is missing or is not a directory never reports `status: 'ok'`;
    every other root does.

## Verified by

- Invariants 1, 6, 7, 8: `tools/test/workspace-scan.test.ts` (source greps for `node:fs`,
  `node:child_process`, `Date.now(`, argument-less `new Date()`, and `localeCompare`;
  double-run equality; the golden comparison; an all-budgets-set-to-one truncation run).
- Invariants 2, 3, 4, 9: `tools/test/workspace-scan.test.ts` against a fixture root seeded
  with `.env`, `id_rsa`, `credentials.json`, a source file, and a README containing a
  credential-shaped token and an absolute path.
- Invariant 2 for written artifacts: `tools/validate.ts`'s `workspace-scan` and `subjects`
  checks, error-level on this subsystem's own artifacts (a scan snapshot, a dated subjects
  report, the evidence packet, the hub note) - not warning-level elsewhere in the vault,
  simply not run there at all. These checks are also not part of the standard gate by
  default: `tools/validate.ts`'s default targets are `examples/`, `content/community/`, and
  optionally `content/org/`, none of which ever contain `content/tenants/`. Invariant 2 is
  actually enforced only when something runs `node tools/validate.ts
  content/tenants/<tenant>` against a real tenant directory, which the `find-subjects` skill
  now does as protocol step 9 (`.agents/skills/find-subjects/SKILL.md`). `npm run gate`
  alone does not cover it.
- Invariant 5: `tools/test/workspace-scan.test.ts` (non-zero exit and a zero open count
  against an unapproved root; a child-drift fixture; a partial-approval fixture asserting
  that an unapproved sibling contributes zero repositories and leaks no file or documentation
  content anywhere in the snapshot or the doc bundle, while its approved siblings are scanned
  normally; a missing-approved-child fixture).
- Invariant 10: by construction, plus the existing write-authority test.
- Invariant 11: `tools/validate.ts`'s `subjects` check.
- Invariant 12: `tools/test/workspace-scan.test.ts` (a root pointed at a nonexistent path yields
  `status: 'missing'`; a root pointed at a regular file yields `status: 'not-a-directory'`; a
  genuinely empty real directory yields `status: 'ok'` and none of the three is conflated with
  another).

## Limits

The chokepoint makes most of this deterministic, but not all of it:

1. **Paraphrase leakage is not machine-catchable.** A validate check can catch a path shape
   or a credential shape. It cannot catch a faithful paraphrase of a client's architecture
   written into a report. The report is a tenant artifact and `publish-to-community`
   already sanitises whole files, but the user reviewing the report before it travels is
   the real control.
2. **User-invoked only is instructed, not enforced.** Nothing prevents an agent offering to
   run this. The consequence is bounded, because the scanner still refuses to read anything
   without a recorded approval.
3. **Identifying names that are not secrets** - a repository directory named for a client,
   a product name in a README title - survive every regular-expression guard. This is the
   same class `publish-to-community`'s sanitisation rules already name as uncatchable.
   A specific instance worth stating outright: the module-host allowlist collapses a
   self-hosted module server, but a **private repository on a public host** is
   indistinguishable from a public one without network access, so
   `github.com/acme-corp/billing` is recorded verbatim. The scan is deliberately offline,
   so this cannot be fixed by the scanner; the user reviewing the report before it travels
   is the control.
4. **Generated files outside the committed prune list are counted** as ordinary files,
   because `.gitignore` is deliberately not consulted.
5. **A bind mount or filesystem firmlink inside an approved root is still walked.** The
   confinement guard is never-follow-symlinks, not a per-candidate escape check (see
   Traversal confinement above); a bind mount or firmlink is not a symbolic link, so the
   walker treats it as ordinary directory content and reads whatever it points at.
6. **The manifest parsers are deliberately shallow** - a bounded regex or a hand-rolled line
   scanner, never a real TOML/PEP 508/go.mod grammar, matching this repo's
   zero-dependency-tooling preference. Each still knowingly misses cases that a full parser
   would not, disclosed here rather than silently: `pyproject.toml` does not read poetry
   dependency groups other than the main table
   (`[tool.poetry.group.dev.dependencies]`), PEP 735 dependency-groups, or any
   `dependencies` a build backend computes dynamically rather than lists literally, and its
   TOML section matcher still does not understand inline tables written as a section header
   (`project = { ... }`) or array-of-tables syntax (`[[...]]`). `requirements.txt` skips an
   option line (`-r`, `-e`, `--index-url`, ...) and a VCS/URL requirement outright rather
   than naming it, and discards extras and environment markers the same way the pyproject
   parser does. `go.mod` does not consult replace or exclude directives, so a module still
   lists as a dependency even when replaced with a local path, and does not distinguish a
   `// indirect` dependency from a direct one. `Cargo.toml` does not recognise a
   target-specific table (`[target.'cfg(windows)'.dependencies]`) as a dependency source at
   all. None of these throw or corrupt other results - each yields fewer names than a full
   parser would, which is the acceptable "miss" this section exists to distinguish from a
   parser reporting something wrong.
7. **The ephemeral doc-body bundle can outlive an aborted run.** It is written into the system
   temporary directory (`os.tmpdir()`, "Data touched" table above) and is deleted only by the
   `find-subjects` skill's own cleanup step ("How it behaves" item 3) once it finishes, or by the
   next `--read`'s self-heal (`tools/scan.ts` removes any bundle a previous run left behind before
   writing its own, printing one line when it does). An abort between the scan and either of those
   two points - the skill crashing, the session ending, the user closing the terminal - leaves the
   bundle sitting on local disk in the meantime. Kept in proportion: every body inside it is
   already redacted at emit (Privacy guards, "Content redaction"), so what persists is a redacted
   doc body, not a raw one - real disk exposure, but a bounded one, and self-healing rather than
   accumulating without limit.

## Open questions

1. Whether the doc-body allowlist should further restrict repository-relative paths to
   well-known names. `docs/architecture.md` is safe to record; `clients/acme/notes.md`
   names a client. Recall was chosen over caution here; revisit if a real scan surfaces an
   uncomfortable path.
2. Whether a harness-level permission rule denying reads outside the repository root should
   ship with Meno to enforce the chokepoint mechanically. It would bind every user's
   harness, including uses unrelated to this subsystem, so it is documented as a
   recommendation rather than shipped as configuration.
3. Whether re-confirmation should be time-based (a root approved 90 days ago) in addition
   to the child-drift trigger. Drift is implemented; time is not, for lack of evidence
   about how often a workspace changes shape.
