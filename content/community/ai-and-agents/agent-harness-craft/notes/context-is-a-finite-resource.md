---
schema_version: 1
type: reference
title: Context is a finite resource
concepts:
  - context-assembly
  - context-hygiene
sources:
  - title: "Effective context engineering for AI agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    archived_url: https://web.archive.org/web/20260805034214/https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
    accessed: 2026-08-05
    source_type: web
    why: establishes the attention-budget framing, context rot, and the compaction, note-taking, and retrieval countermeasures
  - title: "Explore the context window (Claude Code docs)"
    url: https://code.claude.com/docs/en/context-window
    archived_url: https://web.archive.org/web/20260805084058/https://code.claude.com/docs/en/context-window
    accessed: 2026-08-05
    source_type: web
    why: itemizes what one real harness loads into the window at session start and how the window fills during work
---

# Context is a finite resource

The context window is everything the model can see on a given request, and it behaves
like a budget, not a warehouse. Anthropic's
[context engineering post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
frames it as an attention budget with diminishing marginal returns: as context grows,
the transformer architecture must spread pairwise attention across ever more token
relationships, and measured accuracy on long-context tasks degrades. The post calls
this context rot. The practical rule it derives: find the smallest set of
high-signal tokens that makes the desired outcome likely, then stop.

The window is never empty when work starts. In a real coding harness, the
[context window walkthrough](https://code.claude.com/docs/en/context-window) shows a
session begins with the harness's own base instructions, any memory and instruction
files, environment information, and tool listings, all loaded before the first user
message. Every file read, tool result, and turn of conversation then accumulates on
top. Standing instructions therefore have a permanent per-session price, which is why
lean instruction files are a cost decision as much as a style one.

When a long-running session approaches the limit, the standard countermeasures,
per the same engineering post, are:

- **Compaction** - summarize the conversation so far into a high-fidelity digest and
  restart the window from it, preserving decisions and unresolved threads while
  dropping raw tool output.
- **Structured note-taking** - persist important facts outside the window (files,
  running notes) and pull them back only when needed, giving durable memory with
  minimal token overhead.
- **Just-in-time retrieval** - keep lightweight identifiers (paths, links, queries)
  in context and fetch full content at the moment of use rather than preloading it.
- **Sub-agent isolation** - hand a focused subtask to a separate agent with its own
  clean window and take back only a condensed summary.

These four are the same move at different scales: keep the working set small, and
keep everything else addressable rather than resident.
