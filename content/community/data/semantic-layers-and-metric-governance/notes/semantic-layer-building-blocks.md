---
schema_version: 1
type: reference
title: Semantic-layer building blocks - measures, dimensions, entities, and the facade
concepts:
  - measures-and-dimensions
  - entities-and-join-paths
  - cubes-and-views
  - metric-types
sources:
  - title: "Getting started with data modeling (Cube documentation)"
    url: https://docs.cube.dev/docs/data-modeling/overview
    archived_url: https://web.archive.org/web/20260803074640/https://docs.cube.dev/docs/data-modeling/overview
    accessed: 2026-08-05
    source_type: web
    why: source of the measure and dimension definitions and of the views-as-facade claim - data consumers interact with views, which control what the model exposes
  - title: "Semantic models (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/semantic-models
    archived_url: https://web.archive.org/web/20260715154743/https://docs.getdbt.com/docs/build/semantic-models
    accessed: 2026-08-05
    source_type: web
    why: source of the entity definition (join keys with primary, unique, foreign, and natural types) used for joins across semantic models
  - title: "About MetricFlow (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/about-metricflow
    archived_url: https://web.archive.org/web/20260703044844/https://docs.getdbt.com/docs/build/about-metricflow
    accessed: 2026-08-05
    source_type: web
    why: source for the semantic graph framing (entities as edges between semantic models) and for SQL generation finding the best path between tables
  - title: "Creating metrics (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/metrics-overview
    archived_url: https://web.archive.org/web/20260604152310/https://docs.getdbt.com/docs/build/metrics-overview
    accessed: 2026-08-05
    source_type: web
    why: source of the metric-type vocabulary - simple, cumulative, derived, ratio, and conversion - and each type's required parameters
---

# Semantic-layer building blocks - measures, dimensions, entities, and the facade

## Measures and dimensions

The two halves of every metric definition are quantitative and categorical. Cube's
data-modeling documentation defines measures as "quantitative data, such as number of
units sold" and dimensions as "categorical data, such as state, gender, product name"
([Cube documentation](https://docs.cube.dev/docs/data-modeling/overview)). A metric is
a measure made queryable along dimensions: revenue is a measure; revenue by region and
month is that measure sliced by two dimensions. The dbt (data build tool) semantic
model mirrors the split: dimensions are "different ways to organize or look at data"
and are "effectively the group by parameters for metrics"
([dbt Developer Hub](https://docs.getdbt.com/docs/build/semantic-models)).

## Entities: declared join paths instead of hand-written joins

In MetricFlow, dbt's semantic-layer engine, entities are "the join keys of your
semantic model" - described as "the traversal paths, or edges between semantic models"
([dbt Developer Hub](https://docs.getdbt.com/docs/build/about-metricflow)). Entities
come in four types - primary, unique, foreign, and natural - and while an entity name
must be unique within one semantic model, the same identifier "can be non-unique across
semantic models since MetricFlow uses them for joins"
([dbt Developer Hub](https://docs.getdbt.com/docs/build/semantic-models)). The
consequence is that a consumer never writes join SQL (Structured Query Language): when
a metric query spans tables, the engine "uses its SQL engine to figure out the best
path between tables using the framework defined in YAML files" (YAML: a human-readable
data-serialization format).

## Cubes and views: the facade consumers query

Cube organizes definitions into cubes - roughly one per table, each holding its
measures and dimensions - and then exposes views, which "sit on top of cubes and create
a facade of your whole data model, with which data consumers can interact"
([Cube documentation](https://docs.cube.dev/docs/data-modeling/overview)). End users
query views, not cubes, which is what makes the layer a governance surface: views
control "which part of the data model is exposed to end-users." The facade is the
API (application programming interface) contract of the semantic layer - warehouse
tables can be refactored behind it without breaking any dashboard that queries through
it.

## A small vocabulary of metric types

Definitions compose. The dbt metric reference enumerates five types. Simple and
cumulative metrics it describes by their required parameters rather than in prose - a
simple metric takes an aggregation (`agg`) over a measure, a cumulative metric takes an
`input_metric` plus a `window` or `grain_to_date` to accumulate it over. The other three
it defines outright: derived metrics "allow you to perform calculations using other
metrics," ratio metrics "involve a numerator metric and a denominator metric," and
conversion metrics "track when a base event and a subsequent conversion event occur
for an entity within a set time period"
([dbt Developer Hub](https://docs.getdbt.com/docs/build/metrics-overview)). The types
matter for governance as much as for authoring: a derived metric inherits every
upstream definition it references, so a change to one input silently changes every
metric built on it - which is exactly why definitions need the review controls covered
elsewhere in this pack.
