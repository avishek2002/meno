---
schema_version: 1
type: reference
title: Join fan-out - inflated measures, detection, and repair
concepts:
  - join-fan-out
  - fan-out-detection
  - fan-out-repair
sources:
  - title: "Understanding symmetric aggregates - Looker documentation"
    url: https://docs.cloud.google.com/looker/docs/best-practices/understanding-symmetric-aggregates
    archived_url: https://web.archive.org/web/20260213175954/https://docs.cloud.google.com/looker/docs/best-practices/understanding-symmetric-aggregates
    accessed: 2026-08-05
    source_type: web
    why: source of the worked fan-out example quoted here - the one-to-many orders-to-items join whose SUM of order totals inflates from 124.84 to 223.44 - and of the DISTINCT-over-a-primary-key repair
  - title: "Subquery Expressions - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/functions-subquery.html
    archived_url: https://web.archive.org/web/20260801012650/https://www.postgresql.org/docs/current/functions-subquery.html
    accessed: 2026-08-05
    source_type: web
    why: source of EXISTS semantics - true if the subquery returns at least one row - and of the NOT IN NULL behavior warned about in the repair section
---

# Join fan-out - inflated measures, detection, and repair

## What fan-out is

Fan-out is what happens when a query joins across a one-to-many relationship and
then aggregates a measure that lives on the "one" side. The join emits one output
row per matching pair, so a one-side row with three children appears three times -
and any measure carried on it is now counted three times.

The [Looker documentation](https://docs.cloud.google.com/looker/docs/best-practices/understanding-symmetric-aggregates)
walks the canonical case: an orders table joined to an order-items table, where
"the order_items table records one row for each item in an order, so the
relationship between the tables is one-to-many." In its example, "the total of
24.12 for rows where the order_id is 2 will be counted three times, since this
order includes three different items." The damage is quantified: SUM of the order
totals is 124.84 computed on the orders table alone, and 223.44 computed over the
joined result. Nothing errors; the number is simply wrong.

Fan-out is a grain violation committed through a join: the query's author believed
the result grain was "one row per order" while the join produced "one row per order
item", and the aggregate honored the actual grain, not the believed one.

## Detecting it

Because fan-out changes the result's grain, the checks are grain checks:

- **Row counts across the join.** If a query starts from a table with a known row
  count and the joined result has more rows, some input row matched more than once.
- **COUNT of all rows against COUNT DISTINCT of the key.** On the joined result,
  counting all rows and counting distinct values of the believed-grain key (the
  order identifier, in the example) must agree; a gap measures the duplication
  directly.
- **A known total recomputed after the join.** The Looker example's 124.84 against
  223.44 is this check: an aggregate whose true value is known from the base table,
  re-run on the joined result.

## Repairing it

Three repairs, in the order usually preferred:

- **Pre-aggregate the many side.** Aggregate the child table to the parent's grain
  first (one row per order with its item count or item revenue), then join two
  tables that are both at "one row per order". The join becomes one-to-one and
  nothing multiplies.
- **Semi-join with EXISTS when the join was only a filter.** Often the many-side
  table was joined only to restrict the parent rows, not to select its columns. The
  [PostgreSQL subquery documentation](https://www.postgresql.org/docs/current/functions-subquery.html)
  gives EXISTS semantics: "If it returns at least one row, the result of EXISTS is
  'true'; if the subquery returns no rows, the result of EXISTS is 'false'." A
  parent row is kept or dropped exactly once no matter how many children match, so
  the grain is preserved by construction. The subquery may reference the outer row
  (a correlated subquery), and by convention its select list is written as SELECT 1
  because the contents are irrelevant.
- **DISTINCT-based aggregation as a last resort.** Looker's symmetric aggregates
  automate this: SUM DISTINCT keyed on a primary key counts "each total exactly the
  right number of times" even over a fanned-out result. Hand-written equivalents
  work but push grain bookkeeping into every measure, which is why pre-aggregation
  reads better in plain SQL (Structured Query Language).

A related trap when the filter is negative: the same PostgreSQL page notes that with
NOT IN, "if there are no equal right-hand values and at least one right-hand row
yields null, the result of the NOT IN construct will be null, not true" - so one
NULL in the subquery's output makes NOT IN return no rows at all. EXISTS avoids that
outcome by construction rather than by special-casing NULL: the semantics quoted
above admit only two results, 'true' when the subquery returns at least one row and
'false' when it returns none, so there is no third case for a NULL to produce.
