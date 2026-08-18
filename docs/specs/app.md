# App spec

*Status: current as of Phase 4; amended at v1.5 (course groups) and v1.6 (course-list collapse and
filter; the group write surface removed). Canonical formats owned elsewhere: check blocks and
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
   cache; a "Re-read files" action re-fetches, and files remain the only truth. A page
   registers one revalidate function with `RevalidateContext` (`app/client/src/RevalidateContext.tsx`)
   and must compose every fetch it depends on into it, not only its own - the lesson page's own
   lesson fetch and its `useCourseContext` course fetch both run, and the learner list's own
   `/tenants` fetch and every card's independent `/progress` fetch all run, so "Re-read files"
   never leaves part of a page stale against the rest.
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
   `GET :tenant/todos` is declared stable surface in
   [docs/integration-surface.md](../integration-surface.md), and the two-axis tag rewrite
   (todo-format.md) changes that response's `type` field to a new value set - a breaking
   change to that surface, accepted because no in-house tooling consumes it yet.
8. Course groups, in two layers, read-only to the app. A course already sits under a domain
   directory, so the course list groups by domain with no setup at all; `groups.yml` holds the
   learner's own named groups for what a domain cannot say ("Version Control", "Software
   Fundamentals"), and an explicit group always wins over the domain a course would otherwise
   fall back to. Only a course with no domain - one still at the vault root, from before the
   domain layout - lands in Ungrouped. Both layers are resolved server-side into one ordered
   list of sections, each tagged `source: explicit | domain`, so the client renders sections and
   never re-derives the rule. Membership joins to the tree walk, so a slug the walk no longer
   knows drops out with a warning rather than a dangling entry, and a malformed `groups.yml`
   degrades to the domain layer plus a warning rather than an error page.
   **The app reads this file and never writes it** (v1.6; it had create, rename, delete and move
   routes plus an inline manage panel from v1.5). The explicit layer competes with the domain
   layer rather than complementing it - a course belongs to exactly one group - so a write
   surface for it was the wrong half of the feature to spend four routes and a panel on, and the
   layer that costs the learner nothing is the one that earns its keep. `groups.yml` is authored
   by an agent following `second-brain` or by hand in a text editor, and it remains parsed,
   resolved, schema'd and validated exactly as before. `GET :tenant/groups` is now the whole
   group surface; its `raw_sha256` stays as an honest content hash of the bytes the response was
   read from, useful to a client that wants to notice a hand edit, no longer an `If-Match` token
   because no route takes one for this file.
9. The course list collapses and filters. Each section is a native `<details>`/`<summary>`: the
   summary carries the section title, the number of courses listed under it, and the `by domain`
   marker where the section is the tree showing through. Native is the point - keyboard
   operation, focus order, and the screen-reader disclosure semantics come from the platform
   rather than from a state machine we would have to get right twice. A `Collapse all` /
   `Expand all` control acts on every section at once. A filter input above the list
   substring-matches course titles and slugs, case- and diacritic-insensitively (NFKD with
   combining marks stripped - the same normalization discipline `lib/groups.ts` applies to
   titles and ids, so "cafe" finds "Café" and the other way round). Sections with no match are
   hidden entirely; sections with a match render open whatever their stored state says, and that
   forced opening is never written back. Escape clears the filter. A query that matches nothing
   anywhere gets a no-results line naming the query, never a blank page.
   Open and closed state persists in the browser's `localStorage` under one versioned key per
   tenant (`meno.courseList.open.v1:<url-encoded tenant>`), holding only the sections that differ
   from the default, which is open. A second, distinct key
   (`meno.courseList.resume.v1:<url-encoded tenant>`) holds the lesson last opened - course,
   module, file, and its title - which the course list reads to render a "Resume: <lesson>" link.
   It is written from the lesson page on mount and read from the course list, so it is the one
   piece of view state with two owning pages rather than one: `app/client/src/pages/LessonPage.tsx`
   writes it, `app/client/src/pages/TenantCoursesPage.tsx` reads and writes open state as before.
   Both browser-persisted keys are deliberately disposable: a view preference, never evidence,
   never content, never read by anything that derives progress or moves a gate. Clearing either
   loses a preference and nothing else; a browser that refuses storage degrades to session-only
   and every screen still renders, the resume link simply absent.
   All of the pure logic - the fold, the match, the section assembly, the default-open rule, the
   pruning of stale ids, and both key schemes - lives in `app/client/src/courseList.ts`, a module
   with no React and no DOM references, so `node --test` covers it like the server. It is the one
   piece of client logic in this repository that is unit-tested rather than smoke-tested, and it
   is a `.ts` file among `.tsx` files on purpose: the root `tsconfig` compiles `app/**/*.ts`
   without the DOM lib, so naming a browser global there fails typecheck instead of failing
   review.
10. Degraded paths: malformed YAML or check payloads render inert with a warning attached
   to the response; a partial curriculum never breaks a page.
11. Self-explanation, in two layers. **Tooltips**: an `InfoTip` disclosure sits beside the
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
   `#/t/:tenant/c/:course` tolerates the same shape of trailing fragment
   (`#/t/:tenant/c/:course#<module-slug>`) as a module anchor: each module card on the course
   page carries `id={module.slug}`, `CoursePage` scrolls to it on load the same way `GuidePage`
   does for a section, and a module cell elsewhere in the app (the insights page's planned-debt
   table) links through `courseContext.ts`'s `courseModuleHref` instead of landing on the top of
   the course.
12. `#/t/:tenant/graph` renders the whole tenant vault as one picture, joined to the ledger -
    what is planned but unwritten, what is mastered, and how courses connect. See
    [graph.md](graph.md) for the full behavior.

## Architecture

One process, two halves, one root `package.json`:

- `app/server/` - Node, TypeScript, zero build step (Node type stripping,
  `erasableSyntaxOnly`), `node:http` with a regex route table - no framework. Modules:
  `routes.ts` (the whole surface), `tenant.ts` (discovery + path guard), `tree.ts`
  (walk-on-request + vault index), `markdown.ts` (unified pipeline: remark-parse,
  frontmatter, gfm, three local transforms - wikilinks, callouts, check mounts -
  remark-rehype, rehype-raw, rehype-sanitize, stringify), `checks.ts` (grading),
  `ledger.ts` (the only UI write path to the ledger), `todos.ts` (line-precise ops),
  `groups.ts` (reads the course-group file, over `lib/groups.ts`), `atomic.ts` (the two write
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
`:tenant/todos`, `:tenant/progress`, `:tenant/insights`, `:tenant/ledger`, `:tenant/groups`,
`:tenant/graph`. `:tenant/insights`
has no write counterpart - it computes `lib/insights.ts`'s `computeInsights` fresh over the
same walk and adds the list of narrative report files under `insights/` (spec:
[insights.md](insights.md)). Writes (the entire write surface) - `POST :tenant/check/submit`,
`POST :tenant/lesson/read`, `POST :tenant/todos`, `PATCH :tenant/todos/:line`,
`POST :tenant/todos/:line/park`. Five routes across two files: the ledger and `todos.md`.
`groups.yml` was the third from v1.5 until v1.6 and is now read-only to the app, which is worth
stating rather than leaving as an absence - a group write was never load-bearing, and an agent
or a text editor authors that file better than four routes and a panel did. The smallest write
surface that does the job is the one that can still be reasoned about. There is
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
| `content/tenants/<tenant>/groups.yml` | read | agents via second-brain, or the learner by hand | vault-conventions.md, groups.schema.json |
| `content/tenants/<tenant>/<domain>/` (as the default grouping) | read | `lib/course-dirs.ts` walk | vault-conventions.md |
| `content/tenants/<tenant>/progress/mastery.yml` | never (derives in memory) | tutor only | progress.md |
| `app/client/dist` | read (static) | build | - |
| browser `localStorage`, key `meno.courseList.open.v1:<tenant>` | replace | client | one JSON object, section id to open flag |
| browser `localStorage`, key `meno.courseList.resume.v1:<tenant>` | replace | client | one JSON object: course, module, file, lesson title |

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
   rendering, and course-group resolution - the app imports `lib/`, never re-implements it.
   `lib/groups.ts` is what the server resolves through, what `tools/validate.ts` checks with, and
   what defines the format an agent hand-edits.
9. No route builds a filesystem path from a group id or a course slug supplied by a client. The
   only file the group surface names is the tenant's own `groups.yml`, reached through the tenant
   path guard alone. Section ids are never read as bare object keys either - the client's
   open-state map is read with `Object.hasOwn` - so no id, from a stored value or a hand-edited
   file, can reach `Object.prototype`.
10. The app never writes `groups.yml`. No route mutates it and `lib/groups.ts` exports no mutation,
    so the file has exactly two authors: an agent, and the learner's own text editor.
11. Help content is client-side data only; no endpoint serves a file from outside the
    content root to render the guidebook or a tooltip.
12. Every explained term has exactly one definition, in `src/guide/glossary.ts`; tooltips
    and the guidebook glossary both render from it rather than restating it.
13. The client persists nothing but disposable view state, in `localStorage`, under keys prefixed
    `meno.courseList.open.v1` or `meno.courseList.resume.v1`. No content, evidence, progress, or
    todo is ever kept in the browser, and every screen renders correctly with the store empty,
    full of stale ids, missing a resume record, or unavailable entirely.

## Verified by

- Invariants 9, 10: `app/test/groups.test.ts` - a structural assertion that the route table
  exposes exactly one `groups` route and that it is a `GET`, and that `lib/groups.ts` exports no
  mutation; plus the read-side degraded paths (a malformed file rendering inert, a deleted course
  dropping out with a warning, a traversal-shaped tenant refused). The v1.5 runtime assertion -
  diffing the ledger and `course.yml` across a full round of group operations - retired with the
  operations it exercised. A route that does not exist cannot write, and the structural check is
  what stops one coming back unnoticed; that is the honest way to record an invariant that went
  from enforced to true by construction, rather than leaving a claim pointing at deleted code.
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
- Invariants 12-13 and the collapse/filter behaviour: `app/test/course-list.test.ts` - the fold,
  substring matching on title and slug, diacritic folding both directions, section hiding, forced
  expansion while filtering with the stored state left intact, stale-id pruning measured against
  every section rather than the visible ones, prototype-shaped keys in a stored value, an absent
  and a throwing store, the resume-state round trip and its own degraded paths, and a source grep
  asserting that `localStorage` appears only in `LessonPage.tsx` and `TenantCoursesPage.tsx` (the
  two owners UI-16 gives it) and that `courseList.ts` names no browser global and imports no
  React.

- The grouped course list was driven live in a browser against a five-course vault at v1.5: three
  groups plus a fallback section, correct counts and ordering, dark mode, and the `Groups`
  tooltip. The two-layer resolution (explicit over domain, ordering, id collision, and the
  Ungrouped remainder) is unit-tested in `tools/test/groups.test.ts` and asserted end to end over
  HTTP in `app/test/groups.test.ts`. The v1.5 inline manage panel was never visually verified and
  has been removed at v1.6 rather than verified - the browser automation available in that session
  could not reach a loopback page, and a panel nobody could drive was not worth keeping on the
  strength of the bundle carrying its copy.
  **The v1.6 collapse and filter behaviour is unit-tested but not yet visually verified.** The
  logic is covered by `app/test/course-list.test.ts`, but keyboard operation of the `<details>`
  summaries, focus-visible rings, and both colour schemes are reasoned about rather than observed.
  Worth one manual pass, as with the guidebook above.

## Open questions

1. Whether a course slug should carry a durable identity beyond the slug itself. Today, deleting
   a course and later creating a different one that reuses its slug silently inherits the old
   group membership. Renaming a course directory is a pre-existing non-goal (slugs are stable
   once created, because wikilinks bind to them), so this is narrow - but it is a real, quiet
   wrong answer rather than a visible failure, and worth revisiting if slug reuse ever happens.
2. Whether the explicit group layer earns its place at all now that the app only reads it. Array
   order in `groups.yml` is display order, and both order and membership are a hand edit or an
   agent edit away. If the domain directories turn out to carry the whole load in practice, the
   honest next step is to retire `groups.yml` rather than to grow it back a UI.
3. Whether the "Re-read files" action should gain a server-sent-events hint later - only
   if the manual refresh becomes annoying in practice (cut from v1 by design).
4. Whether the loopback `Host` allowlist needs a documented escape hatch. It deliberately
   has none: reaching a `127.0.0.1`-bound socket under some other name is what rebinding
   looks like, so a custom `/etc/hosts` alias or a reverse proxy in front of the app is
   refused today. Revisit if a real deployment needs one, and add an explicit opt-in flag
   rather than widening the default.
