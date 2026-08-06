---
schema_version: 1
id: rust-for-backend/02-borrowing-in-practice/01-borrowing
title: Borrowing and references
module: 02-borrowing-in-practice
type: lesson
objectives: [M2-1, M2-2]
concepts: [borrowing]
prerequisites: [ownership]
estimated_minutes: 70
difficulty: core
status: generated
generated_at: 2026-08-07
review_after: 2026-08-09
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 4.2: References and Borrowing"
    url: https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html
    archived_url: https://web.archive.org/web/20260805033733/https://doc.rust-lang.org/book/ch04-02-references-and-borrowing.html
    accessed: 2026-08-05
    source_type: web
    why: explains the borrow checker's one-mutable-or-many-immutable-references rule that this lesson's exercises apply
tags: []
---

# Borrowing and references

> Heads-up: the borrow checker will reject code below before you fully see why - that rejection is
> the compiler doing retrieval practice's job for you, not a sign you're behind.

**You'll be able to:** rewrite a function that needlessly takes ownership so it borrows instead, and
predict whether a snippet satisfies the borrow checker's one-mutable-or-many-immutable rule.

## Before you start

Answer from memory, then check yourself.

1. Last lesson, `fn archive_code(code: String) -> usize` took `code` by value. What happened to the
   caller's variable the moment that call returned? ([[03-ownership|Ownership]])
   <details><summary>Check yourself</summary>
   It was moved into `archive_code`'s `code` parameter, then dropped when the function ended. The
   caller's binding was invalidated at the call site - using it afterward was a compile error.
   </details>
2. What's the one method you reached for last lesson when you needed to keep using a `String` after
   passing it to a function that takes ownership? ([[03-ownership|Ownership]])
   <details><summary>Check yourself</summary>
   `.clone()` - it allocates a second, independent copy of the heap data, so the original binding
   survives the call.
   </details>
3. Cloning fixes the invalidation problem, but it pays a real cost: copying heap data. Prediction, no
   wrong answer: do you expect Rust to offer a way to let a function use a value temporarily *without*
   paying that copy cost and *without* moving ownership away?
   <details><summary>Check yourself</summary>
   Yes - that's today's lesson. Rust calls it borrowing, and it's the third option this course set
   aside on purpose at the end of the ownership lesson.
   </details>

## The idea

Python and TypeScript never make you think about this at all: passing an object into a function hands
the callee a reference to the same underlying data, full stop, no ownership concept involved, nothing
invalidated on either side. Rust's ownership rules from last lesson are stricter by default - passing a
`String` by value moves it - but Rust also has an explicit way to get back that "just let the function
look at it" behavior: a **reference**.

**Contrast 1 - reading without owning.** Prefix a variable with `&` to create a reference to it instead
of moving it. A reference is guaranteed to point to a valid value for as long as the reference exists,
without taking ownership of that value (The Rust Book, ch. 4.2: References and Borrowing):

```rust
fn code_length(code: &String) -> usize {
    code.len()
}

fn main() {
    let short_code = String::from("gn7x2");
    let length = code_length(&short_code);      // &short_code borrows, doesn't move
    println!("Length: {length}");
    println!("Still have it: {short_code}");    // fine - nothing was moved
}
```

Compare this to last lesson's `archive_code(code: String)`, which moved `code` and dropped it at
function end. `code_length(code: &String)` only *borrows* - when the reference goes out of scope at
the end of the function, nothing is dropped, because the reference never owned the data in the first
place (ch. 4.2). This is the third option the ownership lesson deferred: borrowing avoids both the
move (so the caller keeps using its variable) and the cost of `.clone()` (so no second allocation).

**Contrast 2 - borrowing to modify.** A plain `&` reference is read-only: you can't push new data
through it. To modify borrowed data, opt in explicitly with `&mut`:

```rust
fn append_suffix(code: &mut String) {
    code.push_str("-v2");
}

fn main() {
    let mut short_code = String::from("gn7x2");
    append_suffix(&mut short_code);
    println!("{short_code}");   // gn7x2-v2
}
```

Notice `mut` shows up twice here - once on the `let mut` binding (last module's rule: you can't
reassign or mutate through a binding that isn't declared `mut`) and once on the reference type
`&mut String` (this lesson's rule: you can't mutate through a reference unless the reference itself is
mutable). They're separate opt-ins that happen to look similar.

Rust enforces one more rule on top of both of these, checked entirely at compile time, with zero
runtime cost - the core borrowing rule (ch. 4.2):

> "At any given time, you can have *either* one mutable reference *or* any number of immutable
> references" to the same value, never both kinds at once, and never more than one mutable reference.

Why enforce this at all? Because the failure mode it prevents - one piece of code reading data while
another mutates it out from under it - is exactly the class of bug Python and TypeScript's shared,
freely-aliased references leave open at runtime (a race condition, or a "why did this list change
under me" surprise). Rust's borrow checker catches it before the program ever runs.

## Worked example

Rewriting last lesson's `archive_code` end to end, from taking ownership to borrowing - the version
you'd actually want in the link-shortener, since archiving a code shouldn't cost you the ability to
keep using it:

```rust
fn archive_code(code: String) -> usize {
    code.len()
}
```
Why this was worth fixing: every caller had to either give up its `short_code` for good or pay for a
`.clone()` just to log a length - the previous lesson's `record_click`-shaped `.clone()`-everywhere
pattern happens exactly because functions like this take ownership when they only ever need to look.

```rust
fn archive_code(code: &String) -> usize {
    code.len()
}

fn main() {
    let short_code = String::from("gn7x2");
    let length = archive_code(&short_code);

    println!("Archived a code of length {length}");
    println!("Original code was: {short_code}");   // no longer an error
}
```
Why this compiles now: `archive_code` only ever reads `code.len()` - it never needed ownership at all,
just temporary access. `&short_code` at the call site creates an immutable reference; `code: &String`
in the signature accepts one. `short_code` itself is never moved, so the second `println!` - the exact
line that errored last lesson - now compiles cleanly.

Now suppose the link-shortener needs to normalize a code by lowercasing it in place, which requires
mutation:

```rust
fn normalize(code: &mut String) {
    *code = code.to_lowercase();
}

fn main() {
    let mut short_code = String::from("GN7X2");
    normalize(&mut short_code);
    println!("{short_code}");   // gn7x2
}
```
Why the extra `mut`s: `normalize` needs to write through the reference, so both the parameter type
(`&mut String`) and the borrow at the call site (`&mut short_code`) declare that explicitly - and
`short_code` itself must be declared `let mut` too, or there is nothing mutable to borrow in the first
place. Three separate opt-ins, one purpose: mutation through a reference is never the silent default.

What the borrow checker refuses, and why it matters here specifically:

```rust
fn main() {
    let mut short_code = String::from("gn7x2");
    let r1 = &mut short_code;
    let r2 = &mut short_code;   // ERROR: cannot borrow `short_code` as mutable more than once
    println!("{r1} {r2}");
}
```
Why: two live mutable references to the same `String` at the same time is exactly the "either one
mutable or many immutable, never both" rule from the idea section, enforced the moment `r2` is
created - not when you actually use it. The compiler doesn't wait to see whether you'd have caused a
problem; it refuses the possibility outright.

## Your turn

**Worked example.** This function takes ownership when it only ever reads. Rewrite it to borrow
instead, and update the call site:
```rust
fn is_valid_code(code: String) -> bool {
    code.len() >= 4 && code.len() <= 12
}

fn main() {
    let code = String::from("gn7x2");
    let valid = is_valid_code(code);
    println!("{code} valid: {valid}");   // ERROR today - code was moved
}
```
<details><summary>Answer + why</summary>

```rust
fn is_valid_code(code: &String) -> bool {
    code.len() >= 4 && code.len() <= 12
}

fn main() {
    let code = String::from("gn7x2");
    let valid = is_valid_code(&code);
    println!("{code} valid: {valid}");   // fine - code was never moved
}
```
Why: `is_valid_code` never needed ownership, only `code.len()`. Borrowing at both the signature and the
call site fixes the move without touching what the function actually does.
</details>

**Completion problem.** Fill in the one call so this compiles without changing what `counts` stores:
```rust
fn bump(counts: &mut Vec<u32>, amount: u32) {
    counts.push(amount);
}

fn main() {
    let mut counts = Vec::new();
    bump(___, 1);
    println!("Recorded {} click counts", counts.len());
}
```
<details><summary>Answer + why</summary>

```rust
bump(&mut counts, 1);
```
Why: `bump` takes `counts: &mut Vec<u32>`, so the call site must supply a mutable borrow, not the
vector itself (which would move it) and not an immutable `&counts` (which wouldn't satisfy `&mut`).
</details>

**Full problem.** Predict whether this compiles; if it doesn't, fix it with the smallest change that
keeps both prints:
```rust
fn main() {
    let mut short_code = String::from("gn7x2");
    let reader = &short_code;
    let writer = &mut short_code;
    println!("{reader}");
    writer.push_str("-v2");
}
```
<details><summary>Answer + why</summary>
Does not compile - `reader` (immutable) and `writer` (mutable) are both live borrows of `short_code` at
the same time, which the one-mutable-or-many-immutable rule forbids outright, regardless of the order
you use them in afterward. Fix: narrow `reader`'s scope so it's no longer live when `writer` is
created - print it and let it go out of use before borrowing mutably:

```rust
fn main() {
    let mut short_code = String::from("gn7x2");
    let reader = &short_code;
    println!("{reader}");           // reader's last use
    let writer = &mut short_code;   // reader is no longer live, so this is fine
    writer.push_str("-v2");
}
```
Rust's borrow checker tracks a reference's last *use*, not just its enclosing scope - `reader` stops
counting as a live borrow right after the `println!`, which is what makes `writer` legal one line
later.
</details>

> [!warning] Common wrong model
> "As long as I write `&`, I can have as many references as I want, mutable or not." That model breaks
> the moment you create a second live `&mut` to the same value, or a `&mut` alongside a live `&` - the
> compiler refuses to build, naming both borrows. The right model: `&` doesn't grant unlimited access,
> it grants *one kind* of access under a hard limit - one mutable reference, or any number of immutable
> ones, never a mix, and never two mutables, for as long as both are actually still in use.

## Recall

Answer each once, then check the explanation.

```meno-check
id: reference-default-immutable
type: cloze
concept: borrowing
prompt: |
  A `&` reference is {{...}} by default; you need `&mut` to modify what it points to.
answer: "immutable"
explain: |
  Plain references are read-only. Mutation through a reference is an explicit opt-in with &mut, the
  same "strict by default" pattern as let bindings from module 1.
```

```meno-check
id: one-mutable-or-many-immutable
type: flashcard
concept: borrowing
prompt: |
  State the borrow checker's core rule about mutable and immutable references to the same value.
answer: |
  At any given time, you can have either one mutable reference or any number of immutable references
  to the same value - never both kinds, and never more than one mutable, at once.
explain: |
  This is the rule the compiler enforces at every point a reference is live, not just at declaration -
  it's what makes two simultaneous &mut borrows, or a &mut alongside a live &, refuse to compile.
```

```meno-check
id: borrow-no-ownership-transfer
type: cloze
concept: borrowing
prompt: |
  Passing `&short_code` into a function does not move `short_code`; the caller still {{...}} it
  afterward.
answer: "owns"
explain: |
  A reference never takes ownership, so the original binding is never invalidated - the exact fix for
  last lesson's "value used here after move" error, without paying for a .clone().
```

```meno-check
id: clone-vs-borrow-cost
type: cloze
concept: ownership
prompt: |
  Unlike `.clone()`, borrowing with `&` avoids allocating a {{...}} copy of the heap data.
answer: "duplicate"
explain: |
  A callback to the ownership lesson: cloning pays for a second heap allocation; borrowing hands out
  temporary access to the original allocation instead, at zero extra memory cost.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> Your link-shortener has this function, and it refuses to compile:
> `fn log_and_dedupe(codes: &mut Vec<String>) { for code in codes.iter() { println!("{code}"); if code.is_empty() { codes.push(String::from("unknown")); } } }`
> Explain, in terms of the borrowing rule this lesson covers, exactly why holding `codes.iter()` open
> while also calling `codes.push(...)` inside the same loop is rejected, and rewrite the function so it
> compiles and keeps the same intent (log every code, then separately record replacements for empty
> ones).
