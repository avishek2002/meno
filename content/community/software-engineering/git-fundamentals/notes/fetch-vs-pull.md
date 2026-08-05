---
schema_version: 1
type: reference
title: Fetch versus pull, and remote-tracking branches
concepts:
  - push-pull-fetch
  - remotes-and-tracking
sources:
  - title: "Pro Git, ch. 2.5: Working with Remotes"
    url: https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes
    archived_url: https://web.archive.org/web/20260805092458/https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes
    accessed: 2026-08-05
    source_type: web
    why: draws the fetch-downloads-without-merging versus pull-fetches-and-merges distinction this note states
  - title: "Pro Git, ch. 3.5: Remote Branches"
    url: https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches
    archived_url: https://web.archive.org/web/20260805092628/https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches
    accessed: 2026-08-05
    source_type: web
    why: defines remote-tracking branches as unmovable local references and tracking branches as what makes plain git pull unambiguous
---

# Fetch versus pull, and remote-tracking branches

`git fetch` and `git pull` are the two ways commits arrive from a remote, and
the difference between them is a recurring source of confusion. The mechanism
underneath both is the remote-tracking branch.

## Remote-tracking branches

A remote-tracking branch (`origin/main`, `origin/feature-x`) is a local
reference recording where a branch on the remote pointed the last time you
talked to it. Pro Git describes these as "local references that you can't
move" - git moves them for you whenever you do any network communication,
so they act as bookmarks, not branches you work on
([Pro Git, ch. 3.5](https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches)).

## What fetch does

`git fetch <remote>` downloads any data you do not yet have and advances the
remote-tracking pointers - for example, moving `origin/main` to the remote's
current position. It changes nothing about your own branches or working
files; your local `main` stays where it was until you merge or rebase
yourself ([Pro Git, ch. 2.5](https://git-scm.com/book/en/v2/Git-Basics-Working-with-Remotes)).
Fetch is therefore always safe to run: it only adds objects and moves
bookmarks.

## What pull does

`git pull` is "essentially a `git fetch` immediately followed by a
`git merge`" ([Pro Git, ch. 3.5](https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches)):
it fetches, then merges the corresponding remote-tracking branch into your
current branch. The convenience costs you the pause between seeing what
arrived and integrating it - which is exactly the pause fetch preserves.

## Tracking branches make pull unambiguous

For plain `git pull` (no arguments) to know what to merge, the current branch
needs an upstream, also called a tracking branch. Checking out a local branch
from a remote-tracking branch creates one automatically (for example
`git checkout --track origin/feature-x`), and `git branch -u origin/feature-x`
sets one on an existing branch
([Pro Git, ch. 3.5](https://git-scm.com/book/en/v2/Git-Branching-Remote-Branches)).
Pushing is the same relationship in reverse: `git push origin feature-x`
publishes the local branch onto the remote.
