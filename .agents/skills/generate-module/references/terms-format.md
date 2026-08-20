# terms.yml format (canonical)

The prose definition of `terms.yml`, the per-module glossary sidecar this skill writes
alongside a module's lesson bodies. The field-level half is
`schemas/terms.schema.json`; the machine-checkable rules (lesson resolution, coverage,
sentence and word counts, duplicate detection, `see_also` resolution) live in
`lib/terms.ts` and are enforced by `tools/validate.ts`. This file states the same rules
in prose, plus the judgment call a schema cannot make: what makes a definition good.

## Where it lives, and what it is for

One `terms.yml` per module directory, beside that module's `module.yml`. The app walks
every module in a course, reads each `terms.yml`, and merges them into one glossary tab
per course - so a term this module introduces stays visible to a learner reading a later
module, backlinked to the lesson that taught it.

**Terms are inert.** A manifest's `concepts:` list is mastery-bearing: `lib/mastery.ts`
gives every concept a review state and a share of a gate. A term is not - it never
becomes a review item, never moves a gate, never enters a due computation, and nothing
that reads `terms.yml` touches the ledger. If a change to this file ever needs
`readLedgerEvents`, `deriveMastery`, or a `next_review`, it has gone outside the format;
stop and reconsider. The glossary is a reference surface over lesson bodies that already
exist, not a second channel for tracking what a learner knows.

`terms.yml` also carries no `sources` block. A definition restates content the lesson's
own citations already support; it is not a new claim, so `audit-citations` skips this
file entirely (see that skill's carve-out).

## Schema

```yaml
schema_version: 1
terms:
  - term: <string, as the lesson spells it>
    lesson: <a lessons[].file value from this module's own module.yml, .md suffix included>
    definition: <exactly two sentences, ~45 words>
    see_also: [<other term>, ...]     # optional
no_terms:
  - <a lessons[].file value that introduces no new vocabulary>   # optional
```

- **`term`** - the spelling this lesson's body actually uses. Display only; the merge
  identity is `termKey(term)` in `lib/terms.ts`, not this string, so two entries spelled
  slightly differently (case, whitespace) can still collide - see "Spelling and merge
  identity" below before choosing how to capitalize one.
- **`lesson`** - must be a `lessons[].file` entry in *this module's own* `module.yml`,
  suffix included (`03-ownership.md`, not `03-ownership`). Naming a lesson from a
  different module, or one this module doesn't list, is a validate error.
- **`definition`** - exactly two sentences, roughly 45 words. See "The two-sentence
  rule" below - this is the part a schema cannot check for quality, only shape.
- **`see_also`** (optional) - other terms anywhere in the same course worth reading
  beside this one. Spell each one exactly as its own owning entry spells it: a
  single-token term's capitalization is load-bearing (see below), so `Copy` and `copy`
  are different keys in a `see_also` list too.
- **`no_terms`** (optional, module-level) - lessons in this module that deliberately
  introduce no new vocabulary. See "The no_terms mechanism" below.

## Spelling and merge identity

Capitalization means two different things depending on whether a term is one token or a
phrase, and `termKey()` treats them differently on purpose:

- **A single token keeps its case.** `Copy` (Rust's trait) and `copy` (the verb) are
  different terms - collapsing them would silently merge two unrelated glossary rows.
  Any identifier-shaped spelling (a type name, a code symbol, anything with no space or
  hyphen) is treated this way.
- **A multi-word phrase folds to lowercase.** `Context Window` and `context window` are
  the same term - the capital letters there are only sentence or title case, not part of
  the spelling. A hyphenated term (`fine-tuning`) counts as a phrase for this rule, since
  an identifier cannot contain a hyphen.

Write the `term` field the way you would want it to read as a glossary heading. Write
`see_also` entries to match whichever entry actually owns that term - if in doubt, match
the capitalization the introducing lesson itself uses.

## The two-sentence rule

A definition is exactly two sentences, roughly 45 words (the cap is a soft warning, not
a hard error - two sentences that earn their length beat two that were truncated). Write
it assuming the reader has just finished the lesson that introduces the term, so it may
lean on vocabulary this course already defined - a definition is not a cold-open
dictionary entry.

**Sentence one - what it is.** State the mechanism in plain language: what the thing
actually does or is, not a synonym for its name.

**Sentence two - why it matters.** State what breaks or changes without it - the
consequence that makes the term worth having a name for at all.

### Two good examples

```yaml
- term: borrow
  lesson: 01-borrowing.md
  definition: >-
    A borrow is a reference that lets code read or write a value without taking
    ownership of it. Without borrowing, passing a value to a function would move it
    and the caller could never use it again.
```

```yaml
- term: lifetime
  lesson: 02-lifetimes.md
  definition: >-
    A lifetime is the span of the program for which a reference stays valid, named so
    the compiler can compare two of them. Without it the compiler cannot tell whether a
    returned reference outlives the value it points at.
```

Both name the mechanism first, then the concrete consequence of not having it - not a
restatement of the definition in other words.

### One bad example: too simple

```yaml
- term: borrow
  definition: >-
    A borrow is when you use `&` to reference something. It's used a lot in Rust.
```

This fails on both halves. "When you use `&`" describes the syntax, not the mechanism -
it says nothing about what a borrow actually lets you do that you couldn't do otherwise.
"It's used a lot in Rust" isn't a consequence at all; it's frequency, not stakes. A
learner who reads this cannot answer "what would go wrong without borrowing," which is
the entire point of sentence two.

### One bad example: too long

```yaml
- term: lifetime
  definition: >-
    A lifetime in Rust is a way of describing, to the compiler, how long a particular
    reference to some piece of data is guaranteed to remain valid for use, which
    matters because references that outlive the data they point to would otherwise
    let a program read memory that has already been freed and reused for something
    else entirely, a class of bug that in a language like C or C++ can cause crashes,
    corrupted data, or security vulnerabilities, and lifetimes let Rust catch all of
    that at compile time instead of at runtime.
```

One sentence trying to do a whole lesson's job - it drifts from what a lifetime is, into
a full case for why memory safety matters, into a value judgment about other languages.
None of it is wrong, but none of it is a definition either: a learner rereading this from
the glossary tab, out of context, has to parse a paragraph to find the two facts that
actually define the term. Say the mechanism, say the consequence, stop.

## The no_terms mechanism

Coverage is required only for lessons whose body already exists on disk - a manifest row
with no lesson file yet is a plan, not something to define terms for. A lesson that
genuinely teaches no new vocabulary (a pure recap, a pacing checkpoint) is declared in
`no_terms:` instead of being forced into a filler entry that exists only to satisfy the
gate:

```yaml
no_terms:
  - 03-recap.md
```

Naming a lesson in `no_terms` that this module doesn't list, or that also has a `terms`
entry, is a validate error - it is a contradiction, not a preference. Reach for
`no_terms` only when it is genuinely true; a lesson that quietly introduces a new term
without an entry for it is exactly the gap `no_terms` exists to make visible instead of
silent.

## Worked example

A two-lesson module, `02-borrowing-in-practice`, with `module.yml` listing
`01-borrowing.md` and `02-lifetimes.md`:

```yaml
schema_version: 1
terms:
  - term: borrowing
    lesson: 01-borrowing.md
    definition: >-
      Borrowing is creating a reference to a value with `&`, letting a function read or
      write it temporarily without taking ownership or paying for `.clone()`. Without
      it, a function that only needed a look would have to move the value away or
      duplicate it.
    see_also: [ownership, mutable reference]
  - term: mutable reference
    lesson: 01-borrowing.md
    definition: >-
      A mutable reference, written `&mut`, is a borrow that grants write access to a
      value, and Rust allows only one live mutable reference at a time. Without that
      exclusivity two writers could interleave on the same memory, and races could not
      be ruled out.
    see_also: [borrowing]
  - term: lifetime
    lesson: 02-lifetimes.md
    definition: >-
      A lifetime is the span of a program for which a reference stays valid, and `'a`
      names which input a returned reference relies on when the compiler cannot infer
      it alone. Without it, the compiler could not verify a reference outlives what it
      points at.
    see_also: [borrowing]
```

`ownership`, in `see_also` above, is not defined in this module - it was introduced in an
earlier module and reused here without a new entry, since this lesson relies on it rather
than re-teaching it. That reference still resolves once the whole course is merged into
one glossary; a `see_also` naming a term no module has defined yet renders as plain text,
not a broken link (`tools/validate.ts` reports it as a forward-reference warning, not an
error).

## When to add an entry vs. lean on an existing one

If a lesson genuinely teaches a term for the first time, give it an entry here, in this
module, with `lesson` pointing at the lesson that teaches it. If a lesson merely
*mentions* a term a prior module already defined in passing, adding a `see_also` on a
term this module does introduce is enough - do not add a second entry just to link back.

Add a second entry for an already-defined term only when this lesson meaningfully
re-explains or leans on it - the way `01-borrowing.md` above reasons about ownership
while teaching borrowing. That second entry is how `lib/terms.ts` produces a `reused_by`
backlink on the glossary row: the merge keeps the *first* module's definition as
canonical (a diverging second definition only produces a warning, never a new winner),
but the reused lesson still earns its own backlink, so give the reused entry the same
definition text as the original rather than rephrasing it - there is nothing for a
second wording to add, and identical text is what keeps the merge free of a divergence
warning.
