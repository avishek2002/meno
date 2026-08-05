---
schema_version: 1
type: reference
title: Knowledge cutoffs
concepts:
  - knowledge-cutoffs
sources:
  - title: "Anthropic docs: Models overview"
    url: https://platform.claude.com/docs/en/about-claude/models/overview
    archived_url: https://web.archive.org/web/20260805094120/https://platform.claude.com/docs/en/about-claude/models/overview
    accessed: 2026-08-05
    source_type: web
    why: publishes per-model training data cutoffs and the distinct reliable knowledge cutoff, the two dates this note explains
  - title: "Anthropic docs: Glossary"
    url: https://platform.claude.com/docs/en/about-claude/glossary
    archived_url: https://web.archive.org/web/20260805093519/https://platform.claude.com/docs/en/about-claude/glossary
    accessed: 2026-08-05
    source_type: web
    why: the RAG entry - retrieving current information into the context window at runtime - the standard remedy this note points to
---

# Knowledge cutoffs

A large language model (LLM) knows only what its training data contained, and that data
ends somewhere. Vendors publish this as a cutoff date; Anthropic's model table, for
example, lists two dates per model: a **training data cutoff** (the broader end of the
data range used) and an earlier or equal **reliable knowledge cutoff** - the date through
which the model's knowledge is most extensive and dependable
([models overview](https://platform.claude.com/docs/en/about-claude/models/overview)).
The gap between the two is worth noticing: data near the end of training is present but
thinner, so reliability fades before it stops.

Three practical consequences:

- **The model will not know recent events, releases, or prices** - and, worse, it may
  not know that it does not know, answering from stale patterns instead. A cutoff
  failure often looks exactly like a hallucination: fluent, confident, outdated.
- **Cutoffs are per model, not per product.** Different models behind the same
  interface can carry different cutoffs; check the model table, not the product name.
- **The remedy is retrieval, not asking nicely.** Fresh facts must be put into the
  context window at runtime. Retrieval augmented generation (RAG) does exactly this:
  relevant, current documents are fetched and passed to the model alongside the query,
  letting it use information beyond its training data and ground its answer in evidence
  ([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)).
  Tool use - a web search or database query the model can invoke - is the agentic form
  of the same move.

The habit to build: before trusting a model on anything time-sensitive, ask "was this
true before the cutoff, and is it still true?" If the answer matters, retrieve.
