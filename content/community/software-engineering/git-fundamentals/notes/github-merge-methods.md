---
schema_version: 1
type: reference
title: The three pull request merge methods
concepts:
  - merge-strategies
  - pull-request-lifecycle
sources:
  - title: "GitHub Docs: Pull request merges"
    url: https://docs.github.com/en/pull-requests/reference/pull-request-merges
    archived_url: https://web.archive.org/web/20260805093326/https://docs.github.com/en/pull-requests/reference/pull-request-merges
    accessed: 2026-08-05
    source_type: web
    why: the official contrast of merge commit, squash, and rebase merges, including the squash-then-keep-working and rebase-rewrites-SHAs caveats
---

# The three pull request merge methods

When a pull request merges, the host offers three ways to land the head
branch's commits on the base branch. They produce different histories from
the same approved change, so the choice is a repository-level policy
decision, not a per-merge whim. All claims here follow
[Pull request merges](https://docs.github.com/en/pull-requests/reference/pull-request-merges).

## Merge commit

The default. It preserves every commit from the pull request branch and adds
an explicit merge commit marking the integration point. History keeps full
detail, at the cost of a branchy, non-linear graph.

## Squash and merge

Combines all commits in the pull request into a single commit on the base
branch. The default branch's history stays concise - one commit per merged
pull request - but the intermediate commits are not preserved as separate
commits.

The named caveat: if work continues on the same head branch after a squash
merge, later pull requests from that branch can include commits that were
already squashed into the base branch, which "can make merge conflicts more
likely". For long-running branches, the page suggests a merge commit or
rebasing the branch before opening the next pull request.

## Rebase and merge

Adds each commit from the pull request onto the base branch individually,
with no merge commit, producing a linear history that keeps per-commit
granularity. One behavioral difference from command-line git: GitHub's rebase
and merge "always updates the committer information and creates new commit
SHAs, whereas `git rebase` does not change the committer information when the
rebase happens on top of an ancestor commit".

## Choosing between them

- Full historical detail including integration points: merge commit.
- One clean commit per reviewed change on the default branch: squash.
- Linear history that still keeps individual commits: rebase.

A repository can also restrict which methods its merge button offers, turning
the choice into enforced policy rather than reviewer discipline.
