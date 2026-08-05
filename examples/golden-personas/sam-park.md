# Sam Park

The example learner (see [../example-learner/](../example-learner/README.md)).

## Persona card

Backend developer, five years of Python and TypeScript, ships services at work. Wants to
learn Rust well enough to build and ship a small backend service. Has read blog posts and
knows the vocabulary - can say "ownership", "borrowing", "lifetimes" - but has never
written a Rust program. Answers questions directly and concretely; picks menu options
without hesitation. Motivated by a side project: a small link-shortener service they want
to run cheaply. Can give 4 focused hours a week for 6 weeks. No study materials of their
own. Prefers reading over video.

Probe behavior: when given a vocabulary-level probe (for example "here is a tiny Rust
snippet that fails to compile - say in one sentence why"), Sam reasons correctly about the
concept in prose without being able to write the fix. The probe confirms
vocabulary level.

## Expected brief

```
goal_category: build
outcome_statement mentions: shipping a small backend service in Rust
prior_level: vocabulary
probe_result: confirmed-at-level
depth: build
bloom_ceiling: apply
hours_per_week: 4
total_weeks: 6
budget_hours: 24
format_prefs: text-first
user_sources: false
status: confirmed
questions_asked: between 5 and 7
```

Scope pushback: must NOT fire - build depth at 24 hours for a scoped service is feasible.
Confirmation gate: must fire and Sam accepts on the first pass.
