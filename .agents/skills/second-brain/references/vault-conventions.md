# Vault conventions (canonical)

The full spec for how tenant content hangs together as an Obsidian vault. Generation skills follow this when writing; vault operations enforce it after.

## Naming and layout

- Note filenames are kebab-case and stable once created (wikilinks bind to them). Lessons keep their `NN-` ordering prefix; hubs are `<slug>-hub.md`; the tenant home note is `home.md` at the vault root.
- The vault tree mirrors the course structure - no separate "notes folder"; lessons ARE the notes:

```
content/tenants/<tenant>/
  home.md                      tenant home note (top of the graph)
  todos.md                     shared queue (see todo-format.md)
  groups.yml                   course groups (see below; app-writable)
  sources/                     user-supplied materials (never rewritten by agents)
  progress/                    ledger.jsonl, mastery.yml (data, not notes; no wikilinks needed)
  <course-slug>/
    profile.md                 the contract (wikilinks allowed in prose)
    course.yml                 manifest (regenerable, never hand-edited)
    <course-slug>-hub.md       course hub / map of content
    modules/NN-slug/
      module.yml
      NN-lesson-name.md        lessons = notes
```

## Link rules

1. Wikilinks for everything intra-vault; `[[target|display text]]` when the filename reads poorly inline. External URLs use standard markdown links.
2. Link at first meaningful use in a note, not every mention.
3. A link is a promise: following it should help the reader here. "Related-ish" links dilute the graph - leave them out.
4. Renaming a note means updating every inbound link in the same operation (Obsidian automates this; agents grep and fix).
5. Broken wikilinks are permitted transiently as authoring intent ("[[borrow-checker-deep-dive]] - planned"), but each one must be mirrored by a todo, so intent never silently rots.

## Hub anatomy

The `meno:derived` markers are the contract for refreshes: regenerate only between them; everything outside is human territory, preserved verbatim.

**Tenant home note (`home.md`):**

````markdown
# Home

<!-- meno:derived:start -->
Now learning: [[rust-for-backend/rust-for-backend-hub|Rust for backend]]
- [[rust-for-backend/rust-for-backend-hub|Rust for backend]] - module 1 of 5, next review 2026-08-07
<!-- meno:derived:end -->

## Notes to self
(hands off during refreshes)
````

**Course hub (`<slug>-hub.md`):** the derived block holds (a) a Mermaid `graph TD` of module dependencies and (b) one entry per module. A module whose lessons have no bodies yet appears as plain text with status - "02 borrowing in practice (planned)" - never as a broken wikilink; once its lessons exist, the entry becomes wikilinks to them, each with a one-line why. This skeleton-time rule is the spec `generate-curriculum` builds against, and it generalizes to the pure-skeleton state: immediately after skeleton generation, before any module has bodies, every entry is plain text with status.

````markdown
# Rust for backend - map

<!-- meno:derived:start -->
```mermaid
graph TD
    m1[01 ownership basics] --> m2[02 borrowing in practice]
```
**01 ownership basics** (generated)
- [[modules/01-ownership-basics/01-ownership|Ownership]] - why moves beat copies
**02 borrowing in practice** (planned)
<!-- meno:derived:end -->

## My notes
(human territory; never regenerated)
````

## Course groups (`groups.yml`, canonical)

One learner accumulates courses faster than they finish them, and a flat list stops being
readable somewhere around a dozen. `groups.yml` at the vault root is how the learner sorts
their own course list - free-form groups they name themselves ("AI", "Version Control",
"Software Fundamentals"), each holding course slugs in display order. Schema:
[schemas/groups.schema.json](../../../schemas/groups.schema.json).

```yaml
schema_version: 1
groups:
  - id: version-control          # kebab-case, derived from the title at creation, stable after
    title: Version Control       # what the learner sees; renaming changes this, never the id
    courses:                     # course slugs as course.yml declares them, not directory paths
      - git-fundamentals
```

Five rules make it safe to hand-edit, and they are the reason it is a registry rather than a
field on each course:

1. **A group is a label, never a folder.** Membership changes nothing about a course: no file
   moves, no wikilink breaks, no manifest is rewritten. This is also why membership cannot live
   in `course.yml` - that file is a derived view, regenerated wholesale from the module
   manifests, so anything hand-set there is lost on the next regeneration.
2. **Every course belongs to at most one group.** A course no group names is *Ungrouped*, which
   is a normal state, not an error - the app derives it by diffing this file against the tree
   walk and shows it last.
3. **The walk is the truth about what exists.** A slug here that is no longer a course drops out
   of the rendered list with a warning; nothing auto-deletes and nothing breaks.
4. **Deleting a group deletes the grouping only.** Its courses fall back to Ungrouped, the same
   spirit as `todos.md`, where lines are checked off or parked but never removed.
5. **Three writers, one discipline.** The app writes it through its group routes, Obsidian or a
   text editor can edit it by hand, and an agent files new courses into it. The app guards its
   own writes with a content hash, so a hand edit between read and write is refused rather than
   overwritten - but an agent editing the file directly bypasses that, so read it immediately
   before writing it.

**Group operations** (agent side): create a group, rename one, delete one (courses fall back to
Ungrouped), and file or move a course. Before creating a group, read the existing ones and reuse
one if it fits; the vocabulary is deliberately open, unlike
[content/community/DOMAINS.md](../../../content/community/DOMAINS.md)'s closed domain list,
because one learner curating their own shelf is not the multi-contributor commons that a closed
vocabulary exists to protect. State the assignment; never file a course silently.

The tenant home note's derived block groups its course list the same way, recomputed from
`groups.yml` at every hub refresh - derived, never a second copy to keep in sync.

## Tags (two closed namespaces)

Vault tags on notes: `#stale` (content flagged by the review_after sweep), `#todo-linked` (note referenced by an open todo), `#hand-made` (course or note not generated). Todo-type hashtags inside `todos.md` (`#gen`, `#repo`, `#note` - see todo-format.md) are a separate, equally closed namespace scoped to that one file; Obsidian will show both families in its tag pane, which is expected. Propose additions to either list rather than inventing tags ad hoc; topics are links, not tags.

## Graph hygiene invariants

- Every note reachable from `home.md` (the no-orphans rule).
- Every lesson wikilinked from its course hub's derived block.
- Two or more lateral links per new note is the norm; a note with zero laterals should be rare and deliberate.
- `sources/` files may be linked TO but are never edited; `progress/` files are data, not notes.
