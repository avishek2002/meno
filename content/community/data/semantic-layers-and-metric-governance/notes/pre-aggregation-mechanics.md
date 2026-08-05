---
schema_version: 1
type: reference
title: Pre-aggregation mechanics - rollups, matching, and refresh
concepts:
  - latency-vs-freshness
  - rollup-matching
  - refresh-and-staleness
sources:
  - title: "Caching overview (Cube documentation)"
    url: https://docs.cube.dev/docs/pre-aggregations
    archived_url: https://web.archive.org/web/20260604152613/https://docs.cube.dev/docs/pre-aggregations
    accessed: 2026-08-05
    source_type: web
    why: source for the two-level cache design (in-memory default, pre-aggregations opt-in), the performance and concurrency claim, and the practical floor on refresh intervals
  - title: "Getting started with pre-aggregations (Cube documentation)"
    url: https://docs.cube.dev/docs/pre-aggregations/getting-started-pre-aggregations
    archived_url: https://web.archive.org/web/20260508151339/https://docs.cube.dev/docs/pre-aggregations/getting-started-pre-aggregations
    accessed: 2026-08-05
    source_type: web
    why: source of the condensed-data definition, the dedicated storage layer, the orders-of-magnitude size reduction, and refresh keys with background rebuilds
  - title: "Matching queries with pre-aggregations (Cube documentation)"
    url: https://docs.cube.dev/docs/pre-aggregations/matching-pre-aggregations
    archived_url: https://web.archive.org/web/20260508150754/https://docs.cube.dev/docs/pre-aggregations/matching-pre-aggregations
    accessed: 2026-08-05
    source_type: web
    why: source of the matching rules - member coverage, additive leaf measures, granularity alignment, time-zone match, first-match-wins ordering
---

# Pre-aggregation mechanics - rollups, matching, and refresh

## What a pre-aggregation is

A pre-aggregation is "a condensed version of the source data" - a rollup materialized
ahead of time over chosen measures and dimensions, stored in a dedicated storage layer
rather than recomputed per query
([Cube documentation](https://docs.cube.dev/docs/pre-aggregations/getting-started-pre-aggregations)).
Because the rollup keeps only the attributes it was declared with, it can be smaller
than the source "by several orders of magnitude," which is where the speed comes from:
many different incoming queries can be "served by the same condensed dataset if any
matching attributes are found."

## Why they exist

Cube's caching documentation describes a two-level design: an in-memory cache that is
active by default, and pre-aggregations as a second, explicitly configured layer that
can "dramatically improve the query performance and provide a higher concurrency"
([Cube documentation](https://docs.cube.dev/docs/pre-aggregations)). The docs steer
tuning effort toward pre-aggregations rather than the in-memory defaults. The trigger
for introducing one is empirical, not doctrinal: the getting-started guide frames it
as the point where dataset growth makes "the time-to-response from a user's
perspective" suffer on queries that run frequently.

## How a query finds a rollup

Matching is rule-based, and knowing the rules is what makes pre-aggregations
designable rather than magical
([Cube documentation](https://docs.cube.dev/docs/pre-aggregations/matching-pre-aggregations)):

- The rollup must contain "all dimensions, filter dimensions, and leaf measures" the
  query references.
- Leaf measures in the query must be additive - a sum of daily sums is a monthly sum,
  but a median of daily medians is not a monthly median, so non-additive measures
  cannot be served from coarser rollups.
- The query's time-dimension granularity must align with the rollup's, and "the time
  zone in the query must match the time zone of a pre-aggregation."
- "The first pre-aggregation that matches a query is used" - declaration order is part
  of the design.

A query that matches nothing falls through to the source tables, so a pre-aggregation
strategy is judged by how much of the real workload it intercepts.

## Refresh: the staleness budget

A rollup is a snapshot, so freshness is a managed trade-off. "Cube uses a refresh key
to check the freshness of the data"; when the key's value changes, pre-aggregations are
rebuilt by background processes
([Cube documentation](https://docs.cube.dev/docs/pre-aggregations/getting-started-pre-aggregations)).
The caching overview notes a practical floor - a refresh interval of about one minute
is the lowest recommended - so a team adopting pre-aggregations is explicitly buying
latency and concurrency with a bounded, configurable amount of staleness.
