# Meno

**An AI agent that interviews you, builds you a cited curriculum, and tutors you through it - all in a git repo you own.**

> **Status: planning phase.** The design is settled and researched; implementation has not started. Details below.

You tell your coding agent (Claude Code, Codex, Gemini CLI, or any capable agent CLI) what you want to learn. Meno's skills will make it interrogate you properly first - goal, prior knowledge, depth, time budget - because a novice can't spec their own curriculum. Then it generates a course with real, verified sources, renders it in a local web app on your machine, and runs spaced review sessions that gate progress on actual mastery.

Your content stays yours: everything generated for you is gitignored, never committed or published, and backed up only to your own private mirror. (Your agent's model provider does process what it generates for you - that's true of any agent workflow, and the guide will say so plainly.) The repo you clone will contain only the shared machinery - the skills, schemas, guide, and one example course.

The name is Plato's *Meno*: how can you search for something when you don't know what it is? The interview is the answer.

## Where things stand

Nothing to run yet. What exists is the full design:

- [PLAN.md](PLAN.md) - phased build plan with acceptance criteria and the locked decision record.
- [docs/RESEARCH.md](docs/RESEARCH.md) - the evidence base: learning science, LMS landscape, prior art, architecture.

## Design in one paragraph

Evidence-backed generation (spaced retrieval, worked examples with fading, mastery gates at ~80 percent, desirable difficulties), a clarification interview built for people who don't know what they don't know (closed questions, anchored menus, one live probe), model-agnostic entry points (`AGENTS.md` canonical, `CLAUDE.md` a one-line shim), tenant-scoped content over a shared skill core, and citations that are fetched before they're cited and archived against link rot.

## License

MIT for everything in this repository. Content Meno generates for you belongs to you.
