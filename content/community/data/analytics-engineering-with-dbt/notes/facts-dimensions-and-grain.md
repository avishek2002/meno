---
schema_version: 1
type: reference
title: Facts, dimensions, grain, and the star schema
concepts:
  - facts-and-dimensions
  - declared-grain
  - star-vs-normalized
sources:
  - title: "Fact Tables and Dimension Tables (Ralph Kimball, Kimball Group)"
    url: https://www.kimballgroup.com/2003/01/fact-tables-and-dimension-tables/
    archived_url: https://web.archive.org/web/20260216195349/https://www.kimballgroup.com/2003/01/fact-tables-and-dimension-tables/
    accessed: 2026-08-05
    source_type: web
    why: source for facts as numeric measurements and dimensions as the textual context true when the fact is recorded
  - title: "Four-Step Dimensional Design Process (Kimball Group)"
    url: https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/
    archived_url: https://web.archive.org/web/20260714211616/https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/
    accessed: 2026-08-05
    source_type: web
    why: source for the ordered four design decisions - business process, grain, dimensions, facts
  - title: "Declaring the Grain (Ralph Kimball, Kimball Group)"
    url: https://www.kimballgroup.com/2003/03/declaring-the-grain/
    archived_url: https://web.archive.org/web/20260512133704/https://www.kimballgroup.com/2003/03/declaring-the-grain/
    accessed: 2026-08-05
    source_type: web
    why: source for the quicksand warning, what an undeclared grain costs a design, and the case for atomic grain
  - title: "Star Schemas and OLAP Cubes (Kimball Group)"
    url: https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/star-schema-olap-cube/
    archived_url: https://web.archive.org/web/20260714211615/https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/star-schema-olap-cube/
    accessed: 2026-08-05
    source_type: web
    why: source for the star schema as fact tables linked to dimension tables via primary/foreign key relationships
  - title: "Building a Kimball dimensional model with dbt (Jonathan Neo, dbt Developer Blog)"
    url: https://docs.getdbt.com/blog/kimball-dimensional-model
    archived_url: https://web.archive.org/web/20260723213452/https://docs.getdbt.com/blog/kimball-dimensional-model
    accessed: 2026-08-05
    source_type: web
    why: source for the stated analytics advantages of a dimensional model over a 3NF model - simpler joins, reusability, performance
---

# Facts, dimensions, grain, and the star schema

## Two kinds of table

Kimball's dimensional model splits analytical data into measurements and their
context. In
[Fact Tables and Dimension Tables](https://www.kimballgroup.com/2003/01/fact-tables-and-dimension-tables/),
Ralph Kimball is compact about the first half: "Numeric measurements are _facts_" -
specific, well-defined numeric attributes, ideally additive, recorded event after
event in a fact table. Around them, "facts are always surrounded by mostly textual
context that's true at the moment the fact is recorded"; that context - product,
store, customer, date - lands in dimension tables as verbose, descriptive attributes
that analysts filter and group by. Fact tables carry foreign keys to the dimension
tables' primary keys, and the resulting shape - one fact table joined outward to its
dimensions - is the
[star schema](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/star-schema-olap-cube/):
"fact tables linked to associated dimension tables via primary/foreign key
relationships."

## Grain is a declaration, made early

The Kimball Group's
[four-step design process](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/four-4-step-design-process/)
fixes the order of design decisions: select the business process, declare the grain,
identify the dimensions, identify the facts. Declaring the grain means saying
precisely what one fact-table row represents - for example, an individual line item
on a retail sales ticket - before any column list exists. In
[Declaring the Grain](https://www.kimballgroup.com/2003/03/declaring-the-grain/),
Kimball calls skipping this the most common design error: "If the grain isn't
clearly defined, the whole design rests on quicksand." Without the declaration,
dimension discussions circle, and facts that are untrue to the grain slip in and
produce nonsense when aggregated. His advice is to declare the most atomic grain the
source data offers, because "the smaller and more atomic the measurement [...], the more
things you know for sure, and the more dimensions you have" - aggregates can always
be built on top, but a pre-aggregated design cannot recover detail. (Grain here is a
modeling declaration; how joins between tables of different grains behave at query
time is its own subject, outside this pack.)

## Why analytics prefers this to normal forms

Third normal form (3NF) optimizes for non-redundant writes; a dimensional model
optimizes for reads. The dbt Developer Blog's
[Kimball walkthrough](https://docs.getdbt.com/blog/kimball-dimensional-model) states
the trade concretely: consumers of a dimensional model "do not need to perform
complex joins," dimensions "can be easily re-used with other fact tables to avoid
duplication of effort and code logic," and analytical queries against it "are
significantly faster than a 3NF model since data transformations like joins and
aggregations have been already applied." The same source prefers the star to the
further-normalized snowflake variant for the same reason: every level of dimension
normalization hands joins back to the consumer.
