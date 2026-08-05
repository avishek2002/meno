---
schema_version: 1
type: reference
title: Hybrid retrieval and reranking - how the search side works
concepts:
  - chunking-and-indexing
  - hybrid-lexical-semantic-search
  - reranking
sources:
  - title: "Retrieval-Augmented Generation for Large Language Models: A Survey (Gao et al.)"
    url: https://arxiv.org/abs/2312.10997
    archived_url: https://web.archive.org/web/20260802002734/https://arxiv.org/abs/2312.10997
    accessed: 2026-08-05
    source_type: web
    why: source for the naive, advanced, and modular RAG paradigms and the retrieval-generation-augmentation decomposition this note follows
  - title: "Dense Passage Retrieval for Open-Domain Question Answering (Karpukhin et al.)"
    url: https://arxiv.org/abs/2004.04906
    archived_url: https://web.archive.org/web/20260729153150/https://arxiv.org/abs/2004.04906
    accessed: 2026-08-05
    source_type: web
    why: source for dense dual-encoder retrieval and its 9 to 19 point absolute improvement over BM25 on top-20 passage accuracy
  - title: "Hybrid search overview (Azure AI Search documentation, Microsoft Learn)"
    url: https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview
    archived_url: https://web.archive.org/web/20260724050501/https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview
    accessed: 2026-08-05
    source_type: web
    why: source for the production hybrid pattern - parallel full-text and vector queries merged with reciprocal rank fusion, plus the cases where keyword search wins outright
---

# Hybrid retrieval and reranking - how the search side works

## The pipeline in one pass

The survey by [Gao et al.](https://arxiv.org/abs/2312.10997) organizes
RAG (retrieval-augmented generation) systems into three paradigms - naive, advanced, and
modular - built on the same tripartite foundation of retrieval, generation, and
augmentation. The retrieval half of that foundation is a pipeline: split documents into
chunks, index each chunk so it can be found, search the index for a query's candidates,
and reorder the candidates so the best ones reach the generator. Each stage has a
design choice that changes what the generator ultimately sees.

## Lexical and semantic search catch different things

Classic lexical search scores exact term matches - BM25 (a term-frequency ranking
function) is the standard. Dense retrieval instead embeds queries and passages as
vectors and searches by similarity: [Karpukhin et
al.](https://arxiv.org/abs/2004.04906) showed a simple dual-encoder, trained on a small
number of question-passage pairs, beat a strong BM25 system by 9 to 19 points absolute
on top-20 passage retrieval accuracy - retrieval can be implemented with dense
representations alone.

Neither side wins everywhere. The [Azure AI Search
documentation](https://learn.microsoft.com/en-us/azure/search/hybrid-search-overview)
is explicit about the split: vector search finds conceptually similar content with no
keyword overlap, while keyword search stays more precise on exact identifiers - product
codes, specialized jargon, dates, and names. Hybrid search runs both queries in
parallel against one index and merges the two ranked lists with RRF (reciprocal rank
fusion), which the documentation names as the merge step for results that come from
different ranking functions - BM25 for text, vector-similarity search for embeddings.

## Reranking as the final filter

Merged candidates are ordered by retrieval scores, which are cheap and approximate. A
reranking stage rescores the top candidates against the query with a more expensive
model and reorders them before the context is assembled. The Azure documentation
describes this as an optional semantic ranking step applying machine reading
comprehension over initial results, and reports that testing on real-world and
benchmark datasets indicates hybrid retrieval with the semantic ranker offers
significant benefits in search relevance. The
Gao et al. survey likewise places it in the advanced paradigm's post-retrieval stage:
"the main methods in post-retrieval process include rerank chunks and context
compressing." The practical takeaway: recall problems are fixed in chunking and
hybrid search; precision problems at the top of the list are fixed in reranking.
