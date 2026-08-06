---
schema_version: 1
type: reference
title: Slowly changing dimensions and dbt snapshots
concepts:
  - scd-types
  - dbt-snapshots
  - as-of-queries
sources:
  - title: "Slowly Changing Dimensions (Ralph Kimball, Kimball Group)"
    url: https://www.kimballgroup.com/2008/08/slowly-changing-dimensions/
    archived_url: https://web.archive.org/web/20260306032058/https://www.kimballgroup.com/2008/08/slowly-changing-dimensions/
    accessed: 2026-08-05
    source_type: web
    why: source for the type 1 / 2 / 3 taxonomy and the cost of overwriting - type 1 destroys the history of a field
  - title: "Slowly Changing Dimensions, Part 2 (Ralph Kimball, Kimball Group)"
    url: https://www.kimballgroup.com/2008/09/slowly-changing-dimensions-part-2/
    archived_url: https://web.archive.org/web/20260730161931/https://www.kimballgroup.com/2008/09/slowly-changing-dimensions-part-2/
    accessed: 2026-08-05
    source_type: web
    why: source for type 2 implementation - surrogate keys, begin and end effective datetimes, current-row indicator
  - title: "Add snapshots to your DAG (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/snapshots
    archived_url: https://web.archive.org/web/20260624214534/https://docs.getdbt.com/docs/build/snapshots
    accessed: 2026-08-05
    source_type: web
    why: source for snapshots as dbt's type 2 mechanism - strategies, dbt_valid_from and dbt_valid_to, first-run and subsequent-run behavior
---

# Slowly changing dimensions and dbt snapshots

## The problem and Kimball's taxonomy

Dimension attributes drift: a customer moves, a product changes category. In
[Slowly Changing Dimensions](https://www.kimballgroup.com/2008/08/slowly-changing-dimensions/),
Ralph Kimball names the three fundamental responses. Type 1 overwrites the old value;
it is the simplest and the most destructive - "Type 1 destroys the history of a
particular field," and every historical report thereafter sees only the current
value. Type 2 issues a new dimension row for each change, preserving history
chronologically. Type 3 establishes "an alternate reality that coexists with the
current truth," so two versions of an attribute stay queryable side by side.
Organizations under compliance obligations often cannot use type 1 at all.

## Type 2 mechanics

[Part 2](https://www.kimballgroup.com/2008/09/slowly-changing-dimensions-part-2/)
details what a type 2 dimension needs: surrogate primary keys ("completely
artificial primary keys that are simply sequentially assigned integers") rather than
natural keys, begin- and end-effective datetimes bounding each row's validity, and a
current-row indicator for fast lookups of the present state. The validity ranges
must tile perfectly: "the end-effective-datetime of a Type 2 dimension record must
be exactly equal to the begin-effective-datetime of the next change." Fact rows then
join to the dimension row that was in effect when the fact occurred, which is what
makes historically faithful reporting possible - an as-of query selects the row
whose range contains the event's timestamp.

## Snapshots - type 2 built into dbt

dbt (data build tool) implements this pattern as
[snapshots](https://docs.getdbt.com/docs/build/snapshots), which record "changes to
a mutable table over time" as type 2 slowly changing dimension rows. A snapshot
configuration names a `unique_key` and a change-detection strategy: `timestamp`
(recommended - watches an `updated_at` column) or `check` (compares a listed set of
columns, or all of them). On the first run dbt builds the snapshot table with every
row current; on later runs it closes out changed rows by setting `dbt_valid_to` and
inserts the new versions with `dbt_valid_to` null (or a configured far-future
value). The `dbt_valid_from` and `dbt_valid_to` columns are exactly Kimball's
effective-date pair, maintained automatically, and a snapshot is referenced
downstream with `ref()` like any model.
