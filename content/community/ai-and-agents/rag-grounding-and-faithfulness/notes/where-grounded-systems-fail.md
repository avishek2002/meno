---
schema_version: 1
type: reference
title: Where grounded systems fail - misses, ignored context, wrong premises
concepts:
  - retrieval-misses
  - context-ignoring-generation
  - wrong-premise-deference
sources:
  - title: "Seven Failure Points When Engineering a Retrieval Augmented Generation System (Barnett et al.)"
    url: https://arxiv.org/abs/2401.05856
    archived_url: https://web.archive.org/web/20260723013153/https://arxiv.org/abs/2401.05856
    accessed: 2026-08-05
    source_type: web
    why: source for the seven failure points catalogued across three case-study domains and for the observation that RAG robustness evolves in operation rather than being designed in
  - title: "Lost in the Middle: How Language Models Use Long Contexts (Liu et al.)"
    url: https://arxiv.org/abs/2307.03172
    archived_url: https://web.archive.org/web/20260804204928/https://arxiv.org/abs/2307.03172
    accessed: 2026-08-05
    source_type: web
    why: source for the position effect - accuracy is highest when relevant information sits at the start or end of the context and degrades significantly in the middle
  - title: "ClashEval: Quantifying the tug-of-war between an LLM's internal prior and external evidence (Wu et al.)"
    url: https://arxiv.org/abs/2404.10198
    archived_url: https://web.archive.org/web/20260719194031/https://arxiv.org/abs/2404.10198
    accessed: 2026-08-05
    source_type: web
    why: source for models overriding their own correct knowledge in favor of wrong retrieved content over 60 percent of the time, and for perturbation severity and confidence as moderators
---

# Where grounded systems fail - misses, ignored context, wrong premises

Retrieval plus grounding plus metrics does not make a system immune; it changes where
the failures live. Three families cover most of them, one per pipeline stage.

## The retrieval stage: nothing useful arrives

[Barnett et al.](https://arxiv.org/abs/2401.05856), reporting on RAG
(retrieval-augmented generation) systems built across research, education, and
biomedical domains, catalogue seven failure points. The early ones are retrieval
failures: the corpus simply does not contain the answer (missing content), the right
document exists but does not rank high enough to be retrieved, or it is retrieved and
then lost when results are consolidated into the context. Their operational
conclusions are sobering and useful: validating a RAG system is only feasible during
operation, and robustness evolves rather than being designed in at the start - which
is why module 4's evaluation set is built before the failures are hunted, not after.

## The generation stage: the answer ignores its context

The later failure points in the same catalogue are generation-side: the answer is
present in the retrieved context but the model fails to extract it, or the output has
the wrong format, specificity, or completeness. One mechanism behind
retrieved-but-ignored failures is positional:
[Liu et al.](https://arxiv.org/abs/2307.03172) show that on multi-document question
answering, model accuracy is highest when the relevant passage sits at the beginning or
end of the context and degrades significantly when it sits in the middle - including
for models built for long contexts. Stuffing more passages into the prompt can
therefore lower answer quality even while retrieval recall improves.

## The query itself: wrong premises pull the answer

The third family involves no missing evidence at all. When the context and the model's
own knowledge disagree, [Wu et al.](https://arxiv.org/abs/2404.10198) measure a
tug-of-war: given retrieved documents with deliberately introduced errors, models
abandoned their own correct prior knowledge in favor of the wrong context over 60
percent of the time, with wilder perturbations rejected more often and less confident
models yielding more readily. A query that embeds a false premise sets up the same
trap from the other side - the retriever dutifully fetches passages matching the
premise, and the generator elaborates it instead of challenging it. Why models tend to
agree with an asker's stated framing at all is the sycophancy literature, owned by the
sibling pack's note on
[sycophancy evidence](../../limits-of-agent-generated-content/notes/sycophancy-evidence.md);
the engineering response here is diagnostic: false-premise probes in the evaluation
set, and a grounding instruction that licenses the system to dispute the question.
