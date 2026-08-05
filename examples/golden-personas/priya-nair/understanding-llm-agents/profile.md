---
schema_version: 1
tenant: priya-nair
course: understanding-llm-agents
created: 2026-08-05
status: confirmed
goal_category: understand
outcome_statement: "Understand how LLM agents work - tool use, context windows, orchestration, failure modes - well enough to lead design reviews credibly, without needing to build one herself"
prior_level: none
probe_result: confirmed-at-level
depth: orient
bloom_ceiling: understand
hours_per_week: 2
total_weeks: 4
budget_hours: 8
format_prefs: text-first
user_sources: false
questions_asked: 7
---

# Learning contract: Understanding LLM agents

## Goal
Priya is an engineering manager, ten years in industry, who hasn't written production code
in three years and has no hands-on machine-learning background. Her teams are building
features on LLM (large language model) agents, and she's been "nodding along" in meetings
where the team discusses tool calls and context windows. She does not want to build an agent
herself - she has engineers for that. What she wants is to stop nodding: to walk into a
design review, follow the trade-offs, ask sharp questions, and tell whether a proposed agent
design is sound, instead of trusting it on faith.

## Starting point
Self-reported: never touched agent-building or agent internals directly (menu option "never
touched it"). Live probe: asked what an agent is doing between two calls to the model, she
guessed it "pauses and reflects" on what it said - a conversational mental model with no
mechanism (no tool-call dispatch, no context reassembly, no orchestrating code). The probe
confirmed the self-report rather than adjusting it, per the skill's rule that a level-a probe
"mostly confirms rather than filters" - **verified starting level: none**. Known: general
software engineering fluency from a prior IC (individual contributor) career, comfortable
with technical conversation generally. Missing: any mechanical model of the agent
call-tool-observe loop, of context-window management, or of where these systems typically
fail.

## Scope contract
**In** (bounded by `orient` depth and an 8-hour budget):
- The core agent loop: how a model call, a tool call, and the tool's result chain together -
  reason: this is the load-bearing mechanism the probe showed is missing.
- Context windows: what's in context at each step and why it grows/gets pruned - reason:
  named explicitly as a goal term in the interview.
- Orchestration at a conceptual level: how a controller decides what happens next - reason:
  named explicitly as a goal term.
- Common failure modes (hallucinated tool arguments, infinite loops, context overflow, silent
  error swallowing) at a recognize-and-name level - reason: named explicitly ("where it
  fails") and is what makes design-review questions sharp.
- Enough shared vocabulary to read and question a design proposal - reason: this is the
  outcome statement itself.

**Out:**
- Hands-on building of an agent from scratch - reason: `orient` depth, and Priya explicitly
  said she is not trying to build one.
- Debugging or evaluating trade-offs at a practitioner level (e.g., picking an orchestration
  framework, tuning retry/backoff logic) - reason: that is `work-ready` depth, which was
  ruled out by the scope pushback as not fitting her real budget.
- Model training or fine-tuning - reason: a different discipline than agent orchestration;
  never part of the stated goal.
- Prompt-engineering craft or hands-on writing practice - reason: not part of the stated goal
  (leading reviews, not authoring agents).
- Certification or interview prep framing - reason: `goal_category` is `understand`, not
  `career`.

## Adjustment log
- 2026-08-05 - contract confirmed at interview. Depth was negotiated down from an initial
  `work-ready` ask (which did not fit the stated 6-hour budget) to `orient`, with the budget
  extended from 3 to 4 weeks at Priya's own suggestion to reach 8 hours; see the interview
  transcript's [PUSHBACK] section for the full negotiation.
