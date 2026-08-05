---
schema_version: 1
type: reference
title: Why one owner per format, and why specs live
concepts:
  - one-owner-law
  - gate-and-spec-discipline
sources:
  - title: "AGENTS.md (canonical agent entry point)"
    url: https://github.com/avishek2002/meno/blob/main/AGENTS.md
    archived_url: https://web.archive.org/web/20260805092506/https://github.com/avishek2002/meno/blob/main/AGENTS.md
    accessed: 2026-08-05
    source_type: web
    why: states the one-owner rule and lists which skill owns which canonical format
  - title: "docs/specs/README.md (spec template and amendment discipline)"
    url: https://github.com/avishek2002/meno/blob/main/docs/specs/README.md
    archived_url: https://web.archive.org/web/20260805092913/https://github.com/avishek2002/meno/blob/main/docs/specs/README.md
    accessed: 2026-08-05
    source_type: web
    why: defines specs as the living technical truth, amended in place, and states the link-don't-restate rule this note explains the reasoning behind
  - title: "CONTRIBUTING.md (standing rules)"
    url: https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md
    archived_url: https://web.archive.org/web/20260805092530/https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md
    accessed: 2026-08-05
    source_type: web
    why: makes both disciplines binding on contributions - one canonical owner per format, and behavior changes amending the owning spec in the same pull request
---

# Why one owner per format, and why specs live

Two files that describe the same thing must change in lockstep to stay correct, and
they never do - one gets updated, the other becomes a plausible-looking lie. In a
repository read by agents that trust what they read, a stale duplicate is worse than a
missing document: it actively misleads the next session. Meno's answer is structural,
not procedural: every canonical format has exactly one owning file, everything else
links to it, and the moment you find yourself restating an owner's content you are
creating the future stale copy.

The owner list itself lives in
[AGENTS.md](https://github.com/avishek2002/meno/blob/main/AGENTS.md); the fullest
statement of the link-don't-restate rule is in
[docs/specs/README.md](https://github.com/avishek2002/meno/blob/main/docs/specs/README.md).
This note deliberately does not repeat which skill owns which format - that would be
the exact failure it describes.

Specs follow from the same logic applied over time. A spec that describes last month's
behavior is a duplicate of history, not a description of the system, so Meno's specs
are living documents: amended in place whenever behavior changes, in the same pull
request as the change.
[CONTRIBUTING.md](https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md) makes
that binding - a change is not done while its spec lies. The gate makes the mechanical
half of correctness cheap to check (one command runs typecheck, tests, and validation),
and the spec-amendment rule covers the half no tool can check: whether the prose still
tells the truth.

Two exercises worth doing before your first real change. First, pick any behavior you
can observe in the repository (a validate finding, an app endpoint, a ledger event) and
find the one spec under docs/specs/ that owns it - then imagine your change touching
that behavior and note which sections would need amending. Second, run the gate command
CONTRIBUTING.md gives you on a clean checkout and read the output: knowing what green
looks like before you break anything is what makes a later red run legible.
