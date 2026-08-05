# Ownership

Ownership is one of Rust's most unique features. It enables Rust to make memory safety
guarantees without needing a garbage collector.

Here are the ownership rules:

- Each value in Rust has an owner.
- There can only be one owner at a time.
- When the owner goes out of scope, the value will be dropped.

Ownership is very important in Rust and you will use it everywhere. The borrow checker
checks ownership at compile time. Many beginners find ownership confusing at first, but
it becomes second nature with practice.

Some types are Copy and some are not. String is not Copy. Integers are Copy. This
matters for assignment and function calls.

Lifetimes are related to ownership and will be covered later. Traits are also important
in Rust. The Vec type is a growable array that owns its contents.

In summary, ownership is how Rust manages memory. It is checked at compile time. There
is no garbage collector. This makes Rust fast and safe.

## Quiz

What are the three ownership rules? (See above.)
