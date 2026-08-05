---
schema_version: 1
type: reference
title: Choosing a dbt materialization
concepts:
  - views-and-tables
  - incremental-models
  - ephemeral-models
sources:
  - title: "Materializations (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/materializations
    archived_url: https://web.archive.org/web/20260723212229/https://docs.getdbt.com/docs/build/materializations
    accessed: 2026-08-05
    source_type: web
    why: source for what each built-in materialization persists and the official when-to-use guidance quoted here
  - title: "Configure incremental models (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/incremental-models
    archived_url: https://web.archive.org/web/20260713053935/https://docs.getdbt.com/docs/build/incremental-models
    accessed: 2026-08-05
    source_type: web
    why: source for incremental mechanics - first-run full build, is_incremental() filtering, and unique_key updates
---

# Choosing a dbt materialization

A materialization is the strategy dbt (data build tool) uses to persist a model in
the warehouse. The
[materializations documentation](https://docs.getdbt.com/docs/build/materializations)
lists five built-in options; the first four are the everyday set.

## View and table - the two defaults

A view rebuilds as `create view as` on each run: no data is stored, and "views on
top of source data will always have the latest records in them," but views "that
perform a significant transformation, or are stacked on top of other views, are slow
to query." A table rebuilds as `create table as`: fast to query, but slow to rebuild
and frozen between runs - new source records do not appear until the next `dbt run`.

The documented default posture: "generally start with views for your models, and
only change to another materialization when you notice performance problems," then
"use the table materialization for any models being queried by BI tools" (business
intelligence tools) and for slow transformations feeding many downstream models.

## Incremental - pay only for new rows

An incremental model transforms all rows on its first run, then on later runs
transforms "_only_ the rows in your source data that you tell dbt to filter for,
inserting them into the target table," per the
[incremental models documentation](https://docs.getdbt.com/docs/build/incremental-models).
The filter lives inside an `is_incremental()` block, which is true only when the
table already exists and no full refresh was requested. A `unique_key` upgrades the
behavior from append-only to upsert: new information for an existing key replaces
the old row - with the caveat that key columns must never be null or the model can
generate duplicates. The materializations page's advice is restraint: incremental
models "are best for event-style data," and you should reach for them "when your
`dbt run`s are becoming too slow (i.e. don't start with incremental models)."

## Ephemeral - no warehouse object at all

An ephemeral model is never built in the database; dbt interpolates its code into
dependent models as a common table expression (CTE). That keeps the warehouse
uncluttered and the logic reusable, but nothing can select from it directly, and the
docs warn that overuse "can also make queries harder to debug." Recommended for
lightweight transformations early in the graph, used by only one or two downstream
models.

The fifth option, the materialized view, delegates the incremental refresh problem
to the database engine where the platform supports it - a combination of a view's
freshness and a table's query speed, at the cost of platform-specific limits.
