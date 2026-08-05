---
schema_version: 1
pack: data/sql-joins-and-grain
title: SQL joins and grain
maintainers: []
audience: developers who can write basic SELECTs and want to combine tables without silently wrong numbers; no data-warehouse background needed
hours: 13-15
created: 2026-08-05
---

# SQL joins and grain - pack provenance

SQL (Structured Query Language) as a pipeline rather than a bag of keywords. Five
modules build one argument: a query evaluates in a fixed logical order, joins are
row-matching with predictable NULL behavior, every table answers to a grain - a
statement of what one row represents - and the queries that produce silently wrong
numbers are almost always grain violations. The fan-out module names the classic
trap (a one-to-many join duplicating measures before an aggregate) and the last
module turns GROUP BY and window functions into deliberate grain decisions instead
of syntax habits.

Anchors are engine documentation (PostgreSQL and SQLite reference pages), the
Kimball Group's grain articles, the Looker fan-out analysis with its worked
inflation example, and the former Mode SQL tutorial (now hosted by ThoughtSpot).

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 13 archived anchors: PostgreSQL SELECT
  reference and tutorial pages, SQLite SELECT and NULL-handling pages, two Kimball
  Group grain articles, the Looker fan-out walkthrough, and two former-Mode
  tutorial pages; 5 reference notes).
- 2026-08-05 - citation audit: every anchor re-fetched live and every snapshot
  re-checked for the phrase it is cited for. One misattribution corrected - the
  SQLite NULL-handling page documents NULL distinctness in UNIQUE, DISTINCT, and
  UNION, not comparison semantics, so the "a NULL join key never matches" claim in
  module 2 and its note now cites the PostgreSQL comparison-operators page (14
  anchors).
