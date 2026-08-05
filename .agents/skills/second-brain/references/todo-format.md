# todos.md format (canonical)

One shared queue per tenant at `content/<tenant>/todos.md`. Three writers - the user (in the app or Obsidian), the app server, and agents - so the format is deliberately minimal: standard markdown checkboxes that Obsidian (and its Tasks plugin) render natively and the app parses without ambiguity.

## Format

```markdown
# Todos

## Content
- [ ] Course on SQL window functions #gen
- [ ] Add a lesson on error handling to [[rust-for-backend-hub|Rust course]] #gen
- [x] Generate module 2 when module 1 review passes #gen ✅ 2026-08-05

## Repo
- [ ] Try switching lesson font in the app #repo
- [ ] Add my company style guide to sources/ #note

## Parked
- [ ] Revisit whether to learn Kubernetes at all (drifted from goal, 2026-08-05) #note
```

## Rules

- One todo per line, standard `- [ ]` / `- [x]` checkboxes. No indented sub-todos (the app treats indented lines as free-text notes attached to the todo above).
- Type hashtag at line end, exactly one: `#gen` (content to create - the agent can act on these), `#repo` (a change to this Meno instance - extend-meno territory), `#note` (personal reminder; agents read but never act). These three are a closed namespace scoped to this file, separate from the vault note tags in vault-conventions.md.
- Completion appends `✅ YYYY-MM-DD` after the hashtag. Lines are never deleted; a stale todo moves to `## Parked` instead.
- Wikilinks inside todo text are encouraged - they tie the queue into the graph.
- Section headers are free-form; `## Parked` is the only reserved one.

## Lifecycle

1. **Created** - by the user in the app or Obsidian, or by an agent capturing deferred work ("parking a tangent" from a drift trigger, a broken-wikilink placeholder, a declined proposal).
2. **Scanned** - at every agent session start (AGENTS.md rule): the agent reads the file, surfaces open `#gen` and `#repo` items that are actionable now, and proposes. Proposing is the ceiling: no todo is acted on without the user's explicit yes in that session.
3. **Acted** - the agent routes by shape before doing the work: a NEW topic (`course on X #gen`) goes to elicit-needs first - a course needs a contract, so the proposal is "shall I interview you for it now?", never straight to generation; an addition to an EXISTING course goes to extend-meno's amend recipe; `#repo` items go to extend-meno. Then check the item off with the date and, where the work produced an artifact, append a wikilink to it.
4. **Parked** - anything the user declines twice or marks as "later" moves to `## Parked` so the active sections stay honest.

## Why this shape

Checkbox markdown is the one format all three writers already speak. The single-hashtag type field is the minimum machine-readable signal for "may the agent offer to do this"; anything richer (due dates, priorities, assignees) is speculative until real usage demands it - propose additions against this file rather than improvising per-tenant dialects.
