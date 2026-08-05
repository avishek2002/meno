# Schema migrations

One line per breaking or behavior-relevant schema change: date, what changed, what it means for previously generated tenant content. Consumers stay permissive with old `schema_version` values (they flag, never choke); regeneration decisions belong to the user.

| Date | Change | Effect on existing content |
|------|--------|---------------------------|
| - | (none yet; all formats are at schema_version 1) | - |

## 2026-08-05 - topic packs gain domains

`topic-packs/<slug>/` became `topic-packs/<domain>/<slug>/` with domains drawn from the
closed vocabulary in `topic-packs/DOMAINS.md`. One pack existed (`git-fundamentals`, moved
under `software-engineering/`); no schema fields changed. Packs also gained a required
`PACK.md` (provenance and amendment log) and optional `notes/` reference notes - both new
files, no breaking change to existing manifests.
