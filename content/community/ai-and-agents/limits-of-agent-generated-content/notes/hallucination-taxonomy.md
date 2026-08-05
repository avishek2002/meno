---
schema_version: 1
type: reference
title: Hallucination in language models - definition and taxonomies
concepts:
  - hallucination-taxonomy
  - hallucination-causes
sources:
  - title: "Survey of Hallucination in Natural Language Generation (Ji et al., ACM Computing Surveys)"
    url: https://arxiv.org/abs/2202.03629
    archived_url: https://web.archive.org/web/20260805092703/https://arxiv.org/abs/2202.03629
    accessed: 2026-08-05
    source_type: web
    why: source of the definition of hallucination as unintended, unfaithful generation and of the survey's organization across natural language generation tasks
  - title: "A Survey on Hallucination in Large Language Models (Huang et al., ACM Transactions on Information Systems)"
    url: https://arxiv.org/abs/2311.05232
    archived_url: https://web.archive.org/web/20260805093131/https://arxiv.org/abs/2311.05232
    accessed: 2026-08-05
    source_type: web
    why: source for the claim that large-language-model hallucination differs from task-specific hallucination and needs its own taxonomy of causes and mitigations
---

# Hallucination in language models - definition and taxonomies

## Definition

Hallucination is a model generating content that is plausible and fluent but false or
unsupported. The field-defining survey by
[Ji et al.](https://arxiv.org/abs/2202.03629), published in ACM Computing Surveys,
puts it plainly: transformer-based generation dramatically improved fluency and
coherence, but "deep learning based generation is prone to hallucinate unintended
text," which undermines deployment. The problem is not occasional sloppiness at the
margins; it is a systematic property of how these systems generate text.

## Two levels of taxonomy

Ji et al. organize hallucination research across the natural language generation
tasks where it was first studied - summarization, dialogue, question answering,
data-to-text, machine translation, and vision-language tasks - along with the metrics
used to measure it and the mitigation methods proposed. The recurring distinction in
that literature is between output that contradicts its given source material and
output that cannot be verified against the source at all.

For large language models specifically,
[Huang et al.](https://arxiv.org/abs/2311.05232), in ACM Transactions on Information
Systems, argue the older task-specific framing no longer fits: a general-purpose
assistant has no single source document to be faithful to, so their taxonomy centers
on "plausible yet nonfactual content" and classifies hallucinations by what they
betray - the facts of the world, or the input and context the model was given. The
same survey systematizes causes and reviews detection and mitigation approaches,
including the limits of retrieval-augmented systems.

## Where hallucinations come from

Huang et al. trace contributing factors along the model lifecycle: what the training
data contained (wrong, outdated, or missing information), what training optimized for,
and how inference-time decoding samples text. The practical consequence for a reader
of agent-generated content is that fluency carries no evidential weight: the
generation process that produces a correct sentence and the one that produces a
fabricated sentence are the same process, so confidence-sounding prose is not a
signal of truth.
