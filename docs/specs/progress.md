# Progress spec: the ledger and mastery

*Status: current as of Phase 3; amended by Phase 5 (live tutor writes). Canonical formats
owned elsewhere: the generated seed event example in
[generate-module/references/lesson-format.md](../../.agents/skills/generate-module/references/lesson-format.md);
check-block ids in
[generate-module/references/check-formats.md](../../.agents/skills/generate-module/references/check-formats.md).
This spec owns ledger event semantics and the mastery-derivation rules; the machine contract
is `schemas/ledger.schema.json`.*

## Purpose

One append-only fact log (`progress/ledger.jsonl`) is the entire memory of a learner's
progress, and one pure function derives everything else from it. This is what keeps the
picture honest: nothing about mastery is stored that cannot be re-derived, so nothing can
silently drift, and the split write authority (decision 14) is checkable at rest.

## How it behaves

1. Every fact that happened - a lesson generated, a check answered, a session run, a gate
   evaluated - is one JSON object appended as one line. Lines are never edited or removed.
2. Two writers append: the app server (recognition-level results and reading progress,
   always `source: ui`) and the agent in sessions (everything else, always
   `source: agent`). Neither ever reads-modifies-rewrites the file.
3. `mastery.yml` (`progress/mastery.yml`) is a derived view: disposable, rebuildable,
   byte-identical on every rebuild from the same ledger bytes. The app derives mastery in
   memory to render progress; only the tutor session (and `tools/rebuild-mastery.ts`)
   materializes the file.
4. Gates read only agent-graded transfer evidence. Recognition results inform what a
   session probes first, but no volume of recognition success can unlock a module.
5. A module with any concept lacking transfer evidence evaluates as insufficient evidence,
   which is not a pass.
6. Degraded path: a malformed line is reported by validate and skipped by the fold - one
   bad line never poisons the rebuild.

## The event vocabulary (eight types)

Common envelope on every line: `{v, ts, event, source, course}`. `ts` is RFC 3339 with
offset, strictly increasing within a file (bump 1 millisecond on collision - `ts` is the
join key `overridden.gate_ts` points at). `concepts` is always an array, even with one
element.

| Event | Source | When | Distinctive fields |
|---|---|---|---|
| `generated` | agent | a lesson body was written | `module, lesson, concepts, review_after` |
| `read` | ui | learner dwelled on a lesson | `module, lesson, seconds` |
| `scored` | ui or agent | one item answered and graded | `level, item, item_type, correct, score, attempt, session` |
| `reviewed` | agent | a review session closed | `session, items, concepts, due_covered, due_skipped, next_review` |
| `gated` | agent | a module-entry gate evaluated | `module, gate, result, score, threshold, basis, unlocks` |
| `overridden` | agent | learner proceeded past a failed gate | `module, gate_ts, reason, weak_concepts, reinject_after` |
| `rescoped` | agent | the learning contract changed | `trigger, changes, note` |
| `noted` | agent | scheduling-relevant maintenance fact | `kind, detail, review_after` |

Scored-event rules: recognition items set `correct` (boolean, deterministically graded)
with `score: null`; transfer items set `score` quantized to {0, 0.25, 0.5, 0.75, 1} with
`correct: null` - the two fields stay separate because "was deterministically graded" is
exactly the distinction decision 14 protects. Transfer-level scored events are always
`source: agent`. An item is identified as `<lesson id>#<check id>` (authored ids, stable
across edits and reorders) or `<lesson id>#transfer` for the single transfer prompt.

## Mastery derivation (the pure function)

`deriveMastery` in `lib/mastery.ts` - the only implementation; app, validate, and eval
import it.

1. Fold lines in file order. Never re-sort: file order is authoritative, `ts` is a join
   and display field.
2. Per concept: track each item's latest outcome (latest-per-item, no recency decay -
   spacing lives in scheduling, not in decaying old scores), `next_review` (last seen
   among reviewed/generated/noted/overridden dates), staleness, and weakness
   (`overridden.weak_concepts`; weakness stays active until a transfer score lands after
   the override).
3. `transfer_score` = mean over distinct transfer items of each item's last score;
   `recognition_rate` = mean over distinct recognition items of each item's last result.
   Only `source: agent` + `level: transfer` lines enter `transfer_score`.
4. Concept level: `introduced` (generated only), `practiced` (recognition only),
   `mastered` (transfer evidence, score at or above 0.8, no active weakness), `shaky`
   (transfer evidence below 0.8, or active weakness).
5. Module gate state comes from `gated`/`overridden` events (`locked` = last gate failed
   with no matching override); the module score is the mean over its concepts' transfer
   scores, or null while any concept is unproved.
6. Serialization: keys sorted, floats rounded to 2 decimals, dates as YYYY-MM-DD, and no
   timestamp anywhere in the file - so rebuild-identical means byte-identical, with no
   exclusion list to argue about.

Two constraints that bind everything upstream: no derived field may depend on today's
date (due-ness is computed at read time by app and tutor), and no derived field may read
lesson files (which is why `module` and `concepts` are mandatory on events rather than
looked up).

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `content/<tenant>/progress/ledger.jsonl` | append (server: ui events; agent: agent events) | split per decision 14 | ledger.schema.json |
| `content/<tenant>/progress/mastery.yml` | write (tutor, rebuild tool); read (app) | agent | serializeMastery output |

## Invariants

1. The ledger is append-only; no component read-modifies-rewrites it.
2. No `source: ui` line carries `level: transfer` or any event outside `scored`/`read`.
3. `serialize(derive(lines))` is a pure function of the lines in file order - no clock,
   filesystem, or model input - and rebuilds byte-identical.
4. Gates key exclusively on `source: agent` + `level: transfer` scored events.
5. `ts` is unique and strictly increasing within a file.
6. Insufficient evidence never evaluates as a pass.
7. Exactly one mastery-derivation implementation exists in the repo.

## Verified by

- Invariants 2, 5: validate's `ledger` check (write authority at rest - the only guard
  that sees a hand-edited file) plus `tools/test/lessons.test.ts`.
- Invariants 3, 4, 6: `tools/test/mastery.test.ts` (ui-transfer-ignored fold test,
  latest-per-item, gate lock/override/reinject, insufficient evidence, byte-identical
  double run) and validate's `mastery` check against the committed example fixture.
- Invariant 1: procedural for the agent (skill instructions); enforced by construction in
  the app server (Phase 4).
- Invariant 7: not yet machine-verified (a grep test lands with the app in Phase 4).

## Open questions

1. ~~Whether `read` events should feed a visible "time spent" view or stay
   analytics-only~~ - resolved (v1.1, [insights.md](insights.md)): `read` events stay
   counts-only. `usage.surface_mix.reads` reports how many reads happened, never how long
   - `lib/insights.ts` names this explicitly in its own `limits` array ("time studied is
   not measured: dwell seconds cannot distinguish reading from an open tab"), so the
   report is honest about the gap rather than quietly filling it with a number `seconds`
   was never trustworthy enough to support.
