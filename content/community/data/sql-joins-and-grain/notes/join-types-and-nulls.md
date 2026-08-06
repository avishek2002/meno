---
schema_version: 1
type: reference
title: Join types as row matching, and how NULL behaves
concepts:
  - join-types
  - join-keys
  - null-join-behavior
sources:
  - title: "Table Expressions - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/queries-table-expressions.html
    archived_url: https://web.archive.org/web/20260804103651/https://www.postgresql.org/docs/current/queries-table-expressions.html
    accessed: 2026-08-05
    source_type: web
    why: source of the per-join-type definitions quoted here - inner join as matching pairs, outer joins as inner join plus null-extended unmatched rows, cross join as Cartesian product - and of the ON, USING, and alias forms
  - title: "SQL Joins - former Mode SQL tutorial (ThoughtSpot)"
    url: https://www.thoughtspot.com/sql-tutorial/sql-joins
    archived_url: https://web.archive.org/web/20260312045125/https://www.thoughtspot.com/sql-tutorial/sql-joins
    accessed: 2026-08-05
    source_type: web
    why: source of the join-key terminology - the two columns that map to one another are referred to as foreign keys or join keys
  - title: "Comparison Functions and Operators - PostgreSQL documentation"
    url: https://www.postgresql.org/docs/current/functions-comparison.html
    archived_url: https://web.archive.org/web/20260721181915/https://www.postgresql.org/docs/current/functions-comparison.html
    accessed: 2026-08-05
    source_type: web
    why: source of the NULL comparison rule quoted here - ordinary comparison operators yield null, signifying unknown, rather than true or false when either input is null - which is why a NULL join key matches nothing
  - title: "NULL Handling in SQLite - SQLite documentation"
    url: https://www.sqlite.org/nulls.html
    archived_url: https://web.archive.org/web/20260731121940/https://www.sqlite.org/nulls.html
    accessed: 2026-08-05
    source_type: web
    why: source of the DISTINCT vs UNIQUE inconsistency quoted here, and of the note that SQLite was modified to match Oracle, PostgreSQL, and DB2 by making NULLs indistinct for SELECT DISTINCT and UNION
---

# Join types as row matching, and how NULL behaves

## Every join is a row-matching rule

A join takes two tables and a matching rule, and produces rows built from pairs. The
[PostgreSQL table expressions documentation](https://www.postgresql.org/docs/current/queries-table-expressions.html)
defines the five types in exactly those terms:

- **Cross join**: every possible combination of rows - "a Cartesian product" - with
  no matching rule at all.
- **Inner join**: "For each row R1 of T1, the joined table has a row for each row in
  T2 that satisfies the join condition with R1." Unmatched rows on either side simply
  disappear.
- **Left outer join**: "First, an inner join is performed. Then, for each row in T1
  that does not satisfy the join condition with any row in T2, a joined row is added
  with null values in columns of T2. Thus, the joined table always has at least one
  row for each row in T1."
- **Right outer join**: the mirror image - unmatched T2 rows survive, null-extended
  on the T1 side.
- **Full outer join**: both behaviors at once - unmatched rows from either table
  appear, null-extended on the side that had no match.

Two consequences fall out of these definitions. First, an inner join can both drop
rows (no match) and multiply them (several matches) - the row count of a join is a
prediction to make, not a surprise to accept. Second, the NULLs an outer join
produces are structural: they mark "no matching row existed", not missing data in
the underlying table.

## Join keys

The matching rule is usually equality on identifying columns. The
[former Mode SQL tutorial](https://www.thoughtspot.com/sql-tutorial/sql-joins) names
them: the two columns that map to one another "are referred to as 'foreign keys' or
'join keys'". PostgreSQL's documentation gives the three syntactic forms: an ON
expression (the general case), USING for identically named columns (which also
suppresses the redundant duplicate column), and NATURAL as the implicit
all-shared-columns shorthand. Table aliases exist for notational convenience and
become mandatory when a table joins to itself.

## NULL never matches

Join conditions are ordinary boolean expressions, so NULL comparison semantics apply
to them. The
[PostgreSQL comparison-operators documentation](https://www.postgresql.org/docs/current/functions-comparison.html)
states the rule: ordinary comparison operators yield null - signifying unknown -
rather than true or false when either input is null, so `7 = NULL` is itself null.
The page warns against writing an equality test against NULL at all, because "the
null value represents an unknown value, and it is not known whether two unknown
values are equal"; `IS NULL` and `IS NOT DISTINCT FROM` exist for the cases where
NULL should be treated as an ordinary value. A row whose join key is NULL therefore
matches nothing, in any join type; in an inner join it vanishes, and in an outer
join it survives only as a null-extended row.

Equality in a join condition and "sameness" elsewhere are different rules, and the
[SQLite NULL-handling page](https://www.sqlite.org/nulls.html) records an
inconsistency worth knowing when grain checks come later: NULLs are treated as
distinct from one another in UNIQUE constraints (a UNIQUE column admits many NULLs)
but as indistinct in SELECT DISTINCT and UNION (multiple NULLs collapse to one).
That page calls the split "puzzling" and explains the history - SQLite "was modified
to work the same as Oracle, PostgreSQL, and DB2", which "involved making NULLs
indistinct for the purposes of the SELECT DISTINCT statement and for the UNION
operator", while "NULLs are still distinct in a UNIQUE column".
