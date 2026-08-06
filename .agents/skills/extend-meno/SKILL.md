---
name: extend-meno
description: Change or add to this Meno instance - a hand-made course, a custom skill, an amended course structure, adjusted conventions, new tooling - while keeping schemas, tenancy, and entry points intact. Use when the user wants to modify how THEIR Meno works or add something to it; unlike elicit-needs and the generate skills, which create learning content, this changes the instance itself. For changes meant for every Meno user, route to CONTRIBUTING.md and an upstream pull request instead.
---

# Extend Meno

This skill owns safe local modification: the difference between "Meno is a product I use" and "Meno is mine". It exists because the repo is designed to be built on - and because extensions that break the invariants below quietly break the app, the vault, or a future upstream pull.

## First: route the request

- **New learning content for this user** -> not an extension: `elicit-needs` then the generate skills.
- **A change to this instance's behavior or structure** -> this skill, recipes below.
- **Something every Meno user would want** (a better question menu, a new check type, a schema improvement) -> build it here as a local change if the user wants it now, but say plainly that it belongs upstream, and point at `CONTRIBUTING.md` for the pull-request path. Local-only copies of generally-useful fixes rot.

## Invariants (survive every extension, verify before declaring done)

1. `CLAUDE.md` stays a one-line `@AGENTS.md` shim; agent-facing guidance lives in `AGENTS.md`.
2. `content/tenants/` stays gitignored; nothing under it is committed or referenced from tracked content (base or pack).
3. Schema changes bump `schema_version` and add a line to `docs/migrations.md`; consumers stay permissive with old versions.
4. Canonical-format ownership stands (profile: elicit-needs; manifests and sourcing: generate-curriculum; lesson anatomy and checks: generate-module; vault, todos, and `groups.yml`: second-brain; pack provenance and `CONTRIBUTORS.yml`: content/community/README.md). Extensions link to owners; they never fork a second copy of a spec.
5. New skills follow the Agent Skills shape: `name` + `description` frontmatter, body under 5,000 tokens, depth in `references/`, load-bearing instructions in plain prose - and get a `.claude/skills/` symlink plus an `AGENTS.md` listing line.

## Recipes

Step-by-step versions with commands live in [references/recipes.md](references/recipes.md).

- **Add a hand-made course** - build the same tree the generators build (profile, manifests, hub, lessons), validate against the format references; hand-made and generated courses are indistinguishable to the app and tutor.
- **Amend an existing course** - add, retitle, or resequence lessons and modules in a course that already exists: manifest edits per the manifest spec, then `generate-module` for any new bodies. This recipe owns "add a lesson on X to my course" requests (including `#course #for-agent` todos of that shape).
- **Add a custom skill** - scaffold under `.agents/skills/<name>/`, symlink, list in `AGENTS.md`, then cold-start test it: a fresh agent session must execute it from the SKILL.md alone.
- **Adjust shipped behavior** (question menus, lesson template, conventions) - prefer an additive custom skill or reference note over editing a shipped skill; a shipped-skill edit is allowed but recorded in a local `docs/local-divergences.md`, because upstream pulls will conflict exactly there and future-you needs to know which side to keep.
- **Draft a topic pack** - a pre-built course under `content/community/` following the same manifests; the full spec arrives in Phase 8, so mark drafts as such.

## Pulling upstream updates

`git pull` on main never touches `content/tenants/` (untracked by design). Conflicts can only land in tracked files - base files or `content/community/` packs - most likely in locally-edited shipped skills, which is what `docs/local-divergences.md` is for. After any pull: re-run validation if it exists, re-check invariant 1, and skim `docs/migrations.md` for schema notes affecting previously generated content (the tutor flags stale-schema content rather than choking, but regeneration decisions are the user's).

## Done means

Every invariant above re-verified after the change; validation passes where tooling exists; new skills cold-start tested; divergences recorded; and anything deferred ("do this properly later") captured as a todo in `content/tenants/<tenant>/todos.md` per the second-brain todo format - not left in conversation.
