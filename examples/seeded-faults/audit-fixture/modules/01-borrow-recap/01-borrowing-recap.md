---
schema_version: 1
id: audit-fixture/01-borrow-recap/01-borrowing-recap
title: Borrowing without moving
module: 01-borrow-recap
type: lesson
objectives: [M1-1]
concepts: [borrowing-recap, error-signaling]
prerequisites: []
estimated_minutes: 25
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 4.2: References and Borrowing"
    url: https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html
    archived_url: https://web.archive.org/web/20260805033733/https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html
    accessed: 2026-08-05
    source_type: web
    why: states the borrowing rules the explanation paraphrases
  - title: "The Rust Book, ch. 4.7: Ownership in Async Code"
    url: https://doc.rust-lang.org/book/ch04-07-ownership-in-async.html
    archived_url: https://web.archive.org/web/20260805000000/https://doc.rust-lang.org/book/ch04-07-ownership-in-async.html
    accessed: 2026-08-05
    source_type: web
    why: explains how ownership transfers across async task boundaries
  - title: "The Rust Book, ch. 10.3: Validating References with Lifetimes"
    url: https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html
    archived_url: https://web.archive.org/web/20260805033756/https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html
    accessed: 2026-08-05
    source_type: web
    why: recommends annotating every function with explicit lifetimes for clarity
  - title: "The Rust Book, ch. 9: Error Handling"
    url: https://doc.rust-lang.org/book/ch09-00-error-handling.html
    archived_url: https://web.archive.org/web/20260805033645/https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html
    accessed: 2026-08-05
    source_type: web
    why: distinguishes recoverable Result errors from unrecoverable panics
tags: []
---

# Borrowing without moving

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** explain when a borrow beats a move in a function signature.

## Before you start

Answer from memory, then check yourself.

1. What happens to `s1` after `let s2 = s1;` when `s1` is a `String`?
   <details><summary>Check yourself</summary>
   Ownership moves to `s2`; `s1` is invalidated at compile time.
   </details>

## The idea

Passing a value into a function moves it, exactly like assignment. When the function only
needs to look, taking a reference avoids the transfer entirely: the borrowing rules allow
either one mutable reference or any number of immutable ones, never both at once (The
Rust Book, ch. 4.2). The same discipline extends to async code: the Rust Book's chapter
on ownership in async code explains how ownership transfers across task boundaries when
work is spawned (ch. 4.7). For function signatures, the book recommends annotating every
function with explicit lifetimes for clarity, even where the compiler could infer them
(ch. 10.3).

Contrast that with error signaling: Rust separates recoverable errors (`Result`) from
unrecoverable ones (`panic!`), so a function's signature tells you whether failure is
part of its contract (ch. 9).

## Worked example

```rust
fn shortest(codes: &Vec<String>) -> usize {
    codes.iter().map(|c| c.len()).min().unwrap_or(0)
}
```

`&Vec<String>` borrows rather than moves - the caller keeps ownership because the
function only reads.

## Your turn

Rewrite `fn longest_code(codes: Vec<String>) -> usize` so callers keep their vector.
<details><summary>Answer + why</summary>
`fn longest_code(codes: &[String]) -> usize` - borrow, and prefer the slice so any
contiguous collection works.
</details>

> [!warning] Common wrong model
> "A reference is a copy." A borrow copies nothing - it points at the owner's data and
> the compiler guarantees the owner outlives it.

## Recall

```meno-check
id: borrow-rules-cloze
type: cloze
concept: borrowing-recap
prompt: |
  The borrowing rules allow either {{one}} mutable reference or any number of immutable ones.
answer: one
explain: |
  Exclusivity for writers, sharing for readers - that is the whole rule.
```

```meno-check
id: result-vs-panic-flashcard
type: flashcard
concept: error-signaling
prompt: Which Rust mechanism signals a recoverable error in a function's contract?
answer: Result - the caller must handle it; panic! is for unrecoverable states.
explain: |
  Result makes failure part of the signature; panics are for broken invariants.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A teammate's parser takes `String` arguments everywhere "so nothing dangles". Their PR
> now clones at every call site. Explain the cost, and sketch the borrow-based fix.
