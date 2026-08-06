---
schema_version: 1
pack: ai-and-agents/rag-grounding-and-faithfulness
title: RAG grounding and faithfulness
maintainers: []
audience: developers who can call a model API (application programming interface) and want to build a retrieval-augmented generation system whose answers they can prove are grounded; no information-retrieval background assumed
hours: 15-17
created: 2026-08-05
---

# RAG grounding and faithfulness - pack provenance

Build a RAG (retrieval-augmented generation) system and prove it is grounded. Module 1
makes the case for retrieval from the evidence on parametric knowledge limits - long-tail
gaps, stale training data, missing attribution. Modules 2 and 3 build the two halves of
the pipeline: retrieval (chunking, embeddings, hybrid lexical-plus-semantic search,
reranking) and grounded generation (grounding instructions, citation formats, forced
abstention when retrieval comes back empty). Module 4 measures the result with
RAG-specific metrics - faithfulness against retrieved context, answer relevance against
the question - over a labelled evaluation set. Module 5 diagnoses the ways grounded
systems still fail: retrieval misses, generation that ignores its context, and deference
to wrong premises in the query.

Scope boundaries, stated so the overlap check reads as intended:

- The sibling pack `ai-and-agents/limits-of-agent-generated-content` owns hallucination
  and sycophancy as phenomena (mechanisms, taxonomies, psychology). This pack cites those
  concepts and teaches the engineering response - retrieval, grounding, and measurement -
  not the phenomena themselves.
- Module 4 covers metrics specific to retrieval-augmented systems only; general
  evaluation practice (judges, rubrics, eval-set design at large) belongs to an
  evaluation-focused pack, not here.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 13 archived anchors: the original RAG paper,
  long-tail and freshness evidence, the RAG survey, dense passage retrieval, hybrid
  search documentation, citation and abstention references, the Ragas paper and metric
  documentation, and the failure-mode studies; 5 reference notes).
