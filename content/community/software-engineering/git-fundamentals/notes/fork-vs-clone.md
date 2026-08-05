---
schema_version: 1
type: reference
title: Fork versus clone
concepts:
  - forks-and-clones
  - remotes-and-tracking
sources:
  - title: "GitHub Docs: Fork a repository"
    url: https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo
    archived_url: https://web.archive.org/web/20260805092810/https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo
    accessed: 2026-08-05
    source_type: web
    why: defines forking as proposing changes without affecting the upstream repository, and walks the fork-clone-upstream setup
  - title: "GitHub Docs: About forks"
    url: https://docs.github.com/en/pull-requests/reference/forks
    archived_url: https://web.archive.org/web/20260805092915/https://docs.github.com/en/pull-requests/reference/forks
    accessed: 2026-08-05
    source_type: web
    why: states that a fork is a separate repository with its own settings and collaboration space, unlike a branch
  - title: "Pro Git, ch. 2.5: Working with Remotes"
    url: https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes
    archived_url: https://web.archive.org/web/20260805092458/https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes
    accessed: 2026-08-05
    source_type: web
    why: shows that cloning configures a remote named origin pointing at the repository the clone came from
---

# Fork versus clone

Two words that both mean "copy a repository", on different machines and for
different reasons. Lessons on remotes and on the fork workflow both need this
distinction, so it lives here once.

## What a clone is

A clone is a local copy of a repository, made with `git clone`. It brings the
full history to your machine and configures a remote named `origin` pointing
back at the repository you cloned from, so `git remote` on a fresh clone lists
`origin` ([Pro Git, ch. 2.5](https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes)).
A clone is where you actually edit, commit, and run code; the copy lives on
your disk, not on the hosting service.

## What a fork is

A fork is a server-side copy of someone else's repository, created under your
own account on the hosting service. GitHub's docs frame its purpose as
proposing changes "without affecting the upstream repository": you get your
own copy of the codebase to push to, even when you have no write access to the
original ([Fork a repository](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)).
A fork is also not a branch: "A branch is part of one repository. A fork is a
separate repository with its own settings and collaboration space"
([About forks](https://docs.github.com/en/pull-requests/reference/forks)).

Forking alone puts nothing on your machine. After forking, "you do not have
the files from that repository on your computer" until you clone the fork -
which is why the two operations show up together in practice.

## How they combine in the fork workflow

The standard wiring for contributing to a repository you cannot push to:

1. Fork the repository on the host, giving you a server-side copy you own.
2. Clone your fork locally; its `origin` remote points at your fork.
3. Add the original repository as a second remote, conventionally named
   `upstream` (`git remote add upstream <url>`), so you can fetch the
   project's ongoing changes and keep your fork in sync
   ([Fork a repository](https://docs.github.com/en/pull-requests/how-tos/work-with-forks/fork-a-repo)).

The result is one local clone with two remotes: `origin` (your fork, where
you push) and `upstream` (the original, where you pull new work from).
