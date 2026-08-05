# Extension recipes

Ordered steps per recipe. All paths relative to the repo root; `<t>` is the tenant directory name.

## Add a hand-made course

1. `content/<t>/<course-slug>/` with: `profile.md` (write it honestly - even a hand-made course deserves a contract; format: `.agents/skills/elicit-needs/references/profile-format.md`), `course.yml` and `modules/NN-slug/module.yml` per `.agents/skills/generate-curriculum/references/manifest-format.md`.
2. Lessons can be any markdown you want, but the closer to the nine-part anatomy (`.agents/skills/generate-module/references/lesson-format.md`), the more the app and tutor can do with them; at minimum give each lesson the frontmatter block so scheduling and progress work.
3. Hub note wikilinking every module; link it from the tenant home note (`.agents/skills/second-brain/references/vault-conventions.md`).
4. Validate: `tools/validate.py` when it exists; until then check each file against its format reference.
5. Seed `generated` ledger events if you want reviews scheduled (event format in the lesson format reference).

## Amend an existing course

1. Manifest first: add the lesson entry (`file`, `title`, `concept`, `status: planned`) to the right `modules/NN-slug/module.yml` - or a whole new module directory with its `module.yml` - per `.agents/skills/generate-curriculum/references/manifest-format.md`. New concepts join the module's `concepts` list.
2. Keep the contract honest: if the addition grows the course beyond the profile's `budget_hours` +10 percent, say so and let the user re-scope (extend the budget in `profile.md` with an Adjustment log line, or park something else).
3. Bodies via `generate-module` for the affected module (it iterates the `lessons` list, so the new entry gets picked up; existing lessons with bodies are left alone).
4. Regenerate `course.yml`, refresh the course hub's derived block, and check off the originating todo if one exists.

## Add a custom skill

1. `.agents/skills/<name>/SKILL.md` - frontmatter `name` (kebab-case, match the directory) and `description` (front-load what it is, then the distinct triggers, then its contrast with the nearest existing skill). Body: ordered steps, hard rules, "done means" checklist, all under 5,000 tokens; depth goes in `references/`.
2. Symlink for Claude Code: `ln -s ../../.agents/skills/<name> .claude/skills/<name>` (relative, from `.claude/skills/`).
3. Add one listing line to the Skills section of `AGENTS.md`.
4. Cold-start test, concretely: spawn a fresh agent session or sub-agent (any CLI) whose only briefing is the path to the new SKILL.md plus a realistic task the skill owns; it must complete correctly with no coaching. Fix the file, not the prompt, until it does.

## Adjust shipped behavior

1. Prefer additive: a custom skill or a reference note that the shipped skill's user (you) reads alongside - e.g. a `my-question-tweaks.md` the interview consults - over editing shipped files.
2. If editing a shipped skill is genuinely right: make the edit, then record it in `docs/local-divergences.md` (create the file on first use): date, file, what changed, why, and what to do on upstream conflict (usually "keep mine, re-apply on top").
3. If the change is generally useful, say so and offer the upstream path (`CONTRIBUTING.md`); a merged pull request deletes the divergence entry.

## Draft a topic pack

1. `topic-packs/<pack-slug>/` mirroring a course tree (manifests, hub, lessons) but with no profile - packs are pre-contract; the interview still runs and its profile decides how much of the pack applies.
2. Mark the pack `status: draft` in its `course.yml` until the Phase 8 spec formalizes packs.
3. Packs are base content: standard markdown links, no tenant references, sources fetched and archived like any generated content.

## After any recipe

Re-verify the five invariants in the SKILL.md, run validation where it exists, and capture follow-ups as todos in `content/<t>/todos.md` (format: `.agents/skills/second-brain/references/todo-format.md`).
