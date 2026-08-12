# fx-payments-api (fixture project)

Part of `examples/workspace-fixture/`. See that directory's `README.md` for what this whole
tree is and is not. This project exercises:

- An npm manifest (`package.json`) with a mix of an unscoped public dependency (`express`,
  `stripe`, `dotenv`), a public-scope dev dependency (`@types/node`), and an unscoped dev
  dependency (`jest`, `typescript`) - all real, well-known package names, never a real
  version pin the scanner should keep.
- A lockfile (`package-lock.json`, name only - never parsed).
- A `tests/` directory and a `.test.ts`-suffixed file, plus a continuous-integration config
  under `.github/workflows/`, so the `tests` and `ci` markers both read true.
- `.env`, `id_rsa`, and `credentials.json`, each holding only obviously fake placeholder text
  (`NOT_A_REAL_SECRET=placeholder` and equivalent). Not committed to this tree - the parent
  `README.md`'s "What is not here" explains why - `tools/test/workspace-fixture.test.ts`
  materializes them into a temporary copy before scanning. They exist to prove the secret
  denylist skips a file by name before ever opening it - the scan should record
  `secrets_skipped: 3` for this repository and name none of the three files anywhere.
- `.ts` source files (`src/index.ts`, `src/payments.ts`) whose bodies must never appear
  anywhere the scan writes, because source bodies are never on the doc-body allowlist.
- `README.md`, which carries a fake AKIA-shaped access key and a fake absolute path
  (`/Users/example/...`), so redaction (the key becomes `[REDACTED:token]`) and the
  no-absolute-path guard are both exercised against the same file.
- `link-to-shared`, a real symbolic link (not a directory placeholder) pointing outside this
  project to `../fx-notes-cli/FIXTURE.md`, so `symlinks_skipped` is exercised. The walker
  never follows it, so the target's content is irrelevant to this project's scan.
- `FIXTURE-git.json`, giving this project two commit authors and a `github.com` remote.
