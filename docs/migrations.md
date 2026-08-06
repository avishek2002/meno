# Schema migrations

One line per breaking or behavior-relevant schema change: date, what changed, what it means for previously generated tenant content. Consumers stay permissive with old `schema_version` values (they flag, never choke); regeneration decisions belong to the user.

| Date | Change | Effect on existing content |
|------|--------|---------------------------|
| - | (none yet; all formats are at schema_version 1) | - |

## 2026-08-05 - content tier consolidation (layout, plus one narrowed pattern)

All learning material moved under one root, `content/` (decision 18 in PLAN.md). No schema
field was added, removed, or changed meaning, and every format keeps `schema_version` 1 -
but one constraint did narrow, so "layout only" is not quite the whole truth. Path changes:

| Was | Now |
|-----|-----|
| `topic-packs/<domain>/<slug>/` | `content/community/<domain>/<slug>/` |
| `org/packs/<domain>/<slug>/` | `content/org/<domain>/<slug>/` |
| `content/<tenant>/` | `content/tenants/<tenant>/` |

For an existing instance: move each tenant vault with
`mv content/<tenant> content/tenants/<tenant>` (it is untracked, so plain `mv`), rerun
`tools/meno-init` to refresh the leakage-guard hook to its default-deny form, and update
any private-mirror scripts that hardcode `content/<tenant>`. Org clones: move
`org/packs/*` under `content/org/` before the next upstream merge; `tools/org-sync.sh`
now guards `content/tenants/` and `content/org/` instead of `content/` and `org/`.

**If you adopted a pack before this change**, one more edit: `course.schema.json`'s
`derived_from.pack` pattern moved with the layout and now accepts only
`content/community/<domain>/<slug>` or `content/org/<domain>/<slug>`. A `course.yml`
carrying the old `topic-packs/<domain>/<slug>` or `org/packs/<domain>/<slug>` form fails
`npm run validate` until you rewrite that one line. Nothing else in the block changes.

No `schema_version` bump for it, deliberately: `derived_from` is optional, it shipped the
same day (v1.2), and the fix is a one-line edit with a validate error that names the field.
Bumping would make every existing `course.yml` stale and oblige validate to keep blessing a
path form that no longer exists anywhere in the layout - a worse trade than a migration
note. The pattern is pinned by a test in `tools/test/courses.test.ts`, because no fixture
under `examples/` carries a `derived_from` block and the constraint was otherwise
unexercised.

## 2026-08-05 - topic packs gain domains

`topic-packs/<slug>/` became `topic-packs/<domain>/<slug>/` with domains drawn from the
closed vocabulary in `topic-packs/DOMAINS.md`. One pack existed (`git-fundamentals`, moved
under `software-engineering/`); no schema fields changed. Packs also gained a required
`PACK.md` (provenance and amendment log) and optional `notes/` reference notes - both new
files, no breaking change to existing manifests.

## 2026-08-06 - tenant courses gain domains (the grouping is now one grouping)

`content/tenants/<tenant>/<course-slug>/` became
`content/tenants/<tenant>/<domain>/<course-slug>/`, with `<domain>` from the same closed
vocabulary the community tier already used. The two tiers had drifted apart: packs were
grouped by domain, tenant courses were a flat list, and adopting a pack silently discarded
the domain on the way in. Now the shape is identical on both sides, adoption is a straight
mirror copy, and `content/community/DOMAINS.md` governs all three tiers rather than one.
No schema field was added, removed, or changed meaning; every format keeps
`schema_version` 1.

| Was | Now |
|---|---|
| `content/tenants/<t>/<course-slug>/course.yml` | `content/tenants/<t>/<domain>/<course-slug>/course.yml` |
| `content/tenants/<t>/<course-slug>/profile.md` | `content/tenants/<t>/<domain>/<course-slug>/profile.md` |
| `content/tenants/<t>/<course-slug>/modules/NN-slug/` | `content/tenants/<t>/<domain>/<course-slug>/modules/NN-slug/` |
| `[[<course-slug>/<course-slug>-hub]]` in `home.md` | `[[<domain>/<course-slug>/<course-slug>-hub]]` |

**To migrate an instance.** Tenant content is untracked, so a plain `mv` per course is the
whole operation - pick the domain from `content/community/DOMAINS.md`:

```sh
mkdir -p content/tenants/<t>/<domain>
mv content/tenants/<t>/<course-slug> content/tenants/<t>/<domain>/<course-slug>
```

Then fix the path-style wikilinks in `home.md` (and any note that links a course hub by
path) to carry the new `<domain>/` prefix; bare-basename wikilinks like
`[[rust-for-backend-hub]]` keep resolving untouched. `npm run validate
content/tenants/<t>` names every course still sitting at the old depth.

**What holds while you migrate.** The app reads a course at either depth, so an unmigrated
vault renders normally rather than showing an empty course list - validate is what insists
on the move. Two things do *not* self-heal: path-style wikilinks written before the move
resolve to nothing until reprefixed, and any course whose domain is outside the closed
vocabulary is a `course-layout` error rather than a new domain (add domains by pull
request against `DOMAINS.md`, per that file).

**Why `elicit-needs` changed too.** Nothing computed a course's domain before - it was
derived at publish time, long after the directory existed. A course now needs its domain
at creation, so the interview classifies it against the closed vocabulary up front.
## 2026-08-06 - course groups and pack attribution

Two new files, two new schemas, no change to any existing schema and therefore no
`schema_version` bump anywhere:

- `content/tenants/<tenant>/groups.yml` (`schemas/groups.schema.json`, version 1) - a tenant's
  course groups. Absent means every course is Ungrouped, which is exactly what every existing
  vault gets on upgrade: nothing to migrate, nothing breaks, and the app creates the file on the
  first group a learner makes.
- `content/community/<domain>/<slug>/CONTRIBUTORS.yml` (`schemas/contributors.schema.json`,
  version 1) - per-pack attribution. Unlike the tenant file this one is **required**, and
  `pack-attribution` errors without it, so the five packs that existed at the time were
  backfilled in the same change (`@avishek2002`, `action: created`, dated from each pack's
  `PACK.md` `created` field). Any pack authored before this change and merged after it needs the
  same one-record backfill.
