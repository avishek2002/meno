---
schema_version: 1
type: reference
title: Why AGENTS.md is the front door
concepts:
  - entry-point-discipline
sources:
  - title: "AGENTS.md (canonical agent entry point)"
    url: https://github.com/avishek2002/meno/blob/main/AGENTS.md
    archived_url: https://web.archive.org/web/20260805092506/https://github.com/avishek2002/meno/blob/main/AGENTS.md
    accessed: 2026-08-05
    source_type: web
    why: the file this note is about - it names itself the canonical entry point and says everything else is reachable from it
  - title: "docs/architecture.md (system architecture)"
    url: https://github.com/avishek2002/meno/blob/main/docs/architecture.md
    archived_url: https://web.archive.org/web/20260805092615/https://github.com/avishek2002/meno/blob/main/docs/architecture.md
    accessed: 2026-08-05
    source_type: web
    why: the level below the entry point - the component map a contributor lands on after the front door, showing why one canonical map matters
---

# Why AGENTS.md is the front door

Meno is built to be worked on by coding agents as much as by people, and an agent
arrives with no memory of the repository. If orientation lived in three half-overlapping
files, every session would start from a slightly different map, and the maps would
drift apart - entry-point drift is a ranked risk in the project's plan, not a
hypothetical.

So the repository commits to one rule: there is exactly one front door,
[AGENTS.md](https://github.com/avishek2002/meno/blob/main/AGENTS.md), and everything
else is reachable from it. Even the file most agent tooling reads by default exists
only as a one-line pointer to it, so the two can never disagree. The front door holds
the map (what the repo is, where each document lives, which skill owns which job) and
the standing rules for anyone changing it; the map's next level down is
[docs/architecture.md](https://github.com/avishek2002/meno/blob/main/docs/architecture.md).
This note tells you why the door exists; the door itself tells you what is behind it,
and this note will not duplicate that.

The discipline this buys is that "where do I read about X?" always has one answer with
one hop count, and "where do I document X?" has the same one. A contributor who adds
guidance anywhere else is quietly building a second front door, which is how drift
starts.

A good first exercise: pick three conventions you have seen mentioned anywhere in the
repository (a writing rule, a link-syntax rule, a content-placement rule), start at
AGENTS.md, and write down the hop path from it to the file that owns each one. If any
convention takes more than two hops or has no owner you can point at, you have either
misread the map or found a real gap worth raising.
