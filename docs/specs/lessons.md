# Lessons spec

*Status: current as of Phase 3 (stale-content flows live in [citations.md](citations.md)). Canonical formats
owned elsewhere: lesson frontmatter and the nine-part skeleton in
[generate-module/references/lesson-format.md](../../.agents/skills/generate-module/references/lesson-format.md);
check blocks and the transfer callout in
[generate-module/references/check-formats.md](../../.agents/skills/generate-module/references/check-formats.md);
sourcing in
[generate-curriculum/references/sourcing.md](../../.agents/skills/generate-curriculum/references/sourcing.md).*

## Purpose

Lesson bodies are where the learning science either happens or silently doesn't. The
nine-part anatomy encodes what the evidence supports - retrieval practice, worked examples
with fading, misconception confrontation, spaced review, transfer - as a checklist a
machine can verify, so quality does not depend on a generation run's mood.

## How it behaves

1. `generate-module` writes one module's lesson bodies per its manifest's lessons list.
   Module 1 generates immediately after skeleton confirmation (decision 6); later modules
   generate one step ahead, during review sessions.
2. Every lesson follows the nine-part anatomy in order: objective, prerequisite check
   (lesson 1 of module 1 probes the profile's claimed level instead), chunked explanation
   with contrasting examples and inline citations, worked example with why-annotations,
   faded practice with answer reveals, misconception trap, retrieval checks, the
   spaced-review hook (frontmatter), and exactly one transfer prompt.
3. Checks are authored at two levels (decision 14): recognition-level `meno-check` blocks
   the app grades deterministically, each with a stable authored `id`; one transfer-level
   callout per lesson, agent-graded only, no stored answer.
4. Once a module has two or more taught concepts, later lessons' retrieval checks
   interleave earlier concepts rather than only the current lesson's.
5. Every factual claim leans on a source fetched in the generating session; lessons reuse
   their module's verified anchors and record structured source objects. User material
   under `sources/` is read agentically before drafting and cited with vault-relative
   paths.
6. Generation appends one `generated` ledger event per lesson and flips lesson and module
   statuses, regenerating `course.yml` and the hub's derived block (lessons become
   wikilinks).
7. Degraded path: a malformed check block renders as an inert code block and is reported
   by validate; it never crashes a renderer.

## Architecture

- `.agents/skills/generate-module/SKILL.md` - the procedure (agent-executed).
- `schemas/lesson.schema.json` - frontmatter contract (`source.schema.json` shared with
  manifests).
- `lib/lesson.ts` - the single lesson parser: check-block and callout extraction,
  wikilink collection, and the nine anatomy detectors. The app server (Phase 4), validate,
  and eval all import it.
- `tools/validate.ts` - `lessons` and `checks` checks: schema, anatomy 9/9, authored-id
  uniqueness and shape, mcq answer ranges, cloze gaps, concepts resolve course-wide,
  interleaving warning, id/path agreement, status drift.
- `examples/example-learner/.../01-syntax-and-ownership-basics/` - module 1 fully
  generated as the living fixture, with its ledger seed events and derived mastery.

## Data touched

| Path | Access | Owner | Format |
|---|---|---|---|
| `<course>/modules/NN/*.md` | write | agent | lesson-format.md |
| `<course>/modules/NN/module.yml` | write (statuses) | agent | manifest-format.md |
| `<course>/course.yml`, hub note, `home.md` | write (regenerate/derived regions) | agent | manifest-format.md, vault-conventions.md |
| `<tenant>/progress/ledger.jsonl` | append (`generated` events) | agent | [progress.md](progress.md) |
| `<tenant>/sources/*` | read | agent | learner-supplied |

## Invariants

1. A generated lesson scores 9/9 on the anatomy checklist.
2. Every check block carries a unique, stable, authored kebab-case `id`; history binds to
   `<lesson id>#<check id>`.
3. Exactly one transfer callout per lesson, detectable by the word "Transfer" in its
   title; no answer for it is stored anywhere in the file.
4. Answers and explanations for recognition checks live only in the check payload (the
   app strips them from lesson GETs - enforced in Phase 4).
5. Every cited source was fetched in the generating session; web sources carry Wayback
   archive URLs.
6. Lesson frontmatter `id` equals `course/module/file` and its concepts are a subset of
   the module's.

## Verified by

- Invariants 1-3, 6: validate `lessons`/`checks` checks plus `tools/test/lessons.test.ts`
  (anatomy fixture, missing-part, duplicate-id, missing-id, double-transfer cases).
- Invariant 5: citations check (structural) + the Phase 3 acceptance run's live
  verification; ongoing liveness belongs to Phase 6's audit skill.
- Invariant 4: lands with the app (Phase 4) - "not yet verified" here, honestly.

## Open questions

1. Whether `practice` and `review` lesson types (reduced anatomy) need their own
   detectors - Phase 5 landed without these types materializing; deferred until real
   remediation sessions want written artifacts.
