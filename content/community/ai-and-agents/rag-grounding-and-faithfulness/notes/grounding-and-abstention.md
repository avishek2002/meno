---
schema_version: 1
type: reference
title: Grounding, citations, and abstention - constraining the generator
concepts:
  - grounding-instructions
  - citation-formats
  - forced-abstention
sources:
  - title: "Citations (Claude API documentation)"
    url: https://platform.claude.com/docs/en/build-with-claude/citations
    archived_url: https://web.archive.org/web/20260428061146/https://platform.claude.com/docs/en/build-with-claude/citations
    accessed: 2026-08-05
    source_type: web
    why: source for sentence-level document chunking, cited-text-plus-index response structure, and the guarantee that parsed citations point at the provided documents
  - title: "Know Your Limits: A Survey of Abstention in Large Language Models (Wen et al., TACL 2024)"
    url: https://arxiv.org/abs/2407.18418
    archived_url: https://web.archive.org/web/20260719194027/https://arxiv.org/abs/2407.18418
    accessed: 2026-08-05
    source_type: web
    why: source for the query, model, and human-values framing of abstention and for abstention as a mitigation for hallucination
---

# Grounding, citations, and abstention - constraining the generator

## Grounding is a constraint, not a hope

Retrieval only helps if the generator actually answers from the retrieved passages. A
grounded generation stage states that constraint explicitly in its instructions -
answer only from the provided passages, quote or reference them, and say so when they
do not contain the answer - and then verifies the constraint held, rather than trusting
fluent output. The measurement half of that verification is module 4's subject; this
note covers the two mechanical supports: citations and abstention.

## Citations a reader can check

A citation format ties each claim in the answer to the specific passage that supports
it, at a granularity fine enough to verify. The [Claude API citations
documentation](https://platform.claude.com/docs/en/build-with-claude/citations)
shows one production shape of this: provided documents are chunked - plain text and PDF
(Portable Document Format) documents into sentences, or caller-defined content blocks
when more control is needed - and responses return the exact cited text along with
indices into the source documents. Because the citations are parsed and the cited text
is extracted directly, they are guaranteed to be valid pointers into the provided
documents, which the documentation contrasts with prompt-based quoting where nothing
enforces that a quoted string actually appears in a source. Whatever the vendor or
format, the property to preserve is that same one: a citation must resolve to a real
passage the reader can open.

## Abstention when the evidence is not there

The remaining case is a query whose answer the index does not contain. An ungrounded
model answers anyway, from its weights; a grounded system should decline. The survey by
[Wen et al.](https://arxiv.org/abs/2407.18418), published in Transactions of the
Association for Computational Linguistics, examines abstention from three perspectives -
the query, the model, and human values - and positions well-calibrated refusal as a
mitigation for hallucination and a safety property, not a failure of helpfulness. In a
RAG (retrieval-augmented generation) pipeline the cleanest version is structural:
when retrieval returns nothing over the relevance threshold, the system returns its
explicit "not in the corpus" path instead of calling the generator with an empty
context and letting parametric memory fill the silence.
