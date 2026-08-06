---
name: study-insights
description: Write a dated narrative report interpreting a learner's study-insights snapshot (sessions, reviews, gates, evidence, usage, vault health) into plain-language observations, stuck points, and up to three suggestions and three topic candidates. User-invoked only - never runs automatically at session start or inside a tutor session. Use when the learner asks "how am I doing", "what does my study data say", "give me an insights report", or similar. Quotes lib/insights.ts's numbers; never computes or invents one.
---

# Study insights

This skill turns the numeric snapshot `lib/insights.ts` computes into a dated, readable
report a learner can act on. It is strictly a read-and-narrate skill: every number in the
report it writes must trace back to the snapshot, and it never touches `progress/ledger.jsonl`
or `progress/mastery.yml` - those stay owned by [tutor-session](../tutor-session/SKILL.md)
and the app server alone (decision 14).

**User-invoked only.** Unlike the todo scan and due-review check in AGENTS.md's session-start
rule, this skill never runs on its own - a learner asks for it by name.

## The one hard rule: quote, never compute

Run the CLI and read its JSON. Every number that appears in the report's prose must come
verbatim from that JSON (the `metrics_snapshot` you embed in frontmatter is exactly this
JSON, so validate's cite-your-numbers check can confirm it). If you want to say something
the snapshot cannot support - a number, a trend, a comparison it does not compute - say so
explicitly ("the report has no way to measure X") and, if the metric would be genuinely
useful and honestly computable, propose the concrete addition to `lib/insights.ts` (a new
field, its formula, its `min_n`) rather than approximating it in prose.

## Protocol

1. **Run the snapshot.** `npm run insights -- <tenant-dir> --json`. This shells out to
   `tools/insights.ts`, which calls the same `lib/insights-io.ts` loader and
   `lib/insights.ts` pure function the app's `GET /api/v1/:tenant/insights` endpoint uses -
   there is exactly one computation, three callers.
2. **Gather what the frontmatter needs.** `courses`: every course slug under the tenant
   (one `course.yml` per course directory). `basis.ledger_lines`: the snapshot's
   `basis.ledger_lines`. `basis.ledger_sha256`: sha256 of `progress/ledger.jsonl`'s current
   bytes (records exactly which ledger state this report describes, so a later re-run over
   a longer ledger is never mistaken for the same report). `agent`: your own model
   identity string.
3. **Write the note** at `content/tenants/<tenant>/insights/YYYY-MM-DD-insights.md` (today's date;
   if a note for today already exists, overwrite it - one report per day, not per
   invocation) following [references/narrative-format.md](references/narrative-format.md)
   exactly: frontmatter per `schemas/insights.schema.json` with the full snapshot JSON
   embedded as `metrics_snapshot`, then the six fixed body sections in order.
4. **Weave it in**, per [second-brain conventions](../second-brain/references/vault-conventions.md):
   update `content/tenants/<tenant>/insights/insights-hub.md` (create it on the first report) to
   list every dated report newest-first inside its `meno:derived` markers, preserving any
   human prose below; link the hub from `home.md`'s derived block if it is not linked
   already. No orphans.
5. **Read it back to the learner** in plain language - do not just say "written to
   insights/2026-08-05-insights.md" and stop. Summarize what changed and what stands out;
   the file is the artifact, the conversation is where it lands.

## Writing the body sections

Tone throughout: **observations, not verdicts** - the same rule tutor-session applies to
session close. "Your override rate is 33% (1/3)" reads honestly; "your gate discipline is
weak" does not. This page and this skill exist specifically so a learner sees their own
data without it feeling like a second gate.

- **What the numbers say** - the headline facts: session cadence, due coverage, gate
  outcomes, transfer coverage. Every rate stated as `value (n/of)`, exactly as the snapshot
  gives it - never round away the denominator. Quote the raw decimal or the `n`/`of`
  integers rather than a computed percentage: validate's cite-your-numbers check does a
  literal substring match against the embedded snapshot JSON, and `0.62` (or `5/8`)
  appears there verbatim while a paraphrased `62%` does not - if a percentage reads more
  naturally, say it alongside the raw figure, not instead of it.
- **How you are using Meno** - surface mix (recognition vs. transfer, UI vs. agent, reads),
  todo activity, check usage. What the learner's actual behavior looks like, not what it
  should look like.
- **Where you are stuck** - draw from `reviews.overdue`, `gates.unrepaid_overrides`
  (call these out prominently - an override with no repaying transfer score since is the
  single most actionable fact in the report), `evidence.weak_concepts`, and
  `evidence.mastered_on_old_evidence`. Every claim here cites the specific item id or
  concept it is about - "ownership is shaky (first 0.5, still 0.5, n_transfer=1)" not
  "you're struggling with ownership."
- **Suggestions** - at most 3, concrete and doable ("run a review session - 3 concepts are
  overdue", not "study more"). If a suggestion repeats one from an earlier report, mark it
  `(repeated - first suggested YYYY-MM-DD)` by checking prior `insights/*-insights.md`
  frontmatter dates. If the learner declines a suggestion in conversation, add it to
  `todos.md` as an unchecked line, kind `#course` or `#feature` as fits the suggestion and
  audience `#for-agent`, per
  [todo-format.md](../second-brain/references/todo-format.md) rather than dropping it -
  same rule second-brain uses for any declined proposal.
- **Topics you might want** - at most 3. The candidate pool is exactly:
  `vault.referenced_but_untaught` entries, open `#admin #for-me` todos that read as topic requests,
  filenames under `sources/` that no course currently covers, and the profile's stated
  goal read against what is actually taught so far. Never invent a topic outside this
  pool. For each candidate, name the evidence that surfaced it. Do not generate anything
  here yourself - if the learner wants to act on one, route it through
  [elicit-needs](../elicit-needs/SKILL.md) like any new-topic request (a course needs a
  contract before it needs content).
- **Limits of this report** - required, never omit. Start from the snapshot's own `limits`
  array (quote it) and add anything this narration pass could not do either (e.g., no
  comparison to a prior report exists yet for a first-ever note).

## Done means

- The note validates against `schemas/insights.schema.json` and passes validate's
  `insights` check (six sections present, every standalone number in the body traceable to
  `metrics_snapshot`).
- `insights-hub.md` lists the new report and is itself linked from `home.md` - no orphan.
- Every claim in "Where you are stuck" and "Topics you might want" names its evidence.
- No ledger line was appended and `mastery.yml` was not touched - this skill only reads.
- The learner heard the report in conversation, not just as a file path.
