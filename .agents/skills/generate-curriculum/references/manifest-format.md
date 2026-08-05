# Manifest formats (canonical)

Course and module manifests. This document is the spec until `schemas/course.schema.json` and `schemas/module.schema.json` land in Phase 2. Decentralized on purpose: per-module manifests own all mutable state, so parallel writes never collide. **`course.yml` is a derived view**: regenerated from `profile.md` plus the module manifests (statuses included), never hand-edited - anything a tool needs to change lives in a `module.yml`.

## module.yml (the mutable truth)

At `content/<tenant>/<course-slug>/modules/NN-slug/module.yml`:

```yaml
schema_version: 1
module: 01-ownership-basics
title: Ownership, borrowing, lifetimes without tears
status: generated              # skeleton | generated | in-progress | mastered | stale
serves: [O1]
prerequisites: []              # module slugs that gate this one
est_hours: 4
concepts:                      # >= 2 siblings wherever material allows (interleaving)
  - ownership
  - borrowing
  - lifetimes
objectives:
  - id: M1-1
    text: Predict whether a snippet compiles, from ownership rules
    bloom: apply               # never above the profile's bloom_ceiling
sources:                       # 2-4, each FETCHED this session; see sourcing.md
  - title: The Rust Book, ch. 4
    url: https://doc.rust-lang.org/book/ch04-00-understanding-ownership.html
    archived_url: https://web.archive.org/web/2026...
    accessed: 2026-08-05
    source_type: web           # web | user (user = vault-root-relative path in url field)
    why: canonical explanation the lessons paraphrase and cite
  - title: Rust ownership visualized (user notes)
    url: sources/ownership-notes.pdf
    archived_url: ""
    accessed: 2026-08-05
    source_type: user
    why: the learner's own annotations; lessons build on their framing
lessons:                       # planned at skeleton time, default one per concept
  - file: 01-ownership.md
    title: Ownership
    concept: ownership
    status: generated          # planned | generated | reviewed | stale
```

## course.yml (the derived view)

At `content/<tenant>/<course-slug>/course.yml`:

```yaml
schema_version: 1
slug: rust-for-backend
title: Rust for backend developers
created: 2026-08-05
status: active                 # active | draft (draft = topic packs not yet adopted)
profile: ./profile.md          # topic packs: omit (packs are pre-contract)
hub: ./rust-for-backend-hub.md
objectives:
  - id: O1
    text: Build and ship a small HTTP service in Rust    # Bloom verb, <= ceiling
    bloom: apply
    assessed_by: working service passing the module 5 transfer prompt
modules:                       # ordered; every field here mirrors module.yml at regen time
  - n: 1
    slug: 01-ownership-basics
    title: Ownership, borrowing, lifetimes without tears
    status: generated          # copied from module.yml, never edited here
    est_hours: 4
    serves: [O1]
```

## Rules

- Directory prefix `NN-` fixes ordering; slugs are kebab-case and stable once created (wikilinks depend on them).
- Status changes go to `module.yml` (or a lesson's entry there); then regenerate `course.yml`. Tools that only read can trust `course.yml`; tools that write never touch it directly.
- A module with one concept is allowed when the material genuinely has no siblings; note why in a comment.
- Estimates are honest medians, not paddings; the budget check in generate-curriculum uses them.
- Topic packs (`topic-packs/`) use these same formats with `status: draft` and no `profile` field until adopted by a tenant.
