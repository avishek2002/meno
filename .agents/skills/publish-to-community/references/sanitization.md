# Sanitization catalog (canonical)

What never leaves `content/` on the way into a pack, and why. Work this list top to bottom
against every file about to be transcribed - "I don't think this file has any" is not a pass.

## Whole files, no exceptions

- **`profile.md`, entirely.** Packs are pre-contract - `tools/validate.ts`'s `pack-layout`
  check already refuses a pack `course.yml` that carries a `profile` field, but the file's prose
  (goal, starting point, scope contract) never gets paraphrased into a pack either, even
  rewritten. It is one learner's private contract.
- **Everything under `progress/`** (`ledger.jsonl`, `mastery.yml`) **and anything derived from
  it.** No difficulty hint, pacing suggestion, or "learners often struggle with X" line sourced
  from one person's scored history - a pack's difficulty framing comes from the subject matter,
  not from a sample size of one.
- **`todos.md`, entirely.** A personal queue, not reference material.
- **Everything under `sources/`.** These are the learner's own uploaded materials; publishing
  them, even a paraphrase, is publishing someone else's private document.

## Fields, wherever they appear

- **Every rubric string** (`ledger.jsonl` `scored` events' `rubric` field) **and every override
  reason** (`overridden` events' `reason` field). Both are agent prose written about one specific
  person's specific answer - they read like generic content but they quote the learner.
- **Journal blocks**: `home.md`'s "Notes to self" section, a course hub's free-text "My notes"
  section, or any other human-territory block preserved by the `meno:derived` marker convention
  ([vault-conventions.md](../../second-brain/references/vault-conventions.md)) - these are
  explicitly the parts refreshes never touch, which is exactly why they accumulate personal
  content.
- **Any `source_type: user` record**, wherever it sits (a module's `sources` list, a lesson's
  frontmatter `sources`). Drop it, or replace it with a public equivalent that supports the same
  claim - a pack may not cite a `sources/`-relative path, because that path does not exist
  outside the tenant it was uploaded to.
- **Personal identifiers**: real names, email addresses, employers, machine paths
  (`/Users/<name>/...`), API keys or other credential-shaped strings, internal tool or service
  names. These show up in the least expected places - a lesson's aside crediting a colleague, a
  code snippet's placeholder value, a `why` line on a source record.

## The one class no regex catches

A **worked example drawn from the learner's real work** - "our checkout service", a real
employer's actual bug, a real incident - reads exactly like ordinary pedagogy. `pack-safety`'s
patterns catch scripts, credentials, and instruction-shaped text; nothing in `tools/validate.ts`
can tell a genuinely illustrative example from one quietly lifted from someone's private
codebase, because both are, structurally, just prose describing a scenario. This is why human
review of the pull request is the named gate for this class specifically - not an eval, not a
regex, not this skill's own judgment during transcription. Flag anything that reads as concrete
and specific enough to be real, and let the reviewer decide.
`examples/seeded-faults/publish-fixture/` seeds exactly this class, among others, for practicing
the catch.

## Two consequences the first blind drill surfaced

- **Dropping a user source can leave the pack under-anchored.** A module needs at least
  two anchor sources; when sanitization removes a `source_type: user` record and only one
  survives, finding and archiving a genuine public replacement (full
  [sourcing.md](../../generate-curriculum/references/sourcing.md) procedure) is part of
  the publish work. A pack cannot ship under-anchored, and fabricating a citation is
  never the fix - the gate staying red until a real source exists is the design working.
- **Build the pack inside `topic-packs/<domain>/<slug>/` on your branch, not in a staging
  directory.** The pack-layout, pack-notes, pack-safety, and pack-overlap checks are
  path-gated to the pack roots; a tree drafted elsewhere skips them and self-verification
  silently loses its teeth.
