---
schema_version: 1
type: reference
title: Tokens and tokenization
concepts:
  - tokens-and-tokenization
sources:
  - title: "Anthropic docs: Glossary"
    url: https://platform.claude.com/docs/en/about-claude/glossary
    archived_url: https://web.archive.org/web/20260805093519/https://platform.claude.com/docs/en/about-claude/glossary
    accessed: 2026-08-05
    source_type: web
    why: defines tokens as the smallest units a model processes and gives the roughly 3.5-English-characters-per-token rule of thumb this note quotes
  - title: "3Blue1Brown: Transformers, the tech behind LLMs"
    url: https://www.3blue1brown.com/lessons/gpt
    archived_url: https://web.archive.org/web/20260805094409/https://www.3blue1brown.com/lessons/gpt/
    accessed: 2026-08-05
    source_type: web
    why: shows tokens being converted to high-dimensional vectors whose coordinates encode meaning, the step after tokenization this note describes
  - title: "Anthropic docs: Models overview"
    url: https://platform.claude.com/docs/en/about-claude/models/overview
    archived_url: https://web.archive.org/web/20260805094120/https://platform.claude.com/docs/en/about-claude/models/overview
    accessed: 2026-08-05
    source_type: web
    why: shows context windows and pricing denominated in tokens and notes the same text produces different token counts under different tokenizers
---

# Tokens and tokenization

A large language model (LLM) never sees raw text. Before inference, the input string is
encoded into a sequence of tokens - the smallest individual units the model processes.
A token can correspond to a word, a subword fragment, a single character, or even a byte;
for Claude models, one token averages roughly 3.5 English characters, though the ratio
varies by language ([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)).

Tokenizers trade off two pressures. Larger tokens (whole common words) make training and
inference more data-efficient, so vocabularies prefer them where possible. Smaller tokens
(fragments, characters, bytes) let the model represent rare, misspelled, or
never-before-seen strings by composition. The chosen tokenization method affects the
model's vocabulary size, its performance, and how it copes with out-of-vocabulary words.

After tokenization, each token is mapped to a high-dimensional vector (an embedding).
The coordinates of these vectors encode meaning: tokens used in similar contexts sit near
each other, and consistent directions in the space capture relationships such as gender
or plurality ([3Blue1Brown](https://www.3blue1brown.com/lessons/gpt)). These vectors,
not the text, are what the network actually transforms.

Why a developer should care:

- **Context windows and pricing are denominated in tokens**, not characters or words -
  vendor model tables state both limits and prices per token
  ([Anthropic models overview](https://platform.claude.com/docs/en/about-claude/models/overview)).
- **Tokens are usually invisible until they are not.** Working at the text level hides
  them, but they become relevant the moment you examine a model's exact inputs and
  outputs - counting costs, hitting limits, or debugging odd splits of unfamiliar words.
- **Identical text can tokenize differently across models.** Tokenizers differ between
  model families and even between generations of one family; the same text can produce
  materially different token counts under a different tokenizer.
