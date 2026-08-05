# Durability spec

*Status: current as of Phase 7 - written before the tooling, per the plan's design-doc-first
rule. Canonical formats owned elsewhere: tenancy boundary in
[repo-and-tenancy.md](repo-and-tenancy.md); vault bootstrap belongs to elicit-needs.*

## Purpose

Closes the two irreversible failure modes: a lost laptop (tenant content exists only on
one machine until mirrored) and an accidental publish (one wrong push exposing a private
vault). Everything else in Meno is regenerable; the learner's history is not.

## How it behaves

1. `tools/meno-init` runs once after cloning: installs the leakage-guard pre-commit hook
   into the clone, creates `content/<tenant>/`, reports which agent CLIs are installed,
   and offers the mirror walkthrough. Re-running is safe (idempotent).
2. The leakage guard blocks any commit that stages a path under `content/` - the
   gitignore already hides tenant files, so the hook exists to stop the one path around
   it (`git add -f`). It prints why and how to undo, never deletes anything.
3. `tools/meno-mirror` backs the tenant up to a private repository of the learner's own:
   - `init <tenant> [remote-url]` - makes `content/<tenant>/` an independent git
     repository (nested, invisible to the outer repo) and wires its remote; with `gh`
     installed and no URL given, offers to create a private GitHub repository.
   - `push <tenant>` - verify, then commit-all and push the tenant snapshot.
   - `restore <remote-url> <tenant>` - on a fresh machine: clone the mirror into
     `content/<tenant>/`.
   - `status <tenant>` - what is unpushed, when the last push happened.
   - `verify <tenant>` - the guard: for a GitHub remote, asserts the repository's
     visibility is PRIVATE (via `gh repo view`) and refuses the push otherwise; a
     local-path remote (the drill case) is allowed with a note; an unverifiable remote
     is a hard stop, not a warning.
4. Degraded path (the documented fallback, usable with zero Meno tooling): create a
   private repository by hand, `git init` inside `content/<tenant>/`, add the remote,
   push. The guide shows the four commands.
5. Privacy guidance lives in the guide: clone-don't-fork (a public fork can never be
   made private), and what leaves the machine (the model provider processes what the
   agent reads and writes).

## Architecture and design decisions

- **The tenant directory is its own independent git repository** (`content/<tenant>/.git`),
  nested inside the gitignored path. Not a submodule: a `.gitmodules` entry would commit
  the tenant's existence and its private URL into the public repo. Not a second remote on
  the outer repo: that would mean force-tracking ignored files, fighting the tenancy
  boundary. The nested shape keeps the public repo structurally ignorant of the mirror.
- **POSIX shell, not Node** - the deliberate exception to the one-runtime rule: restore
  must work on a fresh machine where `npm install` has never run (that is precisely the
  disaster it exists for), and 150 lines of shell is auditable line-by-line before a
  learner trusts it with private data. Plain `git` plus optional `gh`; no daemons, no
  state outside the tenant repo itself.
- **The mirror's pushes run with hooks scoped off** (`core.hooksPath=` for its own
  invocations): a backup mirror is machine-managed and single-user - global personal
  hooks that enforce collaborative PR flow (this machine blocks direct pushes to main)
  do not apply to it, and a backup that fails because of an unrelated policy hook is a
  backup that silently stops happening.
- **`verify` runs before every push, not just at init** - a remote made public after
  setup is the failure mode that matters; checking once is a ritual, checking always is
  a guard.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `content/<tenant>/**` | read (push), write (restore) | meno-mirror | the learner's vault |
| `content/<tenant>/.git` | create, commit, push | meno-mirror | nested git repo |
| `.git/hooks/pre-commit` (the clone's) | install | meno-init | shell |
| the private mirror remote | push, clone | meno-mirror | git |

## Invariants

1. Nothing under `content/` is ever committable to the outer repository - gitignore by
   default, the leakage hook against force-adds.
2. The public repository never learns the mirror's URL or existence (no submodule, no
   config entry, no committed reference).
3. `verify` precedes every push; a GitHub remote that is not PRIVATE refuses the push.
4. Restore produces a byte-identical tenant tree (content files; the `.git` directory
   itself is the mirror's own).
5. The tooling never deletes tenant files; restore refuses to overwrite a non-empty
   tenant directory.

## Verified by

- `tools/test/mirror.test.ts` - the automated end-to-end drill against a `file://` bare
  remote, run in every gate: init, hook installation, hook blocks a force-added tenant
  file, mirror init + push, wipe, restore, byte-identical tree comparison (content
  files), push refusal paths.
- What the `file://` drill cannot exercise, stated honestly: `gh repo create --private`
  against real GitHub (auth, the visibility flag actually taking effect) and the
  PRIVATE-visibility assertion against a real repository. **Not yet verified** - the
  maintainer should run one real-GitHub drill before first trusting the mirror with real
  content; `verify`'s refusal logic is the standing guard either way, and the manual
  fallback (five git commands) needs no tooling at all.

## Open questions

1. Whether `meno-init` should also install a pre-push guard on the nested mirror repo
   itself (defense against pushing the mirror to a second, public remote added by hand) -
   revisit if real usage grows second remotes.
