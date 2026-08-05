---
schema_version: 1
type: reference
title: Logical query processing - clause order and alias visibility
concepts:
  - logical-clause-order
  - alias-visibility
  - where-vs-having
sources:
  - title: "SELECT - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/sql-select.html
    archived_url: https://web.archive.org/web/20260803135249/https://www.postgresql.org/docs/current/sql-select.html
    accessed: 2026-08-05
    source_type: web
    why: source of the numbered processing steps and of the rule that output-column names are usable in ORDER BY and GROUP BY but not in WHERE or HAVING
  - title: "SELECT - SQLite documentation"
    url: https://www.sqlite.org/lang_select.html
    archived_url: https://web.archive.org/web/20260728194803/https://www.sqlite.org/lang_select.html
    accessed: 2026-08-05
    source_type: web
    why: source for the cross-engine claim - SQLite documents the same conceptual pipeline for a simple SELECT, from FROM-clause input data through WHERE filtering to DISTINCT, ORDER BY, and LIMIT
  - title: "Aggregate Functions - PostgreSQL tutorial"
    url: https://www.postgresql.org/docs/current/tutorial-agg.html
    archived_url: https://web.archive.org/web/20260720235713/https://www.postgresql.org/docs/current/tutorial-agg.html
    accessed: 2026-08-05
    source_type: web
    why: source of the WHERE vs HAVING rule - input rows are filtered before aggregation, group rows after it
---

# Logical query processing - clause order and alias visibility

## The pipeline behind the keyword order

A SELECT statement is written in one order (SELECT, FROM, WHERE, GROUP BY, HAVING,
ORDER BY, LIMIT) but evaluated in another. The
[PostgreSQL SELECT reference](https://www.postgresql.org/docs/current/sql-select.html)
describes the processing as ordered steps: any WITH subqueries are computed first,
then the FROM clause assembles the source tables (cross-joining when more than one is
listed), then WHERE eliminates rows that fail its condition, then GROUP BY groups the
survivors and HAVING eliminates groups, and only then is the select list computed for
each remaining row or group. DISTINCT, set operations, ORDER BY, and LIMIT/OFFSET
follow at the end.

This is not one engine's implementation detail. The
[SQLite SELECT documentation](https://www.sqlite.org/lang_select.html) walks a simple
SELECT through the same conceptual pipeline: determine the input data from the FROM
clause (a join of multiple tables starts, conceptually, as their Cartesian product),
filter with WHERE, generate result rows, remove duplicates for DISTINCT, then sort
with ORDER BY and cut with LIMIT. Both engines document the order as the meaning of
the statement; an optimizer may execute differently, but it must preserve the result
this order defines.

## Alias visibility follows the order

The evaluation order explains a rule that otherwise looks arbitrary. The PostgreSQL
SELECT reference states that an output column's name "can be used to refer to the
column's value in ORDER BY and GROUP BY clauses, but not in the WHERE or HAVING
clauses; there you must write out the expression instead." WHERE runs before the
select list exists, so a name defined in the select list is not yet available there;
ORDER BY runs after, so the name is.

PostgreSQL also notes a wrinkle: by the SQL (Structured Query Language) standard the
output expressions are computed before DISTINCT, ORDER BY, and LIMIT, but PostgreSQL
actually evaluates them after sorting and limiting "so long as those expressions are
not referenced in DISTINCT, ORDER BY or GROUP BY". The observable rule for writing
queries is unchanged; the wrinkle only matters for expressions with side effects or
errors that sorting might skip.

## WHERE filters rows, HAVING filters groups

The [PostgreSQL aggregates tutorial](https://www.postgresql.org/docs/current/tutorial-agg.html)
states the boundary exactly: "WHERE selects input rows before groups and aggregates
are computed (thus, it controls which rows go into the aggregate computation),
whereas HAVING selects group rows after groups and aggregates are computed." A direct
consequence, from the same page: the WHERE clause must not contain aggregate
functions, while HAVING almost always does.
