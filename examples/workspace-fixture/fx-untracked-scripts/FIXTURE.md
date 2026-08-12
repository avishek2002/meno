# fx-untracked-scripts (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. Deliberately different from the other three fixture projects: it carries
no `FIXTURE-git.json` sidecar, so `fixtureGit.isRepo()` returns false for it. The scanner's
`discoverRepos` therefore never treats this directory as a repository boundary - it recurses
into it looking for a nested one, finds none among these loose files, and the directory
contributes zero entries to `snapshot.repos`.

This is the non-repository path: a directory of files with no recognized project boundary is
invisible to the scan, not counted, not walked for markers or manifests. The loose files below
(`backup.sh`, `scratch.py`, `notes.txt`) exist only to give this directory real content to be
invisible about.
