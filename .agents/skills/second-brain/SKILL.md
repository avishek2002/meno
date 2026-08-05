---
name: second-brain
description: Own the Obsidian-vault side of tenant content - wikilink conventions, hub (map-of-content) notes, graph hygiene, and the todos.md shared queue - and perform vault operations: weave new notes in, refresh hubs, explain how concepts connect, sweep orphans, process todos. Use for anything about the vault view, linking, hub notes, orphaned notes, or todos. Lesson content itself belongs to generate-module.
---

# Second brain

This skill owns the connective tissue: the conventions that make `content/<tenant>/` a real Obsidian vault instead of a folder of files, and the operations that keep its graph honest as content grows. The generation skills follow the conventions defined here when they write; this skill is also invoked directly for vault work.

## The vault contract

- `content/<tenant>/` opens directly in Obsidian as a vault. Every file in it is vault-native markdown; the localhost app resolves wikilinks exactly as Obsidian does.
- Base content (docs, skills, examples) stays out of the vault on purpose: machinery does not belong in a knowledge graph.
- The vault is also the app's data and the agent's workspace - three views, one set of files. Nothing here may break any of the three (a todo edit that mangles checkbox syntax breaks the app; a renamed note without link updates breaks the graph).

## Linking conventions

Full spec with naming, folders, tags, and hub templates: [references/vault-conventions.md](references/vault-conventions.md). The load-bearing rules:

- Wikilinks (`[[note]]`, `[[note|shown text]]`) for every intra-vault reference; standard markdown links only for external URLs.
- Link where a concept is **used**, not merely related - a link is a claim that following it helps right here.
- Hierarchy is hubs: tenant home note -> course hubs -> module sections -> lessons. Every note reachable from the home note; **no orphans, ever**.
- Lateral links carry the "second brain" value: when a lesson uses a concept from another module or course, wikilink it at first use. Two or more laterals per new note is the norm.
- Tags are for status and type only (`#stale`, `#todo-linked`); topics are expressed as links, never tags.

## Operations

Shared rule for all of them: a proposal the user declines becomes an unchecked todo in `todos.md` (typed `#gen` or `#repo` as appropriate) - declined is not dropped.

- **Weave in** (after any new note or content batch): link it from its hub, add its lateral links, then check its backlinks - if nothing points TO it beyond the hub, ask whether an existing note should.
- **Hub refresh**: regenerate a hub's derived parts (Mermaid map, link lists) from the manifests; preserve every human-written line. Hubs are part machine-view, part journal - only the machine part regenerates.
- **Connection query** ("how does X relate to Y"): answer by walking actual links, citing the path (`[[X]] -> [[Z]] -> [[Y]]`); when the honest answer is "they aren't linked", say so and propose the missing link with a one-line why.
- **Orphan sweep**: list notes unreachable from the home note, propose a hub or lateral home for each; delete nothing without the user's say.
- **Todo processing** (session start, per AGENTS.md): read `content/<tenant>/todos.md` (format: [references/todo-format.md](references/todo-format.md)), surface actionable items, propose - "shall I generate that?", "want me to make that change?" - and act only on explicit confirmation. Completing an item: check it off, append the date; never delete lines.

## Done means

For any vault operation: no new orphans; hubs consistent with manifests; human prose preserved; todo syntax round-trips (checkbox lines stay parseable by the app and Obsidian Tasks); every proposed-but-declined action left as an unchecked todo rather than dropped.
