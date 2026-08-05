#!/bin/sh
# org-sync - pull upstream Meno improvements into an org's private deployment
# (docs/org-deployment.md) without ever touching the org's own content. The
# refusal below is the tool's entire reason to exist: content/ and org/ are
# reserved downstream-owned roots (docs/specs/repo-and-tenancy.md) that
# upstream never creates or writes, so a legitimate upstream change can never
# touch either path - if one somehow does, that is a signal to stop and look
# by hand, not something to merge blind.
#
# Usage: tools/org-sync.sh
#   Requires a remote named "upstream" (docs/org-deployment.md section (a)
#   sets this up: git remote add upstream <public-meno-url>).
#
# MENO_SYNC_SKIP_GATE=1 skips the `npm run gate` step after a successful
# merge - used only by tools/test/org-sync.test.ts, which merges into
# throwaway repos with no node_modules. Never set this outside a test.
set -eu

die() { echo "org-sync: $*" >&2; exit 1; }

git remote get-url upstream >/dev/null 2>&1 || die "no 'upstream' remote configured - git remote add upstream <public-meno-url>"

echo "fetching upstream..."
git fetch -q upstream

incoming=$(git log --oneline HEAD..upstream/main)
if [ -z "$incoming" ]; then
  echo "org-sync: already up to date with upstream/main"
  exit 0
fi
echo "incoming commits:"
echo "$incoming" | sed 's/^/  /'

touched=$(git diff --name-only HEAD...upstream/main | grep -E '^(content|org)/' || true)
if [ -n "$touched" ]; then
  die "refusing to merge - upstream/main touches your reserved paths (should never happen; investigate by hand):
$(echo "$touched" | sed 's/^/  /')"
fi

echo "merging upstream/main..."
git merge --no-edit -q upstream/main

if [ "${MENO_SYNC_SKIP_GATE:-}" = "1" ]; then
  echo "org-sync: MENO_SYNC_SKIP_GATE=1 set, skipping npm run gate (test-only escape hatch)"
  exit 0
fi

echo "running npm run gate..."
if npm run gate; then
  echo "org-sync: merged and gate green"
else
  echo "org-sync: merge landed but npm run gate failed - fix before your team pulls this branch" >&2
  exit 1
fi
