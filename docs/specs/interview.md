# Interview spec

*Status: current as of Phase 1; amended at v1.2 (community-tier search before handoff).
Canonical formats owned elsewhere: profile format in
[elicit-needs/references/profile-format.md](../../.agents/skills/elicit-needs/references/profile-format.md),
question menus and probe patterns in
[elicit-needs/references/question-bank.md](../../.agents/skills/elicit-needs/references/question-bank.md),
the community tier itself in [community.md](community.md).*

## Purpose

Turns "I want to learn X" into a confirmed, persisted learning contract. This is Meno's
answer to its founding paradox: a novice cannot spec their own curriculum, so nothing is
generated until a structured interview has pinned down goal, verified starting level, depth,
and time budget. Without it, every downstream artifact inherits a guessed scope - the
number-two ranked risk (scope mismatch, the MOOC killer).

## How it behaves

1. Any request to learn something new routes here first; generation skills refuse to start
   without a confirmed profile.
2. The interviewer asks 5 to 7 closed questions, one at a time, each with 3 to 4 anchored
   options plus an open escape hatch. Open-ended questions are never asked; a novice cannot
   answer them.
3. One question is a live micro-probe matched to the claimed prior level - a tiny task, not
   a self-report. The probe's outcome, not the self-report, is authoritative for the
   starting level (`probe_result` records whether it confirmed or adjusted).
4. A vague answer triggers one re-anchor to the menu; after two vague answers on the same
   dimension the interviewer stops probing and takes the documented default for that field.
5. If the chosen depth and the offered time budget conflict, scope pushback fires before
   confirmation: the interviewer names the conflict and offers a narrowed scope or a bigger
   budget. It never silently accepts an infeasible contract.
6. The interview always ends with a confirmation brief (not counted against the question
   budget) restating the whole contract; only explicit acceptance persists it.
7. The confirmed contract lands at `content/tenants/<tenant>/<course-slug>/profile.md`. If the
   tenant vault does not exist yet, the skill bootstraps it (home note, todos, sources
   directory) before writing.
8. Before handing off to `generate-curriculum`, the interviewer searches
   `content/community/INDEX.md` for coverage of the confirmed subject. A match is presented as a
   choice, never resolved silently in either direction: adopt the pack as the skeleton
   (recommended - `extend-meno`'s adopt-a-pack recipe) or generate fresh anyway.
   `generate-curriculum` runs the same search again as its own preflight backstop
   ([curriculum.md](curriculum.md)), for the case where it is invoked directly against an
   older confirmed profile with no fresh handoff to check against.
9. Mid-course, two triggers re-open the interview in a short re-clarification form (1-2
   questions): struggle (repeated misses on the same concepts) and drift (requests
   off-contract). Re-clarification appends to the profile's adjustment log; a wholesale
   re-scope supersedes the profile rather than deleting it.
10. Degraded path: an interview abandoned before confirmation leaves `status: draft` and
    downstream skills still refuse to generate from it.

## Architecture

A procedure, not a program: the skill markdown is executed by whatever agent CLI the
learner uses. Deterministic code touches it only at the edges:

- `.agents/skills/elicit-needs/SKILL.md` - the five-phase interview procedure.
- `schemas/profile.schema.json` - the machine-checkable half of the profile contract.
- `tools/validate.ts` (`profiles` checks) - schema validation plus the cross-field rules:
  budget arithmetic, the fixed depth-to-Bloom-ceiling mapping, question-budget warning,
  required body sections, dated adjustment-log entries.
- `examples/golden-personas/` - three persona cards with expected briefs; the acceptance
  and eval fixtures for this subsystem.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `content/tenants/<tenant>/<course>/profile.md` | write (create, append to log) | agent | profile-format.md |
| `content/tenants/<tenant>/{home.md, todos.md, sources/}` | write (bootstrap only if absent) | agent | vault-conventions.md |
| `schemas/profile.schema.json` | read | validate | JSON Schema |
| `examples/golden-personas/*.md` | read | evals and acceptance | persona card + expected brief |

## Invariants

1. No generation skill runs against a profile whose `status` is not `confirmed`.
2. Structured profile fields always validate against the schema, and `bloom_ceiling` is a
   pure function of `depth`.
3. `budget_hours` equals `hours_per_week` times `total_weeks`.
4. The adjustment log is append-only; profiles are superseded, never deleted.
5. The interviewer never exceeds 7 counted questions; the confirmation brief always runs.
6. The live probe always runs, and its result overrides self-report.

## Verified by

- Invariants 2-3: `tools/validate.ts` (`schema`, `profile-consistency` checks) plus
  `tools/test/validate.test.ts`.
- Invariants 5-6 and the pushback rule: Phase 1 acceptance runs - simulated interviews
  against Sam Park (happy path) and Priya Nair (pushback path) with transcripts checked for
  probe, budget, confirmation, and pushback markers, and resulting profiles diffed against
  the golden briefs. Recorded in the Phase 1 pull request.
- Invariant 1: procedural (stated in the generation skills); becomes machine-checked when
  the app renders draft profiles as not-startable (Phase 4).
- Invariant 4: not yet machine-verified (validate checks a dated entry exists, not
  append-onlyness; git history is the practical guard).

## Open questions

1. Whether "vague answer" needs an operational definition beyond the two-strike rule -
   resolve if Phase 8 eval runs show interviewer judgment varying too much between runs.
