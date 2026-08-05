# Specs

Each file here describes one subsystem as it is: how it functions and what it looks like
architecturally. Specs are the living technical truth - amended in place whenever behavior
changes, never archived. They complete a three-document chain:

- [RESEARCH.md](../RESEARCH.md) is **why** - the evidence base, effectively frozen.
- [PLAN.md](../../PLAN.md) is **when and whether done** - phases, locked decisions,
  acceptance criteria.
- These specs are **what and how** - the present-tense system. The only documents that
  change when behavior changes.

Specs land with the phase that builds their subsystem, never speculatively ahead of it - a
spec for unbuilt behavior has no code to keep it honest. The
[phase-to-spec table](../architecture.md#phase-to-spec-table) says what exists yet.

## The template

Every spec uses these sections, in this order:

```markdown
# <Subsystem> spec

*Status: current as of Phase N. Canonical formats owned elsewhere: [links].*

## Purpose            one paragraph: what it exists to do, what breaks without it
## How it behaves     numbered observable behavior, in encounter order, including empty,
                      degraded, and failure paths - no implementation detail
## Architecture       components and responsibilities, real names (files, endpoints,
                      functions); a mermaid diagram once there is more than one arrow
## Data touched       table: path or endpoint | read/write/append | owner | format link
## Invariants         numbered, testable statements; each one is a candidate test
## Verified by        which acceptance criterion, test, or validate check proves each
                      invariant - "not yet verified" is a legitimate, honest entry
## Open questions     numbered, each tagged with the phase that resolves it
```

The **Data touched** table is the load-bearing section: write authority is Meno's central
design seam, and this is where each spec declares its side of it.

## The link-don't-restate rule

If two files would need to change in lockstep to stay correct, one of them must be a link.
Concretely:

- Specs never restate a canonical format owned by a skill (check-block YAML, lesson
  frontmatter, manifest fields, todo syntax, vault conventions). They link to the owning
  reference file, and may name a field they branch on ("the app dispatches on the check's
  `type`") but never enumerate its allowed values.
- Specs never restate acceptance criteria (PLAN.md owns them) or research evidence
  (RESEARCH.md owns it).
- Specs exclusively own: the HTTP API surface, ledger event semantics, component boundaries,
  and cross-component invariants. Nothing else owns those, so there is no overlap.
