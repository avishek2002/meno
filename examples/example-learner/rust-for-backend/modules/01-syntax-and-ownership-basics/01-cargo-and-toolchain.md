---
schema_version: 1
id: rust-for-backend/01-syntax-and-ownership-basics/01-cargo-and-toolchain
title: Cargo and the Rust toolchain
module: 01-syntax-and-ownership-basics
type: lesson
objectives: [M1-1]
concepts: [cargo-and-toolchain]
prerequisites: []
estimated_minutes: 40
difficulty: intro
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "The Rust Book, ch. 1: Getting Started"
    url: https://doc.rust-lang.org/book/ch01-00-getting-started.html
    archived_url: https://web.archive.org/web/20260805033625/https://doc.rust-lang.org/book/ch01-00-getting-started.html
    accessed: 2026-08-05
    source_type: web
    why: names Cargo as Rust's package manager and build system and frames the chapter's install-and-run walkthrough this lesson follows
  - title: "The Rust Book, ch. 1.3: Hello, Cargo!"
    url: https://doc.rust-lang.org/book/ch01-03-hello-cargo.html
    archived_url: https://web.archive.org/web/20260805040500/https://doc.rust-lang.org/book/ch01-03-hello-cargo.html
    accessed: 2026-08-05
    source_type: web
    why: covers cargo new's generated files, Cargo.toml's [package]/[dependencies] tables, cargo build vs cargo run, cargo check, and the target/debug vs target/release split that the worked example and checks rely on
tags: []
---

# Cargo and the Rust toolchain

> Heads-up: the recall questions below are supposed to make you dig a little -
> that friction is retrieval practice working, not a sign you're behind.

**You'll be able to:** set up a Rust project with Cargo, then build it, run it, and add a dependency to it.

## Before you start

You haven't had a Rust lesson yet, so instead of checking prior lessons, this checks what you already told
us in the [[profile|placement interview]]. Answer from memory, then check yourself.

1. In the placement interview you correctly said that `let s2 = s1;` moves ownership when `s1` is a
   `String`, because `String` isn't `Copy`. You were less sure whether the idiomatic fix was to clone `s1`
   or to borrow it. Before this lesson - which of those two fixes makes `s2` an independent copy, and which
   one avoids copying at all?
   <details><summary>Check yourself</summary>
   Cloning (`s1.clone()`) makes an independent copy - two separate allocations you can both use freely, at
   the cost of the extra copy. Borrowing (`&s1`) avoids copying entirely by lending temporary access to the
   original data instead of taking ownership of it. You don't need to know the borrow syntax yet - that's
   next module - but naming the trade-off (copy cost vs. no new ownership) is the part this checks.
   </details>
2. You've used `pip install` (Python) and `npm install` (TypeScript) to pull dependencies into a project.
   Rust compiles to a binary before it runs, unlike Python's line-by-line interpretation. What's one thing
   you'd expect a dependency tool for a *compiled* language to have to manage that pip and npm mostly don't?
   <details><summary>Check yourself</summary>
   Compilation itself - which source files to compile, in what order, with which compiler flags, and where
   to put the resulting binary. pip and npm mostly just place files on disk; a build tool for a compiled
   language has to orchestrate an actual compile step too. Cargo does both jobs at once, which is the
   subject of this lesson.
   </details>
3. True or false, and explain: because Rust compiles to a binary, `cargo run` should feel more like
   double-clicking a pre-built `.exe` than like typing `python app.py`.
   <details><summary>Check yourself</summary>
   Half true. The *first* `cargo run` compiles first (so it's slower, more like a build step than a
   double-click), but Cargo caches the result - if nothing changed, later runs skip recompiling and behave
   like launching a pre-built binary. The worked example below shows exactly this.
   </details>

## The idea

Every backend language you've shipped code in has one tool that answers three questions: how do I start a
new project, how do I pull in a library, and how do I run my code. In Python that's `pip` plus a virtual
environment; in TypeScript it's `npm` plus `package.json`. In Rust, one tool answers all three: **Cargo**
is Rust's package manager and build system in a single binary (The Rust Book, ch. 1: Getting Started).

**Contrast 1 - starting a project.** In Python, starting clean usually takes several commands and a file
you write by hand:

```bash
mkdir link_shortener && cd link_shortener
python -m venv .venv && source .venv/bin/activate
touch requirements.txt
```

In Rust, one command does the whole job:

```bash
cargo new link_shortener
```

`cargo new` creates the project directory, a `Cargo.toml` manifest, a `src/main.rs` with a working
"Hello, world!", and even initializes a git repository with a `.gitignore` - all in one step (The Rust
Book, ch. 1.3: Hello, Cargo!).

**Contrast 2 - declaring a dependency.** In TypeScript, `npm install axios` edits `package.json` for you
and downloads the package into `node_modules/`. In Rust, `cargo add <crate-name>` does the equivalent
job: it edits Cargo.toml's `[dependencies]` table for you. Same move, different file format - TOML
instead of JSON, and the source lives in `~/.cargo/registry` instead of a project-local `node_modules/`.

Cargo.toml itself has two tables you'll touch constantly: `[package]` holds your project's own name,
version, and edition; `[dependencies]` lists the crates it needs (The Rust Book, ch. 1.3). You'll edit
`[package]` rarely and grow `[dependencies]` steadily as this course adds an HTTP framework and a
persistence layer in later modules.

Once you have code, three commands cover the whole build-and-run cycle:

- `cargo check` - compiles just far enough to catch errors, without producing a runnable binary. Fastest
  option; use it constantly while writing code.
- `cargo build` - compiles fully and places the binary in `target/debug/`.
- `cargo run` - compiles (skipping the step entirely if nothing changed since the last build) and then
  runs the result in one command - the one you'll reach for most often.

Once a project is running, the code you write inside `src/main.rs` is the next thing to make familiar -
the next lesson takes constructs you already reach for daily in Python and TypeScript and shows you their
Rust spelling ([[02-syntax-for-experienced-developers|Rust syntax for Python and TypeScript developers]]).

`cargo build --release` produces an optimized binary in `target/release/` instead of `target/debug/` -
slower to compile, faster to run. You'll use it in module 7 (packaging and shipping), later in this
course, when the link-shortener is ready to actually deploy cheaply.

## Worked example

Setting up the actual skeleton this course builds toward - the link-shortener service:

```bash
$ cargo new link_shortener
```
Why: one command scaffolds everything - directory, manifest, a runnable `src/main.rs`, and git. No
separate "create a venv" or "write a package.json by hand" step.

```bash
$ cd link_shortener && cat Cargo.toml
```
```toml
[package]
name = "link_shortener"
version = "0.1.0"
edition = "2024"

[dependencies]
```
Why: `[package]` is metadata Cargo generated from the project name; `[dependencies]` is empty because you
haven't added any yet. This file is the single source of truth for what your project depends on - no
separate lockfile to hand-maintain the way you might juggle `requirements.txt` and `pip freeze` output.

```bash
$ cargo run
   Compiling link_shortener v0.1.0 (/path/to/link_shortener)
    Finished dev [unoptimized + debuginfo] target(s) in 0.31s
     Running `target/debug/link_shortener`
Hello, world!
```
Why: this is the "first run is slower" moment from the prereq check - `cargo run` compiled first (you can
see the `Compiling` and `Finished` lines), then executed the binary it just built. Run it again with no
code changes and the `Compiling` line disappears - Cargo notices nothing changed and skips straight to
running the cached binary.

```bash
$ cargo add rand
```
Why: the link-shortener needs to generate short codes, and `rand` is the standard crate for that. This
single command adds `rand = "<version>"` under `[dependencies]` in Cargo.toml for you - you never
hand-edit the TOML for a routine dependency add, the same way `npm install` spares you from hand-editing
`package.json`.

```bash
$ cargo build --release
    Finished release [optimized] target(s) in 4.02s
$ ls target/release/link_shortener
target/release/link_shortener
```
Why: `--release` turns on optimizations and writes to `target/release/` instead of `target/debug/` - a
different binary, not a flag on the debug one. You won't need this daily, but it's what you'll actually
ship in module 7 (packaging and shipping), later in this course.

## Your turn

**Worked example.** Create a new project called `note_taker`, add the `serde` crate (a common
serialization library), and confirm it runs.
<details><summary>Answer + why</summary>

```bash
cargo new note_taker      # scaffolds the project
cd note_taker
cargo add serde           # edits Cargo.toml's [dependencies] for you
cargo run                 # compiles (first time, so it's slower) then runs Hello, world!
```
Each step matches the worked example above: one command per job, no hand-edited files, and the first
`cargo run` pays the compile cost that later runs won't.
</details>

**Completion problem.** You ran `cargo new url_stats` and now need the `chrono` crate for handling
timestamps - but without hand-editing Cargo.toml. What's the one command?
<details><summary>Answer + why</summary>

```bash
cargo add chrono
```
Why: `cargo add` is Cargo's dependency-editing command regardless of which crate you need - there's no
separate "install" vs. "add to manifest" step the way pip's `install` and a manually maintained
`requirements.txt` can drift apart. Cargo.toml and what's actually available to your code stay in sync
automatically.
</details>

**Full problem.** Starting from nothing: set up a new Cargo project called `click_logger`, add `serde` as
a dependency, and get it printing `ready` when run. Write out the exact commands in order (you'll need to
edit `src/main.rs` once).
<details><summary>Answer + why</summary>

```bash
cargo new click_logger
cd click_logger
cargo add serde
```
Then edit `src/main.rs` to read:
```rust
fn main() {
    println!("ready");
}
```
```bash
cargo run
```
Why this order: `cargo new` must come first because every later command assumes a Cargo.toml already
exists. Adding the dependency before editing `main.rs` isn't strictly required, but it mirrors how you'll
usually work - decide what you need, then write the code that uses it. `cargo run` last because it's the
only command that both compiles and executes.
</details>

> [!warning] Common wrong model
> "`cargo run` is just like `python app.py` - it runs my source directly." It doesn't: `cargo run` always
> compiles first, then executes the resulting binary. The wrong model breaks the moment you watch the
> first `cargo run` pause for a `Compiling...` line before anything happens - a plain interpreter never
> does that. The right model: `cargo run` is "compile if needed, then execute the binary," which behaves
> like invoking a prebuilt executable once nothing has changed, not like re-interpreting a script every
> time.

## Recall

Answer each once, then check the explanation.

```meno-check
id: cargo-new-scaffold
type: flashcard
concept: cargo-and-toolchain
prompt: |
  Which single Cargo command creates a new project directory, complete with Cargo.toml and src/main.rs?
answer: "cargo new <project-name>"
explain: |
  cargo new bundles project-directory creation, the manifest, a runnable main.rs, and git init into one
  step - the Rust equivalent of the several commands you'd run to start a clean Python or TypeScript
  project.
```

```meno-check
id: cargo-toml-dependencies-table
type: cloze
concept: cargo-and-toolchain
prompt: |
  Running `cargo add serde` edits the {{...}} table inside Cargo.toml for you.
answer: "[dependencies]"
explain: |
  [dependencies] is the table Cargo reads to know what to fetch and compile against. cargo add writes to
  it directly, the same way npm install writes to package.json's dependencies field.
```

```meno-check
id: cargo-check-vs-build
type: cloze
concept: cargo-and-toolchain
prompt: |
  When you only want fast feedback on whether your code compiles, without producing a runnable binary,
  use `{{...}}` instead of cargo build.
answer: "cargo check"
explain: |
  cargo check skips the final code-generation step that produces a binary, so it's faster than a full
  cargo build - useful for the frequent "does this even compile" loop while you're writing code.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A teammate wants to swap the crate you're using for short-code generation for a different one, and asks
> you to make the change end to end using only Cargo - no hand-editing files. Walk through exactly what
> you'd run, in order, and explain how you'd confirm afterward that both Cargo.toml and the compiled
> binary actually reflect the swap, not just the source you happened to look at.
