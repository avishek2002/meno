# Sourcing: fetch before you cite (canonical)

The citation-integrity procedure for every generation skill. Hallucinated citations are Meno's number-one ranked risk (PLAN.md); this procedure is the first defense layer. `generate-module` links here too; the on-demand audit skill (Phase 6) checks compliance after the fact.

## The rule

**Only cite what you retrieved and read in this session.** A URL remembered from training is a candidate, never a citation: fetch it, confirm it exists, confirm it says what you're about to claim it says, then cite it. A source you could not fetch does not get cited, no matter how confident you feel.

## Per-source procedure

1. Fetch the URL (WebFetch or your CLI's equivalent). If it 404s or the content does not match expectations, discard and find another. Resolve all redirects and record the final canonical URL in `url` - a search-indexed alias can die while the canonical page lives on.
2. Read enough to verify it supports the specific claim or module it anchors.
3. Archive it: request `https://web.archive.org/save/<url>` (Wayback Machine Save Page Now), then record the resulting snapshot URL. The snapshot URL arrives in the 302 response's Location header; if your fetch tool cannot reach web.archive.org, fall back to `curl -sI https://web.archive.org/save/<url>` and read the header. Save Page Now rate-limits aggressively - space saves about 20 seconds apart, and on a 429 check `https://archive.org/wayback/available?url=<url>` for an existing recent snapshot instead. An empty `archived_url` is allowed only with a `why` note (paywall, robots-blocked) - never silently.
4. Record the full source object: `title`, `url`, `archived_url`, `accessed` (today), `source_type`, `why` (one line: what this source anchors).

## User sources

Material under `content/<tenant>/sources/` is already trusted - the learner supplied it. Record with `source_type: user` and the path in the `url` field, always relative to the vault root (`content/<tenant>/`), so it always starts with `sources/` regardless of which file the record sits in; no archiving needed. Where user material covers a module, it outranks web sources: the course should feel built on their materials, not beside them.

## Quality bar for anchor sources

Prefer, in order: primary documentation and specs; textbooks and long-lived references; peer-reviewed or canonical explainers; well-maintained community resources. Avoid as anchors (fine as supplements): individual blog posts younger than a year, social threads, generated content farms. For contested topics, two anchors representing the mainstream positions beat one. Topical precision outranks venue prestige: a preprint that names exactly the phenomenon a module teaches beats a prestigious source that gestures at it - note the trade-off in `why` when you make it.

## What downstream consumers expect

- The references panel in the app is built from these structured records - malformed records render broken panels.
- The Phase 6 audit skill will re-fetch a sample and check the claim-support link, not just liveness. Write `why` lines specific enough to audit against ("explains the borrow checker rules lessons 2-3 paraphrase", not "good resource").
