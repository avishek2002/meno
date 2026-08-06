---
schema_version: 1
type: reference
title: Data tests and documentation in dbt
concepts:
  - singular-tests
  - generic-tests
  - schema-yml-documentation
sources:
  - title: "Add data tests to your DAG (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/data-tests
    archived_url: https://web.archive.org/web/20260709152546/https://docs.getdbt.com/docs/build/data-tests
    accessed: 2026-08-05
    source_type: web
    why: source for the failing-rows test model, the singular versus generic distinction, and the four built-in generic tests
  - title: "About documentation (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/documentation
    archived_url: https://web.archive.org/web/20260709152551/https://docs.getdbt.com/docs/build/documentation
    accessed: 2026-08-05
    source_type: web
    why: source for YAML descriptions, doc blocks, and how the generated documentation site is produced and read
---

# Data tests and documentation in dbt

## Tests are SELECTs that return failing rows

dbt (data build tool) data tests are assertions about models, sources, seeds, and
snapshots, run with `dbt test`. The
[data tests documentation](https://docs.getdbt.com/docs/build/data-tests) defines the
mechanism: "they are `select` statements that seek to grab 'failing' records, ones
that disprove your assertion." Zero rows back means the assertion holds - the same
mental model as a model file, pointed at quality instead of transformation.

## Singular versus generic

A singular test is a one-off: "when you write a SQL query that returns failing rows,
you can save that query in a `.sql` file within your test directory" - for example,
asserting that no order's payment amounts sum negative. A generic test is "a
parameterized query that accepts arguments," defined once and applied anywhere. The
docs are explicit about the balance: generic tests "should make up the bulk of your
dbt data testing suite," with singular tests reserved for rules too bespoke to
parameterize.

Four generic tests ship built in, attached to columns in a YAML properties file
(`data_tests:` under a column): `unique` (no duplicate values), `not_null` (no
nulls), `accepted_values` (the value set is closed, such as an order status enum),
and `relationships` (every foreign key value exists in the referenced model -
referential integrity, asserted in the transformation layer since analytical
warehouses rarely enforce it).

## Documentation lives beside the tests

The same YAML file carries `description:` fields for models and columns. Per the
[documentation page](https://docs.getdbt.com/docs/build/documentation), longer prose
moves into doc blocks - markdown between `{% docs %}` and `{% enddocs %}` tags,
referenced from a description with `{{ doc("...") }}`. Generating documentation
introspects the warehouse and matches actual columns against the YAML, so
undocumented columns still appear in the site - visible as gaps rather than silently
missing. The generated site includes the project's lineage graph, which renders the
same dependency graph that ref() and source() calls define.
