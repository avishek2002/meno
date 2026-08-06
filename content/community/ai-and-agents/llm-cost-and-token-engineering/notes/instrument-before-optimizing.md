---
schema_version: 1
type: reference
title: Instrument before optimizing - make the bill attributable first
concepts:
  - spend-attribution
sources:
  - title: "Token counting (Claude API docs)"
    url: https://platform.claude.com/docs/en/build-with-claude/token-counting
    archived_url: https://web.archive.org/web/20260805104805/https://platform.claude.com/docs/en/build-with-claude/token-counting
    accessed: 2026-08-05
    source_type: web
    why: source for the free count_tokens endpoint, its use for cost management and routing decisions, and the instruction to recount per model rather than reuse counts
  - title: "Pricing (Claude API docs)"
    url: https://platform.claude.com/docs/en/about-claude/pricing
    archived_url: https://web.archive.org/web/20260805104506/https://platform.claude.com/docs/en/about-claude/pricing
    accessed: 2026-08-05
    source_type: web
    why: source for per-request usage fields (input, output, cache reads and writes, server tool use) and console usage tracking that attribution is built from
---

# Instrument before optimizing - make the bill attributable first

Every optimization in this pack - routing, context discipline, caching, batching -
changes a number. None of them can be chosen, sized, or verified until that number
is visible per workload, not just as a monthly total. So the first move is always
instrumentation: make the bill attributable to its drivers, then optimize the
largest one.

The instruments are already in the platform. The
[token counting endpoint](https://platform.claude.com/docs/en/build-with-claude/token-counting)
is free and accepts a complete request - system instructions, tools, messages - returning
its input token count before anything is spent; the documentation names cost
management, routing decisions, and prompt-length optimization as its intended uses.
Every response also carries a usage block that the
[pricing documentation](https://platform.claude.com/docs/en/about-claude/pricing)
itemizes in its worked examples: input tokens, output tokens, cache reads and
writes, and server tool use, each billed at a different rate. Logged per call with
a workload label, those fields turn a flat bill into an answerable question - which
job, which prompt section, which model, cached or not - and the console's usage
tracking gives the same picture in aggregate.

Attribution also decides which lever applies. A bill dominated by repeated input
prefix points at caching; one dominated by output points at a smaller model or
tighter outputs; one dominated by growing conversation history points at context
discipline. Optimizing before measuring means guessing among these - and paying to
find out slowly.
