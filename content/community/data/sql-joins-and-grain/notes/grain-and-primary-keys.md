---
schema_version: 1
type: reference
title: Grain - what one row represents, and primary keys as its enforcement
concepts:
  - table-grain
  - grain-declaration
  - primary-key-thinking
sources:
  - title: "Grain - Kimball Group dimensional modeling techniques"
    url: https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain/
    archived_url: https://web.archive.org/web/20260306023852/https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain/
    accessed: 2026-08-05
    source_type: web
    why: source of the definition - the grain establishes exactly what a single fact table row represents - and of the rule that grain is declared before choosing dimensions or facts
  - title: "Declaring the Grain - Ralph Kimball, Kimball Group"
    url: https://www.kimballgroup.com/2003/03/declaring-the-grain/
    archived_url: https://web.archive.org/web/20260512133704/https://www.kimballgroup.com/2003/03/declaring-the-grain/
    accessed: 2026-08-05
    source_type: web
    why: source of the business-terms formulation, the quicksand warning, and the untrue-to-the-grain failure mode quoted here
  - title: "Constraints - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/ddl-constraints.html
    archived_url: https://web.archive.org/web/20260803152840/https://www.postgresql.org/docs/current/ddl-constraints.html
    accessed: 2026-08-05
    source_type: web
    why: source of the primary-key definition - a column or group of columns usable as a unique identifier for rows, requiring values both unique and not null, at most one per table
---

# Grain - what one row represents, and primary keys as its enforcement

## The definition

Grain is the answer to one question about a table: what, exactly, does a single row
represent? The [Kimball Group's technique page](https://www.kimballgroup.com/data-warehouse-business-intelligence-resources/kimball-techniques/dimensional-modeling-techniques/grain/)
puts it as "the grain establishes exactly what a single fact table row represents,"
calls declaring it "the pivotal step in a dimensional design," and is strict about
ordering: "the grain must be declared before choosing dimensions or facts because
every candidate dimension or fact must be consistent with the grain." The
declaration "becomes a binding contract on the design." Atomic grain - "the lowest
level at which data is captured by a given business process" - is the recommended
default: the page urges starting there "because it withstands the assault of
unpredictable user queries", where "rolled-up summary grains are important for
performance tuning, but they pre-suppose the business's common questions."

## Declared in business terms

Ralph Kimball's ["Declaring the Grain"](https://www.kimballgroup.com/2003/03/declaring-the-grain/)
insists the declaration is a business sentence, not a column list: "an individual
line item on a customer's retail sales ticket as measured by a scanner device" says
more than naming the dimensions that happen to identify it. The article is blunt about the alternative: "If the
grain isn't clearly defined, the whole design rests on quicksand" - candidate
dimensions circle without resolution, and "rogue facts that introduce application
errors sneak into the design." The sharpest failure mode is the fact that is not
true to the grain: a measure stored at one level inside rows of another, which
"produce[s] nonsensical, useless results" the moment a report aggregates it.

Although Kimball writes about warehouse fact tables, the discipline transfers to any
table a query touches: an orders table whose grain is "one row per order" and an
order-items table whose grain is "one row per line item" behave completely
differently under a SUM, and the difference is visible only to someone who has
stated both grains.

## Primary keys make grain checkable

A grain declaration is prose; a primary key is the machine-checked version of the
same claim. The [PostgreSQL constraints documentation](https://www.postgresql.org/docs/current/ddl-constraints.html)
defines it: "A primary key constraint indicates that a column, or group of columns,
can be used as a unique identifier for rows in the table. This requires that the
values be both unique and not null," and "a table can have at most one primary key."
If the declared grain is "one row per order", then the order identifier must be a
valid primary key, and a duplicate check on it that returns anything is a grain
violation - either the declaration is wrong or the data is. Tables without a
declared key still have a grain; it is just unverified, and unverified grain is
where join fan-out hides.
