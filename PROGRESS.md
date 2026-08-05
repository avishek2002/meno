# Progress & agenda - Meno

Living status file - the done / backlog tracker for this project. **Update it whenever work changes:**
finish a thing -> move it to Done; pick up or think of a new thing -> add it to the agenda; make a call
that isn't captured in the code -> log it. Keep entries dated, newest near the top of each section.

_Last updated: 2026-08-05_

> Maintenance: keep this file current whenever work changes. Tooling can't see conversation-only
> decisions, so logging those is on whoever made them.

## Pending decisions (needs maintainer)

- None currently open.

## Done

- 2026-08-05 - **Phase 1 complete (the interview).** schemas/profile.schema.json + tools/validate.ts landed (Node/TS per build addenda: schema, cross-field consistency, body-section checks; 7 unit tests; npm run gate wired). Three golden personas committed (Sam Park, Priya Nair, Marcus Webb) with expected briefs. Acceptance: two simulated interviews (Sam happy path, Priya pushback path) produced valid, distinct profiles matching golden briefs exactly on all structured fields - question budgets 6 and 7, probes ran, confirmation gates fired, Priya's scope pushback fired and resolved to orient. Profiles committed as fixtures (example-learner/rust-for-backend, golden-personas/priya-nair). Skill hardened from run feedback: partial-opener rule, silent-pass feasibility, pushback counting, cascading-pushback recompute, Diagnose probe pattern, floor scaling table, time-question bundling.
- 2026-08-05 - **Phase 0 complete (skeleton and entry points).** Guides landed (how-meno-works, extending-meno, content-schema stub), specs foundation landed (docs/architecture.md, docs/specs/ template + repo-and-tenancy spec), example-learner stub with the Sam Park persona and golden brief. Acceptance: cold-start `claude -p` run in a fresh clone named the interview as entry point, covered tenant privacy, and linked the user guide (after one AGENTS.md hardening iteration; only Claude Code installed, other CLIs designed-for but unverified); dummy tenant content invisible to `git status`; all five skill symlinks survive a fresh clone on macOS (Linux by construction, not machine-verified).
- 2026-08-05 - design council at build start (4 specialists) locked the open build questions: one Node runtime for tools (validate.ts/eval.ts; mirror tooling stays shell), per-subsystem specs under docs/specs/, 8-event ledger taxonomy with authored check ids and byte-identical mastery rebuild, app design (node:http, unified/remark, walk-on-request, write authority by construction), eval judge with pinned model + anchor set. Details: docs/architecture.md and PLAN.md build addenda.
- 2026-08-05 - three open items resolved at build start: (a) static-site-generator choice is moot, superseded by decision 17 (Vite + React + local file API); (b) maintainer-machine agent CLI census: only Claude Code is installed, so Phase 0/8 acceptance runs record Claude Code results and list other CLIs as unverified; (c) video and interactive resources: decided by default - a source is any URL, video included, with no dedicated content type in v1 (additive to revisit).

- 2026-08-05 - adversarial review of the skill drafts (7-agent workflow: per-skill executability, cross-consistency, end-to-end flow simulation); 40 findings fixed, notably: vault bootstrap given an owner (elicit-needs preflight), module status moved to module.yml with course.yml as derived view, ledger events gain the level field gates key on, new-topic todos route through the interview, amend-a-course recipe added to extend-meno, CONTRIBUTING.md and docs/migrations.md stubs created.
- 2026-08-05 - five core skills drafted in `.agents/skills/` (elicit-needs, generate-curriculum, generate-module, extend-meno, second-brain) with references/ carrying the canonical formats (profile, manifests, sourcing, lesson anatomy, check blocks, vault conventions, todos); `.claude/skills/` symlinks; AGENTS.md skill listing + session-start rule. Drafts - phase acceptance criteria still gate "done".
- 2026-08-05 - second grill: three-pillar model added (Obsidian second brain / localhost app / agent). Decisions 14-17 locked: split write authority (UI recognition-level, agent gates), content/<tenant>/ IS an Obsidian vault (wikilinks canonical), todos.md as shared agent-scannable queue, Vite + React + local file API. Decision 2 superseded: static site -> local-first web app. PLAN.md Phase 4 rewritten.
- 2026-08-05 - project scaffolded: PLAN.md (phased build plan + decision record), docs/RESEARCH.md (9-agent research synthesis), AGENTS.md/CLAUDE.md entry points, README, MIT license. Public repo on avishek2002.
- 2026-08-05 - grill phase: all load-bearing decisions locked (see PLAN.md decision record). Notable: static site from day one, hybrid study loop, generate-ahead timing, gated-with-logged-override mastery, private-mirror tooling in v1 (knowingly-accepted scope risk).
- 2026-08-05 - research phase: 9-agent workflow across learning science, LMS landscape, needs elicitation, agent architecture, prior art, content schema; synthesized into docs/RESEARCH.md.

## On the agenda (backlog, not started)

- Phase 2 - harden generate-curriculum: course/module JSON schemas, tools/validate.py, example skeleton.
- Phase 3 - harden generate-module: lesson/ledger JSON schemas, example module 1, anatomy validation.
- Phase 4 - the localhost app (Vite + React + file API; recognition checks, todos, progress, wikilink rendering).
- Phase 5 - tutor-session skill + live ledger writes.
- Phase 6 - citation-integrity hardening (audit-citations + seeded-fault fixture).
- Phase 7 - meno init + private mirror tooling (design doc first).
- Phase 8 - collaboration + eval gate.
