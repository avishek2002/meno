# Golden personas

Three fictional learners with known-correct interview outcomes. Each file carries a persona
card (who they are and how they answer) and the expected brief - the exact structured
frontmatter values a faithful `elicit-needs` interview must reach. Prose fields (goal,
starting point, scope) need only be present and on-topic; the structured fields must match
exactly.

They serve two jobs:

- **Acceptance fixtures** (Phase 1): interviews simulated against contrasting personas are
  diffed against these briefs.
- **Eval fixtures** (Phase 8): the eval runner replays them against `elicit-needs` and
  gates on the same exact-match rule.

The personas are deliberately contrasting: different goal categories, depths, prior levels,
and one (Priya) whose opening ask is infeasible so the scope-pushback rule must fire.

| Persona | Topic | Depth | Prior | Budget | Exercises |
|---|---|---|---|---|---|
| [Sam Park](sam-park.md) | Rust for backend | build | vocabulary | 24h | the happy path; doubles as the example learner |
| [Priya Nair](priya-nair.md) | LLM agents | orient | none | 8h | scope pushback, one vague answer |
| [Marcus Webb](marcus-webb.md) | SQL and data modeling | work-ready | built-small-things | 48h | career goal, user-supplied sources |
