---
schema_version: 1
type: reference
title: How large language model pricing works - two meters, priced apart
concepts:
  - token-pricing-mechanics
  - context-length-cost
sources:
  - title: "Pricing (Claude API docs)"
    url: https://platform.claude.com/docs/en/about-claude/pricing
    archived_url: https://web.archive.org/web/20260805104506/https://platform.claude.com/docs/en/about-claude/pricing
    accessed: 2026-08-05
    source_type: web
    why: source for the per-model input and output rates, the roughly five-to-one output premium, the tokenizer note, and long-context billing at standard per-token rates
  - title: "Pricing (OpenAI API docs)"
    url: https://developers.openai.com/api/docs/pricing
    archived_url: https://web.archive.org/web/20260805103143/https://developers.openai.com/api/docs/pricing
    accessed: 2026-08-05
    source_type: web
    why: source for the same asymmetry at a second provider - flagship output priced about six times input - establishing the pattern as industry-wide
  - title: "Token counting (Claude API docs)"
    url: https://platform.claude.com/docs/en/build-with-claude/token-counting
    archived_url: https://web.archive.org/web/20260805104805/https://platform.claude.com/docs/en/build-with-claude/token-counting
    accessed: 2026-08-05
    source_type: web
    why: source for the free count_tokens endpoint and the roughly 30 percent tokenizer difference between model generations
  - title: "How we built our multi-agent research system (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/multi-agent-research-system
    archived_url: https://web.archive.org/web/20260805105311/https://www.anthropic.com/engineering/multi-agent-research-system
    accessed: 2026-08-05
    source_type: web
    why: source for the 4x and 15x token multipliers of agents and multi-agent systems over chat
---

# How large language model pricing works - two meters, priced apart

## Two meters

A large language model (LLM) API (application programming interface) call is billed
on two separate meters: tokens you send (input) and tokens the model generates
(output). The rates differ sharply. On the
[Claude pricing page](https://platform.claude.com/docs/en/about-claude/pricing),
every current model prices output at five times its input rate - Claude Haiku 4.5 at
$1 per million input tokens and $5 per million output, Claude Opus 5 at $5 and $25,
the flagship at $10 and $50.
[OpenAI's pricing page](https://developers.openai.com/api/docs/pricing) shows the
same shape, with flagship output at roughly six times input. The asymmetry is
structural across the industry, not one vendor's quirk.

The practical consequence cuts both ways. A summarization job (large input, small
output) and a generation job (small input, large output) with identical total token
counts can differ several-fold in cost, so a bill cannot be reasoned about from
token totals alone - the input-output split matters.

## Why context length is the bill

Each request is billed on everything sent as input, and an agentic system sends a
lot: instructions, tool definitions, and the accumulating conversation history
travel with every call. Anthropic's
[multi-agent research system writeup](https://www.anthropic.com/engineering/multi-agent-research-system)
measured the consequence: agents use about 4 times the tokens of ordinary chat, and
multi-agent systems about 15 times.
The bill lives in the context, not the reply. Long-context requests carry no rate
premium on Claude 4.6 and later models (a 900,000-token request bills at the same
per-token rate as a 9,000-token one, per the pricing page), which means the cost of
a bloated context is exactly proportional to its size - every needless token is
billed at full rate on every call that carries it.

## Counts do not transfer between models

Token counts are tokenizer-specific. The
[token counting documentation](https://platform.claude.com/docs/en/build-with-claude/token-counting)
notes that Claude models from 4.7 onward use a tokenizer producing roughly 30
percent more tokens for the same text than earlier models, and tells you to recount
prompts against the model you plan to use rather than reusing old measurements. The
same page documents the free `count_tokens` endpoint, which accepts a full request
(system instructions, tools, messages) and returns its input token count - the cheapest
possible instrument for measuring a workload before spending anything on it.
