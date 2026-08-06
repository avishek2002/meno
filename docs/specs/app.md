# App spec

*Status: current as of Phase 4; amended at v1.5 (course groups). Canonical formats owned elsewhere: check blocks and
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
8. Course groups: the course list renders under the tenant's own groups from `groups.yml`,
   with an Ungrouped section last for anything no group claims. Create, rename, and delete a
   group, and move a course between groups, from an inline manage mode on the same page - not a
   route of its own, since it edits exactly the list already on screen. Deleting a group deletes
   the grouping and nothing else: its courses reappear under Ungrouped, the same spirit as a
   parked todo. Membership is joined to the tree walk server-side, so a slug the walk no longer
   knows drops out with a warning rather than a dangling entry, and a malformed `groups.yml`
   renders as no groups plus a warning rather than an error page. Every mutation carries the
   same `If-Match` hash discipline as todos, including create - the whole file is rewritten each
   time, so a create can clobber a hand edit exactly as a rename can.
9. Degraded paths: malformed YAML or check payloads render inert with a warning attached
   to the response; a partial curriculum never breaks a page.
10. Self-explanation, in two layers. **Tooltips**: an `InfoTip` disclosure sits beside the
   terms whose meaning is not self-evident (the "Re-read files" action, the mastery table's
   Level / Transfer score / Recognition rate / Next review columns, Due for review, Todos,
   Insights). It is a disclosure button, not a hover-only tooltip - it opens on hover, on
   keyboard focus, or on click (click pins it so the pointer can leave), closes on Escape
   returning focus to the trigger, and carries a 24 by 24 pixel hit area. The bubble is
   positioned `fixed` from the trigger's rect because the mastery tables are
   `display: block; overflow-x: auto` and would clip an absolutely positioned child.
   **The guidebook**: `#/guide` explains what the app is, the four-step loop, what each
   screen does, what the app deliberately will not do (the write-authority seam, in plain
   language), and why re-reading is manual, plus a glossary. Its section links are real URLs
   (`#/guide#glossary`), so the route pattern tolerates one trailing fragment and the page
   scrolls to it, honoring `prefers-reduced-motion`. A "Guide" nav link is present on every
   screen including the no-tenant empty state, which is exactly when help is most wanted.

## Architecture

One process, two halves, one root `package.json`:

- `app/server/` - Node, TypeScript, zero build step (Node type stripping,
  `erasableSyntaxOnly`), `node:http` with a regex route table - no framework. Modules:
  `routes.ts` (the whole surface), `tenant.ts` (discovery + path guard), `tree.ts`
  (walk-on-request + vault index), `markdown.ts` (unified pipeline: remark-parse,
  frontmatter, gfm, three local transforms - wikilinks, callouts, check mounts -
  remark-rehype, rehype-raw, rehype-sanitize, stringify), `checks.ts` (grading),
  `ledger.ts` (the only UI write path to the ledger), `todos.ts` (line-precise ops),
  `groups.ts` (the course-group file, over `lib/groups.ts`), `atomic.ts` (the two write
  disciplines).
- `app/client/` - Vite + React, dependencies react, react-dom, mermaid only; hash
  routing and data fetching hand-rolled. `src/guide/` holds the help copy as client-side
  data: `glossary.ts` (one entry per explained term, read by both the tooltips and the
  guidebook's glossary, so a term can never be explained two ways) and `content.ts` (the
  guidebook's sections). Shipping this as data rather than markdown on disk is deliberate -
  rendering it from the repository would mean a route that reads outside the content root,
  which invariant 6 exists to prevent. Scope is equally deliberate: the guidebook explains
  the app, and links out to `docs/how-meno-works.md` for the journey, rather than
  duplicating a document that would then drift.
- `app/shared/types.ts` - the transport shapes both halves compile against.
- `app/test/` - `node --test` against a real server instance on an ephemeral port, over a
  throwaway copy of the example tenant.

The HTTP surface (base `/api/v1`): reads - `health`, `tenants`, `:tenant/tree`,
`:tenant/course/:course`, `:tenant/lesson/:course/:module/:file`, `:tenant/note?path=`,
`:tenant/todos`, `:tenant/progress`, `:tenant/insights`, `:tenant/ledger`, `:tenant/groups`. `:tenant/insights`
has no write counterpart - it computes `lib/insights.ts`'s `computeInsights` fresh over the
same walk and adds the list of narrative report files under `insights/` (spec:
[insights.md](insights.md)). Writes (the entire write surface) -
`POST :tenant/check/submit`, `POST :tenant/lesson/read`, `POST :tenant/todos`,
`PATCH :tenant/todos/:line`, `POST :tenant/todos/:line/park`, `POST :tenant/groups`,
`PATCH :tenant/groups/:id`, `DELETE :tenant/groups/:id`, and
`PATCH :tenant/course/:course/group`. The four group writes are the todos class of write, not
the ledger class: they write organization, never evidence. Decision 14 exists to stop the UI
claiming a learner knows something, and no group operation appends an event, touches
`mastery.yml`, or edits a course manifest - a fact `app/test/groups.test.ts` asserts directly by
diffing the ledger and `course.yml` across a full round of group operations. There is
deliberately no generic ledger endpoint: no route accepts `event`, `source`, or `level` from a client, and
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
| `content/tenants/<tenant>/groups.yml` | replace (atomic, If-Match) | server, and agents via second-brain | vault-conventions.md, groups.schema.json |
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
8. Exactly one implementation exists for grading, lesson parsing, mastery derivation, markdown
   rendering, and course-group operations - the app imports `lib/`, never re-implements it.
   `lib/groups.ts` is what the server writes through, what `tools/validate.ts` checks with, and
   what defines the format an agent hand-edits.
9. No group route builds a filesystem path from a client-supplied group id or course slug. The
   only file they name is the tenant's own `groups.yml`; an unknown id is a 404 from a lookup,
   never a path that resolves. Group ids are never used as object keys either, so no id can
   reach `Object.prototype`.
10. `groups.yml` is written through the YAML serializer, never string concatenation, and group
   titles are normalized to one length-capped line - a title cannot introduce structure into the
   document that holds it.
11. Help content is client-side data only; no endpoint serves a file from outside the
    content root to render the guidebook or a tooltip.
12. Every explained term has exactly one definition, in `src/guide/glossary.ts`; tooltips
    and the guidebook glossary both render from it rather than restating it.

## Verified by

- Invariants 1-2, 9, 10: `app/test/groups.test.ts` - the full group lifecycle, the
  never-touches-the-ledger and never-touches-`course.yml` assertions, 428 without `If-Match` and
  409 on a stale one, a malformed file rendering inert, a deleted course dropping out with a
  warning, a YAML-metacharacter title round-tripping as text, prototype-shaped ids and body keys,
  traversal-shaped ids, and the title validation bounds. `write-authority.test.ts`'s
  injected-typing-field battery covers the group write routes too.
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
- Invariants 11-12: by construction (no route reads outside the content root; both
  renderers import `GLOSSARY`). Not machine-asserted - a future contributor could add a
  second copy of a definition and nothing would fail.
- The guidebook and tooltips: typecheck, build, and the full suite pass, and the built
  bundle was confirmed to carry the copy. **Not visually verified in a browser** - the
  usual "drive it in both colour schemes" pass could not run in the session that added it
  (no browser automation available), so keyboard operation, the pinned-open behavior, and
  dark-mode contrast of the bubble are reasoned-about rather than observed. Worth one
  manual pass before trusting them.
- "Example course fully navigable": live smoke run recorded in the Phase 4 pull request
  (API walk of tree, course, lesson, submit, todos, progress against the example tenant,
  plus the built client served). Client-side rendering is smoke-verified, not
  unit-tested - a deliberate v1 economy (the logic lives server-side).

- The grouped course list was driven live in a browser against a five-course vault: three
  groups plus Ungrouped, correct counts and ordering, dark mode, and the `Groups` tooltip. The
  group routes were exercised live too (create, move, delete, over HTTP, against a real vault).
  **The inline manage-mode panel was not visually verified** - the browser automation available
  in that session could not reach a loopback page to click the button, so its markup is asserted
  only by the bundle carrying its copy and by its reuse of the todo page's primitives. Worth one
  manual pass, in both colour schemes, as with the guidebook above.

## Open questions

1. Whether a course slug should carry a durable identity beyond the slug itself. Today, deleting
   a course and later creating a different one that reuses its slug silently inherits the old
   group membership. Renaming a course directory is a pre-existing non-goal (slugs are stable
   once created, because wikilinks bind to them), so this is narrow - but it is a real, quiet
   wrong answer rather than a visible failure, and worth revisiting if slug reuse ever happens.
2. Whether group ordering should be editable from the app. Array order in `groups.yml` is display
   order and a hand edit can change it, but the UI deliberately ships no reorder control: it is
   not part of the create/rename/delete/move surface the feature was asked for, and it is the
   first thing to add if a long shelf makes creation order feel wrong.
3. Whether the "Re-read files" action should gain a server-sent-events hint later - only
   if the manual refresh becomes annoying in practice (cut from v1 by design).
4. Whether the loopback `Host` allowlist needs a documented escape hatch. It deliberately
   has none: reaching a `127.0.0.1`-bound socket under some other name is what rebinding
   looks like, so a custom `/etc/hosts` alias or a reverse proxy in front of the app is
   refused today. Revisit if a real deployment needs one, and add an explicit opt-in flag
   rather than widening the default.
