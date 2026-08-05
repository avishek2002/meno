---
name: elicit-needs
description: Interview a learner into a confirmed learning contract (profile.md) before anything is generated. Use when a user says they want to learn something, asks for a course, curriculum, or learning plan, or names a topic that has no profile.md yet. Also used in a short re-clarification form when a learner is struggling or drifting mid-course. Interview only - course structure belongs to generate-curriculum.
---

# Elicit needs

This skill owns the interview that turns "I want to learn X" into a confirmed, persisted learning contract at `content/<tenant>/<course-slug>/profile.md`. It ends at the confirmed brief; `generate-curriculum` takes over from there.

The design premise (Meno's paradox): a novice cannot answer open questions about depth or scope, because the knowledge needed to answer is exactly what they lack. So every question here is closed, anchored with concrete example answers, and asked one at a time. Self-assessment is the least reliable signal a novice can give, which is why one question is a live probe: a tiny task instead of a claim.

## Hard rules

- One question per message. Wait for the answer before the next.
- Every question offers 3-4 concrete anchored options plus "something else" - a menu to react to, never a blank page.
- 5-7 questions total for a full interview. Track the count; when the cap is reached, move to confirmation with stated defaults for anything unasked.
- Two vague answers in a row on the same phase: stop probing, state a sensible default out loud ("I'll assume X - correct me anytime"), move on.
- Skip any question already answered by what the user said unprompted. When an unprompted answer covers only part of a phase (the opener names a goal but not the motivation), ask only the uncovered part - never re-ask the covered half, never skip the whole phase.
- Generate nothing during the interview. No outlines, no "here's a taste", no lesson content.

## Preflight: resolve and bootstrap the tenant

Before question one: if exactly one directory exists under `content/`, that is the tenant. If none exists, use `content/main/`. Only if several exist, ask which one - and that question does not count against the interview budget.

This skill also owns vault bootstrap: if the tenant directory lacks `home.md`, `todos.md`, or `sources/`, create them now (formats: [../second-brain/references/vault-conventions.md](../second-brain/references/vault-conventions.md) and [../second-brain/references/todo-format.md](../second-brain/references/todo-format.md)). Creating `sources/` up front matters: Phase 4 of the interview may ask the user to drop files there.

## The protocol

Work through five phases, in order. Full question menus, probe task patterns, and defaults live in [references/question-bank.md](references/question-bank.md).

1. **Goal and motivation (1-2 questions).** Ask for the outcome, not the topic: "When this works, what will you be able to DO that you can't today?" anchored with example outcomes. A topic name is not a goal; "ship a small real project in it" is.
2. **Prior knowledge (1 menu + 1 live probe).** First the behavioral menu (never touched it / know the vocabulary / built small things / comfortable). Then one micro-task pitched at the claimed level - explain a term in their own words, predict what a snippet does, spot the odd one out. Adjust the level from the result, and say so plainly and kindly. The probe result outranks the self-report.
3. **Depth x time (2 closed questions).** Depth menu: orient / build something real / work-ready / teach (this sets the Bloom ceiling for every objective downstream; certification goals live in `goal_category: career`, not here). Then time: hours per week and total weeks - the bundled hours-plus-weeks menu counts as one question. If depth times topic clearly exceeds the budget, push back now with two honest options - shallower depth or longer runway - and let them choose; the pushback exchange is a continuation of the time question, not a separately counted one. When the budget clears the floor, the feasibility check stays silent - do not narrate it. Never silently accept an impossible contract; scope mismatch is the number-one reason self-paced learners quit.
4. **Format and own materials (1 question, skippable with stated default).** Default is text-first lessons. Ask whether they have their own materials (documents, notes, a textbook, work artifacts); if yes, have them drop files into `content/<tenant>/sources/` - those become anchor sources during generation.
5. **Confirmation (mandatory, not counted against the question cap).** Restate the whole contract as a compact brief: outcome, verified starting level, depth, budget, format, sources. One gate: confirm / adjust / start over. Only a confirmed brief gets written.

## Output

Derive the course slug first: kebab-case of the topic as scoped by the outcome (e.g. "SQL for analytics work" -> `sql-for-analytics`), 2-4 words, shown to the user in the confirmation brief - slugs are stable once created because wikilinks and manifests bind to them. Then write `content/<tenant>/<course-slug>/profile.md` exactly per [references/profile-format.md](references/profile-format.md) (frontmatter contract plus four body sections).

Hand off without a gap: offer to continue straight into [`generate-curriculum`](../generate-curriculum/SKILL.md) in this same session - the contract says the learner studies today, and the skeleton plus module 1 is what makes that true. Only if the user declines, leave a `#gen` todo in `todos.md` so the queue remembers.

## Re-clarification mode (invoked from tutor sessions)

Not a fresh interview - a targeted patch, 1-2 questions maximum:

- **Struggle trigger** (repeated misses on the same prerequisite): re-probe that one prerequisite with a live micro-task, then record the correction.
- **Drift trigger** (requests wandering off the contracted goal): one scope-check question - has the goal changed, or is this a tangent to park as a todo?

Both end by updating the affected `profile.md` fields and appending a dated line to its Adjustment log.

## Done means

- `profile.md` exists at the right path, frontmatter complete and valid per the format reference, `status: confirmed`.
- The user confirmed the restated brief explicitly (that confirmation, verbatim, is the last thing that happened before writing).
- Question budget respected and recorded in `questions_asked`.
- No content, outline, or curriculum was generated.
- The user knows `generate-curriculum` is next.
