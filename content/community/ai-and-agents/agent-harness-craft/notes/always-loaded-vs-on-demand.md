---
schema_version: 1
type: reference
title: Always-loaded instructions vs on-demand skills
concepts:
  - instruction-tiers
  - progressive-disclosure
  - capture-decision
sources:
  - title: "How Claude remembers your project (Claude Code docs)"
    url: https://code.claude.com/docs/en/memory
    archived_url: https://web.archive.org/web/20260803184145/https://code.claude.com/docs/en/memory
    accessed: 2026-08-05
    source_type: web
    why: documents the instruction-file tiers, their load order, and the guidance to keep files short and move procedures out
  - title: "Extend Claude with skills (Claude Code docs)"
    url: https://code.claude.com/docs/en/skills
    archived_url: https://web.archive.org/web/20260805084519/https://code.claude.com/docs/en/skills
    accessed: 2026-08-05
    source_type: web
    why: defines skills as on-demand procedure packages and states the trigger for capturing one
  - title: "Equipping agents for the real world with Agent Skills (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
    archived_url: https://web.archive.org/web/20260805093413/https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
    accessed: 2026-08-05
    source_type: web
    why: describes the three-tier progressive-disclosure loading model that makes on-demand knowledge nearly free until used
---

# Always-loaded instructions vs on-demand skills

An agent harness gives you two places to put standing knowledge, and they have
opposite cost profiles.

**Instruction files load every session.** In Claude Code's
[memory system](https://code.claude.com/docs/en/memory), markdown instruction files
are read at the start of every conversation, tiered by scope: an organization-managed
policy file, a user-level file for personal preferences across all projects, a
project-level file shared with the team through version control, and a local
project file for personal, uncommitted preferences. Files load broad to specific and
are concatenated, not overridden, so each fact should live at the widest tier where
it is true - and only there, because every line is paid for in context tokens on
every session. The documentation's guidance follows directly: keep these files short
(a target of under 200 lines), specific, and structured, and note that instructions
are context the model tries to follow, not enforced configuration.

**Skills load when needed.** A
[skill](https://code.claude.com/docs/en/skills) is a folder with a `SKILL.md` of
instructions plus optional supporting files and scripts - a packaged, repeatable
procedure. The
[Agent Skills engineering post](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
describes the loading model, called progressive disclosure, as three tiers: only each
skill's name and description load at startup; the full `SKILL.md` body loads when the
skill becomes relevant or is invoked; linked reference files load only if the
procedure actually needs them. Detailed know-how is therefore nearly free until the
moment it is used.

The boundary between the two is the working decision rule:

- A **fact** the agent should hold in every session - build commands, conventions,
  layout, standing rules - belongs in an instruction file.
- A **procedure** - multi-step, situational, with its own reference material -
  belongs in a skill. The skills documentation names the capture trigger precisely:
  you keep pasting the same instructions into chat, or a section of the always-loaded
  file has grown into a step-by-step workflow.
- A **one-off** stays a prompt. Capturing it buys nothing and adds a maintenance
  obligation.

Misplacing a procedure in the always-loaded tier is the common failure: it taxes
every session to support the few that need it, and the memory documentation notes
that longer instruction files reduce how reliably their instructions are followed.
