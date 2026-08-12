# Workspace-scan fixture

This directory is a committed scanner fixture, not a tenant, not a real workspace, and not
an example someone should study for what a project should look like. It exists so
`npm run gate` can check the workspace-scan subsystem's behavior against a fixed, versioned
input and a fixed, versioned output, rather than a human eyeballing a scan result and hoping
it looks right. See `docs/specs/subject-finder.md` for the subsystem this fixture backs.

## What is here

Four fixture projects, each prefixed `fx-` so it can never be mistaken for a real one, each
carrying a `FIXTURE.md` marker that explains what it exercises:

- `fx-payments-api/` - a Node/TypeScript project with a manifest, a lockfile, a tests
  directory, a continuous-integration config, three secret-named placeholder files (not
  committed - see "What is not here" below), a symlink pointing outside the project, and a
  README containing a fake credential-shaped token and a fake absolute path.
- `fx-notes-cli/` - a Python project (`pyproject.toml` plus `requirements.txt`) with no
  `tests/` directory and no continuous-integration config, on purpose: marker absence is the
  main gap signal the whole `find-subjects` feature rests on.
- `fx-infra/` - a Go and Rust project (`go.mod`, `Cargo.toml`) with a `terraform/` directory,
  a `Dockerfile`, a `LICENSE`, and a `docs/` directory, covering the remaining marker and
  manifest kinds.
- `fx-untracked-scripts/` - loose files with no manifest and no git state at all, so the
  scanner's non-repository path is exercised: this directory is walked looking for nested
  repositories, finds none, and contributes nothing to the scan.
- `fx-scratch-clone/` - a real fixture repository with no manifest, no readme, and one commit,
  exercising the substantive/non-substantive split (`docs/specs/subject-finder.md`): it is
  still discovered and still listed in `snapshot.repos`, but `substantive: false` and it is
  excluded from `aggregate.marker_coverage`, `aggregate.dependency_frequency`, and
  `aggregate.manifest_coverage`'s denominators.
- `fx-agent-tool-cache/` - not itself a repository; stands in for a coding agent's plugin cache
  directory, the exact shape a real scan found diluting a report. A real fixture repository sits
  nested at `cache/plugins/temp_git_9421_a1b2/`, and `cache` is now in `PRUNE_DIRS`
  (`lib/workspace-scan.ts`), so the walker never descends past it: that nested repository never
  appears anywhere in the scan.

Each project directory carries a `FIXTURE-git.json` sidecar instead of a real nested `.git`
directory - git would treat a committed `.git` as a submodule boundary and break checkout of
this repository, which is exactly why `GitProbe` in `lib/workspace-scan-io.ts` is injectable.
`fixtureGit` reads the sidecar (commit dates, authors, subjects, and a remote URL) instead of
shelling out to git.

`expected-snapshot.json` is the golden output of `collectWorkspace` and `computeWorkspaceScan`
run over this tree with a fixed `as_of` date. `tools/test/workspace-fixture.test.ts` asserts
the scan is `JSON.stringify`-identical across two runs and matches this file byte for byte.

## What is not here

No `course.yml`, `profile.md`, `ledger.jsonl`, or `mastery.yml` anywhere in this tree -
`tools/validate.ts`'s `workspace-fixture` check enforces that this stays a scanner fixture and
never becomes a course. No real secret, credential, or private data.

Also not here, on purpose: `fx-payments-api/.env`, `fx-payments-api/id_rsa`, and
`fx-payments-api/credentials.json` are not committed to this tree. A public repository must not
ship files named exactly like real credentials - GitHub secret scanning, every contributor's
own pre-commit hooks, and any organisation's scanners mirror-cloning Meno would flag them in
perpetuity, and a filename match on `id_rsa` or `credentials.json` has no allowlist escape the
way a pattern match does. The fixture does not need these files committed, only present when
the scan runs, so `tools/test/workspace-fixture.test.ts` materializes them instead: it copies
`examples/workspace-fixture/` into a fresh temporary directory and writes the three placeholder
files into the copy before scanning, then scans and compares the golden against that copy. Their
content, when materialized, is inert and obviously fake, exactly as it would be if committed -
purely to prove the secret denylist skips them by name without ever opening them.

## Do not edit casually

A golden snapshot is pinned to this tree's exact bytes. Adding, removing, or editing any file
here - including a `FIXTURE.md` or a `FIXTURE-git.json` sidecar - changes what the scanner
observes and invalidates `expected-snapshot.json`. After any change to this tree, or to
`lib/workspace-scan.ts` / `lib/workspace-scan-io.ts`'s behavior, regenerate the golden with:

```
WRITE_GOLDEN=1 node --test tools/test/workspace-fixture.test.ts
```

then re-run `node --test tools/test/workspace-fixture.test.ts` without the flag to confirm it
is green, and review the diff of `expected-snapshot.json` before committing it - a diff you
did not expect is a bug, not noise to wave through.

`root_id` and `repo_id` in the snapshot are `sha256` hashes of the root's label and the
repository's root-relative path (`docs/specs/subject-finder.md`, "Identifiers") - never of
this fixture's absolute filesystem path. The golden is therefore portable: it matches
byte for byte in this worktree, in a fresh clone, and in CI's runner checkout alike, and only
needs regenerating when the fixture tree or the scanner's own behavior actually changes.
