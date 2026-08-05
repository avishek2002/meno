# profile.md format (canonical)

The learning contract. One per course, at `content/tenants/<tenant>/<course-slug>/profile.md`. Every generation and tutoring skill reads it first; nothing downstream may contradict it. This file is the single source of truth for the format - other skills link here. The frontmatter is formalized in `schemas/profile.schema.json` and machine-checked by `tools/validate.ts` (schema, cross-field arithmetic, the depth-to-Bloom mapping, required body sections); this document remains the canonical prose definition.

## Frontmatter

```yaml
---
schema_version: 1
tenant: main                    # tenant directory name
course: rust-for-backend       # course slug, kebab-case, matches directory
created: 2026-08-05
status: confirmed               # draft | confirmed | superseded
goal_category: build            # build | understand | career | teach
outcome_statement: "Ship a small production-quality web service in Rust"
prior_level: vocabulary         # none | vocabulary | built-small-things | comfortable
probe_result: adjusted-down     # confirmed-at-level | adjusted-down | adjusted-up
depth: build                    # orient | build | work-ready | teach
bloom_ceiling: apply            # derived from depth, see mapping below
hours_per_week: 5
total_weeks: 8
budget_hours: 40                # hours_per_week x total_weeks
format_prefs: text-first        # text-first unless the user chose otherwise
user_sources: false             # true when content/tenants/<tenant>/sources/ has material
questions_asked: 6
---
```

Depth to Bloom ceiling mapping (fixed): `orient -> understand`, `build -> apply`, `work-ready -> analyze`, `teach -> create`. Objectives downstream never exceed the ceiling.

## Body sections (all four required)

```markdown
# Learning contract: <course title>

## Goal
One short paragraph in the learner's own words: the outcome, why now, what
"done" enables. Quote their phrasing where possible.

## Starting point
What the interview established: the claimed level, what the live probe was,
what it showed, and the verified starting level. Name specific known and
missing prerequisites discovered.

## Scope contract
What is IN (bounded by depth and budget) and what is explicitly OUT with a
one-line reason each. This is the section the drift trigger checks against.

## Adjustment log
- 2026-08-05 - contract confirmed at interview.
(Dated lines appended by re-clarification, override events, and re-scoping.
Never rewrite old lines.)
```

## Rules

- `status: superseded` plus a pointer line in the Adjustment log when a re-scope replaces the contract wholesale; never delete a profile.
- The Adjustment log is append-only.
- Wikilinks are the canonical link syntax in body prose, like everywhere in tenant content (PLAN.md decision 15); standard markdown links only for external URLs.
