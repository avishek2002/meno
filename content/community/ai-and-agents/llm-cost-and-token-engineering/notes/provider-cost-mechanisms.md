---
schema_version: 1
type: reference
title: Provider cost mechanisms - caching, batching, and structured output
concepts:
  - prompt-caching-economics
  - batch-economics
  - structured-output-retries
sources:
  - title: "Prompt caching (Claude API docs)"
    url: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
    archived_url: https://web.archive.org/web/20260805105758/https://platform.claude.com/docs/en/build-with-claude/prompt-caching
    accessed: 2026-08-05
    source_type: web
    why: source for cache write and read multipliers, time-to-live options, exact-prefix matching, and breakpoint placement
  - title: "Batch processing (Claude API docs)"
    url: https://platform.claude.com/docs/en/build-with-claude/batch-processing
    archived_url: https://web.archive.org/web/20260805105920/https://platform.claude.com/docs/en/build-with-claude/batch-processing
    accessed: 2026-08-05
    source_type: web
    why: source for the 50 percent discount, the under-an-hour typical turnaround, and suitable workload shapes on the Anthropic side
  - title: "Batch API (OpenAI docs)"
    url: https://developers.openai.com/api/docs/guides/batch
    archived_url: https://web.archive.org/web/20260805110414/https://developers.openai.com/api/docs/guides/batch
    accessed: 2026-08-05
    source_type: web
    why: source for the matching 50 percent discount, the 24-hour completion window, and separate batch rate limits at the second provider
  - title: "Structured outputs (Claude API docs)"
    url: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
    archived_url: https://web.archive.org/web/20260805093928/https://platform.claude.com/docs/en/build-with-claude/structured-outputs
    accessed: 2026-08-05
    source_type: web
    why: source for constrained decoding guaranteeing schema-conforming output on the first attempt
---

# Provider cost mechanisms - caching, batching, and structured output

Providers publish three mechanisms that discount work you were already doing. None
changes what the model produces; all change what you pay for it.

## Prompt caching: pay for the prefix once

Most requests in an agentic workload share a large stable prefix - system instructions,
tool definitions, reference documents - that would otherwise be re-billed at full
input rate on every call. The
[prompt caching documentation](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)
prices the alternative: writing a prefix to cache costs 1.25x the base input rate
(5-minute lifetime) or 2x (1-hour lifetime), and every subsequent read costs 0.1x -
a tenth of the normal price. The 5-minute write pays for itself after a single hit.
The catch is exactness: a cache hit requires a 100 percent identical prefix, so the
mechanic rewards a specific prompt architecture - stable content first, volatile
content last, with the cache breakpoint on the last block that is identical across
requests. A timestamp or request identifier placed early in the prompt silently
converts every call back to full price. [OpenAI prices the same mechanism](https://developers.openai.com/api/docs/pricing)
at roughly 90 percent off for cached input.

## Batch endpoints: the patience discount

Work that does not need an answer within seconds can be submitted asynchronously
for a flat 50 percent discount on both input and output tokens - the same figure at
[Anthropic](https://platform.claude.com/docs/en/build-with-claude/batch-processing)
and [OpenAI](https://developers.openai.com/api/docs/guides/batch). Anthropic
reports most batches finish in under an hour; OpenAI guarantees a 24-hour window
and gives batch traffic its own, higher rate limits. The fit is any high-volume job
where latency is irrelevant: evaluations, dataset classification, content analysis,
embedding runs. Batch and caching discounts stack, per the Anthropic pricing notes,
so a batched workload with a well-placed cache prefix compounds both.

## Structured output: stop paying for retries

When output must be machine-readable, free-form generation carries a hidden
cost: every malformed response - broken JSON (JavaScript Object Notation), a
missing field, a wrong type - is detected by the caller and retried, paying full
input and output price for the do-over. The
[structured outputs documentation](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)
removes that loop with constrained decoding: the response is guaranteed to conform
to the supplied schema on the first attempt, which eliminates schema-violation
retries as a cost category, along with the validation-and-repair code that produced
them.
