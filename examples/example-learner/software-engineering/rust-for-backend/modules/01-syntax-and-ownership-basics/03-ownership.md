---
schema_version: 1
id: rust-for-backend/01-syntax-and-ownership-basics/03-ownership
title: Ownership
module: 01-syntax-and-ownership-basics
type: lesson
objectives: [M1-3]
concepts: [ownership]
prerequisites: [syntax-for-experienced-developers]
estimated_minutes: 80
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 4.1: What Is Ownership?"
    url: https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html
    archived_url: https://web.archive.org/web/20260805033707/https://doc.rust-lang.org/book/ch04-01-what-is-ownership.html
    accessed: 2026-08-05
    source_type: web
    why: states the three ownership rules (one owner, move vs. Copy, drop on scope exit) and the String-vs-i32 contrast this lesson's worked example and checks build on directly
tags: []
---

# Ownership

> Heads-up: ownership is the one idea in this module with no clean Python or TypeScript analogue - if it
> takes a few failed compiles before it clicks, that struggle is exactly how this one sticks.

**You'll be able to:** predict whether a snippet compiles by applying the rule that every value has
exactly one owner.

## Before you start

Answer from memory, then check yourself.

1. What's the difference between `let x = 5;` and `let mut x = 5;` in Rust?
   ([[02-syntax-for-experienced-developers|Rust syntax for Python and TypeScript developers]])
   <details><summary>Check yourself</summary>
   `let x = 5;` is immutable - reassigning `x` later is a compile error. `let mut x = 5;` opts into
   reassignment. Neither has anything to do with ownership yet - that's today's lesson - but it's the same
   compiler-enforced-at-compile-time flavor of strictness you're about to see again.
   </details>
2. In `fn classify_clicks(count: i32, threshold: i32) -> String { if count >= threshold { String::from(...)
   } else { String::from(...) } }`, why does neither branch's last line have a semicolon?
   ([[02-syntax-for-experienced-developers|Rust syntax for Python and TypeScript developers]])
   <details><summary>Check yourself</summary>
   Because a trailing semicolon turns an expression into a statement that returns nothing. Without it,
   each branch's `String::from(...)` is the value that `if`/`else` - and therefore the function - returns.
   </details>
3. You already wrote `String::from("popular")` in the last lesson without worrying about where that data
   lives in memory. Quick prediction before we open the hood: do you expect a Rust `String` to behave more
   like Python's `str` (freely shared, garbage collected whenever), or something stricter?
   <details><summary>Check yourself</summary>
   There's no wrong answer here - it's a prediction, not a recall check - but the short version is
   "something stricter." Rust has no garbage collector; the compiler decides, at compile time, exactly one
   variable that's responsible for freeing a String's memory. That's ownership, and it's what the rest of
   this lesson explains.
   </details>

## The idea

Python and TypeScript both use a garbage collector: however many variables end up pointing at the same
list or object, the runtime frees the memory once nothing references it anymore, and you never think
about *which* variable is "responsible" for cleanup. Rust has no garbage collector. Instead, the compiler
enforces three rules, checked entirely at compile time, with zero runtime cost (The Rust Book, ch. 4.1:
What Is Ownership?):

1. Each value has exactly one owner (one variable) at a time.
2. When that owner goes out of scope, Rust automatically frees the value - it calls `drop`.
3. Assigning a value to a new variable can either **move** ownership or **copy** the value, depending on
   the type - and which one happens changes everything about what code after it can do.

Which of "move" or "copy" happens depends on where the type's data lives. **Contrast 1 - a simple stack
type, `i32`:**

```rust
let a = 5;
let b = a;              // a is Copied, not moved
println!("{a} {b}");    // fine - both a and b are still valid
```

`i32` has a fixed, small, known size, so Rust just duplicates the bits - both `a` and `b` are independent,
valid values afterward (ch. 4.1). This is the `i32` case from the "vocabulary" placement interview you
already reasoned through correctly.

**Contrast 2 - a heap type, `String`:**

```rust
let s1 = String::from("hello");
let s2 = s1;             // s1 is MOVED into s2, not copied
println!("{s1}");        // ERROR: value borrowed here after move
```

A `String` has a pointer, length, and capacity stored on the stack, plus the actual character data on the
heap - and unlike `i32`, `String` does not implement the `Copy` trait. So `let s2 = s1;` moves ownership
of the heap data to `s2` instead of duplicating it, and Rust invalidates `s1` on the spot to guarantee
only one variable will ever try to free that heap memory (ch. 4.1). This is exactly the case you correctly
diagnosed in the placement interview ([[profile|the placement interview]]) - you knew it moved; this
lesson is about seeing it happen and reasoning about the fix.

Why go to this trouble at all? Because "who frees this memory, and when" is a question every language has
to answer somehow. Python and TypeScript answer it at runtime, with a garbage collector watching
references. Rust answers it at compile time, with the one-owner rule - no collector running in the
background, but the compiler has to be able to prove, statically, that exactly one variable will ever be
responsible for cleanup.

## Worked example

Back to the link-shortener. Here's a function that "archives" a short code by recording its length,
called from `main`:

```rust
fn archive_code(code: String) -> usize {
    code.len()
}   // `code` goes out of scope here and is dropped - rule 2

fn main() {
    let short_code = String::from("gn7x2");
    let length = archive_code(short_code);

    println!("Archived a code of length {length}");
    println!("Original code was: {short_code}");   // ERROR: value used here after move
}
```

Step by step:

- `let short_code = String::from("gn7x2");` - `short_code` becomes the sole owner of this heap-allocated
  string (rule 1).
- `archive_code(short_code)` passes `short_code` **by value**. Because `String` isn't `Copy`, this moves
  ownership into the function's `code` parameter - the same move you saw with `s1`/`s2` above, just across
  a function boundary instead of a second `let`.
- Inside `archive_code`, `code` is now the owner. When the function ends, `code` goes out of scope and
  Rust drops it (rule 2) - the memory is freed right there, with no garbage collector needed to notice
  later that nothing points to it anymore.
- Back in `main`, `short_code` no longer owns anything - it was moved away two lines ago. The final
  `println!` tries to use it anyway, and the compiler refuses to build the program.

The fix depends on what you actually need. If you still need `short_code` after the call, clone it before
passing it in:

```rust
fn main() {
    let short_code = String::from("gn7x2");
    let length = archive_code(short_code.clone());   // clone kept for later use

    println!("Archived a code of length {length}");
    println!("Original code was: {short_code}");     // fine now - short_code was never moved
}
```

`.clone()` allocates a second, independent copy of the heap data - `short_code` and the clone passed into
`archive_code` are now two separate owners of two separate allocations, at the cost of that extra
allocation. There's a third option, lending access without giving up ownership at all, called
**borrowing** - that's the entire subject of the next module, so it's set aside for now on purpose.

## Your turn

**Worked example.** Predict, then check: does this compile?
```rust
fn print_target(target: String) {
    println!("Redirects to: {target}");
}

fn main() {
    let redirect_target = String::from("https://example.com");
    print_target(redirect_target);
    print_target(redirect_target);   // called again
}
```
<details><summary>Answer + why</summary>
No - compile error on the second `print_target(redirect_target)`. The first call moves
`redirect_target`'s ownership into `print_target`'s `target` parameter, which is then dropped when that
call ends. By the second call, `redirect_target` in `main` no longer owns anything - there's nothing left
to move. Fix: clone on at least one of the two calls, e.g. `print_target(redirect_target.clone());` for
the first, leaving the original intact for the second.
</details>

**Completion problem.** Fill in the one call that fixes this without changing what `seen_codes` stores:
```rust
fn record(seen_codes: &mut Vec<String>, code: String) {
    seen_codes.push(code);
}

fn main() {
    let code = String::from("ab12c");
    let mut seen_codes = Vec::new();
    record(&mut seen_codes, ___);
    println!("Just recorded: {code}");
}
```
<details><summary>Answer + why</summary>

```rust
record(&mut seen_codes, code.clone());
```
Why: `record` takes `code` by value, so passing `code` directly moves it into the vector, and the
`println!` afterward would fail to compile. `code.clone()` hands `record` an independent copy to store,
leaving the original `code` valid for the `println!` that follows.
</details>

**Full problem.** This snippet tries to use the same `String` in two function calls. Predict whether it
compiles; if it doesn't, fix it.
```rust
fn char_count(s: String) -> usize {
    s.len()
}

fn shout(s: String) -> String {
    s.to_uppercase()
}

fn main() {
    let code = String::from("gn7x2");
    let count = char_count(code);
    let shouted = shout(code);
    println!("{count} chars, shouted: {shouted}");
}
```
<details><summary>Answer + why</summary>
Does not compile - `char_count(code)` moves `code` into `char_count`, where it's dropped when that
function returns. `shout(code)` then tries to move a value that's already gone. Fix: clone for one of the
two calls, since both functions take ownership:

```rust
let count = char_count(code.clone());
let shouted = shout(code);
```
Cloning for the *first* call (not the second) means the original `code` survives to be moved into `shout`
for the last use - only one clone needed, not two, because after `shout` consumes `code` nothing needs it
again.
</details>

> [!warning] Common wrong model
> "Ownership is just a fancy word for scoping - as long as a variable's block hasn't ended, I can still
> use it." That model breaks on the very first move: `let short_code = String::from("gn7x2"); let archived
> = short_code; println!("{short_code}");` fails to compile even though `short_code`'s enclosing block
> hasn't ended - scope and ownership are different things that usually overlap but don't have to. The
> right model: the compiler tracks each value's *one current owner* at every point in the code, and moving
> it away invalidates the old binding immediately, regardless of how much of its scope is technically
> still left to run.

## Recall

Answer each once, then check the explanation.

```meno-check
id: string-move-invalidates
type: cloze
concept: ownership
prompt: |
  After `let s2 = s1;` where s1 is a String, using s1 afterward is a compile error because ownership has
  {{...}} to s2.
answer: "moved"
explain: |
  String isn't Copy, so assignment transfers ownership rather than duplicating the heap data. The old
  binding, s1, is invalidated the instant the move happens.
```

```meno-check
id: i32-copy-both-valid
type: cloze
concept: ownership
prompt: |
  Unlike String, i32 implements the {{...}} trait, so after `let b = a;` both a and b remain valid.
answer: "Copy"
explain: |
  Fixed-size stack types like i32 implement Copy, so assignment duplicates the value instead of moving
  it - no invalidation, both bindings stay usable.
```

```meno-check
id: drop-on-scope-exit
type: flashcard
concept: ownership
prompt: |
  What happens automatically to a value when its owner goes out of scope?
answer: |
  Rust calls drop on it, freeing the memory immediately.
explain: |
  This is rule 2 of ownership - drop runs at a compile-time-determined point, with no garbage collector
  watching for unreferenced memory. It's the reason Rust programs don't pay a GC's runtime cost.
```

```meno-check
id: mut-required-cloze
type: cloze
concept: syntax-for-experienced-developers
prompt: |
  Reassigning a let-bound variable in Rust requires the binding to have been declared with {{...}}.
answer: "mut"
explain: |
  A callback to the syntax lesson: mutability is opt-in in Rust, separate from (though easy to conflate
  with) the ownership rules this lesson covers - both are compile-time-enforced strictness, but they
  govern different things.
```

```meno-check
id: cargo-toml-manifest-flashcard
type: flashcard
concept: cargo-and-toolchain
prompt: |
  Which Cargo-generated file lists your project's dependencies under a [dependencies] table?
answer: "Cargo.toml"
explain: |
  Another callback, this time to the toolchain lesson - now that three concepts are on the table, recall
  mixes across all of them rather than only testing whatever was taught most recently.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> Your link-shortener's click-counting code looks like this: `fn record_click(mut counts: HashMap<String,
> u32>, code: String) -> HashMap<String, u32> { *counts.entry(code).or_insert(0) += 1; counts }`, and every
> call site writes `counts = record_click(counts, code.clone());` - even in places where `code` is never
> used again after that line. Explain, in your own words, exactly which ownership rule made that `.clone()`
> feel necessary to whoever wrote this, and what you'd change so a call site that doesn't reuse `code`
> afterward no longer needs to clone it.
