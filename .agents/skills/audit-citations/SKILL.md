---
name: audit-citations
description: Spot-check generated content's citations after the fact - verify cited sources exist, actually say what the lesson claims they say, and have live, matching archive snapshots - then route problems into the citation-refresh or content-refresh flow. Use on demand ("audit the citations", "check this course's sources"), after big generation runs, or when a learner doubts a claim. Detection and refresh routing only - regeneration belongs to generate-module.
---

# Audit citations

Hallucinated citations are Meno's number-one ranked risk (PLAN.md). The first defense is
fetch-before-cite at generation time
([sourcing.md](../generate-curriculum/references/sourcing.md)); this skill is the second:
an adversarial re-check of what generation claimed. `tools/validate.ts` proves records are
well-shaped; only this audit proves they are true.

## The stance

Audit like you expect fraud. A well-formed source record with a plausible title, a real
domain, and a wayback-shaped archive URL is exactly what a hallucinated citation looks
like. Every check below is against the live network, never against memory - if you
remember the page, you still fetch it.

## Protocol (per source record)

Work through every source in the target's `module.yml` files and lesson frontmatter (or a
sample when asked for a spot-check - but always the full set when the run is an
acceptance or eval). For each record:

1. **Existence.** Fetch `url`. A 404, a redirect to somewhere substantively different, or
   a page that plainly is not what `title` names -> FABRICATED or ROTTED. Record which.
2. **Claim support.** Read the page against the `why` line and against what the citing
   lesson actually claims (grep the lesson body for the citation's inline mentions). The
   page must support the specific claims, not the general topic. A source that exists but
   does not say what the lesson says it says -> MISATTRIBUTED. This is the subtle one -
   check the direction of claims, recommendations, and numbers, not just topic overlap.
3. **Archive liveness.** Fetch `archived_url`. Must resolve (HTTP 200 after redirects)
   -> otherwise DEAD-ARCHIVE.
4. **Archive match.** The snapshot must be a capture of `url` (the original URL is
   embedded in the wayback URL after the timestamp - compare canonically, and eyeball
   the fetched content matches the live page's subject) -> otherwise MISMATCHED-ARCHIVE.
5. **User sources** (`source_type: user`): the path under `sources/` exists and the
   material covers what `why` claims. No network involved.

Report one line per source: verdict (CLEAN | FABRICATED | ROTTED | MISATTRIBUTED |
DEAD-ARCHIVE | MISMATCHED-ARCHIVE) plus a one-sentence justification specific enough to
act on. Never fix silently while auditing - detection and repair are separate passes.

Edge rules, learned the hard way:

- **Checks are independent; the primary verdict is the earliest-stage failure.** A
  fabricated source usually has a dead archive too - report FABRICATED and name the dead
  archive in the justification, because the routing differs (a dead archive alone looks
  citation-refreshable; a fabrication never is).
- **FABRICATED vs ROTTED needs evidence, not a guess.** A bare 404 cannot tell you which.
  Check an authoritative index of the source - the site's table of contents, the
  upstream repository, an old archive snapshot of the index - for whether the cited
  thing ever existed. Never existed -> FABRICATED; existed and gone -> ROTTED.
- **Orphaned sources count.** A record in a manifest that no prose actually cites, with a
  `why` claiming it anchors something - report MISATTRIBUTED and say it is orphaned; the
  false claim-to-source link is the fault even when no sentence leans on it.
- **Compare archive URLs canonically**: ignore http/https, trailing slashes, and query
  strings when matching the wayback-embedded URL against `url`; anything beyond that is
  a mismatch.

## Routing what you found

Two distinct repair flows; picking the wrong one either loses good prose or preserves bad
claims.

- **Citation refresh** - the prose is still true, the record is broken (ROTTED,
  DEAD-ARCHIVE, MISMATCHED-ARCHIVE): fix ONLY source fields - find the successor URL or
  re-archive per sourcing.md, update `url`/`archived_url`/`accessed`, bump nothing else.
  The lesson body is untouched; the diff must show source fields only. Then re-run
  validate.
- **Content refresh** - the prose itself is wrong or outdated (FABRICATED,
  MISATTRIBUTED, or a live source now contradicting the lesson): the lesson body cannot
  be trusted. Regenerate it through [generate-module](../generate-module/SKILL.md)
  (which re-fetches and re-anchors), flip the lesson's `status` through the manifest,
  append a `noted` ledger event (`kind: refreshed`), re-run the anatomy checks, and
  RE-AUDIT the regenerated lesson before calling it done.

Routing is **per record, not per file**: one lesson can need both flows at once (an
archive fix on one record, a prose rewrite for another) - resolve each record on its own
terms in a single regeneration pass. The ledger append (`noted`, kind refreshed) applies
to tenant content; a standalone fixture or example tree with no `progress/` simply skips
it.

A stale sweep (lessons whose `review_after` is long past, flagged `#stale` per
[vault conventions](../second-brain/references/vault-conventions.md)) routes through the
same two flows: check the sources first; only touch prose when the sources say the world
changed.

## Done means

- Every audited source has a verdict line with a specific justification.
- No repair happened in the same pass as detection; refresh work names which flow it took
  and why.
- After any content refresh: anatomy passes, the re-audit is clean, and validate is green.
- The audit report distinguishes "the record is broken" from "the lesson is wrong" -
  because the learner's trust rides on knowing which it was.
