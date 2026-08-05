---
schema_version: 1
id: rust-for-backend/01-syntax-and-ownership-basics/02-syntax-for-experienced-developers
title: Rust syntax for Python and TypeScript developers
module: 01-syntax-and-ownership-basics
type: lesson
objectives: [M1-2]
concepts: [syntax-for-experienced-developers]
prerequisites: [cargo-and-toolchain]
estimated_minutes: 60
difficulty: intro
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 3.1: Variables and Mutability"
    url: https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html
    archived_url: https://web.archive.org/web/20260805033645/https://doc.rust-lang.org/book/ch03-01-variables-and-mutability.html
    accessed: 2026-08-05
    source_type: web
    why: states that let bindings are immutable by default, how let mut and const differ, and what shadowing means - the exact rules this lesson contrasts with Python and TypeScript variable semantics
  - title: "The Rust Book, ch. 3.3: How Functions Work"
    url: https://doc.rust-lang.org/book/ch03-03-how-functions-work.html
    archived_url: https://web.archive.org/web/20260805040540/https://doc.rust-lang.org/book/ch03-03-how-functions-work.html
    accessed: 2026-08-05
    source_type: web
    why: states that parameter types are mandatory, return types use ->, and a semicolon turns a returning expression into a non-returning statement - the rule the worked example's function translation relies on
  - title: "The Rust Book, ch. 3.5: Control Flow"
    url: https://doc.rust-lang.org/book/ch03-05-control-flow.html
    archived_url: https://web.archive.org/web/20260805040709/https://doc.rust-lang.org/book/ch03-05-control-flow.html
    accessed: 2026-08-05
    source_type: web
    why: states that if is an expression usable directly in a let statement (with both arms required to match types) and covers loop/while/for - what this lesson contrasts with Python/TypeScript control flow and the ternary operator
tags: []
---

# Rust syntax for Python and TypeScript developers

> Heads-up: translating syntax you already understand conceptually can still feel slow the first few
> times - that slowdown is new muscle memory forming, not a sign you don't get it.

**You'll be able to:** translate variables, functions, and control flow you already know from Python and
TypeScript into idiomatic Rust syntax.

## Before you start

Answer from memory, then check yourself.

1. What single command scaffolds a new Cargo project with a working `src/main.rs`, and what file lists
   its dependencies? ([[01-cargo-and-toolchain|Cargo and the Rust toolchain]])
   <details><summary>Check yourself</summary>
   `cargo new <name>` scaffolds the project; Cargo.toml, under its `[dependencies]` table, lists what it
   depends on.
   </details>
2. True or false: `cargo run` recompiles your code from scratch every single time, even when nothing
   changed. ([[01-cargo-and-toolchain|Cargo and the Rust toolchain]])
   <details><summary>Check yourself</summary>
   False. Cargo skips recompilation when no source files changed since the last build and just runs the
   cached binary - which is why the second cargo run in a row is near-instant.
   </details>

## The idea

**Variables.** Python lets you rebind a name to anything, anytime, with zero ceremony:

```python
count = 0
count = count + 1   # fine, no declaration needed
count = "now a string"   # also fine - Python doesn't care
```

TypeScript adds a mutability choice at declaration time - `let` for reassignable, `const` for not - but
values themselves stay ordinary mutable objects at runtime:

```typescript
let count = 0;
count = count + 1;   // fine, let means reassignable
```

Rust flips the default: **bindings are immutable unless you say otherwise.** `let count = 0;` followed by
`count = count + 1;` is a compile error, not a lint warning - you have to opt in with `mut`:

```rust
let mut count = 0;
count = count + 1;   // fine, now that count is declared mut
```

This is stricter than either Python or TypeScript's `let` (The Rust Book, ch. 3.1: Variables and
Mutability). Rust also has `const`, which - unlike an immutable `let` - can never be made mutable, must
have an explicit type, and can only hold a value computable at compile time (ch. 3.1). And it has a move
neither Python nor TypeScript has an equivalent for: **shadowing**, where a new `let` with the same name
replaces the old one, type change allowed:

```rust
let spaces = "   ";      // a &str
let spaces = spaces.len();   // now a number - allowed, because this is a *new* binding, not a mutation
```

Trying the same type change via `mut` would be a compile error - `mut` only ever changes a binding's
*value*, never its type. Python would let you rebind `spaces` to a number with no complaint at all, which
is exactly the freedom Rust's compiler is refusing to give you here.

**Functions.** Python needs no parameter types at all; TypeScript's are optional but idiomatic. Rust makes
them mandatory - every parameter must declare its type, and the compiler leans on that to give you sharper
error messages elsewhere (The Rust Book, ch. 3.3: How Functions Work):

```python
def plus_one(x):
    return x + 1
```
```typescript
function plusOne(x: number): number {
    return x + 1;
}
```
```rust
fn plus_one(x: i32) -> i32 {
    x + 1
}
```

Notice `x + 1` has no `return` keyword and no semicolon. That's not a typo: in Rust, a function's last
expression - if it has no trailing semicolon - is its return value. Add a semicolon and you turn that
expression into a statement, which returns nothing, and the compiler will refuse to compile the function
(ch. 3.3). Python and TypeScript don't have this trap: `return` is always explicit, so nothing changes
meaning based on a punctuation mark at the end of a line.

**Control flow.** Python's ternary is `a if cond else b`; TypeScript's is `cond ? a : b`. Rust doesn't
need a separate ternary operator, because `if` is already an expression - it produces a value, so it can
sit directly on the right of a `let`, as long as every arm produces the same type (The Rust Book, ch. 3.5:
Control Flow):

```rust
let condition = true;
let number = if condition { 5 } else { 6 };   // no ternary needed - if already returns a value
```

Rust also has three loop forms - `loop` (runs until an explicit `break`, and can return a value from that
break), `while`, and `for` (iterates over a collection, the safest and most common of the three) - which
map fairly directly onto Python's `while True: ... break`, `while`, and `for ... in`, or TypeScript's
`while` and `for...of` (ch. 3.5).

## Worked example

Translating a small Python function into Rust, piece by piece. Here's the Python version, deciding
whether a click count counts as "popular" for the link-shortener's stats page:

```python
def classify_clicks(count, threshold=100):
    if count >= threshold:
        return "popular"
    else:
        return "quiet"
```

Step 1 - the signature:
```rust
fn classify_clicks(count: i32, threshold: i32) -> String {
```
Why: both parameters need explicit types (`i32` for plain integers - no decimal point needed here), and
the return type is declared with `->` rather than being implicit. Python needed no types at all here;
Rust asks for exactly two.

Step 2 - the body, without a default parameter (Rust doesn't have default parameter values - you'd
overload with a second function or a builder pattern for that, out of scope here, so `threshold` is just
always passed explicitly):
```rust
    if count >= threshold {
        String::from("popular")
    } else {
        String::from("quiet")
    }
}
```
Why no `return` and no semicolons: the whole `if`/`else` is itself an expression (both arms are the same
type, `String`), so its value becomes the function's return value directly - matching the "last
expression, no semicolon" rule from the idea section above. You could still write this with explicit
`return` statements and semicolons, exactly like the Python version, and it would compile fine - but
idiomatic Rust favors the expression form, and you'll see it constantly in code you read.

Full translation:
```rust
fn classify_clicks(count: i32, threshold: i32) -> String {
    if count >= threshold {
        String::from("popular")
    } else {
        String::from("quiet")
    }
}
```

One thing this example deliberately doesn't explain yet: why `String::from(...)` is written that way, or
what it costs to hand a `String` back out of a function. That's the whole subject of the next lesson,
[[03-ownership|Ownership]] - for now, treat `String::from("popular")` as "how you spell a string literal
you want to own," the same way you'd write `"popular"` in Python without thinking about memory at all.

## Your turn

**Worked example.** Translate this Python guard-clause function into Rust:
```python
def is_valid_code(code_length):
    if code_length < 4:
        return False
    if code_length > 12:
        return False
    return True
```
<details><summary>Answer + why</summary>

```rust
fn is_valid_code(code_length: i32) -> bool {
    if code_length < 4 {
        false
    } else if code_length > 12 {
        false
    } else {
        true
    }
}
```
Why: Python's early `return`s become an `if`/`else if`/`else` chain, because Rust favors one expression
producing the final value over multiple exit points - both compile to the same logic, but the expression
form fits the "last expression is the return value" pattern you just practiced. (Rust does support early
`return` too, and you'll see it used for genuinely early exits later in this course - it's not wrong here,
just not the idiomatic shape for a simple three-way check.)
</details>

**Completion problem.** Fill in the blank so this compiles and reassigns `attempts`:
```rust
let ___ attempts = 0;
attempts = attempts + 1;
```
<details><summary>Answer + why</summary>

```rust
let mut attempts = 0;
```
Why: bindings are immutable by default in Rust; reassigning `attempts` requires declaring it `mut` up
front, unlike Python or TypeScript's `let`, where reassignment needs no special declaration at all.
</details>

**Full problem.** Translate this TypeScript function into Rust from scratch:
```typescript
function applyDiscount(price: number, isMember: boolean): number {
    const discount = isMember ? 0.9 : 1.0;
    return price * discount;
}
```
<details><summary>Answer + why</summary>

```rust
fn apply_discount(price: f64, is_member: bool) -> f64 {
    let discount = if is_member { 0.9 } else { 1.0 };
    price * discount
}
```
Why: `number` becomes `f64` (Rust separates integer and floating-point types, where TypeScript's `number`
covers both); the ternary `isMember ? 0.9 : 1.0` becomes an `if` expression bound directly to `let
discount` - no ternary operator needed, same reasoning as the `number` example in the idea section; and
the final `price * discount` has no semicolon, so it's the function's return value, mirroring
`classify_clicks` above.
</details>

> [!warning] Common wrong model
> "Rust variables are mutable unless I say otherwise, same as Python and TypeScript." That model breaks
> the first time you write `let x = 5;` and then `x = 6;` without `mut` - the compiler refuses to build at
> all, with an error naming the exact line, not a warning you can ignore. The right model: Rust defaults
> to immutable, and mutability is something you opt into explicitly with `mut`, enforced at compile time
> rather than left to convention or a linter.

## Recall

Answer each once, then check the explanation.

```meno-check
id: rust-let-default-immutable
type: cloze
concept: syntax-for-experienced-developers
prompt: |
  In Rust, `let x = 5;` followed by `x = 6;` fails to compile unless you write `let {{...}} x = 5;`
  instead.
answer: "mut"
explain: |
  Bindings are immutable by default in Rust. mut is the explicit opt-in for reassignment - unlike Python
  or TypeScript's let, where reassignment needs no special declaration.
```

```meno-check
id: fn-return-no-semicolon
type: cloze
concept: syntax-for-experienced-developers
prompt: |
  Removing the trailing semicolon from a function's last line turns it from a statement into an
  {{...}}, whose value becomes the function's return value.
answer: "expression"
explain: |
  Statements perform an action and return nothing; expressions evaluate to a value. Dropping the
  semicolon on the last line is what makes that line's value the function's return value.
```

```meno-check
id: if-as-expression-flashcard
type: flashcard
concept: syntax-for-experienced-developers
prompt: |
  In Rust, can you write `let x = if cond { 1 } else { 2 };` directly, the way you'd use a ternary in
  TypeScript?
answer: |
  Yes - because if is an expression in Rust.
explain: |
  Since if produces a value, it can sit directly on the right of a let, as long as every arm produces the
  same type. That's exactly why Rust has no separate ternary operator the way TypeScript does - if already
  covers the job.
```

```meno-check
id: cargo-run-recompile-cloze
type: cloze
concept: cargo-and-toolchain
prompt: |
  cargo run only recompiles when source files have {{...}}; otherwise it reuses the cached binary from
  target/debug.
answer: "changed"
explain: |
  Cargo tracks whether anything changed since the last build. No changes means no Compiling line and a
  near-instant run - a callback to the toolchain lesson, since syntax and tooling questions interleave
  once more than one concept is on the table.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A teammate reviewing your code leaves a comment: "add a semicolon here for consistency with the rest of
> the file" - pointing at the last line inside a Rust function whose return type isn't `()`. Explain in
> your own words why making that single-character change would break the build, and rewrite the function
> so it both compiles and stays idiomatic (rather than just deleting their comment and moving on).
