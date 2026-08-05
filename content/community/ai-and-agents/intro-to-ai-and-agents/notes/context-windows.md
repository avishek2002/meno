---
schema_version: 1
type: reference
title: Context windows
concepts:
  - context-windows
sources:
  - title: "Anthropic docs: Context windows"
    url: https://platform.claude.com/docs/en/build-with-claude/context-windows
    archived_url: https://web.archive.org/web/20260805034729/https://platform.claude.com/docs/en/build-with-claude/context-windows
    accessed: 2026-08-05
    source_type: web
    why: defines the window as working memory, lists what counts toward it, documents context rot and the overflow behaviors this note describes
  - title: "Anthropic docs: Glossary"
    url: https://platform.claude.com/docs/en/about-claude/glossary
    archived_url: https://web.archive.org/web/20260805093519/https://platform.claude.com/docs/en/about-claude/glossary
    accessed: 2026-08-05
    source_type: web
    why: the context window entry contrasting working memory with the training corpus, the distinction this note leads with
---

# Context windows

The context window is all the text a large language model (LLM) can reference while
generating a response, including the response itself. It is the model's working memory,
and it is a different thing from the corpus the model was trained on: training data
shaped the weights long ago, while the context window holds whatever this conversation
has put in front of the model right now
([Anthropic glossary](https://platform.claude.com/docs/en/about-claude/glossary)).

Mechanics that matter in practice, per the
[context windows guide](https://platform.claude.com/docs/en/build-with-claude/context-windows):

- **Everything in the request counts.** The instructions the caller sets, every prior
  turn of the conversation (tool results, images, and documents included), the tool
  definitions, and the output being generated all consume window space. Conversations
  accumulate: each turn's input carries all previous turns.
- **Sizes are per model and finite** - recent Claude models offer up to 1 million
  tokens, others 200 thousand. The size is a hard budget, not a target.
- **More context is not automatically better.** As token count grows, accuracy and
  recall over the context degrade - a phenomenon the guide names context rot. Curating
  what is in the window matters as much as its capacity.
- **Overflow is a real failure mode.** Input that alone exceeds the window is rejected
  outright; on newer models, generation that reaches the limit mid-response stops with
  an explicit stop reason. Long-running conversations need a management strategy -
  summarizing or compacting earlier turns, or trimming what no longer earns its place.

The practical consequence for a developer: treat the window like any other bounded
resource. Count tokens before sending (vendors expose counting endpoints), decide what
deserves to be in context, and plan for the moment a long task approaches the limit.
