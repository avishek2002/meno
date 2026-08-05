# Repo and tenancy spec

*Status: current as of Phase 0. Canonical formats owned elsewhere: vault layout and naming in
[second-brain/references/vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md).*

## Purpose

Defines the repository's structural contract: how any agent CLI finds its way in, and the
boundary that keeps a learner's private content permanently separate from the public base.
Without the entry-point contract, each CLI drifts toward its own config file and guidance
forks; without the tenancy boundary, one bad commit publishes someone's learning history.

## How it behaves

1. An agent cold-started in a clone reads `AGENTS.md` first - it is the canonical entry
   point. `CLAUDE.md` exists only as a one-line `@AGENTS.md` import shim so Claude Code
   arrives at the same file. No agent guidance lives anywhere else.
2. From `AGENTS.md` alone, an agent learns: what Meno is, that the interview
   (`elicit-needs`) is the entry point for a new learner, the tenant-privacy rules, where
   the user guide is, and the session-start rule (check for due reviews and actionable
   todos once a tenant exists; propose, never auto-act).
3. Skills resolve from `.agents/skills/<name>/SKILL.md`. Claude Code discovers them through
   `.claude/skills/` relative symlinks; any other CLI reads the SKILL.md files directly -
   each is written to work without native skill support.
4. Anything under `content/` is invisible to git: creating tenant files changes nothing in
   `git status`. The example learner lives under `examples/`, outside `content/`, so no
   ignore rule can ever hide it or leak a real tenant alongside it.
5. `content/` and `org/` are both reserved downstream-owned roots: this repository never
   creates either directory and never commits a file under either path. `content/` stays
   gitignored everywhere (invariant 3 below); `org/` is different in kind, not just in
   name - it exists only inside an organization's own private deployment
   ([docs/org-deployment.md](../org-deployment.md)), where it is meant to be committed to
   that org's repository, not ignored. Upstream's contract is identical either way: it never
   writes there, so `tools/org-sync.sh` can refuse an incoming merge that touches either path
   as proof something has gone wrong, not as a routine check.
6. A fresh clone behaves identically on macOS and Linux: symlinks are committed as symlinks
   and resolve after checkout.
7. Base content renders on GitHub (standard markdown links); tenant content is
   Obsidian-canonical (wikilinks). The committed example tenant uses wikilinks like any
   tenant; its degraded GitHub rendering is accepted.

## Architecture

Two nested worlds with one-way visibility:

- **The base** (everything committed): skills, schemas, docs, app, tools, examples. Public,
  MIT, shared by every clone.
- **The tenant world** (`content/<tenant>/`): gitignored, one directory per learner,
  each an Obsidian vault. Base code and docs may read the committed `examples/` fixtures
  but never a real tenant's content; nothing under `content/` is ever committed, read into
  shared artifacts, or referenced by base content.

Entry-point chain: `CLAUDE.md` (shim) -> `AGENTS.md` (canonical) -> skills, guide, specs.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `AGENTS.md`, `CLAUDE.md` | read | maintainer (via extend-meno rules) | prose |
| `.agents/skills/**`, `.claude/skills/*` (symlinks) | read | maintainer | Agent Skills shape |
| `.gitignore` (`content/` rule) | read | maintainer | git |
| `content/<tenant>/**` | never touched by base | tenant | vault-conventions.md |
| `examples/**` | read (fixtures) | maintainer | same schemas as tenant content |

## Invariants

1. `CLAUDE.md` is exactly one line: `@AGENTS.md`.
2. Every skill is listed in `AGENTS.md` and readable as plain markdown without native skill
   support.
3. No committed file under `content/` or `org/` in this repository; no base file references
   a path under either except as a pattern or example.
4. `.claude/skills/` entries are relative symlinks into `.agents/skills/` (relative, so
   they survive clone and directory moves).
5. Every manifest and lesson carries `schema_version`; consumers tolerate stale versions
   and missing optional fields rather than failing (permissive rendering).

## Verified by

- Cold-start acceptance run (PLAN.md Phase 0): a fresh `claude -p` session in a clean clone
  answers entry-point, privacy, and guide questions from AGENTS.md alone. Recorded in the
  Phase 0 pull request. Only Claude Code exists on the maintainer machine; other CLIs are
  designed-for but unverified.
- Dummy-tenant `git status` check and fresh-clone symlink check (PLAN.md Phase 0),
  re-runnable by hand; Linux symlink behavior holds by construction (git stores symlinks as
  symlinks) but has not been machine-verified here.
- Invariants 1-3: enforced as validate checks from Phase 2 onward
  ([validation.md](validation.md)).

## Open questions

1. Whether Claude Code's native AGENTS.md support (when it ships) removes the shim -
   revisit when it lands; tracked as a ranked risk in PLAN.md.
