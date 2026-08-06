---
schema_version: 1
type: reference
title: dbt models, ref(), and the dependency graph
concepts:
  - models-as-selects
  - ref-and-the-dag
  - source-declarations
sources:
  - title: "SQL models (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/sql-models
    archived_url: https://web.archive.org/web/20260715105350/https://docs.getdbt.com/docs/build/sql-models
    accessed: 2026-08-05
    source_type: web
    why: source for the model-is-a-select definition, the DDL wrapping at run time, and ref() creating the dependency graph
  - title: "Add sources to your DAG (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/sources
    archived_url: https://web.archive.org/web/20260715105349/https://docs.getdbt.com/docs/build/sources
    accessed: 2026-08-05
    source_type: web
    why: source for source declarations in YAML, the source() function's dependency edge, and freshness thresholds
---

# dbt models, ref(), and the dependency graph

## A model is a SELECT statement

In dbt (data build tool), a SQL model is a single SELECT statement saved in a `.sql`
file, and the model's name is the filename. The
[official documentation](https://docs.getdbt.com/docs/build/sql-models) states it
directly: "A SQL model is a `select` statement." The analyst never writes data
definition language: "When you execute the `dbt run` command, dbt builds this model
in your data warehouse by wrapping it in a `create view as` or `create table as`
statement." Transformation logic stays declarative; what gets persisted is a
separate, configurable concern.

## ref() gives dbt the graph

Models depend on other models by calling the `ref()` function in place of a hard-coded
table name, for example `select * from {{ ref('stg_customers') }}`. The docs give
`ref()` two jobs at once. First, dependency ordering: "dbt uses the `ref` function to
determine the order to run the models by creating a dependent acyclic graph (DAG)" -
DAG standing for directed acyclic graph, the structure that tells dbt what must build
before what. Second, environment management: because `ref()` resolves the name at
compile time, the same model code builds into a development schema and a production
schema without edits. The graph is also what lets dbt skip downstream models when an
upstream build fails.

## Sources are the raw edge

Raw tables loaded by extract-and-load tools enter the graph through source
declarations rather than bare table names.
[Sources](https://docs.getdbt.com/docs/build/sources) are declared in YAML under a
`sources:` key (name, database, schema, tables) and queried with
`{{ source('jaffle_shop', 'orders') }}`. Per the docs, sources "make it possible to
name and describe the data loaded into your warehouse by your Extract and Load
tools," and "using the `{{ source() }}` function also creates a dependency between
the model and the source table" - so lineage runs unbroken from raw table to final
model. Declared sources can also carry freshness expectations (`warn_after`,
`error_after` against a `loaded_at_field`), checked with the `dbt source freshness`
command.
