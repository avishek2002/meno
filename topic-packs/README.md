# Topic packs

A topic pack is a pre-vetted curriculum for a common subject, shareable through the
normal pull-request path and adoptable by any tenant. Packs exist so well-trodden topics
do not need every learner's agent to rediscover the same structure and sources.

## The format (no new schema)

A pack is a course skeleton in the exact formats generated courses use
([manifest-format.md](../.agents/skills/generate-curriculum/references/manifest-format.md)),
with two deliberate differences:

- `course.yml` has `status: draft` and **no `profile` field** - a pack is pre-contract;
  it meets its learner at adoption time.
- Lessons are `planned` only - **no lesson bodies ship in a pack**. Bodies are written
  by `generate-module` at adoption, against the adopter's confirmed profile, so depth,
  pacing, and prior-knowledge fit are theirs, not the pack author's. What a pack
  contributes is the hard-won part: objective structure, module decomposition,
  prerequisite order, and verified anchor sources.

Layout: `topic-packs/<slug>/` containing `course.yml`, `<slug>-hub.md`, and
`modules/NN-slug/module.yml` - exactly like a course directory.

## The bar for landing a pack

- Every anchor source fetched and archived per
  [sourcing.md](../.agents/skills/generate-curriculum/references/sourcing.md) - the
  citation rules do not relax for packs.
- `npm run validate` clean (packs are validated like any course tree; budget checks are
  skipped, since there is no profile to sum against - state the intended audience and
  rough hours in the hub note instead).
- Objectives use Bloom verbs; module sizing follows the 2-6 hour guideline.
- The pull-request checklist applies ([CONTRIBUTING.md](../CONTRIBUTING.md)).

## Adopting a pack (tenant side)

Adoption is an `extend-meno` recipe: copy the pack's tree into
`content/<you>/<slug>/`, run the interview to produce the missing `profile.md` (the
pack's scope gives the interviewer a running start), set `status: active` and add the
`profile` field, then let `generate-module` write module 1 against your contract.
