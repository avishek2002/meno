# Schema migrations

One line per breaking or behavior-relevant schema change: date, what changed, what it means for previously generated tenant content. Consumers stay permissive with old `schema_version` values (they flag, never choke); regeneration decisions belong to the user.

| Date | Change | Effect on existing content |
|------|--------|---------------------------|
| - | (none yet; all formats are at schema_version 1) | - |
