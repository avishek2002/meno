# Sourcing: fetch before you cite (canonical)

The citation-integrity procedure for every generation skill. Hallucinated citations are Meno's number-one ranked risk (PLAN.md); this procedure is the first defense layer. `generate-module` links here too; the on-demand audit skill (Phase 6) checks compliance after the fact.

## The rule

**Only cite what you retrieved and read in this session.** A URL remembered from training is a candidate, never a citation: fetch it, confirm it exists, confirm it says what you're about to claim it says, then cite it. A source you could not fetch does not get cited, no matter how confident you feel.

## Per-source procedure

1. Fetch the URL (WebFetch or your CLI's equivalent). If it 404s or the content does not match expectations, discard and find another. Resolve all redirects and record the final canonical URL in `url` - a search-indexed alias can die while the canonical page lives on.
2. Read enough to verify it supports the specific claim or module it anchors.
3. Archive it. **Never use a page-fetching tool for anything on web.archive.org** - several agent harnesses (Claude Code's WebFetch among them) refuse that host outright, and the refusal is indistinguishable from a dead snapshot. Use `curl` throughout.

   **Look for an existing snapshot first**, because most pages already have one and a lookup costs nothing:

   ```sh
   curl -s -o /dev/null -w '%{http_code} %{url_effective}\n' -L "https://web.archive.org/web/2/<url>"
   ```

   The serving-path redirect resolves to the nearest snapshot and, unlike the lookup APIs, is not rate-limited. Prefer it. The CDX API (`/cdx/search/cdx`) and the availability API (`/wayback/available`) are both throttled hard and return empty under load, which reads exactly like "no snapshot exists" - never conclude a page is unarchived from either one.

   **Only if no snapshot exists**, mint one with Save Page Now (`curl -sI https://web.archive.org/save/<url>`, snapshot URL in the Location header). Save Page Now rate-limits aggressively; space saves about 20 seconds apart.

   **Verify the snapshot captures the cited page**: its `link: <...>; rel="original"` response header is the archive stating which URL it captured, and it must match `url`. That header is also what `validate`'s `citations` check compares offline, so a mismatch here becomes a gate failure later. Archiving follows redirects, so if they disagree it is usually `url` that needs updating to where it now resolves.

   **Concurrency is the trap.** archive.org throttles by client, not by agent: several agents archiving at once get connection refusals and empty responses for perfectly healthy snapshots. When a generation run spans multiple courses or agents, do the fetch-and-verify work in parallel but collect the URLs and run **one serial archiving pass** at the end, with backoff. Leave `archived_url` empty with a `why` note in the meantime and fill it in that pass - a batch of failures under load is throttling, never evidence that a page is unarchived.

   An empty `archived_url` is allowed only with a `why` note (paywall, robots-blocked, or a pending batch pass) - never silently, and never left that way at the end of a run.
4. Record the full source object: `title`, `url`, `archived_url`, `accessed` (today), `source_type`, `why` (one line: what this source anchors).

## User sources

Material under `content/tenants/<tenant>/sources/` is already trusted - the learner supplied it. Record with `source_type: user` and the path in the `url` field, always relative to the vault root (`content/tenants/<tenant>/`), so it always starts with `sources/` regardless of which file the record sits in; no archiving needed. Where user material covers a module, it outranks web sources: the course should feel built on their materials, not beside them.

## Quality bar for anchor sources

Prefer, in order: primary documentation and specs; textbooks and long-lived references; peer-reviewed or canonical explainers; well-maintained community resources. Avoid as anchors (fine as supplements): individual blog posts younger than a year, social threads, generated content farms. For contested topics, two anchors representing the mainstream positions beat one. Topical precision outranks venue prestige: a preprint that names exactly the phenomenon a module teaches beats a prestigious source that gestures at it - note the trade-off in `why` when you make it.

## What downstream consumers expect

- The references panel in the app is built from these structured records - malformed records render broken panels.
- The Phase 6 audit skill will re-fetch a sample and check the claim-support link, not just liveness. Write `why` lines specific enough to audit against ("explains the borrow checker rules lessons 2-3 paraphrase", not "good resource").
