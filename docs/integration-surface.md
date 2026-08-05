# Integration surface: what in-house systems may build against

*Status: current as of v1.3. Companion to [org-deployment.md](org-deployment.md) - that page
covers the deployment pattern and RBAC (role-based access control); this page draws the line
around what is safe to write tooling against and what stays a free-to-change implementation
detail.*

## Purpose

Once an organization has deployed Meno ([org-deployment.md](org-deployment.md)), the next
question is always "what can we build against this?" - a dashboard, a sync into an existing
learning record store, a Slack digest of who's overdue for review. This page is the honest
answer: four things are committed as stable, everything else can change release to release
without notice. Treat this as the actual contract; treat everything not on this page as an
implementation detail regardless of how stable it looks today.

**The stability rule, stated once:** additive changes within a `schema_version` are always
safe; a breaking change bumps `schema_version` and adds a line to
[migrations.md](migrations.md) - this is already the repo-wide rule
([CONTRIBUTING.md](../CONTRIBUTING.md), standing rule 2), restated here because this is the
page an external integrator actually reads before writing a parser.

## 1. Schemas - `schemas/*.schema.json`

Every format Meno defines has a machine-checkable JSON Schema, committed and versioned:
`profile`, `course`, `module`, `lesson`, `ledger`, `ledger.ui` (the narrowed schema the app's
own write path validates against), `pack`, `reference-note`, `insights`. Validate against the
schema file itself, not against a paraphrase of it in this document or anywhere else - the
schema is the contract; prose describing it can drift, the schema cannot without a version
bump.

## 2. The ledger read format - `progress/ledger.jsonl`

The eight event types (`generated`, `read`, `scored`, `reviewed`, `gated`, `overridden`,
`rescoped`, `noted` - full semantics in [specs/progress.md](specs/progress.md)) keep their
existing fields' meaning stable for the life of `schema_version: 1`. A future version may
introduce new event types; a well-behaved consumer **ignores event types it does not
recognize** rather than failing closed - the same permissive-rendering rule the rest of Meno
follows for stale schema versions.

**External systems never write the ledger.** Exactly two writers append to it, with disjoint,
enforced authority: the app server (recognition-level UI events only) and the agent
(everything else) - decision 14, the correctness boundary the whole progress model rests on
([specs/progress.md](specs/progress.md), [specs/app.md](specs/app.md)). That two-writer split
is not a convention that a careful third writer could join safely; it is the argument itself.
A gate keys "exclusively on `source: agent` + `level: transfer`" scored events precisely
because nothing else can produce that shape - a third writer, however well-intentioned, is a
way to forge the one signal the mastery gates trust.

Read it three ways, all safe: a batch export via [`tools/export.ts`](../tools/export.ts)
(below), the running local app's `GET /api/v1/:tenant/ledger` (below), or parsing
`progress/ledger.jsonl` directly against `schemas/ledger.schema.json`.

## 3. `GET /api/v1/*` read routes

Every read route under the `/api/v1` prefix is stable surface:
`health`, `tenants`, `:tenant/tree`, `:tenant/course/:course`,
`:tenant/lesson/:course/:module/:file`, `:tenant/note`, `:tenant/todos`, `:tenant/progress`,
`:tenant/insights`, `:tenant/ledger` ([specs/app.md](specs/app.md) owns the shapes; response
types are `app/shared/types.ts`).

**Write routes are not surface.** `POST :tenant/check/submit`, `POST :tenant/lesson/read`,
`POST`/`PATCH :tenant/todos*` exist for the app's own client and may change shape between
versions without notice. More importantly, calling them from outside the app means
impersonating "the app, on the UI's behalf" - the exact thing decision 14's disjoint-authority
guarantee depends on nobody else doing. An external system that writes through these routes
is not integrating with Meno; it is a third ledger writer wearing the app's clothes (see
[#2](#2-the-ledger-read-format---progressledgerjsonl) above).

**The server binds `127.0.0.1` only** and rejects any request carrying a foreign `Origin`
header ([specs/app.md](specs/app.md)). There is no remote endpoint to integrate against, on
purpose - that is not a gap in the API, it is the boundary that keeps a private vault private
by default. In practice, "integration" means one of two things: your integration runs on the
same machine as the learner's `npm start` (a local agent, a scheduled script, a menu-bar app
polling `127.0.0.1`), or it reads files and exports directly and never talks to a running
server at all.

## 4. Exports - `tools/export.ts`

```
node tools/export.ts <tenant-dir> [--format jsonl|csv] [--redact] [--out <dir>]
```

Writes `ledger.jsonl` or `ledger.csv` (per `--format`), `mastery.csv` (derived live via
`deriveMastery` - never read from `mastery.yml` on disk), and `insights.json` (a
`computeInsights` snapshot) to `<dir>` (default: `<tenant-dir>/export`). **The learner runs
it; nothing pushes automatically.** This is the honest alternative named in
[org-deployment.md's load-bearing refusal](org-deployment.md#f-what-meno-will-not-do-and-why):
an org that wants data out of a deployment gets a documented, stable format to build against,
and the learner keeps the only copy that runs on its own, which is none.

`--redact` strips the `rubric` and `reason` fields - the only two places a learner's own
words appear anywhere in the ledger - and nothing else. Every other field, including every
score and every date, passes through unchanged.

## What is not committed surface

- **`lib/*` signatures.** Internal implementation; the schema and the ledger format are the
  contract, not the TypeScript that happens to compute them today. `deriveMastery`'s exact
  function signature can change across a minor version; its output's shape (governed by
  `Mastery` and, transitively, what `mastery.csv` reports) is what's promised.
- **The client bundle (`app/client/dist`).** One rendering of the data among possible ones.
  Do not scrape it, do not import from it.
- **`mastery.yml` as a file.** A derived, disposable cache
  ([specs/progress.md](specs/progress.md)) - a future version could stop writing it to disk
  entirely without breaking anything that depends only on the ledger or on
  `tools/export.ts`'s `mastery.csv`. Read mastery live, never by depending on that file
  existing.
- **CLI stdout in its human-readable form.** `node tools/insights.ts` and similar commands
  may reformat their printed summaries anytime. Pass `--json`, or use `tools/export.ts`, if a
  script needs to parse output.

## See also

- [org-deployment.md](org-deployment.md) - the deployment pattern and RBAC this surface
  supports.
- [specs/progress.md](specs/progress.md) - full ledger event semantics and mastery derivation.
- [specs/app.md](specs/app.md) - the HTTP surface's own invariants (write-authority
  enforcement, path safety, origin checks).
- [migrations.md](migrations.md) - the schema version history.
