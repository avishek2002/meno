# Tutor session spec

*Status: current as of Phase 5. Canonical formats owned elsewhere: session procedure in
[tutor-session/SKILL.md](../../.agents/skills/tutor-session/SKILL.md), ledger semantics
and derivation in [progress.md](progress.md), lesson and check formats with
generate-module's references.*

## Purpose

Turns the agent from an author into a tutor: spaced reviews, honest grading, and the
mastery gates that make progress mean something. This is the only component that writes
gate-consequential events - the seam decision 14 reserves for agent judgment - and the
piece that closes the loop from studying back into generation (generate-ahead).

## How it behaves

1. A session starts on request or when due reviews exist. Preflight reconciles UI
   activity since the last session (recognition results and completed todos inform what
   to probe first; they never move gates) and scans `todos.md`, proposing but never
   auto-acting.
2. Due = every concept whose `next_review` is today or earlier. Review order interleaves
   across modules and concepts.
3. Reviews are Socratic: the tutor prompts retrieval from the lesson's transfer prompt or
   a novel variant, hints rather than answers, and grades on the quantized five-point
   scale with a one-sentence auditable rubric per item.
4. Every graded item appends one `scored` event; the session closes with one `reviewed`
   event whose `next_review` map advances passing concepts (score at or above 0.75) to
   their next offset and resets weak ones to the first offset.
5. A gate evaluation appends `gated` with the exact `basis` items the mean was computed
   over: pass at or above 0.8 with every concept evidenced; fail below; insufficient
   evidence when any concept lacks transfer scores (never a pass). Failure comes with
   offered remediation, not a wall.
6. Overrides happen only on the learner's explicit request, append `overridden` bound to
   the gate's `ts`, and re-inject the weak concepts into the schedule via
   `reinject_after`. The tutor never proposes an override.
7. After a pass or override, the next module is generated before the session ends
   (decision 6) - the learner never waits on generation to study.
8. Repeated misses on one prerequisite reopen the interview's struggle re-clarification;
   off-contract requests trigger the drift check; a wholesale re-scope appends
   `rescoped`.
9. The session ends by rebuilding `mastery.yml` with `tools/rebuild-mastery.ts` and
   running validate clean - the byte-identical check is the proof the session wrote
   honest events.

## Architecture

A procedure over deterministic rails: the skill markdown executes in the agent CLI; the
deterministic pieces it leans on are `lib/mastery.ts` (the same derivation the app and
validate use - the tutor's gate math is that function's math), `tools/rebuild-mastery.ts`
(the only mastery.yml writer besides nothing), `schemas/ledger.schema.json` (event
contract), and validate's `ledger` + `mastery` checks (the after-the-fact backstop for a
procedure the server cannot guard).

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `<tenant>/progress/ledger.jsonl` | append (agent-typed events) | tutor | progress.md / ledger.schema.json |
| `<tenant>/progress/mastery.yml` | rebuild via tool | tutor | serializeMastery output |
| `<tenant>/<course>/modules/**` | write via generate-module (generate-ahead) | generate-module | lesson-format.md |
| `<tenant>/todos.md` | read (propose only) | learner/app | todo-format.md |
| `<course>/profile.md` | append via elicit-needs re-clarification | elicit-needs | profile-format.md |

## Invariants

1. Gate-consequential events (`scored` transfer, `gated`, `overridden`) are written only
   in tutor sessions, always `source: agent`.
2. Transfer scores are quantized to {0, 0.25, 0.5, 0.75, 1}; every one carries a rubric.
3. A `gated` event always records its `basis`; an `overridden` event always joins a real
   gate via `gate_ts` and always reschedules its weak concepts.
4. Insufficient evidence never passes a gate.
5. `mastery.yml` after a session equals the pure derivation of the ledger, byte for byte.
6. No direct answers in live review dialogue.

## Verified by

- Invariants 1-5: the scripted acceptance session against the example tenant (Phase 5
  pull request): warm-up + three graded transfer reviews, a 0.75 gate failure, an
  explicit override with reinjection, module 2 generated ahead, one reviewed event -
  ledger validates clean, mastery rebuilds byte-identical, and the fixture now carries
  the full story (`ownership` shaky with `weak_until`, module 02 `gate: fail,
  overridden: true`).
- Invariant 5 mechanically: validate's `mastery` check plus `tools/test/mastery.test.ts`
  (lock, override, reschedule, double-run determinism).
- Invariant 6: procedural - visible in the committed session transcript excerpt in the
  pull request; not machine-checkable.

## Open questions

1. Whether `practice`/`review` lesson types (reduced anatomy) earn their own format once
   real remediation sessions want written artifacts - deferred until usage shows the
   need.
