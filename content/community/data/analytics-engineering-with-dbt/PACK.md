---
schema_version: 1
pack: data/analytics-engineering-with-dbt
title: Analytics engineering with dbt
maintainers: []
audience: developers comfortable with SQL and version control who are new to analytics engineering - they can query a warehouse but have not owned a transformation layer
hours: 16-18
created: 2026-08-05
---

# Analytics engineering with dbt - pack provenance

From raw warehouse tables to a tested, documented star schema. Module 1 grounds the
dbt (data build tool) mental model - models as SELECT statements, ref() and the
dependency graph, declared sources. Modules 2 and 3 make the project trustworthy and
affordable: data tests and generated documentation, then the four materializations
and when each earns its keep. Modules 4 and 5 turn to what the models should build:
Kimball dimensional modeling - facts, dimensions, declared grain, the star schema's
case against normalized schemas for analytics - and slowly changing dimensions
captured as type 2 history with dbt snapshots.

Scope note: grain appears here strictly as the Kimball modeling decision - what one
fact-table row represents and why you declare it before anything else. How joins
execute and multiply rows at query time is deliberately out of scope; that ground
belongs to the sql-joins-and-grain pack in this domain.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract. Anchors are the official dbt
documentation and Kimball Group articles.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 14 archived anchors: dbt documentation on
  models, sources, data tests, documentation, materializations, incremental models,
  and snapshots; Kimball Group articles on the four-step design process, grain
  declaration, fact and dimension tables, star schemas, and slowly changing
  dimensions parts 1 and 2; one dbt Developer Blog walkthrough; 5 reference notes).
