# Citations spec

*Status: current as of Phase 6. Canonical formats owned elsewhere: source records and
fetch-before-cite in
[generate-curriculum/references/sourcing.md](../../.agents/skills/generate-curriculum/references/sourcing.md);
the audit protocol in
[audit-citations/SKILL.md](../../.agents/skills/audit-citations/SKILL.md).*

## Purpose

Defense in depth for Meno's number-one ranked risk: hallucinated citations. Three layers,
each catching what the previous cannot: fetch-before-cite at generation time (nothing is
cited from memory), structural validation at rest (records are well-shaped, archives are
wayback-shaped), and the on-demand audit (records are *true* - the only layer that can
tell a fabricated citation from a real one, because they look identical on disk).

## How it behaves

1. Generation archives every web source to the Wayback Machine at cite time, so link rot
   never silently destroys the evidence base.
2. `npm run validate` (`citations` check) enforces record shape offline - it never
   fetches, so it proves form, not truth.
3. The `audit-citations` skill re-checks records against the live network: existence,
   claim support (against the `why` line and the citing prose - direction and specifics,
   not topic overlap), archive liveness, and archive match. Six verdicts: CLEAN,
   FABRICATED, ROTTED, MISATTRIBUTED, DEAD-ARCHIVE, MISMATCHED-ARCHIVE.
4. Findings route into exactly two repair flows: **citation refresh** (record broken,
   prose true - source fields change, prose provably untouched) and **content refresh**
   (prose wrong - the lesson regenerates through generate-module, re-passes anatomy, and
   is re-audited). Detection and repair never happen in the same pass.
5. Stale sweeps (`review_after` long past) route through the same two flows: sources
   first, prose only when the world actually changed.

## Architecture

- `.agents/skills/audit-citations/SKILL.md` - the protocol (agent-executed; the network
  checks are the audit).
- `tools/validate.ts` `citations` check - the structural floor.
- `examples/seeded-faults/` - the permanent adversarial fixture: a structurally valid
  mini-course seeding FABRICATED, MISATTRIBUTED, MISMATCHED-ARCHIVE, and WRONG-SUPPORT
  records among clean ones, with `ANSWER-KEY.md` as scoring ground truth (auditors are
  forbidden to read it; Phase 8 evals enforce that by instruction).

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `module.yml` and lesson `sources` records | read (audit); write source fields only (citation refresh) | audit-citations | sourcing.md |
| lesson bodies | write via generate-module only (content refresh) | generate-module | lesson-format.md |
| `<tenant>/progress/ledger.jsonl` | append `noted` (kind: refreshed) | agent | progress.md |
| the live web + web.archive.org | fetch | audit | - |

## Invariants

1. Every audited record gets a verdict with an actionable justification; audits fetch
   live, never answer from memory.
2. A citation refresh changes source-record fields only - the prose diff is empty.
3. A content refresh always re-passes the anatomy checks and a re-audit before it is
   done.
4. The seeded-fault fixture stays faulted - repairs happen on copies.
5. Structural validation alone never claims citation truth (the fixture passing validate
   clean is the permanent proof of why the audit exists).

## Verified by

- The blind-audit acceptance run (Phase 6 pull request): an auditor with the answer key
  off-limits must flag all four seeded faults with the right classes and neither clean
  record - recorded verbatim in the PR.
- Refresh drills on throwaway copies (same PR): drill A's diff touches only source lines;
  drill B's regenerated lesson passes validate, anatomy, and a live re-audit.
- Invariant 5: `npm run validate` green over `examples/seeded-faults/` in every gate run.

## Open questions

1. Whether the audit should sample or exhaust by default on large courses - exhaustive
   for acceptance/evals is settled; the on-demand default can stay a judgment call until
   course sizes make it expensive.
