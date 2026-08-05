# Extending your Meno instance

This guide is about building on top of your own clone: adding courses, custom skills, and
local behavior changes. It is distinct from contributing upstream - improvements useful to
every Meno user go through [CONTRIBUTING.md](../CONTRIBUTING.md) instead.

The `extend-meno` skill (`.agents/skills/extend-meno/`) is the operational version of this
guide: ask your agent to make the change and it will follow that skill, including the
invariants that keep your instance healthy. This page is the human-readable map.

## The routing rule

- **New thing to learn** - not an extension at all. Ask to learn it; the interview
  (`elicit-needs`) is the entry point, and it will scope a new course properly.
- **Change to this instance** - a hand-made course, a custom skill, adjusted behavior: the
  recipes below, via `extend-meno`.
- **Change useful to everyone** - build it locally the same way, then contribute it upstream.

## Recipes (each has a precise procedure in the skill)

### Add a hand-made course

You can author a course yourself instead of generating one: create the course directory under
your tenant, write a `profile.md` for it (the same format the interview produces), add module
manifests and lessons following the canonical formats, and tag it `#hand-made`. The app and
the tutor loop treat it like any generated course - schemas do not care who wrote the files.

### Amend an existing course

Add a lesson, reorder modules, or fold in new source material by editing the module manifest
and regenerating the derived views. The skill's recipe keeps the manifests, hub notes, and
course overview consistent.

### Add a custom skill

New repeatable procedures live in `.agents/skills/<name>/SKILL.md` with a `.claude/skills/`
symlink and a listing in [AGENTS.md](../AGENTS.md). Follow the same shape as the shipped
skills: name and description frontmatter, a body an agent without native skill support can
succeed with by just reading, references for canonical formats.

### Adjust shipped behavior

You can edit the shipped skills - it is your clone. Log each edit in
`docs/local-divergences.md` (date, file, what changed, why) so future upstream updates can be
merged deliberately instead of clobbering your changes.

### Draft a topic pack

A topic pack is a pre-vetted, shareable curriculum in the same schema as generated courses.
Draft it locally under `content/community/`; if it is good, contribute it upstream.

## Invariants that survive every extension

Whatever you change, these hold (the `extend-meno` skill enforces them):

1. `CLAUDE.md` stays a one-line `@AGENTS.md` shim - all agent guidance lives in AGENTS.md.
2. `content/tenants/` stays gitignored - tenant material never becomes committable.
3. Schema changes bump `schema_version` and get a note in [migrations.md](migrations.md).
4. Each canonical format keeps exactly one owner - link to it, never fork a copy.
5. New skills follow the Agent Skills shape and are listed in AGENTS.md.
