# Extension recipes

Ordered steps per recipe. All paths relative to the repo root; `<t>` is the tenant directory name.

## Add a hand-made course

1. `content/tenants/<t>/<course-slug>/` with: `profile.md` (write it honestly - even a hand-made course deserves a contract; format: `.agents/skills/elicit-needs/references/profile-format.md`), `course.yml` and `modules/NN-slug/module.yml` per `.agents/skills/generate-curriculum/references/manifest-format.md`.
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

1. `content/community/<domain>/<pack-slug>/` (`<domain>` from the closed vocabulary in `content/community/DOMAINS.md`) mirroring a course tree (`course.yml`, `PACK.md`, hub, module manifests) but with no profile and no lesson bodies - packs are pre-contract; lessons stay `planned`.
2. `course.yml` gets `status: draft` and no `profile` field; `PACK.md` per `schemas/pack.schema.json` (title, maintainers, audience, hours, created, one amendment-log line).
3. Packs are tracked community content: standard markdown links, no tenant references, sources fetched and archived like any generated content. Full spec: `content/community/README.md`.

This recipe is for hand-authoring a pack from nothing. Turning an already-studied tenant course
into a pack instead is a different job with real sanitization stakes -
`.agents/skills/publish-to-community/SKILL.md` owns that path.

## Adopt a pack

Full flow and the "why" of each step: `content/community/README.md`'s adoption section (canonical -
this recipe only adds the extend-meno-side mechanics and links back rather than restating it).

1. Copy the pack's tree from `content/community/<domain>/<slug>/` into `content/tenants/<t>/<slug>/`
   (this direction is a normal copy - `content/community/README.md`'s adoption flow, not the
   transcribe-never-copy rule that binds the opposite, publish direction).
2. Run `elicit-needs` to produce the missing `profile.md` - the pack's scope gives the
   interviewer a running start. Set `course.yml`'s `status: active` and add the `profile` field.
3. Record provenance in `course.yml`: a `derived_from` block (`schemas/course.schema.json`) -
   `pack` (`content/community/<domain>/<slug>`), `pack_version` (the version `PACK.md` states, if it
   states one; otherwise the git commit sha of the pack directory right now -
   `git log -1 --format=%H -- content/community/<domain>/<slug>`), `adopted_at` (today). This is what
   lets a later `publish-to-community` run find the right pack to amend instead of guessing.
4. `generate-module` writes module 1 against the now-confirmed contract.

## After any recipe

Re-verify the five invariants in the SKILL.md, run validation where it exists, and capture follow-ups as todos in `content/tenants/<t>/todos.md` (format: `.agents/skills/second-brain/references/todo-format.md`).
