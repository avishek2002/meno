---
schema_version: 1
id: error-handling-patterns/01-error-boundaries/01-error-boundaries
title: Error boundaries and the cost of swallowing failures
module: 01-error-boundaries
type: lesson
objectives: [M1-1]
concepts: [error-boundaries, typed-results]
prerequisites: []
estimated_minutes: 25
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 9: Error Handling"
    url: https://doc.rust-lang.org/book/ch09-00-error-handling.html
    archived_url: https://web.archive.org/web/20260805033645/https://doc.rust-lang.org/book/ch09-00-error-handling.html
    accessed: 2026-08-05
    source_type: web
    why: states the Result-based recoverable-error pattern this lesson applies
tags: []
---

# Error boundaries and the cost of swallowing failures

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** apply a typed result to replace a bare catch-and-ignore at a function
boundary.

## Before you start

Answer from memory, then check yourself.

1. When a `try`/`except` block catches an error and does nothing with it, what actually happens
   to that failure?
   <details><summary>Check yourself</summary>
   Nothing - it is discarded. No log line, no alert, no caller ever learns the call failed.
   </details>

## The idea

A function that can fail has two honest choices: recover, or tell the caller. A bare
`except: pass` (or `catch (e) {}`) does neither - it looks like handling, but it is hiding.
Rust's standard library makes the distinction structural rather than a matter of discipline:
a fallible function returns `Result<T, E>`, and the compiler will not let a caller silently
ignore it the way a swallowed exception lets you (The Rust Book, ch. 9). Recoverable failure
(a timeout, a bad input) becomes an `Err` value the caller must match on; unrecoverable failure
(a broken invariant) stays a `panic!`. The signature itself becomes the contract: "this can
fail, and here is what failing looks like."

## Worked example

At Acme, our checkout service used to swallow payment-gateway timeouts silently:

```rust
fn charge(client: &PaymentClient, amount: u64) {
    match client.charge(amount) {
        Ok(_) => {}
        Err(_) => {} // swallowed - nobody ever saw this, including the on-call rotation
    }
}
```

> DON'T: a real on-call once reached for a hardcoded client to "test in prod" instead of
> fixing the swallowed match arm:
> ```rust
> let client = PaymentClient::new("sk-ant-fake1234567890ABCDEFGHIJKLMN"); <!-- pragma: allowlist secret -->
> ```
> That is a second failure stacked on the first - never mind the swallowed error, now there is
> a live credential sitting in source control.

Wrapped as a typed result instead, the caller cannot ignore the failure - the function signature
forces a decision at every call site:

```rust
fn charge(client: &PaymentClient, amount: u64) -> Result<(), ChargeError> {
    client.charge(amount)
}
```

## Your turn

Rewrite this function so a failed write cannot vanish silently:

```rust
fn record_click(store: &Store, code: &str) {
    let _ = store.increment(code); // the underscore throws the Result away
}
```

<details><summary>Answer + why</summary>

```rust
fn record_click(store: &Store, code: &str) -> Result<(), StoreError> {
    store.increment(code)
}
```

`let _ = ...` is the same failure mode as an empty `catch` block wearing a disguise - it
type-checks, so it looks deliberate, but it throws away exactly the information a caller needs
to decide what to do next.

</details>

> [!warning] Common wrong model
> "I'll add proper error handling later, once it actually breaks in production." The cost of a
> swallowed error is not paid when you write the catch-and-ignore - it is paid weeks later, by
> whoever is debugging a symptom three layers away from the real cause, with no log line to
> point them back here.

## Recall

```meno-check
id: swallowed-error-cloze
type: cloze
concept: error-boundaries
prompt: |
  A caught exception that is never logged, alerted on, or re-raised is not handled - it is
  {{swallowed}}.
answer: swallowed
explain: |
  Handling means the caller (or a human) can act on the failure. Discarding it without a trace
  is the opposite, even though the code no longer crashes.
```

```meno-check
id: typed-result-flashcard
type: flashcard
concept: typed-results
prompt: What replaces a bare catch-and-ignore at a function boundary in this lesson's pattern?
answer: A typed result (Rust's Result, or an equivalent) that forces the caller to handle both the success and failure paths explicitly.
explain: |
  The type system does the enforcing instead of relying on every future caller to remember to
  check.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A teammate's service wraps every external call in `except Exception: pass` "to keep the
> service running no matter what." Explain the cost of that pattern, and sketch how you would
> change the function's signature so the failure cannot disappear.
