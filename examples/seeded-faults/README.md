# Seeded-fault fixtures

This directory holds two deliberately compromised trees, each for a skill that must catch what
schema validation cannot. Both are, on purpose, **structurally valid** -
`tools/validate.ts` passes each tree clean - because that is the point in both cases: a
hallucinated citation and a leaked worked example each look exactly like ordinary content
until someone actually checks.

## audit-fixture (below): for `audit-citations`

A deliberately corrupted mini-course. Every source record here is structurally valid because
that is the point: hallucinated citations look exactly like real ones until someone fetches
them. Only a live audit can tell these apart.

The tree seeds four fault classes among clean records:

- **FABRICATED** - a plausible-looking chapter that has never existed, with an equally
  fabricated archive URL.
- **MISATTRIBUTED** - a real, live page cited for a claim it does not make (the subtle
  one: topic overlap, wrong direction).
- **MISMATCHED-ARCHIVE** - a real URL whose archive snapshot captures a different page.
- **MISATTRIBUTED (orphaned)** - a live source whose `why` line claims it anchors
  material it does not contain, and which no prose actually cites.

[ANSWER-KEY.md](ANSWER-KEY.md) holds the expected verdict per record - it exists for
scoring audit runs (Phase 8 evals). **An agent performing an audit must not read the
answer key**; eval harnesses enforce that by instruction.

This fixture is permanent: do not "fix" its citations. The Phase 6 refresh-flow
acceptance runs operate on throwaway copies.

## publish-fixture: for `publish-to-community`

A deliberately compromising tenant course - ordinary and validate-clean, seeded with the kind
of personal, employer, and real-work content that must never reach a topic pack. Its own
[README.md](publish-fixture/README.md) and [ANSWER-KEY.md](publish-fixture/ANSWER-KEY.md)
explain the seeded leaks and score blind publish drills the same way this fixture's answer key
scores blind audits.
