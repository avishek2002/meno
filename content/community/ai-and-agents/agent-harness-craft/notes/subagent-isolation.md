---
schema_version: 1
type: reference
title: Subagent isolation
concepts:
  - subagent-isolation
  - context-hygiene
sources:
  - title: "Create custom subagents (Claude Code docs)"
    url: https://code.claude.com/docs/en/sub-agents
    archived_url: https://web.archive.org/web/20260805094101/https://code.claude.com/docs/en/sub-agents
    accessed: 2026-08-05
    source_type: web
    why: documents subagents as separate context windows with their own instructions, tool access, permissions, and model
  - title: "How we built our multi-agent research system (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/multi-agent-research-system
    archived_url: https://web.archive.org/web/20260805090309/https://www.anthropic.com/engineering/multi-agent-research-system
    accessed: 2026-08-05
    source_type: web
    why: shows the same pattern at production scale - an orchestrator with parallel subagents acting as intelligent filters
---

# Subagent isolation

A subagent is a second agent the main conversation delegates to, and its defining
property is separation: per the
[subagents documentation](https://code.claude.com/docs/en/sub-agents), each subagent
runs in its own context window with its own base instructions, its own tool access
and permissions, and optionally its own model. Work done inside a subagent does not
occupy the main conversation's window; only the subagent's returned summary does.

That makes delegation the strongest context-hygiene move available. The
documentation's rule of thumb: hand off any side task that would flood the main
conversation with output you will not reference again - running tests, fetching and
reading documentation, processing logs, broad code exploration. The verbose
intermediate material stays in the subagent's window and dies with it; the
conclusion comes back. The same page notes the corollary levers: a subagent's tool
list can be restricted to enforce constraints, and its model can be set to a cheaper
tier when the delegated work is mechanical.

The pattern scales up. Anthropic's
[multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
uses an orchestrator-worker design in which a lead agent spawns parallel subagents
that each search and read in their own context windows, compress what they find, and
return condensed findings. The subagents function as intelligent filters: many
windows' worth of raw material becomes one window's worth of synthesis. Parallelism
also buys wall-clock time - the writeup reports large reductions in research time
for complex queries.

Two costs keep isolation from being free. Delegation is a summarization boundary:
whatever the subagent does not put in its summary is lost to the main conversation,
so delegated tasks should be self-contained, with a clear brief and a defined
deliverable. And token spend multiplies with the number of active windows - the
research-system writeup measured multi-agent runs at roughly 15 times chat usage -
so isolation pays when the side task is genuinely heavy or parallel, not as a
reflex.
