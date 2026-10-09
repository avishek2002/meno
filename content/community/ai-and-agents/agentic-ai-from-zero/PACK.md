---
schema_version: 1
pack: ai-and-agents/agentic-ai-from-zero
title: Agentic AI from zero
maintainers: []
audience: complete beginners to agentic AI with no command-line or programming experience - comfortable with a computer and a chat assistant; learns the terminal and git along the way
hours: 16-20
created: 2026-10-09
---

# Agentic AI from zero - pack provenance

A hands-on on-ramp for someone who has only chatted with an AI assistant and has never
opened a terminal. Eight modules of about two hours each walk from what an agent is (model,
loop, tools, permissions), through how to learn with an AI tutor without trusting it blindly,
the terminal and git, instruction files and memory, skills, connectors (the Model Context
Protocol, MCP), hooks, and finally sub-agents and model tiers. Each module ends in something
the learner makes or checks themselves, so the pack ends where the learner can drive an agent
on purpose.

Harness-agnostic: concepts are taught against both Claude Code and Codex. Anchor sources
are each vendor's official documentation plus neutral standards (Agent Skills, MCP, OWASP,
Pro Git), so an adopter on either tool, or another, maps the same concept to their own.

## How this differs from the neighbouring packs

- **[intro-to-ai-and-agents](../intro-to-ai-and-agents/PACK.md)** assumes command-line
  fluency and goes deep on the models themselves (tokens, training, sampling, failure
  modes). This pack assumes none of that and spends its time on using an agent, not on how
  a model works; the one overlap, the agent loop, is taught here as a first working picture
  rather than a mechanism study.
- **[agent-harness-craft](../agent-harness-craft/PACK.md)** assumes the learner already
  drives an agentic coding tool daily and wants to shape it deliberately. This pack is what
  comes before: someone who has never opened a terminal learns the terminal and git first,
  then meets each harness feature once, at a beginner depth. It ends where harness craft
  begins; the topic overlap in skills, hooks, and context is intentional, and the depth is
  not.

That answers any `pack-overlap` warning against those two packs.

Structure and anchor sources only, per the pack model: lesson bodies generate at adoption
against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-10-09 - pack created (8 modules, 29 archived anchor sources from official vendor
  documentation, open standards, and primary learning-science references).
