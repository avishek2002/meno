---
schema_version: 1
type: reference
title: GROUP BY as a grain contract, and window functions as the alternative
concepts:
  - group-by-grain-contract
  - window-functions
  - groupby-vs-window-choice
sources:
  - title: "Aggregate Functions - PostgreSQL tutorial"
    url: https://www.postgresql.org/docs/current/tutorial-agg.html
    archived_url: https://web.archive.org/web/20260720235713/https://www.postgresql.org/docs/current/tutorial-agg.html
    accessed: 2026-08-05
    source_type: web
    why: source for aggregates computing a single result from multiple input rows and for GROUP BY producing one output row per group
  - title: "Table Expressions - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/queries-table-expressions.html
    archived_url: https://web.archive.org/web/20260804103651/https://www.postgresql.org/docs/current/queries-table-expressions.html
    accessed: 2026-08-05
    source_type: web
    why: source of the enforcement rule quoted here - columns not listed in GROUP BY cannot be referenced except in aggregate expressions
  - title: "Window Functions - PostgreSQL tutorial"
    url: https://www.postgresql.org/docs/current/tutorial-window.html
    archived_url: https://web.archive.org/web/20260803135252/https://www.postgresql.org/docs/current/tutorial-window.html
    accessed: 2026-08-05
    source_type: web
    why: source of the window-function definition - a calculation across related rows in which rows retain their separate identities - and of PARTITION BY and ORDER BY within OVER
  - title: "SQL Window Functions - former Mode SQL tutorial (ThoughtSpot)"
    url: https://www.thoughtspot.com/sql-tutorial/sql-window-functions
    archived_url: https://web.archive.org/web/20260414145456/https://www.thoughtspot.com/sql-tutorial/sql-window-functions
    accessed: 2026-08-05
    source_type: web
    why: source for the practical catalog of window functions - running totals, ROW_NUMBER, RANK, DENSE_RANK, NTILE, LAG, LEAD - used as worked examples
---

# GROUP BY as a grain contract, and window functions as the alternative

## GROUP BY changes the output grain

An aggregate function "computes a single result from multiple input rows," and with
GROUP BY the computation runs per group: the
[PostgreSQL aggregates tutorial](https://www.postgresql.org/docs/current/tutorial-agg.html)
shows a weather query grouped by city that "gives us one output row per city." That
phrase is the contract: the columns in GROUP BY define the grain of the result. A
query grouped by city has the grain "one row per city" no matter what its input
grain was.

The engine enforces the contract's other half. Per the
[table expressions documentation](https://www.postgresql.org/docs/current/queries-table-expressions.html):
"if a table is grouped, columns that are not listed in GROUP BY cannot be referenced
except in aggregate expressions." Grouped-by columns pass through, because they are
single-valued within a group; everything else must state how many-rows-become-one -
SUM, MAX, COUNT, or another aggregate. An error about a column "must appear in the
GROUP BY clause or be used in an aggregate function" is the engine refusing an
ill-defined grain, not a syntax nuisance.

## Window functions keep the grain

The [PostgreSQL window functions tutorial](https://www.postgresql.org/docs/current/tutorial-window.html)
defines the alternative: "A window function performs a calculation across a set of
table rows that are somehow related to the current row," and - the decisive
difference - "window functions do not cause rows to become grouped into a single
output row like non-window aggregate calls would. Instead, the rows retain their
separate identities." The related rows are chosen by the OVER clause: PARTITION BY
divides rows into groups sharing values, and ORDER BY within the window controls
processing order and frame boundaries. The tutorial's example attaches each
employee's department-average salary to the employee's own row: per-group
information at per-row grain.

The [former Mode tutorial](https://www.thoughtspot.com/sql-tutorial/sql-window-functions)
catalogs the everyday uses built on this: running totals, ROW_NUMBER, RANK and
DENSE_RANK, NTILE for quartiles, and LAG and LEAD for comparing a row with its
neighbors - all calculations that need group context without surrendering row
identity.

## The choice is a grain decision

Stated as grain, the choice stops being stylistic. GROUP BY is for answers whose
natural grain is the group: revenue per region wants one row per region. A window
function is for answers whose natural grain is the original row, enriched with group
context: each order alongside its customer's running total wants one row per order.
Needing both grains in one result - detail rows plus a genuine summary row - is a
sign of two queries, or of a window function carrying the summary onto the detail
grain. Reaching for GROUP BY and then wanting a column the contract will not admit
is the usual tell that the question was a window-function question all along.
