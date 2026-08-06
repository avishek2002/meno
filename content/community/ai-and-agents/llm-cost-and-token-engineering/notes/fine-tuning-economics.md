---
schema_version: 1
type: reference
title: Fine-tuning economics - why prompting plus retrieval usually wins
concepts:
  - fine-tuning-economics
  - knowledge-injection-tradeoff
  - prompting-first-iteration
sources:
  - title: "Fine-Tuning or Retrieval? Comparing Knowledge Injection in LLMs (Ovadia, Brief, Mishaeli, and Elisha)"
    url: https://arxiv.org/abs/2312.05934
    archived_url: https://web.archive.org/web/20260805110254/https://arxiv.org/abs/2312.05934
    accessed: 2026-08-05
    source_type: web
    why: source for retrieval-augmented generation consistently outperforming unsupervised fine-tuning at knowledge injection, and for models struggling to learn new facts without many phrasing variations
  - title: "Optimizing LLM Accuracy (OpenAI docs)"
    url: https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy
    archived_url: https://web.archive.org/web/20260805110533/https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy
    accessed: 2026-08-05
    source_type: web
    why: source for the context-versus-behavior diagnosis, prompt engineering as the mandatory first step, fine-tuning scoped to consistency problems, and the case where adding retrieval to a tuned model lowered accuracy
  - title: "Introducing Contextual Retrieval (Anthropic)"
    url: https://www.anthropic.com/engineering/contextual-retrieval
    archived_url: https://web.archive.org/web/20260805105542/https://www.anthropic.com/engineering/contextual-retrieval
    accessed: 2026-08-05
    source_type: web
    why: source for the low standing cost of the retrieval baseline - cached prompt-resident knowledge below roughly 200,000 tokens, contextualized chunks near a dollar per million document tokens above it
---

# Fine-tuning economics - why prompting plus retrieval usually wins

## Diagnose before spending

OpenAI's [accuracy optimization guide](https://developers.openai.com/api/docs/guides/optimizing-llm-accuracy)
splits model failures along two axes: context problems (the model lacks the
knowledge - missing, stale, or proprietary information) and behavior problems (the
model has what it needs but is inconsistent in format, tone, or method). The
remedies differ: retrieval fixes context problems, fine-tuning targets behavior
problems, and prompt engineering comes first regardless - partly because writing
the prompt and its test cases is what forces a definition of what accuracy even
means for the task. The guide explicitly warns against reaching for fine-tuning
before the simpler methods have been exhausted, and its own case study shows the
tools are not additive by default: adding retrieval on top of a model fine-tuned
for a correction task lowered its accuracy.

## Knowledge belongs in context, not in weights

For the knowledge-injection case specifically, the comparison has been run head to
head. [Ovadia et al.](https://arxiv.org/abs/2312.05934) evaluated unsupervised
fine-tuning against retrieval-augmented generation (RAG) on factual questions and
found RAG consistently outperformed fine-tuning - for facts the model had seen in
training and for entirely new ones. The same paper explains why the tuned model
underperforms: models struggle to absorb a new fact from a training pass unless
they see it in many phrasing variations, which makes teaching facts through weights
both unreliable and expensive to prepare. Retrieved facts also stay current by
editing a document store; tuned-in facts go stale until the next training run.

## The iteration-speed and carrying-cost argument

The remaining argument is operational. A prompting-plus-retrieval baseline is cheap
to stand up and cheap to change: Anthropic's
[contextual retrieval post](https://www.anthropic.com/engineering/contextual-retrieval)
puts small knowledge bases (under roughly 200,000 tokens) directly in a cached
prompt with no retrieval infrastructure at all, and prices the chunk-contextualization
step for larger ones near a dollar per million document tokens. A prompt or corpus
edit takes effect on the next request. A fine-tune, by contrast, is an asset with a
carrying cost: training data to curate, a training run per change, its own
evaluation pass, and a redeployment - repeated every time the base model,
the task, or the facts move. That asymmetry is why the sensible order is
prompting, then retrieval, then fine-tuning only when an eval-backed consistency
gap survives the first two - and why the upgrade decision, like the tier decisions
elsewhere in this pack, routes through evals rather than intuition.
