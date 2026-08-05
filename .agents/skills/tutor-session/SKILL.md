---
name: tutor-session
description: Run a spaced review session against a tenant's ledger - compute due concepts, quiz Socratically, grade transfer prompts on the quantized scale, append typed ledger events, evaluate mastery gates with logged overrides, rebuild mastery.yml, and generate the next module when a gate resolves. Use when the learner asks for a review session, when due reviews exist at session start, or when a module-gate decision is needed. Grading and gates only - lesson bodies belong to generate-module, contract changes to elicit-needs.
---

# Tutor session

This skill owns study time: reviews, grading, gates, and scheduling. It is where the agent
earns its place after generation - and the only place mastery-gate events are ever written
(PLAN.md decision 14). Event semantics and derivation rules live in
[docs/specs/progress.md](../../../docs/specs/progress.md); the machine contract is
`schemas/ledger.schema.json`. Nothing here contradicts them.

## Hard rules

- **Socratic, no direct answers** (decision 11). In a live session you never hand over an
  answer. Prompt retrieval, narrow with hints, contrast wrong models - the learner
  produces the answer or learns exactly where they could not.
- **Only you write agent-typed events.** `scored` at transfer level, `reviewed`, `gated`,
  `overridden`, `rescoped`, `noted` - all `source: agent`. In-session recognition
  warm-ups you administer are also `source: agent` (you graded them live); `source: ui`
  belongs to the app alone and you never write it by hand.
- **The ledger is append-only.** One JSON object per line, `v: 1` envelope, `ts` RFC 3339
  with offset and strictly later than the last line. Never edit or reorder existing
  lines. Append with a single shell append (`>>`) of one complete line.
- **Desirable-difficulty framing out loud**: effortful retrieval is the method working;
  say so when the learner struggles.

## Session protocol

1. **Preflight.** Read `progress/ledger.jsonl`. Reconcile UI activity since the last
   session: recognition results and completed todos inform what to probe first, but never
   move gates. Scan `todos.md` for actionable items ([second-brain
   conventions](../second-brain/references/todo-format.md)): propose, never auto-act.
2. **Compute due.** A concept is due when its `next_review` is today or earlier
   (`next_review` per concept comes from the last reviewed/generated/overridden event -
   the app's progress view shows the same list). Interleave due items **across modules
   and concepts**, never one module at a time - mixing is the point.
3. **Review each due concept.** Start from its lesson's transfer prompt (the single
   `Transfer` callout) or a fresh variant that displaces the concept into a new context.
   Let the learner work; probe mechanism, not vocabulary. Where recognition results
   flagged weakness, warm up with one produce-the-answer check first.
4. **Grade on the quantized scale** and append one `scored` event per item
   (`level: transfer`, `item: <lesson id>#transfer`, `correct: null`):
   - `1.0` - applies the concept correctly in the novel context, names the why.
   - `0.75` - sound application, one gap or an incomplete fix, self-corrects with a nudge.
   - `0.5` - right vocabulary, mechanism partly wrong; needs substantive help.
   - `0.25` - recognizes the concept but cannot apply it.
   - `0` - wrong model or blank.
   A `rubric` line on the event says what was observed - one sentence, auditable.
   In-session recognition warm-ups append `scored` events too (`level: recognition`,
   `correct: true|false`, `score: null`, `item: <lesson id>#<check id>`).
5. **Reschedule.** Close the session with one `reviewed` event: `session` id, the items
   covered, `due_covered`/`due_skipped`, and `next_review` per concept - a score at or
   above 0.75 advances the concept to its next offset in `review_offsets`; below 0.75
   resets it to the first offset (2 days).
6. **Evaluate the gate** when the learner wants the next module (or asks where they
   stand): over the prerequisite module's concepts, take each concept's latest-per-item
   transfer scores (exactly what `lib/mastery.ts` derives). Mean at or above 0.8 with
   every concept evidenced -> append `gated` with `result: pass` and generate ahead. Below
   0.8 -> `gated` with `result: fail`, name the weak concepts, offer targeted remediation.
   Any concept with zero transfer evidence -> `result: insufficient-evidence`, which is
   not a pass. Record the exact `basis.items` the computation used.
7. **Override, only on explicit request.** The learner may proceed past a failed gate -
   their call, always. Append `overridden` referencing the gate's `ts` (`gate_ts`), the
   learner's `reason`, the `weak_concepts`, and `reinject_after` (2 days out) - the weak
   concepts ride the normal schedule back into future sessions. Then proceed as if the
   gate passed. Never suggest the override yourself.
8. **Generate ahead** (decision 6): after a pass or an override, invoke
   [`generate-module`](../generate-module/SKILL.md) for the unlocked module before the
   session closes, so the learner never waits on generation to study.
9. **Struggle and drift triggers.** Repeated misses on the same prerequisite -> reopen
   [`elicit-needs`](../elicit-needs/SKILL.md) re-clarification (struggle). Session
   requests wandering off the contracted goal -> the drift check. A wholesale re-scope
   appends a `rescoped` event.
10. **Close.** Rebuild the derived view - `node tools/rebuild-mastery.ts <tenant-dir>` -
    then `npm run validate` and confirm it is clean. Summarize: what was reviewed, scores
    in plain language, what unlocked or stayed locked and why, and when the next review
    is due.

## Done means

- Every graded item has exactly one `scored` line; the session has exactly one `reviewed`
  line; gate decisions have their `gated` (and, only on explicit request, `overridden`)
  lines with auditable `basis` and `rubric` fields.
- `mastery.yml` was rebuilt by the tool (never hand-edited) and `npm run validate` is
  clean - the byte-identical check passing is the proof the session wrote honest events.
- The next module exists on disk when a gate passed or was overridden.
- The learner heard scores as observations, not verdicts, and knows what comes next.
