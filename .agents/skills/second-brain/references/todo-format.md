# todos.md format (canonical)

One shared queue per tenant at `content/tenants/<tenant>/todos.md`. Three writers - the user (in the app or Obsidian), the app server, and agents - so the format is deliberately minimal: standard markdown checkboxes that Obsidian (and its Tasks plugin) render natively and the app parses without ambiguity.

## Format

```markdown
# Todos

## Content
- [ ] Course on SQL window functions #course #for-agent
- [ ] Add a lesson on error handling to [[rust-for-backend-hub|Rust course]] #course #for-agent
- [x] Generate module 2 when module 1 review passes #course #for-agent ✅ 2026-08-05

## Vault
- [ ] Add my company style guide to sources/ #vault #for-me

## Setup
- [ ] Try switching lesson font in the app #feature #for-agent

## Study
- [ ] Redo the ownership exercises before the next review #study #for-me

## Notes
- [ ] Renew the annual budget check-in with myself #admin #for-me

## Parked
- [ ] Revisit whether to learn Kubernetes at all (drifted from goal, 2026-08-05) #admin #for-me
```

## Two axes, not one

Every line carries two independent hashtags: **kind** (what the work is) and **audience**
(who can do it). One tag cannot carry both - "learn git" and "build the git material" are the
same subject with opposite actors, and a single-tag namespace either conflates them or needs a
separate tag per combination. The old three-tag namespace (`#gen` / `#repo` / `#note`) tried to
fold both questions into one field and lost precision on both: `#repo` conflated "add a
feature" with "fix a bug"; `#gen` conflated "make new content" with "fix wrong content"; `#note`
was a junk drawer holding study tasks, personal admin, and "supply your own source files" - three
different things with nothing in common except "the agent shouldn't act on it". Two orthogonal
tags let each question stay a question: kind routes the work to the right skill, audience gates
whether the agent may ever propose doing it.

## Axis 1 - kind (exactly one per line, required on new writes)

| tag | meaning | agent route |
|---|---|---|
| `#course` | New learning content to generate - a course, module, or lesson | elicit-needs / generate-curriculum / generate-module |
| `#content-fix` | Existing content is wrong or stale - a bad claim, a dead citation | audit-citations / generate-module refresh |
| `#vault` | Vault work - wikilinks, hub notes, orphans, adding files to `sources/` | second-brain |
| `#feature` | Add or change how this Meno instance works | extend-meno |
| `#bug` | Something in this Meno instance is broken | extend-meno |
| `#study` | Learning or practice work to do yourself | none - yours |
| `#admin` | Personal reminder | none - yours |

## Axis 2 - audience (exactly one per line, required on new writes)

| tag | meaning |
|---|---|
| `#for-agent` | The agent may propose doing it. Proposing is still the ceiling - explicit yes before acting, unchanged. |
| `#for-me` | Yours. The agent reads it for context and may remind you, but never acts on it and never proposes acting. |

The axes are genuinely independent: `#course #for-me` (a course you want to draft yourself) and
`#study #for-agent` are both legal, if unusual. There is no validation coupling them - a
`#bug #for-me` is odd but not wrong, and the format does not second-guess it.

## Rules

- One todo per line, standard `- [ ]` / `- [x]` checkboxes. No indented sub-todos (the app treats indented lines as free-text notes attached to the todo above).
- Kind and audience hashtags at line end, one of each: kind before audience, both after the text, the completion marker last -

  ```markdown
  - [ ] <text> #<kind> #<audience>
  - [x] <text> #<kind> #<audience> ✅ YYYY-MM-DD
  ```

  The parser is tolerant on read: it accepts the two tags in either order and anywhere in the line, and a line missing one or both still parses (the missing field is `null`). New writes always emit kind-then-audience, text-then-tags-then-completion.
- Completion appends `✅ YYYY-MM-DD` after the tags. Lines are never deleted; a stale todo moves to `## Parked` instead.
- Wikilinks inside todo text are encouraged - they tie the queue into the graph.
- Section headers are free-form; `## Parked` is the only reserved one. `addTodo`'s default section by kind: `course`, `content-fix` -> `## Content`; `vault` -> `## Vault`; `feature`, `bug` -> `## Setup`; `study` -> `## Study`; `admin` -> `## Notes`. An explicit `section` in the write request always wins over the default.
- These nine tags (seven kinds, two audiences) are a closed namespace scoped to this file, separate from the vault note tags in vault-conventions.md.

## Back-compat aliases (read only - never written)

Three old tags from the single-namespace format still parse, so a vault that predates this
change keeps working without a migration pass:

| old | parses as |
|---|---|
| `#gen` | kind `course`, audience `for-agent` |
| `#repo` | kind `feature`, audience `for-agent` |
| `#note` | kind `admin`, audience `for-me` |

An explicit new tag on the same line wins over an alias (a line carrying both `#gen` and
`#vault` parses its kind as `vault`). Nothing ever writes an old tag again - every writer (app,
agent, user via the app's create form) emits the current pair only.

## Lifecycle

1. **Created** - by the user in the app or Obsidian, or by an agent capturing deferred work ("parking a tangent" from a drift trigger, a broken-wikilink placeholder, a declined proposal).
2. **Scanned** - at every agent session start (AGENTS.md rule): the agent reads the file and surfaces open `#for-agent` items that are actionable now, regardless of kind. `#for-me` items are read for context - they may inform a reminder - but are never included in what the agent proposes acting on.
3. **Acted** - the agent routes by kind before doing the work: `#course` on a NEW topic goes to elicit-needs first - a course needs a contract, so the proposal is "shall I interview you for it now?", never straight to generation; `#course` on an addition to an EXISTING course goes to extend-meno's amend recipe; `#content-fix` goes to audit-citations or generate-module's refresh path; `#vault` goes to second-brain's own operations; `#feature` and `#bug` go to extend-meno. `#study` and `#admin` are never acted on, whatever their audience tag says - kind already says the work is the user's, audience only ever narrows further. Then check the item off with the date and, where the work produced an artifact, append a wikilink to it.
4. **Parked** - anything the user declines twice or marks as "later" moves to `## Parked` so the active sections stay honest.

## Why this shape

Checkbox markdown is the one format all three writers already speak. Splitting the old single
type field into kind and audience keeps that same minimum-machine-readable-signal property while
answering two questions instead of conflating them into one: kind is the routing key (which
skill, if any, owns this), audience is the permission gate (may the agent ever propose acting on
it). Anything richer (due dates, priorities, assignees) is speculative until real usage demands
it - propose additions against this file rather than improvising per-tenant dialects.
