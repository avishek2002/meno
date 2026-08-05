---
schema_version: 1
type: reference
title: The agent loop and the tool-use round trip
concepts:
  - agent-loop
  - tool-use-loop
sources:
  - title: "Building effective agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/building-effective-agents
    archived_url: https://web.archive.org/web/20260805092535/https://www.anthropic.com/engineering/building-effective-agents
    accessed: 2026-08-05
    source_type: web
    why: defines the augmented LLM, the workflow-vs-agent distinction, and the loop driven by environmental feedback
  - title: "Tool use with Claude (Claude API docs)"
    url: https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
    archived_url: https://web.archive.org/web/20260805092615/https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview
    accessed: 2026-08-05
    source_type: web
    why: documents the tool_use and tool_result message round trip and where client and server tools execute
---

# The agent loop and the tool-use round trip

An agent is not a different kind of model. It is an ordinary large language model (LLM)
wrapped in a harness that gives it three augmentations - retrieval, tools, and memory -
and then calls it repeatedly. Anthropic's
[Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
calls this the augmented LLM and treats it as the basic building block of every agentic
system.

The mechanism underneath is the tool-use round trip, documented in the
[Claude tool-use overview](https://platform.claude.com/docs/en/agents-and-tools/tool-use/overview).
The harness sends the model a request that includes tool definitions - each a name, a
description, and an input schema. When the model decides a tool applies, it does not
execute anything itself: it returns a structured tool call (a `tool_use` block naming
the tool and its arguments) and stops. The harness, or the provider's infrastructure
for server-side tools, executes the call and appends the outcome to the conversation
as a `tool_result` message. The model then continues with that result in view. The
model chooses; the harness acts; the transcript carries the evidence.

Loop that round trip and you have an agent: the model reads the latest results,
decides the next action, acts through a tool, and reads what came back, repeating
until the task is done or a stopping condition fires. The distinguishing feature is
environmental feedback - each iteration's decision is grounded in what actually
happened, not in a plan fixed up front.

That is also the line between a workflow and an agent, and it matters for cost and
predictability. In a workflow, code orchestrates the model through predefined steps;
the path is fixed, so behavior is predictable and spend is bounded. In an agent, the
model directs its own process and tool usage. Workflows suit well-understood,
repeatable tasks; agents earn their overhead only when the path cannot be scripted in
advance.

One consequence for practitioners: the tools are the model's entire action surface,
so tool definitions deserve the same design care as a user interface. The same
engineering post recommends treating the agent-computer interface as a first-class
design object - formats the model naturally produces, descriptions with examples and
edge cases, and parameters shaped so the easy call is the correct one.
