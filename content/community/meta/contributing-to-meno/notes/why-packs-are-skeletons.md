---
schema_version: 1
type: reference
title: Why packs are skeletons, not courses
concepts:
  - pack-anatomy
  - draft-a-pack-recipe
  - reference-notes
sources:
  - title: "content/community/README.md (the topic-pack spec)"
    url: https://github.com/avishek2002/meno/blob/main/content/community/README.md
    archived_url: https://web.archive.org/web/20260805102347/https://github.com/avishek2002/meno/blob/main/content/community/README.md
    accessed: 2026-08-05
    source_type: web
    why: the canonical pack definition - pre-contract, planned lessons only, notes without pedagogy - whose rationale this note spells out
  - title: "extend-meno recipes.md (the draft-a-pack recipe)"
    url: https://github.com/avishek2002/meno/blob/main/.agents/skills/extend-meno/references/recipes.md
    archived_url: https://web.archive.org/web/20260805102420/https://github.com/avishek2002/meno/blob/main/.agents/skills/extend-meno/references/recipes.md
    accessed: 2026-08-05
    source_type: web
    why: the ordered steps for hand-authoring a pack, which the exercise set here follows rather than restates
  - title: "content/community/DOMAINS.md (closed domain vocabulary)"
    url: https://github.com/avishek2002/meno/blob/main/content/community/DOMAINS.md
    archived_url: https://web.archive.org/web/20260805102124/https://github.com/avishek2002/meno/blob/main/content/community/DOMAINS.md
    accessed: 2026-08-05
    source_type: web
    why: the closed list a new pack's domain must come from, and the stated reason the list stays closed
---

# Why packs are skeletons, not courses

A community topic pack ships module structure, Bloom-leveled objectives, prerequisite
order, verified anchor sources - and no lesson bodies. That looks like half a product
until you see what a lesson body is in Meno: prose written against one learner's
confirmed contract, their prior knowledge, their time budget, their goal. A pack has no
learner yet. Any lesson body a pack author wrote would be tuned to an imagined student,
and every real adopter would inherit that stranger's pacing. So packs carry the part of
course-building that is genuinely shareable - the hard-won decomposition of a subject
and the sources that survived verification - and leave generation to adoption time,
when a real contract exists. The full definition is owned by
[content/community/README.md](https://github.com/avishek2002/meno/blob/main/content/community/README.md);
the step-by-step drafting procedure is owned by the draft-a-pack recipe in
[recipes.md](https://github.com/avishek2002/meno/blob/main/.agents/skills/extend-meno/references/recipes.md).
Neither is restated here.

The same logic shapes the two things a pack may carry besides manifests. Reference
notes (like this one) hold fixed ground truth several future lessons would otherwise
each re-derive - but they must stay reference material, because anything shaped like a
lesson smuggles the pack author's pedagogy past the adoption boundary; the validate
gate rejects check blocks and lesson-anatomy sections in notes for exactly this reason.
And the domain a pack lives under comes from the closed vocabulary in
[DOMAINS.md](https://github.com/avishek2002/meno/blob/main/content/community/DOMAINS.md),
because a shared tier only stays searchable if the same subject cannot scatter across
five spellings.

The exercise: draft a one-module pack skeleton for a subject you know well, following
the recipe end to end - domain choice justified against the closed list and the
existing index, PACK.md, course.yml, hub, one module manifest with fetched and archived
anchors - then run the repository's validate gate and read what it says about your
tree. Whether you ever open the pull request, you will have touched every rule this
stream teaches, in the order a real contribution meets them.
