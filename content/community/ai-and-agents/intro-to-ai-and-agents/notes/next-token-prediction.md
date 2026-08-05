---
schema_version: 1
type: reference
title: Next-token prediction, training, and inference
concepts:
  - next-token-prediction
  - training-vs-inference
sources:
  - title: "3Blue1Brown: Transformers, the tech behind LLMs"
    url: https://www.3blue1brown.com/lessons/gpt
    archived_url: https://web.archive.org/web/20260805094409/https://www.3blue1brown.com/lessons/gpt/
    accessed: 2026-08-05
    source_type: web
    why: explains that a model outputs a probability distribution over the next token and that repeated sampling generates text, the core mechanism this note states
  - title: "Attention Is All You Need (Vaswani et al., 2017)"
    url: https://arxiv.org/abs/1706.03762
    archived_url: https://web.archive.org/web/20260804124739/https://arxiv.org/abs/1706.03762
    accessed: 2026-08-05
    source_type: web
    why: the paper that introduced the transformer, the attention-only architecture modern large language models are built on
  - title: "Anthropic docs: Glossary"
    url: https://platform.claude.com/docs/en/about-claude/glossary
    archived_url: https://web.archive.org/web/20260805093519/https://platform.claude.com/docs/en/about-claude/glossary
    accessed: 2026-08-05
    source_type: web
    why: defines pretraining, fine-tuning, and RLHF, the training stages this note distinguishes, and notes pretrained models do not follow instructions well
  - title: "A Survey of Large Language Models (Zhao et al.)"
    url: https://arxiv.org/abs/2303.18223
    archived_url: https://web.archive.org/web/20260805093007/https://arxiv.org/abs/2303.18223
    accessed: 2026-08-05
    source_type: web
    why: documents that scaled-up language models show abilities absent in smaller ones, the emergence claim this note makes about capability from scale
---

# Next-token prediction, training, and inference

A large language model (LLM) does one thing: given a sequence of tokens, it outputs a
probability distribution over what the next token could be. Text generation is that one
operation applied repeatedly - sample a token from the distribution, append it, predict
again ([3Blue1Brown](https://www.3blue1brown.com/lessons/gpt)). Everything a chat
assistant appears to do - answering, summarizing, writing code - is produced this way.

The dominant architecture computing that distribution is the transformer, introduced by
[Vaswani et al. in 2017](https://arxiv.org/abs/1706.03762): a network built on attention
mechanisms alone, discarding the recurrence and convolutions of earlier sequence models.
Inside it, token vectors pass through alternating attention blocks (which let tokens
incorporate context from other tokens) and multilayer perceptrons, before a final layer
converts the result into next-token probabilities.

## Training vs inference

The two phases are easy to conflate and completely different:

- **Training** changes the model's weights. **Pretraining** runs next-token prediction
  over a large unlabeled corpus; the weights gradually encode the patterns of that text.
  A pretrained model is not inherently good at answering questions or following
  instructions ([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)).
  **Fine-tuning** continues training on a narrower dataset so the model mimics its
  patterns, and **reinforcement learning from human feedback (RLHF)** trains the model
  toward outputs humans rank higher - these later stages are what turn a raw text
  predictor into a usable assistant.
- **Inference** is using the trained model. The weights are fixed; each call runs the
  same frozen function over new input. Nothing a user types during inference changes
  what the model knows - there is no learning between calls, only whatever text sits in
  the current context.

## Why prediction produces capability

Predicting the next token well over the breadth of human text turns out to require
absorbing much of what that text encodes - grammar, facts, styles, reasoning patterns.
Empirically, this capability scales: models past a certain parameter scale display
abilities that smaller models trained the same way simply lack, a central observation of
the [survey by Zhao et al.](https://arxiv.org/abs/2303.18223). Capability, in other
words, was not programmed in feature by feature; it emerged from one objective applied
at scale.
