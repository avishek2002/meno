# Meno

**An AI agent that interviews you, builds you a cited curriculum, and tutors you through
it - all in a git repo you own.**

You tell your coding agent (Claude Code first-class; any capable agent CLI) what you want
to learn. Meno's skills make it interrogate you properly first - goal, prior knowledge,
depth, time budget - because a novice can't spec their own curriculum. Then it generates a
course with real, verified, archived sources, renders it in a local web app on your
machine, and runs spaced review sessions that gate progress on actual mastery.

The name is Plato's *Meno*: how can you search for something when you don't know what it
is? The interview is the answer.

## Quickstart

```
git clone https://github.com/avishek2002/meno   # clone, don't fork - forks can't go private
cd meno
tools/meno-init                                 # leakage guard, tenant dir, CLI census
npm install && npm run build && npm start       # the study app on http://127.0.0.1:7373
```

Then open your agent in the repo and say what you want to learn. The interview takes it
from there; module 1 is readable the same sitting. The full journey - reviews, mastery
gates, the Obsidian graph, todos, private backups - is in
[docs/how-meno-works.md](docs/how-meno-works.md).

## What's inside

- **Seven skills** (`.agents/skills/`) - the program an agent CLI executes: interview,
  curriculum generation, lesson generation, tutoring with mastery gates, citation
  auditing, vault upkeep, instance extension.
- **A local-first study app** (`app/`) - Vite + React over a small Node file API; reads
  and writes your markdown directly, grades recognition checks, tracks progress. No
  database, no daemon, binds localhost only.
- **Deterministic rails** (`schemas/`, `tools/`, `lib/`) - JSON Schema contracts,
  `npm run gate` (typecheck + 48 tests + validate), `npm run eval` (the generation-quality
  gate), byte-identical mastery derivation from an append-only ledger.
- **A living example** (`examples/example-learner/`) - a real generated Rust course
  carried through a real graded review session, override and all. It doubles as the test
  fixture, so the docs and the tests can never describe different systems.
- **Your content stays yours** - `content/tenants/` is gitignored, hook-guarded, backed
  up only to a private mirror you own (`tools/meno-mirror`), and never read by the base
  system.
  Your agent's model provider processes what the agent handles - true of any agent
  workflow; the guide says so plainly.

## For the curious

- [docs/architecture.md](docs/architecture.md) - the three pillars, the component map,
  and the write-authority seam that keeps mastery honest.
- [docs/specs/](docs/specs/) - per-subsystem specs: how each piece behaves and why.
- [PLAN.md](PLAN.md) - the phased build plan and locked decision record.
- [docs/RESEARCH.md](docs/RESEARCH.md) - the learning-science evidence base.
- [docs/org-deployment.md](docs/org-deployment.md) - deploying Meno for an organization: a
  private mirror-clone, a shared `content/org/` knowledge base, and roles mapped honestly onto your
  host - as a git-native pattern, not a hosted platform.
- [CONTRIBUTING.md](CONTRIBUTING.md) - the gate, the eval, the smoke protocol.

## License

MIT for everything in this repository. Content Meno generates for you belongs to you.
