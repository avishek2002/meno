# Question bank

Menus, probe patterns, pushback phrasing, and defaults for the interview. Adapt wording to the user's register; keep the structure.

## Phase 1 - Goal and motivation

> "When this has worked, what will you be able to do that you can't today? For example:
> (a) build and ship something real with it,
> (b) hold my own in technical discussions about it,
> (c) pass an interview / certification / assessment,
> (d) teach it or make content about it,
> (e) something else - say it in a sentence."

If the answer is a topic restatement ("I want to know Rust"), follow up once: "What's the first thing you'd want to DO with it?" anchored with two concrete examples from their likely world.

Map to `goal_category`: a->build, b->understand, c->career, d->teach.

## Phase 2 - Prior knowledge

Self-report menu:

> "Where are you starting from?
> (a) never touched it,
> (b) know the vocabulary - read about it, never used it,
> (c) built small things / used it a little,
> (d) comfortable, want to go deeper or fill gaps,
> (e) something else - describe it."

Map to `prior_level`: a->none, b->vocabulary, c->built-small-things, d->comfortable.

Anchored confirm (used instead of the self-report menu above, only when the evidence packet at
`content/tenants/<tenant>/subjects/evidence-packet.json` carries a `prior_level` anchor):

> "Your workspace shows <anchor> - does that match where you're starting from? (yes / not quite -
> here's where I'd put it instead)"

The live probe below still runs regardless of the answer; its result still outranks both the
anchor and the self-report (precedence: live probe result > workspace evidence > self-report).

Live probe - one pattern per claimed level (no judgment call needed):

- Level a -> **Explain-back**: "In one or two sentences, what do you think <core term> means?" Pick the topic's most load-bearing term. (At level a this mostly confirms rather than filters; keep it light.)
- Level b -> **Predict**: show a 3-5 line snippet, config, or scenario; "What happens here?" or "What would you expect this to do?" Or **Diagnose**: show a snippet that fails; "in one sentence, why?" - same difficulty, better when the topic's classic beginner wall is an error.
- Level c -> **Odd-one-out**: four items where one breaks the concept; "Which doesn't belong, and why?"
- Level d -> **Odd-one-out, hard variant**: the odd item fails for a subtle reason (an edge case, not a category error).
- Non-technical topics: replace snippets with a tiny scenario judgment ("A patient presents with... what do you check first?" style) at the same difficulty.

Scoring: clean answer -> `confirmed-at-level`. Partially right or right words with wrong mechanism -> `adjusted-down` one level, and say so kindly: "That's a common way to think about it - it actually works like <one line>. I'll set us one notch earlier so the foundations are solid; we'll move fast through what you know." Overshoot (answers with depth beyond the level) -> `adjusted-up`, confirm with one line.

## Phase 3 - Depth and time

Depth menu (state the implied ceiling plainly):

> "How deep does this need to go?
> (a) **orient** - understand the landscape and hold a conversation (fastest),
> (b) **build** - make a small real thing work,
> (c) **work-ready** - use it professionally: debug, evaluate trade-offs,
> (d) **teach** - explain it to others from first principles (slowest, deepest),
> (e) something in between - say which two it sits between."

Time (anchored bands, pick or adjust):

> "How much time is real - not aspirational?
> (a) light: ~2 hours a week,
> (b) steady: ~4 hours a week,
> (c) serious: ~7 hours a week,
> (d) your own number.
> And for how long: 4 weeks / 8 weeks / 12 weeks / your own?"

### Scope pushback (mandatory when triggered)

Rough floor heuristics: orient >= 5 hours, build >= 15, work-ready >= 40, teach >= 80. Scale by topic size: a narrow tool (one library, one feature) roughly halves the floors; a typical subject uses them as stated; a whole language or discipline roughly doubles them. When budget < floor:

> "Honest check: <depth> on <topic> doesn't fit <budget> hours - that mismatch is the number-one reason self-paced learning dies. Two real options: (1) keep <budget> hours and target <one level down> - you can always extend; (2) keep <depth> and stretch to roughly <floor> hours over <weeks>. Which fits your life better?"

If one level down still does not clear its own floor, offer the nearest depth that does - both options presented must actually be feasible. Never proceed on the impossible contract; never silently thin the content to make it "fit".

## Phase 4 - Format and own materials

> "Default is text-first lessons with worked examples and practice, rendered in your Meno app and Obsidian. Fine? And do you have your own materials - notes, a textbook, docs from work - that the course should build on? If yes, drop them in `content/tenants/<tenant>/sources/` and I'll anchor lessons on them."

Anchored confirm (used instead of the blind materials question above, only when the evidence
packet carries a `user_sources` anchor):

> "Default is text-first lessons with worked examples and practice, rendered in your Meno app and
> Obsidian. Fine? And your workspace shows <anchor> - should I anchor lessons on that material? If
> yes, drop it in `content/tenants/<tenant>/sources/`."

Skippable: if the interview is at its question cap, apply the default and mention it at confirmation.

## Phase 5 - Confirmation template

> "Here's the contract I'll build against:
> **Outcome:** <outcome_statement>. **Starting from:** <verified level + one probe fact>. **Depth:** <depth> (objectives capped at <bloom_ceiling>). **Budget:** <hours/week> x <weeks> = <total> hours. **Format:** <prefs>. **Your materials:** <yes, in sources/ / none>. **Course slug:** `<course-slug>`.
> Confirm, adjust something, or start over?"

## Defaults table (used at the question cap or after two vague answers)

| Field | Default | Say it as |
|---|---|---|
| goal_category | build | "assuming you want to build something real" |
| prior_level | vocabulary | "assuming you've read about it but not used it - the prerequisite checks will confirm" |
| probe_result | confirmed-at-level | recorded as-is when the probe was skipped at the cap; note "probe skipped" in Starting point |
| depth | build | "aiming for 'make a small real thing work'" |
| hours_per_week | 3 | "assuming ~3 focused hours a week" |
| total_weeks | 6 | "six weeks to start - extendable" |
| format_prefs | text-first | applied silently, mentioned at confirmation |
