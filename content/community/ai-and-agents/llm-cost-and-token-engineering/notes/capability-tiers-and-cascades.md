---
schema_version: 1
type: reference
title: Capability tiers and cascades - matching price to difficulty
concepts:
  - capability-tiers
  - cascade-routing
  - fallback-design
sources:
  - title: "Choosing the right model (Claude API docs)"
    url: https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
    archived_url: https://web.archive.org/web/20260805093823/https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
    accessed: 2026-08-05
    source_type: web
    why: source for the capability-speed-cost framing, the efficiency-first and capability-first starting strategies, and the benchmark-before-upgrading guidance
  - title: "FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance (Chen, Zaharia, and Zou)"
    url: https://arxiv.org/abs/2305.05176
    archived_url: https://web.archive.org/web/20260805105151/https://arxiv.org/abs/2305.05176
    accessed: 2026-08-05
    source_type: web
    why: source for the cascade result - up to 98 percent cost reduction while matching the best individual model - and the observation that API fees differ by two orders of magnitude
  - title: "Pricing (Claude API docs)"
    url: https://platform.claude.com/docs/en/about-claude/pricing
    archived_url: https://web.archive.org/web/20260805104506/https://platform.claude.com/docs/en/about-claude/pricing
    accessed: 2026-08-05
    source_type: web
    why: source for the concrete tier ladder used in the price-gap arithmetic
---

# Capability tiers and cascades - matching price to difficulty

## The tier ladder

Providers ship model families as capability tiers with deliberately spread prices.
On the [Claude pricing page](https://platform.claude.com/docs/en/about-claude/pricing),
the ladder runs from Haiku 4.5 ($1 per million input tokens, $5 output) through
Sonnet ($3, $15) and Opus 5 ($5, $25) to the flagship ($10, $50) - a 10x spread
inside one family. Across providers the gap is wider still: the
[FrugalGPT paper](https://arxiv.org/abs/2305.05176) observed that fees across
commercial LLM (large language model) APIs (application programming interfaces)
"differ by two orders of magnitude." Sending every task to the flagship therefore
does not buy uniform quality; it buys flagship prices for work the cheap tier would
have done identically.

## Two defensible starting points

Anthropic's [model choice guidance](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
names two strategies. Efficiency-first: start on the cheapest tier, test
thoroughly, upgrade only where a specific capability gap appears - suited to
prototyping, high-volume straightforward tasks, and latency-sensitive work.
Capability-first: start on the strongest model so capability is never the
confound, then optimize downward once the task is well understood - suited to
complex reasoning and work where accuracy outweighs cost. Both converge on the same
discipline: the tier decision is made per task shape against evidence, not once for
the whole system. The same page puts benchmarks first in its upgrade procedure -
build an evaluation set for your own use case, test with your actual prompts, then
weigh performance against cost. Route upgrade decisions through evals; how to build
trustworthy ones is its own subject (covered by an evals-focused pack where one
exists in this domain), and this pack only depends on the fact that they gate the
decision.

## Cascades and fallbacks

A cascade operationalizes the ladder per request rather than per task shape: send
the query to an inexpensive model first, score the answer with a cheap learned
check, accept it if the score clears a threshold, otherwise escalate to a stronger
model. [FrugalGPT](https://arxiv.org/abs/2305.05176) demonstrated the ceiling on
what this buys: its cascade matched the best individual model's performance with up
to 98 percent cost reduction on the benchmarks studied, because most queries never
needed the expensive model at all. A cascade is only safe with its complement, the
fallback: a defined place for a request to land when escalation runs out - the top
tier, a retry with restructured context, or a human. Without one, the failure mode
of aggressive routing is silent low-quality output rather than a visible miss.

Related, not duplicated: the agent-harness-craft pack in this domain covers
tier-routing as harness mechanics (per-subagent model overrides, session usage
tooling). This note carries the economics that make those mechanics worth wiring.
