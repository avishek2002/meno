# Validation spec

*Status: current as of Phase 2; amended at v1.5 (groups, pack-attribution). Canonical formats owned elsewhere: every format validate
checks is owned by a skill reference or a schema - see
[content-schema.md](../content-schema.md) for the index.*

## Purpose

One deterministic, offline command that says whether a content tree is healthy:
`npm run validate` (`node tools/validate.ts`). It is the executable half of every
acceptance criterion that reads "validates cleanly", and the backstop for invariants that
server-side guards cannot see (hand-edited files, agent-written artifacts). It never
calls the network and never calls a model.

## How it behaves

1. `node tools/validate.ts [target ...] [--strict] [--json]` - targets default to
   `examples/` and `content/community/` (plus `content/org/` where it exists). Every course tree
   found under a target is checked; a real tenant is checked by passing
   `content/tenants/<tenant>`. Tenant-tier checks like `groups` therefore run in the default
   gate only against the committed fixtures under `examples/`, which is what those fixtures are
   for - `examples/example-learner/groups.yml` is the living spec for the format.
2. Findings are errors (the tree is broken) or warnings (the app will cope, but something
   deserves attention - permissive rendering is locked, so validate is deliberately
   stricter than the renderer).
3. Exit codes: 0 clean, 1 any error, 2 warnings-only under `--strict`. `--json` emits the
   findings structurally for tooling (the Phase 8 eval runner consumes it).
4. Malformed input (bad YAML, missing frontmatter) is reported as a finding, never a
   crash.

## Architecture

`tools/validate.ts` is a registry of named checks, each a pure function from a file tree
to findings. It imports the same parsing implementations the app uses
(`lib/frontmatter.ts`, the `yaml` package - one YAML implementation in the process) so
validate and the renderer can never disagree about what a file says.

## Checks

| Check | What it enforces | Since |
|---|---|---|
| `schema` | profile frontmatter against `schemas/profile.schema.json` | 1 |
| `profile-consistency` | budget arithmetic, depth-to-Bloom mapping, question budget | 1 |
| `profile-body` | four required sections, dated adjustment-log entries | 1 |
| `manifests` | course.yml and module.yml against their schemas | 2 |
| `refs` | derived-view drift (course.yml mirrors module.yml), prerequisites and serves resolve, lesson files exist for non-planned statuses, lesson concepts in module concepts, Bloom ceiling, budget sum, module sizing | 2 |
| `citations` | source-record integrity: wayback-shaped archived_url for web sources, vault-relative paths for user sources, sane accessed dates | 2 |
| `hub` | hub note exists, carries the mermaid dependency map, derived markers balanced | 2 |
| `tenancy` | CLAUDE.md stays the one-line shim, content/tenants/ is covered by a gitignore rule, and the only top-level entries under content/ are community/, org/, and tenants/ (anything else is an error) | 1 |
| `lessons` | 9-part anatomy, frontmatter schema, id/path agreement, status drift | 3 |
| `checks` | authored-id presence/uniqueness/shape, mcq ranges, cloze gaps, concepts resolve course-wide, interleaving warning | 3 |
| `ledger` | per-line schema, strictly-increasing ts, write-authority at rest | 3 |
| `mastery` | byte-identical rebuild vs committed mastery.yml | 3 |
| `insights` | narrative insights-note frontmatter against schema, six required body sections, cite-your-numbers (every body number traces to the note's own `metrics_snapshot`) | v1.1 |
| `pack-layout` | pack directory shape (`content/community\|content/org`/domain/slug), domain in the closed vocabulary, `PACK.md` present and schema-valid with a matching `pack` field, `course.yml` is `status: draft` with no `profile` field | v1.2 |
| `pack-notes` | `notes/*.md` frontmatter against `reference-note.schema.json`, source records, and the no-pedagogy rule (no check blocks, no transfer callouts, no lesson-anatomy headings) | v1.2 |
| `pack-overlap` | no two packs in a domain share a slug; objective-text token overlap above 60 percent between packs in a domain is flagged | v1.2 |
| `pack-attribution` | every pack has a `CONTRIBUTORS.yml` with at least one `unit: pack` record; every record's unit resolves against what the pack contains (objective ids in `course.yml`, module directories, `lessons[].file` and `sources[].url` in `module.yml`, files under `notes/`) unless marked `action: removed`; records are oldest-first; `by` is a handle or `anonymous`. A source url the module no longer cites is a warning, not an error - citation upkeep makes attribution stale, not wrong | v1.5 |
| `groups` | wherever a `groups.yml` is found: schema-valid entries, unique group ids, no course in two groups, every listed slug is a course in that tenant. A course in no group is a warning (Ungrouped is a normal state) | v1.5 |
| `pack-safety` | community content is markdown/YAML only; error-level patterns (scripts, inline handlers, credential-shaped strings, private-key blocks, curl-pipe-to-shell, mermaid click/href) and warning-level patterns (instruction-shaped phrases, plain-http URLs) | v1.2 |

Planned: `vault` (wikilink resolution, orphan detection - needs the app's resolver).

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| target trees (examples/, content/tenants/<tenant>) | read | validate | all owned formats |
| `schemas/*.schema.json` | read | validate | JSON Schema 2020-12 |
| repo root (`CLAUDE.md`, `.gitignore`) | read | validate | tenancy contract |

## Invariants

1. Validate is offline and model-free; a network failure can never change its verdict.
2. Validate never writes anything.
3. Every check reports all findings in one pass (no fail-fast) so a contributor sees
   everything wrong in one run.
4. Parsing goes through the same shared implementations the app uses - no parallel
   parsers.

## Verified by

- `tools/test/validate.test.ts` and `tools/test/courses.test.ts` (15 cases: valid trees
  clean, each broken variant caught, malformed YAML reported not thrown).
- `npm run gate` runs typecheck, tests, and validate together; green gate is the
  per-phase acceptance floor.

## Open questions

1. Whether `--strict` should become the default once the content base stabilizes -
   revisit at Phase 8.
