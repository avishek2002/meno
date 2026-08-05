# App spec

*Status: current as of Phase 4. Canonical formats owned elsewhere: check blocks and
callouts in
[generate-module/references/check-formats.md](../../.agents/skills/generate-module/references/check-formats.md),
todos in
[second-brain/references/todo-format.md](../../.agents/skills/second-brain/references/todo-format.md),
vault conventions in
[second-brain/references/vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md),
ledger semantics in [progress.md](progress.md).*

## Purpose

The daily study surface (decision 2): a local-first web app that renders a tenant's vault,
runs recognition checks, tracks progress, and manages todos - reading and writing the same
files Obsidian and the agent use, with no database and no daemon. It is also where the
write-authority seam (decision 14) is enforced in code.

## How it behaves

1. `npm install && npm run build && npm start` serves `http://127.0.0.1:7373`; when no
   built client exists (a fresh clone that skipped the build), the server mounts Vite in
   middleware mode automatically so the documented start path always serves the app
   (`--port` to override; a busy
   port fails loudly rather than silently hopping). `npm run dev` mounts Vite in
   middleware mode in the same process: one port, hot reload.
2. Structure is derived by walking the content root (`content/tenants/` by default,
   `--root` to override - the app browses tenants only, never the community or org
   tiers) fresh on every request - new courses,
   modules, and lessons appear with no registration step. There is no watcher and no
   cache; a "Re-read files" action re-fetches, and files remain the only truth.
3. With no tenant content, every screen shows the onboarding empty state pointing at the
   interview as the way to begin.
4. Lesson pages render sanitized HTML; recognition checks mount as interactive widgets
   (mcq, cloze, flashcard). Grading is server-side: `answer` and `explain` never appear in
   any GET response - they return only in the submit response. Flashcards reveal the
   answer only after the learner self-reports.
5. Each graded submission appends one `scored` event (`source: ui`,
   `level: recognition`); dwelling on a lesson appends one `read` event. Transfer callouts
   render as styled prompts with a "graded in your next review session" badge and no
   input. Progress views derive mastery in memory from the ledger; the server never
   writes `mastery.yml`. The Insights page (`#/t/:tenant/insights`) reads
   `GET :tenant/insights` and renders it in one neutral palette with no pass/fail
   coloring - see [insights.md](insights.md) for the metrics themselves.
6. Wikilinks resolve against a basename index of the vault (unique basename wins,
   ambiguity is treated as unresolved) and navigate in-app; broken links render muted,
   never as errors. Mermaid fences render client-side.
7. Todos: create, edit, complete, and park over `todos.md`, line-precise. Every mutation
   carries an `If-Match` content hash; an Obsidian edit between read and write returns
   409 and the client re-reads. Lines are never deleted - only checked off or parked.
8. Degraded paths: malformed YAML or check payloads render inert with a warning attached
   to the response; a partial curriculum never breaks a page.

## Architecture

One process, two halves, one root `package.json`:

- `app/server/` - Node, TypeScript, zero build step (Node type stripping,
  `erasableSyntaxOnly`), `node:http` with a regex route table - no framework. Modules:
  `routes.ts` (the whole surface), `tenant.ts` (discovery + path guard), `tree.ts`
  (walk-on-request + vault index), `markdown.ts` (unified pipeline: remark-parse,
  frontmatter, gfm, three local transforms - wikilinks, callouts, check mounts -
  remark-rehype, rehype-raw, rehype-sanitize, stringify), `checks.ts` (grading),
  `ledger.ts` (the only UI write path), `todos.ts` (line-precise ops), `atomic.ts` (the
  two write disciplines).
- `app/client/` - Vite + React, dependencies react, react-dom, mermaid only; hash
  routing and data fetching hand-rolled.
- `app/shared/types.ts` - the transport shapes both halves compile against.
- `app/test/` - `node --test` against a real server instance on an ephemeral port, over a
  throwaway copy of the example tenant.

The HTTP surface (base `/api/v1`): reads - `health`, `tenants`, `:tenant/tree`,
`:tenant/course/:course`, `:tenant/lesson/:course/:module/:file`, `:tenant/note?path=`,
`:tenant/todos`, `:tenant/progress`, `:tenant/insights`, `:tenant/ledger`. `:tenant/insights`
has no write counterpart - it computes `lib/insights.ts`'s `computeInsights` fresh over the
same walk and adds the list of narrative report files under `insights/` (spec:
[insights.md](insights.md)). Writes (the entire write surface) -
`POST :tenant/check/submit`, `POST :tenant/lesson/read`, `POST :tenant/todos`,
`PATCH :tenant/todos/:line`, `POST :tenant/todos/:line/park`. There is deliberately no
generic ledger endpoint: no route accepts `event`, `source`, or `level` from a client, and
`ledger.appendUiEvent` - the single exported writer - hard-sets `source: ui`, asserts the
shape, and validates against the narrowed `schemas/ledger.ui.schema.json` before any byte
reaches disk. Three layers; a widening of the main ledger schema can never widen the UI's.

Write disciplines: the ledger is appended with a single sub-4096-byte `write()` on an
`O_APPEND` descriptor (atomic against the agent appending concurrently - no lockfile);
everything else is same-directory temp file + fsync + rename, guarded by `If-Match`.

Security posture for a private vault: bind `127.0.0.1` only; require a loopback `Host`
header; reject foreign `Origin` headers; every request-derived path is rejected on `..`
before resolution, must stay under the content root after resolution, and must not escape
via symlink after `realpath`.

The `Host` check is what closes DNS rebinding, and it is not redundant with the `Origin`
check. Once an attacker's name resolves to `127.0.0.1`, their page is same-origin with the
app, so its requests carry no `Origin` header at all and the `Origin` check never fires;
the `Host` header still names the attacker's domain, and a browser will not let a page
forge it. `Origin` covers ordinary cross-site requests, `Host` covers rebound ones, and
both run before routing so they cover writes and unrouted paths equally.

## Data touched

| Path or endpoint | Access | Owner | Format |
|---|---|---|---|
| `content/tenants/**` (tree, lessons, notes, manifests) | read | server | owned formats |
| `content/tenants/<tenant>/progress/ledger.jsonl` | append (ui events only) | server via `appendUiEvent` | ledger.ui.schema.json |
| `content/tenants/<tenant>/todos.md` | replace (atomic, If-Match) | server | todo-format.md |
| `content/tenants/<tenant>/progress/mastery.yml` | never (derives in memory) | tutor only | progress.md |
| `app/client/dist` | read (static) | build | - |

## Invariants

1. No HTTP endpoint accepts `event`, `source`, or `level` from a client; the literals are
   constructed server-side at exactly two call sites.
2. `appendUiEvent` is the only UI write path to the ledger; it throws on any non-ui,
   non-recognition shape and validates against the narrowed schema.
3. `answer` and `explain` never appear in a GET response body.
4. The server never writes `mastery.yml` and never read-modifies-rewrites the ledger.
5. Correctness never depends on a watcher or cache; every read endpoint rebuilds truth by
   walking the tree.
6. Every request-derived path stays under the content root after realpath.
7. The server binds `127.0.0.1` only, rejects foreign-origin requests, and rejects any
   request whose `Host` header is not a loopback name - both checks run before routing.
8. Exactly one implementation exists for grading, lesson parsing, mastery derivation, and
   markdown rendering - the app imports `lib/`, never re-implements it.

## Verified by

- Invariants 1-2: `app/test/write-authority.test.ts` - hostile injected fields on every
  write route, the appendUiEvent throw, a no-agent-literal source assertion, and a full
  scripted UI session asserting zero gates unlocked, zero transfer evidence gained.
- Invariants 3, 5, 6, 7: `app/test/api.test.ts` - answer-stripping, discovery
  mid-process, traversal/symlink suite, todos line-diff round-trip, If-Match 409, and a
  50-submit + concurrent-agent-appender ledger integrity test. Invariant 7's two header
  checks live in `app/test/write-authority.test.ts`: foreign-origin rejection, rebound
  `Host` rejection with no `Origin` present, the loopback forms that must still pass, and
  coverage of a write route and an unrouted path. Forging a `Host` header needs
  `helpers.ts`'s `rawRequest`, because `fetch` replaces a caller-supplied one.
- Invariant 4: by construction (no code path); the ledger check re-asserts at rest.
- "Example course fully navigable": live smoke run recorded in the Phase 4 pull request
  (API walk of tree, course, lesson, submit, todos, progress against the example tenant,
  plus the built client served). Client-side rendering is smoke-verified, not
  unit-tested - a deliberate v1 economy (the logic lives server-side).

## Open questions

1. Whether the "Re-read files" action should gain a server-sent-events hint later - only
   if the manual refresh becomes annoying in practice (cut from v1 by design).
2. Whether the loopback `Host` allowlist needs a documented escape hatch. It deliberately
   has none: reaching a `127.0.0.1`-bound socket under some other name is what rebinding
   looks like, so a custom `/etc/hosts` alias or a reverse proxy in front of the app is
   refused today. Revisit if a real deployment needs one, and add an explicit opt-in flag
   rather than widening the default.
