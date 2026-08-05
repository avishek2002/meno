---
schema_version: 1
type: reference
title: Why the gate runs twice
concepts:
  - branch-and-pull-request-flow
  - continuous-integration-gate
  - review-contract
sources:
  - title: "CONTRIBUTING.md (the whole contribution bar)"
    url: https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md
    archived_url: https://web.archive.org/web/20260805092530/https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md
    accessed: 2026-08-05
    source_type: web
    why: owns the gate commands, the local-run expectation, and the review-as-execution framing this note gives the reasoning for
  - title: ".github/workflows/gate.yml (the continuous-integration workflow)"
    url: https://github.com/avishek2002/meno/blob/main/.github/workflows/gate.yml
    archived_url: https://web.archive.org/web/20260805093104/https://github.com/avishek2002/meno/blob/main/.github/workflows/gate.yml
    accessed: 2026-08-05
    source_type: web
    why: shows the continuous-integration run is the same commands as the local one, which is the whole point being explained
  - title: ".github/pull_request_template.md (the review contract)"
    url: https://github.com/avishek2002/meno/blob/main/.github/pull_request_template.md
    archived_url: https://web.archive.org/web/20260805102040/https://github.com/avishek2002/meno/blob/main/.github/pull_request_template.md
    accessed: 2026-08-05
    source_type: web
    why: the checklist that turns the honesty half of a contribution - eval runs, spec amendments, attestations - into an explicit contract
---

# Why the gate runs twice

Meno's quality gate runs in two places on purpose: on your machine before you push, and
in continuous integration (CI, the hosted runner that checks every pull request) after.
Both runs execute the same commands -
[.github/workflows/gate.yml](https://github.com/avishek2002/meno/blob/main/.github/workflows/gate.yml)
is short enough to read in a minute and contains no magic - so a green run locally
means a green run remotely. The duplication is not distrust of you; it is what makes
the two roles honest. Your local run is for fast iteration while you work. The CI run
is the one reviewers believe, because a maintainer never checks out a stranger's branch
and executes it on their laptop to find out whether it is green - in a repository where
tools and skills are code that runs, reviewing by local execution would mean running
untrusted code.

That is also why the pull request itself carries a contract. Some required steps cannot
run in CI at all (the eval gate shells out to a local model CLI), so
[the pull request template](https://github.com/avishek2002/meno/blob/main/.github/pull_request_template.md)
asks you to report them, honestly, as checklist attestations. What lands where, which
commands make up the gate, and which changes trigger the extra eval and smoke-test
requirements are all owned by
[CONTRIBUTING.md](https://github.com/avishek2002/meno/blob/main/CONTRIBUTING.md) - read
it there rather than trusting any summary, including this one.

The exercise this note exists to set up: find a small documentation defect (a dead
link, a typo, a sentence the code has outgrown), fix it on a branch, run the gate
locally, and open a documentation-fix pull request with the template filled in
truthfully. It is deliberately low-stakes - the point is to walk the whole path once,
so the mechanics are boring by the time a change of substance is in your hands. If CI
disagrees with your local run, do not shrug: the two run the same commands, so a
difference is information (usually an uncommitted file or a version skew) worth chasing
down.
