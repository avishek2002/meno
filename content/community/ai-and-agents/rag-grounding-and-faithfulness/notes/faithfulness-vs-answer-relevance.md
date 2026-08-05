---
schema_version: 1
type: reference
title: Faithfulness vs answer relevance - two axes, not one
concepts:
  - faithfulness-metric
  - answer-relevance
sources:
  - title: "Ragas: Automated Evaluation of Retrieval Augmented Generation (Es et al.)"
    url: https://arxiv.org/abs/2309.15217
    archived_url: https://web.archive.org/web/20260721155118/https://arxiv.org/abs/2309.15217
    accessed: 2026-08-05
    source_type: web
    why: source for reference-free RAG evaluation and for treating retrieval effectiveness and the generator's fidelity to retrieved passages as separate dimensions
  - title: "Faithfulness (Ragas metric documentation)"
    url: https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
    archived_url: https://web.archive.org/web/20260706064336/https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/
    accessed: 2026-08-05
    source_type: web
    why: source for the operational faithfulness definition - claims extracted from the response, verified against retrieved context, scored as supported over total on a 0-to-1 scale
---

# Faithfulness vs answer relevance - two axes, not one

## Why one score is not enough

A retrieval-augmented answer can fail in two independent ways: it can say things its
retrieved context does not support, or it can stay perfectly inside its context while
failing to answer the question asked. The Ragas framework of
[Es et al.](https://arxiv.org/abs/2309.15217) is built on exactly this separation -
evaluating a RAG (retrieval-augmented generation) system means scoring the retrieval
stage's effectiveness and the generation stage's use of what was retrieved as distinct
dimensions, because a single quality score cannot say which stage to fix. The
framework's other notable property is that its metrics are reference-free: they do not
rely on ground-truth human annotations, which the authors argue contributes to faster
evaluation cycles for RAG architectures.

## Faithfulness, operationally

The [Ragas metric
documentation](https://docs.ragas.io/en/stable/concepts/metrics/available_metrics/faithfulness/)
defines faithfulness as factual consistency between the response and the retrieved
context, computed in three steps: decompose the response into individual claims, check
each claim against the retrieved passages, and score the proportion supported. The
result runs from 0 to 1, where 1 means every claim in the answer is substantiated by
the context. A low faithfulness score implicates the generation stage - the passages
were on hand, and the answer strayed from them anyway.

## Relevance is the other axis

Answer relevance asks the complementary question: does the response actually address
what was asked? Ragas scores an answer down for being incomplete or padded with
redundant information, so an off-target answer rates low on relevance even when every
sentence of it is context-supported - fully faithful, largely useless.
The two metrics move independently, and the combination localizes faults: low
faithfulness with high relevance means the generator is inventing on-topic content;
high faithfulness with low relevance usually means retrieval fetched the wrong
passages, so the generator answered the question the context could support instead of
the one the user asked. That diagnostic reading, stage by stage, is what module 4's
labelled evaluation set makes routine.
