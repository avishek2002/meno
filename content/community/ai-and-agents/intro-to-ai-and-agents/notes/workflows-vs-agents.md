---
schema_version: 1
type: reference
title: Tool use, workflows, and agents
concepts:
  - tool-use
  - agent-loop
sources:
  - title: "Anthropic engineering: Building effective agents"
    url: https://www.anthropic.com/engineering/building-effective-agents
    archived_url: https://web.archive.org/web/20260805092535/https://www.anthropic.com/engineering/building-effective-agents
    accessed: 2026-08-05
    source_type: web
    why: source of the workflow-vs-agent definitions, the five workflow patterns, and the agents-as-tools-in-a-loop characterization this note quotes
  - title: "Anthropic docs: Tool use overview"
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
    archived_url: https://web.archive.org/web/20260805092615/https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
    accessed: 2026-08-05
    source_type: web
    why: documents the tool-use round trip - schema-described tools, structured tool_use calls, caller-side execution, tool_result back as context - this note describes
---

# Tool use, workflows, and agents

A large language model (LLM) only ever emits tokens. **Tool use** is the mechanism that
turns some of those tokens into actions: the caller describes available tools (name,
description, a JSON - JavaScript Object Notation - schema for arguments), and the model,
when it judges a tool relevant, responds not with prose but with a structured call
naming the tool and its arguments. The application executes that call - the model
itself runs nothing - and sends the result back as a new message, which the model reads
as context for its next step
([Anthropic tool use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview)).
Some tools run inside the caller's application; others run on the vendor's
infrastructure. Either way the division of labor is fixed: the model decides, the
harness executes.

On top of that mechanism, [Anthropic's guidance](https://www.anthropic.com/engineering/building-effective-agents)
draws a line worth memorizing:

- **Workflows** are systems where LLMs and tools are orchestrated through predefined
  code paths - the developer decides the steps; models fill in slots. Five recurring
  patterns: prompt chaining (sequential calls, each consuming the last output), routing
  (classify, then dispatch to a specialist), parallelization (independent subtasks, or
  voting across repeated runs), orchestrator-workers (one model decomposes and
  delegates), and evaluator-optimizer (one model generates, another critiques, loop).
- **Agents** are systems where the LLM dynamically directs its own process and tool
  usage - it plans, acts, reads the results, and decides what to do next. Concretely,
  agents are "LLMs using tools based on environmental feedback in a loop": gather
  context, call a tool, observe, revise, repeat until a stopping condition.

The same guidance is blunt about when each applies: prefer the simplest thing that
works. Workflows fit tasks whose steps are predictable; agents earn their complexity on
open-ended problems where the number of steps cannot be predicted or the path cannot be
hardcoded. An agent's autonomy buys flexibility and costs predictability - which is why
checks, verifiable intermediate results, and clear stopping conditions are part of any
serious agent design, not an afterthought.
