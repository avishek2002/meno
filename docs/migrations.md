# Schema migrations

One line per breaking or behavior-relevant schema change: date, what changed, what it means for previously generated tenant content. Consumers stay permissive with old `schema_version` values (they flag, never choke); regeneration decisions belong to the user.

| Date | Change | Effect on existing content |
|------|--------|---------------------------|
| - | (none yet; all formats are at schema_version 1) | - |

## 2026-08-05 - content tier consolidation (layout, not schema)

All learning material moved under one root, `content/` (decision 18 in PLAN.md). No
schema fields changed; every format keeps `schema_version` 1. Path changes:

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

## 2026-08-05 - topic packs gain domains

`topic-packs/<slug>/` became `topic-packs/<domain>/<slug>/` with domains drawn from the
closed vocabulary in `topic-packs/DOMAINS.md`. One pack existed (`git-fundamentals`, moved
under `software-engineering/`); no schema fields changed. Packs also gained a required
`PACK.md` (provenance and amendment log) and optional `notes/` reference notes - both new
files, no breaking change to existing manifests.
