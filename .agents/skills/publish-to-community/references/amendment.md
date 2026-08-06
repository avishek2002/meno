# Amendment mechanics (canonical)

Amend-over-fork is the rule that keeps the community tier from degrading into near-duplicate
packs nobody maintains. This file is the mechanical how; the decision of *when* to amend versus
publish a new pack is step 1 of [../SKILL.md](../SKILL.md).

## What an amendment is

An ordinary pull request against the existing pack's own files - `course.yml`, the affected
`module.yml`, the hub, `notes/` - plus exactly one new line appended to that pack's `PACK.md`
Amendment log. No new directory, no new slug, no second `PACK.md`. The pack's `maintainers`
field (advisory, not veto -
[content/community/README.md](../../../../content/community/README.md)) gets a mention in the pull request
but does not gate merge.

## The amendment-log line

Appended, never inserted into or edited out of the existing history:

```markdown
## Amendment log

- 2026-08-05 - pack created (2 modules, 7 archived anchors).
- 2026-09-12 - added module 3 (async error handling), 4 new anchors; contributed from a
  tenant course originally adopted 2026-08-20.
```

One line, dated, saying what changed and, when the amendment originated from a `derived_from`
adoption, that adoption prompted it - never the tenant's name or any tenant detail, just the
fact that adopt-then-publish-back is how this amendment came to exist.

## The contribution record

Every amendment appends one `CONTRIBUTORS.yml` record beside its `PACK.md` line. The two are not
redundant: the amendment log is the narrative - what changed and why, in a sentence anyone can
read - and `CONTRIBUTORS.yml` is the machine-checkable who, which unit, and when. Keep each in
its own lane and neither drifts.

Granularity, in one rule: **name the smallest unit that contains the whole change.**

- The change lives inside one module directory (its lessons, objectives, sources) - `unit:
  modules/<slug>`.
- It touches `course.yml`, the hub, `PACK.md`, or more than one module - `unit: pack`.
- Go finer than a module - a single objective, a planned lesson, one anchor source - only when
  the contribution is one person's isolated addition inside a module somebody else substantially
  wrote. Attribution inherits from the nearest ancestor, so a finer record earns its place only
  by saying something the module-level record does not. Manufacturing per-objective records as a
  habit is the bloat this design exists to avoid.
- Removing a unit does not remove its history: append `action: removed` for it rather than
  deleting the record that created it. Records are appended, never rewritten or reordered - the
  same rule the amendment log follows, and for the same reason.

```yaml
  - unit: modules/03-async-error-handling
    by: "@handle"
    date: 2026-09-12
    action: created
    note: the async module, contributed back after adopting this pack
```

## Finding the pack to amend

Two paths lead here:

- **Step 1's search** in the main skill found existing coverage directly.
- **A `derived_from` provenance trail.** If the tenant course being published has a
  `derived_from` block in its `course.yml` (recorded at adoption time -
  [content/community/README.md](../../../../content/community/README.md)'s adoption section,
  [extend-meno's adopt-a-pack recipe](../../extend-meno/references/recipes.md)), that names the
  exact pack (`domain/slug`) and the `pack_version` it was adopted from. Amend that pack - this
  is the whole point of recording provenance: publish-back always knows where to send changes
  instead of guessing from a fresh search.

## Provenance on the tenant side

`derived_from` (`schemas/course.schema.json`) carries three fields, required together:

- `pack` - `content/community/<domain>/<slug>` (or `content/org/<domain>/<slug>`), the exact path.
- `pack_version` - whatever the pack's `PACK.md` states as a version, if it states one
  (`additionalProperties: true` allows a maintainer-added `version` field); otherwise the git
  commit sha of the pack directory at adoption time
  (`git log -1 --format=%H -- content/community/<domain>/<slug>`).
- `adopted_at` - the date adoption happened.

This block is written once, at adoption, by `extend-meno`'s adopt-a-pack recipe - not by this
skill. This skill only reads it, to decide where an amendment goes.

## After the amendment

Same quality gate as a new pack ([../SKILL.md](../SKILL.md) step 7): `npm run validate`, a full
`audit-citations` run, `node tools/packs.ts` to refresh `INDEX.md`, template attestations - an
amendment is smaller in scope, never smaller in rigor.
