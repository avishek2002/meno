---
schema_version: 1
pack: ai-and-agents/llm-cost-and-token-engineering
title: LLM cost and token engineering
maintainers: []
audience: developers already shipping large language model (LLM) calls who watch the bill climb without a clear picture of why; comfortable calling an API (application programming interface), no machine-learning background needed
hours: 15-17
created: 2026-08-05
---

# LLM cost and token engineering - pack provenance

The economics pack: run large language model work without the bill or the quality
drifting. Module 1 grounds everything in how a bill is actually computed - separate
input and output token meters, context length, tokenizer differences - and insists on
instrumenting spend before optimizing it. The middle modules cover the three big
levers: routing tasks to capability tiers with cascades and fallbacks, context
discipline (lean prompts, persisted results, retrieval instead of stuffing), and the
provider mechanisms that discount honest work (prompt caching, batch processing,
structured output). Module 5 closes with the decision most teams get wrong once:
when not to fine-tune, and why prompting plus retrieval usually wins on cost and
iteration speed. Anchors are official Anthropic and OpenAI pricing and feature
documentation, Anthropic engineering posts, and the FrugalGPT cascade and
knowledge-injection papers (arXiv preprints).

Scope fences: [agent-harness-craft](../agent-harness-craft/course.yml) owns
model-tier discipline as harness craft (per-subagent overrides, session-level usage
instrumentation) - this pack teaches the economics underneath and cross-references
that pack rather than restating it. Eval methodology belongs to the
llm-evals-and-judges pack if present in this domain; this pack says "route upgrade
decisions through evals" and stops there.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 14 archived anchors: Anthropic and OpenAI
  pricing and token-counting documentation, prompt caching, batch, and structured
  output documentation, model-choice guidance, the FrugalGPT cascade paper, the
  fine-tuning versus retrieval knowledge-injection paper, and Anthropic engineering
  posts on context engineering, contextual retrieval, and multi-agent token
  economics; 6 reference notes).
