---
schema_version: 1
type: reference
title: Sampling and temperature
concepts:
  - sampling-controls
sources:
  - title: "Anthropic docs: Glossary"
    url: https://platform.claude.com/docs/en/about-claude/glossary
    archived_url: https://web.archive.org/web/20260805093519/https://platform.claude.com/docs/en/about-claude/glossary
    accessed: 2026-08-05
    source_type: web
    why: the temperature entry - randomness control, high vs low behavior, and the caveat that temperature 0 is still not fully deterministic - this note restates
  - title: "3Blue1Brown: Transformers, the tech behind LLMs"
    url: https://www.3blue1brown.com/lessons/gpt
    archived_url: https://web.archive.org/web/20260805094409/https://www.3blue1brown.com/lessons/gpt/
    accessed: 2026-08-05
    source_type: web
    why: explains that the model's final layer produces a probability distribution over tokens, the distribution sampling controls act on
---

# Sampling and temperature

A model's forward pass ends in a probability distribution over every token in its
vocabulary ([3Blue1Brown](https://www.3blue1brown.com/lessons/gpt)). Generation requires
choosing one token from that distribution, and sampling controls govern how that choice
is made. They shape the output without changing the model at all.

**Temperature** controls the randomness of those choices
([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)):

- **Lower temperature** concentrates choices on the most probable tokens, producing
  conservative, deterministic-leaning output that sticks to the likeliest phrasing and
  answers. Suited to extraction, classification, and anything a script will parse.
- **Higher temperature** flattens the effective distribution, letting the model explore
  rare, uncommon, or surprising word choices and sequences - more creative and diverse
  output, with variation across runs. Suited to brainstorming and fiction.

One caveat worth internalizing early: even at temperature 0, results are not fully
deterministic - identical inputs may still produce different outputs across API
(application programming interface) calls, on first-party and cloud-hosted inference
alike ([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)).
Pipelines that assume byte-identical reruns of the same prompt are building on sand;
design for semantic stability (validate structure and meaning) rather than exact-match
stability.
