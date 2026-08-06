---
schema_version: 1
pack: ai-and-agents/llm-evals-and-judges
title: LLM evals and judges
maintainers: []
audience: developers who ship features backed by a large language model (LLM) and currently judge quality by eyeballing outputs; comfortable with code and tests, no evaluation background needed
hours: 14-16
created: 2026-08-05
---

# LLM evals and judges - pack provenance

Build the scorer before trusting the output. Five modules take a developer from "the
demo looked good" to a measured pipeline: why reading outputs is not a test suite and
what a labelled set of golden examples buys; the scorer taxonomy from exact match
through programmatic checks and rubric scoring to using a large language model (LLM)
as a judge, and where each can be trusted; the documented judge biases - position,
verbosity, self-enhancement - and the fixed-rubric, pinned-judge discipline they force;
regression gating with baselines, noise-sized guard bands, deliberate rebaselining,
and an append-only run history; and finally the payoff, running prompt iteration and
model upgrades against the suite instead of against anecdotes.

Scope fences, so this pack restates nothing a sibling owns: model capability and
failure-mode basics (hallucination, jagged capability) belong to
[intro-to-ai-and-agents](../intro-to-ai-and-agents/PACK.md); retrieval-specific
faithfulness and grounding metrics belong to the rag-grounding-and-faithfulness pack;
cost-aware model routing belongs to the llm-cost pack. This pack owns the measurement
discipline itself.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 8 archived anchors: the MT-Bench and Chatbot
  Arena judge study, the fair-evaluators position-bias study, Anthropic's eval and
  prompt-engineering documentation, Anthropic's agent-eval engineering guide and
  statistical eval research, promptfoo assertion and continuous-integration docs;
  5 reference notes).
