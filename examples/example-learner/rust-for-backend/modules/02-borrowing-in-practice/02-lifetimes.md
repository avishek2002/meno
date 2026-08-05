---
schema_version: 1
id: rust-for-backend/02-borrowing-in-practice/02-lifetimes
title: Lifetimes
module: 02-borrowing-in-practice
type: lesson
objectives: [M2-3]
concepts: [lifetimes]
prerequisites: [borrowing]
estimated_minutes: 95
difficulty: core
status: generated
generated_at: 2026-08-07
review_after: 2026-08-09
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 10.3: Validating References with Lifetimes"
    url: https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html
    archived_url: https://web.archive.org/web/20260805033756/https://doc.rust-lang.org/book/ch10-03-lifetime-syntax.html
    accessed: 2026-08-05
    source_type: web
    why: covers lifetime annotation syntax and elision rules that this lesson applies to the longest-style example
tags: []
---

# Lifetimes

> Heads-up: lifetimes are the module's hardest idea on purpose - the annotation syntax looks small, but
> reasoning about what it actually promises takes real effortful practice. That effort is the method
> working, not a sign this should already feel obvious.

**You'll be able to:** annotate a function signature with the lifetime parameter it needs when the
compiler can't infer one, and explain what a lifetime annotation does and doesn't promise.

## Before you start

Answer from memory, then check yourself.

1. What's the difference between `&short_code` and `&mut short_code` as function arguments?
   ([[01-borrowing|Borrowing and references]])
   <details><summary>Check yourself</summary>
   `&short_code` is an immutable borrow - read-only access, any number can coexist. `&mut short_code`
   is a mutable borrow - read-write access, and only one can exist at a time, with no immutable borrows
   alongside it.
   </details>
2. State the borrow checker's core rule about how many mutable and immutable references can coexist.
   ([[01-borrowing|Borrowing and references]])
   <details><summary>Check yourself</summary>
   At any given time, either one mutable reference or any number of immutable references to the same
   value - never both kinds at once, and never more than one mutable.
   </details>
3. Module 1 established that every function parameter needs an explicit type - no inference the way
   Python or TypeScript allow. Prediction, no wrong answer: given that a `&str` return type is already
   a type, do you expect a function *returning* a reference to ever need something beyond just writing
   `&str` as its return type?
   <details><summary>Check yourself</summary>
   Yes, sometimes - that's today's lesson. `&str` alone says "returns a string slice"; it doesn't say
   *which* input, if any, that slice's validity depends on. That missing relationship is what a
   lifetime annotation supplies.
   </details>

## The idea

**Contrast 1 - an owned return needs nothing extra.** A function returning an owned `String`, the way
last module's `classify_clicks` did, never needs a lifetime annotation:

```rust
fn shout(code: &str) -> String {
    code.to_uppercase()
}
```

Why: `to_uppercase()` allocates a brand-new `String` that the function now owns outright and hands to
the caller. Nothing about the return value's validity depends on how long `code` sticks around -
ownership was transferred, full stop, so there's no relationship for a lifetime to describe.

**Contrast 2 - a borrowed return can be ambiguous.** Compare that to a function returning a
*reference*, chosen from between two inputs:

```rust
fn longest(x: &str, y: &str) -> &str {
    if x.len() > y.len() { x } else { y }
}
```

This does not compile. The compiler can see the function returns *some* `&str`, but not which one -
`x`'s or `y`'s - and therefore can't verify the return value won't outlive whichever input it actually
came from. Rust requires you to say, explicitly, which relationship holds (The Rust Book, ch. 10.3:
Validating References with Lifetimes):

```rust
fn longest<'a>(x: &'a str, y: &'a str) -> &'a str {
    if x.len() > y.len() { x } else { y }
}
```

The `'a` (read: "tick-a" - lifetime names start with an apostrophe, conventionally short and lowercase)
appears three times: once declaring the generic parameter (`<'a>`), and once on each reference type
that participates in the relationship. It reads as a single promise: *the returned reference is valid
for exactly as long as both `x` and `y` are valid* - the shorter of the two, in practice, since the
promise has to hold for both simultaneously (ch. 10.3).

This is the single most important thing to get right about lifetime syntax, and it's exactly backward
from how it looks:

> "Lifetime annotations don't change how long any of the references live. Rather, they describe the
> relationships of the lifetimes of multiple references to each other without affecting the lifetimes"
> (ch. 10.3).

Writing `'a` doesn't make anything live longer, the way you might expect a config knob to. It's a
constraint the compiler then *checks against reality* - if you actually call `longest` with a reference
that doesn't live long enough, the code still fails to compile, annotation or not. The annotation is a
promise you make; the compiler is what holds you to it.

**When you don't need one.** Rust doesn't force `'a` everywhere a reference appears - three elision
rules cover the common cases automatically (ch. 10.3): every input reference gets its own inferred
lifetime; if there's exactly *one* input lifetime, it's assigned to every output; and in a method, the
lifetime of `&self` is assigned to every output. `longest` needed an explicit `'a` only because it has
*two* input references and elision rule two doesn't apply once there's more than one candidate.

## Worked example

Applying `longest` to the link-shortener: picking whichever of a code's two candidate redirect targets
(a primary and a shortened fallback) is longer, without cloning either one.

```rust
fn longer_target(primary: &str, fallback: &str) -> &str {
    if primary.len() >= fallback.len() { primary } else { fallback }
}
```
Why this doesn't compile: two input `&str` references, one `&str` return, no way for the compiler to
tell which input the output borrows from - the exact ambiguity from the idea section, just with
different names.

```rust
fn longer_target<'a>(primary: &'a str, fallback: &'a str) -> &'a str {
    if primary.len() >= fallback.len() { primary } else { fallback }
}

fn main() {
    let primary = String::from("https://gn.co/x9k2");
    let result;
    {
        let fallback = String::from("https://gn.co/f2");
        result = longer_target(&primary, &fallback);
        println!("Longer target: {result}");
    }   // fallback (and anything borrowed from it) must stop being used by here
}
```
Why this compiles, and why the inner block matters: `<'a>` tells the compiler `result` can only be
trusted for as long as *both* `primary` and `fallback` are valid. Because `result` is printed while
`fallback` is still in scope, that promise holds. Try moving the `println!` outside the inner block -
after `fallback` has been dropped - and the compiler rejects it, even though `primary` alone would
easily outlive that point. The annotation ties `result`'s validity to the *shorter*-lived of the two
inputs, not the longer one.

Now the single-input case, where elision does the work for you:

```rust
fn trimmed(code: &str) -> &str {
    code.trim()
}
```
Why no `'a` needed here: exactly one input reference, so elision rule two applies automatically - the
one input lifetime is assigned to the output, with nothing for you to write. This is the far more
common shape in real code; explicit `'a` is for the ambiguous, multi-reference case specifically.

## Your turn

**Worked example.** This function won't compile. Annotate it correctly:
```rust
fn shorter_code(a: &str, b: &str) -> &str {
    if a.len() <= b.len() { a } else { b }
}
```
<details><summary>Answer + why</summary>

```rust
fn shorter_code<'a>(a: &'a str, b: &'a str) -> &'a str {
    if a.len() <= b.len() { a } else { b }
}
```
Why: same shape as `longer_target` - two input references, one output that could be either, so the
compiler needs the explicit relationship. Elision rule two doesn't apply once there's more than one
candidate input.
</details>

**Completion problem.** Fill in the blank so this compiles:
```rust
fn first_word(text: &___ str) -> &str {
    text.split_whitespace().next().unwrap_or("")
}
```
<details><summary>Answer + why</summary>

```rust
fn first_word(text: &str) -> &str {
    text.split_whitespace().next().unwrap_or("")
}
```
No lifetime annotation needed - the blank is just `&str`, not `&'a str`. Only one input reference
exists, so elision rule two assigns its lifetime to the output automatically; writing `'a` explicitly
here would compile too, but it's redundant, not required.
</details>

**Full problem.** Predict whether this compiles; if it doesn't, fix it with the smallest signature
change:
```rust
fn pick_code(primary: &str, backup: &str, prefer_primary: bool) -> &str {
    if prefer_primary { primary } else { backup }
}

fn main() {
    let a = String::from("gn7x2");
    let chosen;
    {
        let b = String::from("f2q9x");
        chosen = pick_code(&a, &b, false);
    }
    println!("{chosen}");
}
```
<details><summary>Answer + why</summary>
The function signature doesn't compile as written - two input references, one ambiguous output,
missing `'a`. Fix the signature:

```rust
fn pick_code<'a>(primary: &'a str, backup: &'a str, prefer_primary: bool) -> &'a str {
    if prefer_primary { primary } else { backup }
}
```
But fixing the signature surfaces a second problem in `main`: with `prefer_primary: false`, `chosen`
borrows from `b`, and `println!("{chosen}")` runs *after* `b`'s inner block has ended - `b` is already
dropped. Annotating the function correctly doesn't rescue code that violates the promise it makes; the
fix there is moving the `println!` inside the inner block, same as the worked example above.
</details>

> [!warning] Common wrong model
> "Adding `'a` makes the reference live longer, so the compiler stops complaining." That model breaks
> the moment you annotate a function correctly and call it with a reference that still doesn't live
> long enough - the code keeps failing to compile, because the annotation never changed how long
> anything actually lives. The right model: a lifetime annotation is a promise about a *relationship*
> between input and output lifetimes, which the compiler then verifies against what your code actually
> does; it constrains what's checked, not what's true.

## Recall

Answer each once, then check the explanation.

```meno-check
id: lifetime-apostrophe-syntax
type: cloze
concept: lifetimes
prompt: |
  Lifetime parameter names start with a(n) {{...}} and are written directly after the `&` of a
  reference, e.g. `&'a str`.
answer: "apostrophe"
explain: |
  Conventionally short and lowercase ('a, 'b, ...), placed right after the & so the reference type and
  its lifetime read together, e.g. &'a str or &'a mut i32.
```

```meno-check
id: lifetime-does-not-extend
type: flashcard
concept: lifetimes
prompt: |
  Does adding a lifetime annotation like `'a` make a reference live any longer?
answer: |
  No - it only describes the relationship between reference lifetimes the compiler already enforces;
  it never extends how long a value actually lives.
explain: |
  This is the lesson's central misconception, stated as its own check: the annotation is a promise
  checked against reality, not a control that changes reality.
```

```meno-check
id: elision-single-input
type: cloze
concept: lifetimes
prompt: |
  Under lifetime elision rule two, a function with exactly {{...}} input reference needs no explicit
  lifetime annotation on its return type.
answer: "one"
explain: |
  With exactly one input lifetime, the compiler assigns it to every output automatically - the far more
  common case in real code, and why explicit 'a is the exception, not the rule.
```

```meno-check
id: two-refs-ambiguous-lifetime
type: cloze
concept: borrowing
prompt: |
  A function that borrows {{...}} references and returns one of them needs an explicit lifetime
  annotation, because elision rule one alone can't tell the compiler which input the output ties to.
answer: "two"
explain: |
  A callback to the borrowing lesson: elision rule one gives every input its own inferred lifetime, but
  with two or more candidates, nothing picks which one the output borrows from - that's exactly the gap
  an explicit 'a fills.
```

```meno-check
id: owned-return-no-lifetime
type: flashcard
concept: ownership
prompt: |
  Why does a function returning an owned `String` (not a reference) never need a lifetime annotation?
answer: |
  Because ownership transfers outright - the returned value doesn't borrow from anything, so there's no
  reference relationship for a lifetime to describe.
explain: |
  A callback to module 1's ownership lesson: lifetimes only ever describe relationships between
  references. An owned return has no such relationship to state.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> You're writing `fn active_target(primary: &str, fallback: &str) -> &str` for the link-shortener: it
> returns whichever of two redirect targets is non-empty (preferring `primary`), without cloning
> either one. Predict whether this compiles as written, and if it needs a change, write the correct
> signature. Then explain in your own words what your fix promises the compiler about `primary` and
> `fallback` - and what it explicitly does *not* promise about how long either one actually lives.
