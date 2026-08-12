# The example learner

This directory is the committed reference tenant: a complete, fake learner whose content tree
exercises every format Meno defines. It is both the living spec (see a real profile, manifest,
lesson, and ledger side by side) and the fixture that tests, evals, and docs point at.

It lives under `examples/`, outside `content/`, on purpose: `content/tenants/` is gitignored
so real tenant material can never be committed, and a committed fake tenant must never sit
beside real gitignored ones - no gitignore negation rule to carve this example out, no way to
leak a real tenant alongside it. Nothing in the base system reads real tenant content; this
example is the only learner-shaped material base code and docs may reference.

## The persona

**Sam Park** (fictional) is a backend developer, comfortable in Python and TypeScript, who
wants to learn Rust well enough to build and ship a small backend service with it. Sam has
read about Rust and knows the vocabulary (ownership, borrowing, lifetimes as words) but has
never written a program in it. Sam can give the project about 4 focused hours a week for 6
weeks - a budget of roughly 24 hours.

Expected learning contract (the golden brief the interview should reach):

- `goal_category: build` - the outcome is a working service, not exam knowledge.
- `prior_level: vocabulary` - knows the words, has built nothing; the live probe should
  confirm this level rather than adjust it.
- `depth: build` with `bloom_ceiling: apply` - working fluency, not internals mastery.
- `hours_per_week: 4`, `total_weeks: 6`, `budget_hours: 24`.

## What fills this directory, phase by phase

- Phase 1: `rust-for-backend/profile.md` - the confirmed learning contract, plus golden
  personas for the interview under [../golden-personas/](../golden-personas/).
- Phase 2: the course skeleton - `course.yml`, module directories with `module.yml`
  manifests, the course hub note with its dependency map, all sources fetched and archived.
- Phase 3: module 1's lessons in full nine-part anatomy, plus `progress/ledger.jsonl` and
  `mastery.yml` fixtures.
- Phase 5 onward: ledger fixtures grow to cover review sessions, gates, and overrides.

A phase's acceptance criteria treat this directory as evidence: if the example learner's tree
does not validate, the phase is not done.

## The second course

`software-engineering/git-fundamentals/` is a deliberately minimal second course: a
`course.yml`, one skeleton `module.yml` with two planned lessons, no lesson bodies. It exists so
the knowledge-graph view (`docs/specs/graph.md`) has something real to render:

- A cross-course `## Connects to` edge - the hub carries a reciprocal `meno:connects` bullet with
  `rust-for-backend`'s hub, and `rust-for-backend-hub.md` links back the same way.
- Two ghost nodes - the module's two planned lessons have no files, so they render hollow,
  attached to the hub only by a `membership` edge from the manifest.
- A second course group (`version-control` in `groups.yml`), giving the graph's colour channel
  a second value to show.

It is intentionally too small to study from; its only job is to exercise these shapes for the
gate and for the picture.
