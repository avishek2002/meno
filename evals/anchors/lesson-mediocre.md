# Ownership

**You'll be able to:** predict what happens when values are assigned or passed in Rust.

## The idea

Ownership is Rust's memory management system. Every value has one owner, and when the
owner goes out of scope the value is dropped. What assignment does depends on the type -
two contrasting cases:

```rust
let a = 5;
let b = a;        // i32 is Copy: both a and b stay valid
```

```rust
let s1 = String::from("hello");
let s2 = s1;      // String is not Copy: s1 is moved and invalidated
```

The difference: an i32 is a fixed-size stack value, so Rust just duplicates it. A String
owns heap data, and duplicating the pointer would mean two owners trying to free the same
memory - so Rust moves it instead.

## Worked example

```rust
fn shout(s: String) -> String {
    s.to_uppercase()   // we take ownership because we consume s to build a new String
}

fn main() {
    let name = String::from("sam");
    let loud = shout(name);   // name is moved in - we cannot use it after this line
    println!("{loud}");
}
```

The function takes `String` by value because it consumes it; after the call, `name` is
gone and only `loud` remains.

## Your turn

Write a function that takes a String and returns its length, without keeping ownership.
<details><summary>Answer + why</summary>
`fn len(s: String) -> usize { s.len() }` works but consumes the string; the caller loses
it. (Borrowing would avoid that - covered next lesson.)
</details>

> [!warning] Common wrong model
> "Assignment always copies." For heap types it moves instead.

## Recall

```meno-check
id: ownership-move-cloze
type: cloze
concept: ownership
prompt: |
  After `let s2 = s1;` where s1 is a String, s1 is {{moved}} and can no longer be used.
answer: moved
explain: |
  String is not Copy, so assignment transfers ownership.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A function in your codebase takes a `Vec<String>` by value but only counts its
> elements. What is the cost to callers, and what would you change?
