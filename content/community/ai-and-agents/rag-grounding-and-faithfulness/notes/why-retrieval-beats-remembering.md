---
schema_version: 1
type: reference
title: Why retrieval beats remembering - the case for RAG
concepts:
  - parametric-knowledge-limits
  - retrieval-augmentation
  - freshness-and-attribution
sources:
  - title: "Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks (Lewis et al., NeurIPS 2020)"
    url: https://arxiv.org/abs/2005.11401
    archived_url: https://web.archive.org/web/20260731185721/https://arxiv.org/abs/2005.11401
    accessed: 2026-08-05
    source_type: web
    why: source for the parametric vs non-parametric memory framing, the original RAG architecture, and provenance and knowledge updating as the problems retrieval addresses
  - title: "Large Language Models Struggle to Learn Long-Tail Knowledge (Kandpal et al.)"
    url: https://arxiv.org/abs/2211.08411
    archived_url: https://web.archive.org/web/20260801011133/https://arxiv.org/abs/2211.08411
    accessed: 2026-08-05
    source_type: web
    why: source for the correlation between pretraining-document frequency and factual accuracy, the scaling estimate, and retrieval as the long-tail fix
  - title: "FreshLLMs: Refreshing Large Language Models with Search Engine Augmentation (Vu et al.)"
    url: https://arxiv.org/abs/2310.03214
    archived_url: https://web.archive.org/web/20260721034426/https://arxiv.org/abs/2310.03214
    accessed: 2026-08-05
    source_type: web
    why: source for the finding that models of every size fail on fast-changing knowledge and false premises, and that retrieved current evidence recovers much of the loss
---

# Why retrieval beats remembering - the case for RAG

## Two kinds of memory

A language model's weights are parametric memory: knowledge absorbed during training and
frozen at that point. RAG (retrieval-augmented generation), introduced by
[Lewis et al.](https://arxiv.org/abs/2005.11401) at the 2020 Conference on Neural
Information Processing Systems (NeurIPS), pairs that parametric memory with a
non-parametric one - in the original paper, a dense vector index of Wikipedia consulted
by a neural retriever at query time - and conditions generation on what the retriever
returns. On language generation tasks the paper found the combination produced more
specific, diverse, and factual language than a parametric-only sequence-to-sequence
baseline, and it framed two problems that pure parametric models leave open: giving
provenance for what they assert, and updating what they know without retraining.

## The long tail is not in the weights

Parametric memory is not uniformly reliable. [Kandpal et
al.](https://arxiv.org/abs/2211.08411) show strong correlational and causal
relationships between a model's accuracy on a factual question and how many documents
relevant to that fact appeared in its pretraining corpus. Popular facts are learned;
rarely-documented ones are not, and the authors estimate that closing the gap by scale
alone would require models many orders of magnitude larger. The same paper names
retrieval augmentation as a promising approach for exactly this long tail: fetch the
rare fact at query time instead of hoping the weights memorized it.

## Fresh facts and false premises

Even well-documented knowledge goes stale. [Vu et
al.](https://arxiv.org/abs/2310.03214) benchmark models on questions requiring current
world knowledge and find that all of them, regardless of size, struggle on
fast-changing facts and on questions with false premises. Inserting retrieved,
up-to-date search results into the prompt substantially improves accuracy - and the
study observes that the amount and ordering of that retrieved evidence measurably
affect correctness, a detail that matters again when assembling context downstream.

## What this adds up to

Retrieval is the engineering response to three distinct weaknesses of weights-only
generation: long-tail facts the training corpus underrepresented, facts that changed
after training, and the inability to say where an answer came from. A system that
fetches evidence at query time can swap its index without retraining and can hand the
reader the passage behind each claim - which is what the rest of this pack builds and
then measures.
