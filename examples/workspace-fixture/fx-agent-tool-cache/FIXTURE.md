# fx-agent-tool-cache (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. This directory is not itself a repository (no `FIXTURE-git.json` at its own
root) - it stands in for a coding agent's plugin cache directory, the exact shape a real scan
found diluting a report (`PROGRESS.md`, "The scanner counts scratch git repositories inside
agent tool caches as real projects"). Nested inside it, `cache/plugins/temp_git_9421_a1b2/` is a
real fixture repository (`FIXTURE-git.json`, one commit, no manifest, no readme). `PRUNE_DIRS`
now includes `cache` (`lib/workspace-scan.ts`), so the walker never descends past
`fx-agent-tool-cache/cache/` at all: `temp_git_9421_a1b2` is never discovered, never appears in
`snapshot.repos`, and never contributes to any count.
