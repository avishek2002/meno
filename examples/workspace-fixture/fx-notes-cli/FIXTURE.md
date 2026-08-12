# fx-notes-cli (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. This project exercises:

- A Python project with two manifest kinds at once: `pyproject.toml` (PEP 621
  `[project].dependencies`, `[project.optional-dependencies]`, and poetry's
  `[tool.poetry.dependencies]`) and `requirements.txt`, so both parsers run against the same
  repository and their dependency names overlap (`requests` appears in both).
- No `tests/` directory and no continuous-integration config, on purpose - this is the main
  fixture proving marker *absence* is recorded correctly, since absence is the strongest gap
  signal `find-subjects` has.
- `README.md` with clean prose and no seeded secret, so its body should appear verbatim in
  the ephemeral doc bundle while never appearing in the written snapshot.
- `.py` source files whose bodies must never appear anywhere the scan writes.
- `FIXTURE-git.json`, giving this project one commit author and a remote on a host outside
  the closed vocabulary (`git.example-selfhosted.test`), so `remote_host` collapses to
  `self-hosted`.
