# Seeded-fault fixture

A deliberately corrupted mini-course for testing the `audit-citations` skill. Every
source record here is **structurally valid** - `tools/validate.ts` passes this tree
clean - because that is the point: hallucinated citations look exactly like real ones
until someone fetches them. Only a live audit can tell these apart.

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
