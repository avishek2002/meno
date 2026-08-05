# Narrative insights-note format (canonical)

One dated note per report at `content/tenants/<tenant>/insights/YYYY-MM-DD-insights.md`. The
machine-checkable half of this format is `schemas/insights.schema.json`; validate's
`insights` check enforces both the frontmatter schema and the body rules below.

## Format

```markdown
---
schema_version: 1
type: insights
as_of: 2026-08-09
generated_at: 2026-08-09
courses: [rust-for-backend]
agent: claude-sonnet-5
basis:
  ledger_lines: 12
  ledger_sha256: <sha256 of progress/ledger.jsonl's current bytes>
metrics_snapshot:
  as_of: "2026-08-09"
  basis: { ledger_lines: 12 }
  sessions: { ... }
  reviews: { ... }
  gates: { ... }
  evidence: { ... }
  usage: { ... }
  vault: { ... }
  limits: [ ... ]
---

## What the numbers say

...

## How you are using Meno

...

## Where you are stuck

...

## Suggestions

...

## Topics you might want

...

## Limits of this report

...
```

## Frontmatter fields

| Field | Meaning |
|---|---|
| `schema_version` | integer, bump on a breaking change to this format |
| `type` | always the literal `insights` |
| `as_of` | the date the snapshot was computed against (`InsightsReport.as_of`, `tools/insights.ts --as-of`, defaults to today) |
| `generated_at` | the date this note was written - usually equal to `as_of`, but not guaranteed (a note can narrate a snapshot pinned to an earlier date) |
| `courses` | every course slug under the tenant at the time of writing (one entry per `course.yml` directory) |
| `agent` | the writing agent's model identity string |
| `basis.ledger_lines` | `InsightsReport.basis.ledger_lines` - the exact line count the snapshot folded |
| `basis.ledger_sha256` | sha256 of `progress/ledger.jsonl`'s bytes at write time - pins which ledger state this report describes, since `ledger_lines` alone cannot distinguish "12 lines, then 3 more got appended and 3 removed" (impossible for an append-only file, but the hash is the honest proof rather than an assumption) |
| `metrics_snapshot` | the full `InsightsReport` JSON, embedded verbatim - not summarized, not re-keyed. This is what the cite-your-numbers validate rule checks every body number against |

## Body: six required sections, in this order

1. **What the numbers say** - headline facts, every rate as `value (n/of)`.
2. **How you are using Meno** - behavior as observed, not as prescribed.
3. **Where you are stuck** - overdue reviews, unrepaid overrides (called out prominently),
   weak concepts, stale mastery; every claim cites its item id or concept.
4. **Suggestions** - at most 3; a repeat of an earlier report's suggestion is marked
   `(repeated - first suggested YYYY-MM-DD)`; anything the learner declines in the same
   conversation becomes an unchecked `todos.md` line instead of being dropped.
5. **Topics you might want** - at most 3, each with the evidence that surfaced it
   (`referenced_but_untaught`, a `#note` todo, an uncovered `sources/` file, or the profile
   goal read against current coverage) - never a topic outside that pool.
6. **Limits of this report** - required. Starts from the snapshot's own `limits` array.

## The cite-your-numbers rule

Every standalone numeric token in the body (outside inline code and quoted strings) must
appear somewhere inside the frontmatter's `metrics_snapshot` JSON - validate greps for it
by stringifying `metrics_snapshot` and searching. Exempt: date-shaped tokens
(`YYYY-MM-DD`), item or concept ids (containing `#` or `/`, e.g.
`03-ownership#transfer` or `rust-for-backend/ownership`), and anything already inside
backticks or a quoted string. This is a warning by default (a false positive - a section
number, a step count in a suggestion - should not block the note); it becomes an error
under `npm run validate --strict`.

## Why a dated file, not one running note

Every report is a point-in-time snapshot over a specific ledger state (`basis.ledger_sha256`
pins exactly which one). Overwriting one running note would either lose the history of
what was said when, or silently reinterpret an old snapshot as current - both violate the
observations-not-verdicts, honest-dates spirit the rest of Meno holds to. One file per
calendar day (overwritten if the skill runs twice in the same day) keeps the history
legible and diffable, same reasoning as the append-only ledger itself.
