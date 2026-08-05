# Lesson format (canonical)

Frontmatter, section skeleton, and the ledger seed event. This is the spec until `schemas/lesson.schema.json` lands in Phase 3.

## Frontmatter

```yaml
---
schema_version: 1
id: rust-for-backend/01-ownership-basics/01-ownership
title: Ownership
module: 01-ownership-basics
type: lesson                   # lesson | practice | review (generate-module writes
                               # type: lesson only; the other types arrive with the
                               # tutor phase and get their own reduced anatomy then)
objectives: [M1-1]
concepts: [ownership]
prerequisites: []              # concept names; wikilinked again in the body
estimated_minutes: 35
difficulty: core               # intro | core | stretch
status: generated              # generated | reviewed | stale
generated_at: 2026-08-05
review_after: 2026-08-07       # first offset from review_offsets
review_offsets: [2, 9, 30]
sources:
  - title: The Rust Book, ch. 4.1
    url: https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html
    archived_url: https://web.archive.org/web/2026...
    accessed: 2026-08-05
    source_type: web
    why: definitions this lesson paraphrases
tags: []
---
```

## Body skeleton (the nine parts as markdown)

```markdown
# Ownership

> Heads-up: the recall questions here are supposed to feel effortful - that
> difficulty is the method working, not you failing.        <!-- part: framing -->

**You'll be able to:** predict whether a snippet compiles, using ownership rules.  <!-- 1 objective -->

## Before you start                                          <!-- 2 prereq check -->
Answer from memory, then check:
1. What does it mean for a variable to be on the stack vs the heap? ([[00-memory-basics]])
<details><summary>Check yourself</summary>...</details>

## The idea                                                  <!-- 3 explanation -->
(chunked prose, concrete first, two contrasting examples, inline citations)

## Worked example                                            <!-- 4 -->
(complete example, every step annotated with WHY)

## Your turn                                                 <!-- 5 faded practice -->
(worked example -> completion problem -> full problem, each with
<details><summary>Answer + why</summary>...</details>)

> [!warning] Common wrong model                              <!-- 6 misconception trap -->
> "Ownership is just scoping." Here's where that model breaks: ...

## Recall                                                    <!-- 7 retrieval check -->
(recognition-level check blocks per check-formats.md, interleaved across
concepts taught so far; the transfer-level prompt is part 9 below, once)

## Apply it somewhere new                                    <!-- 9 transfer prompt -->
> [!question] Transfer (graded in your next review session)
> (novel-context application task)
```

Part 8 (spaced-review hook) lives in frontmatter (`review_offsets`, `review_after`), not the body.

## Ledger seed event

Appended per lesson to `content/<tenant>/progress/ledger.jsonl` at generation time (full event schema arrives in Phase 3; these fields are stable):

```json
{"ts": "2026-08-05T10:00:00+10:00", "course": "rust-for-backend", "module": "01-ownership-basics", "lesson": "01-ownership", "concepts": ["ownership"], "event": "generated", "source": "agent", "review_after": "2026-08-07"}
```

Rules: the ledger is append-only; events are one JSON object per line; `review_after` uses the same field name as lesson frontmatter on purpose (one concept, one name). `source` is `agent` or `ui`, and every `scored` or `reviewed` event additionally carries `level: recognition|transfer` - gates key exclusively on `source: agent` + `level: transfer` events, and recognition-level UI events never carry gate consequences (PLAN.md decision 14).
