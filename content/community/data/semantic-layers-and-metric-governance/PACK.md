---
schema_version: 1
pack: data/semantic-layers-and-metric-governance
title: Semantic layers and metric governance
maintainers: []
audience: analysts and analytics engineers who ship dashboards from already-modeled warehouse tables and keep getting asked why two reports disagree; comfortable with SQL (Structured Query Language), no semantic-layer experience assumed
hours: 13-15
created: 2026-08-05
---

# Semantic layers and metric governance - pack provenance

Define a metric once, serve it everywhere. Four modules: why the same metric label
comes to mean three different numbers when every BI (business intelligence) tool embeds
its own formula; what a semantic layer is - measures, dimensions, and entities, with
cubes or views as the query interface; when pre-aggregations earn their build and
refresh cost; and how to govern metric definitions - ownership, change review,
versioning, and parity testing. Anchors are the official Cube and dbt Semantic Layer /
MetricFlow documentation plus Airbnb's two Minerva engineering write-ups, all fetched
and archived.

Scope fence: this pack consumes already-modeled warehouse tables. Dimensional modeling
and transformation work - how those tables get built - belongs to the
analytics-engineering pack in this domain, not here.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (4 modules, 11 archived anchors: Cube data-modeling and
  pre-aggregation docs, dbt Semantic Layer / MetricFlow / semantic-model / metric-type /
  validation docs, and Airbnb's Minerva metric-consistency and metric-computation
  write-ups; 4 reference notes).
