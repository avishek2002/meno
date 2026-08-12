# fx-infra (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. This project exercises:

- A Go manifest (`go.mod`) with a `require (...)` block and a single-line `require`
  statement, and a Rust manifest (`Cargo.toml`) with `[dependencies]` and
  `[dev-dependencies]`. Every dependency here is a real, well-known public module path or
  crate name (`github.com/...`, `golang.org/x/...`, `serde`, `tokio`) - none point at a
  private or self-hosted host, so this project stays safe to scan alongside a concurrent
  private-module collapsing rule elsewhere in the codebase.
- `go.sum` as the lockfile marker, `Dockerfile` as the dockerfile marker, a `terraform/`
  directory and a `.tf` file as the infrastructure-as-code marker, and `LICENSE` as the
  license marker - the marker kinds `fx-payments-api` and `fx-notes-cli` do not cover.
- A `docs/` directory with two markdown files, exercising the `docs/**/*.md` branch of the
  doc-body allowlist (as opposed to a root-level `README.md`).
- `FIXTURE-git.json`, giving this project two commit authors and a `gitlab.com` remote.
