---
schema_version: 1
type: reference
title: Routing work across model tiers
concepts:
  - tier-selection
  - task-routing
  - cost-instrumentation
sources:
  - title: "Choosing the right model (Claude API docs)"
    url: https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
    archived_url: https://web.archive.org/web/20260805093823/https://platform.claude.com/docs/en/about-claude/models/choosing-a-model
    accessed: 2026-08-05
    source_type: web
    why: frames model choice as capability vs speed vs cost and gives the efficiency-first and capability-first strategies
  - title: "Manage costs effectively (Claude Code docs)"
    url: https://code.claude.com/docs/en/costs
    archived_url: https://web.archive.org/web/20260805093714/https://code.claude.com/docs/en/costs
    accessed: 2026-08-05
    source_type: web
    why: names the drivers of token spend and the in-session usage tooling that attributes it
  - title: "How we built our multi-agent research system (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/multi-agent-research-system
    archived_url: https://web.archive.org/web/20260805090309/https://www.anthropic.com/engineering/multi-agent-research-system
    accessed: 2026-08-05
    source_type: web
    why: quantifies the token economics of multi-agent work - roughly 15x chat usage - and when the value justifies it
---

# Routing work across model tiers

Model families ship in tiers that trade capability against speed and cost. The
[model selection guide](https://platform.claude.com/docs/en/about-claude/models/choosing-a-model)
reduces the choice to those three axes and offers two starting strategies:
**efficiency-first** - begin on a fast, inexpensive tier, test thoroughly, and
upgrade only where a capability gap appears - and **capability-first** - begin on the
strongest tier so capability is never the confound, then optimize downward once the
workflow is proven. Either way, the guide's core advice is empirical: build an
evaluation set from your real tasks and let measured results, not intuition, decide
upgrades and downgrades.

Inside an agent harness the choice is not one decision but a routing policy,
because different parts of a session can run on different models. The
[cost guide](https://code.claude.com/docs/en/costs) recommends a mid-tier model as
the daily default, reserving the top tier for genuinely hard reasoning such as
architectural decisions, and pushing simple delegated tasks down to the small tier
via per-subagent model configuration. The shape that results: a cheap tier for
mechanical, well-specified work; a mid tier for ordinary coding and exploration; the
top tier for the few steps where a wrong call is expensive.

Routing only works if you can see where tokens go. Per the same cost guide, spend
in an agentic session is dominated by context size rather than message count: the
full conversation is resent with every request, so long sessions, cache misses after
breaks, and verbose tool output cost more than the visible chat suggests. In-session
usage tooling breaks token counts down per model and attributes usage to skills,
subagents, and long-context behavior; telemetry export exists for team-level
tracking. Read the instrumentation before and after a routing change - a cheaper
model that needs twice the retries is not cheaper.

Scale amplifies all of this. Anthropic's
[multi-agent research system writeup](https://www.anthropic.com/engineering/multi-agent-research-system)
measured multi-agent systems using roughly 15 times the tokens of ordinary chat,
with token usage explaining most of the performance variance in their browsing
evaluations. Their economic conclusion generalizes: parallel
multi-agent architectures pay for themselves only on tasks whose value supports the
token bill. The cheapest capable model, verified by instrumentation, is the
sustainable default.
