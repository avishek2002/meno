---
schema_version: 1
type: reference
title: Governing metric definitions as code - review, versioning, and parity
concepts:
  - metric-ownership
  - change-review-and-versioning
  - metric-parity-testing
sources:
  - title: "How Airbnb Standardized Metric Computation at Scale (Amit Pahwa et al., The Airbnb Tech Blog)"
    url: https://medium.com/airbnb-engineering/airbnb-metric-computation-with-minerva-part-2-9afe6695b486
    archived_url: https://web.archive.org/web/20250911225300/https://medium.com/airbnb-engineering/airbnb-metric-computation-with-minerva-part-2-9afe6695b486
    accessed: 2026-08-05
    source_type: web
    why: source for definitions as version-controlled code under rigorous review, automatic data-version bumps and backfills on definition change, and the staging environment that absorbs changes before production
  - title: "Validations (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/build/validation
    archived_url: https://web.archive.org/web/20260612053905/https://docs.getdbt.com/docs/build/validation
    accessed: 2026-08-05
    source_type: web
    why: source for the three built-in validations (parsing, semantic, data platform) and for running them in continuous integration so model changes cannot silently break metrics
---

# Governing metric definitions as code - review, versioning, and parity

## Definitions are code, so they get code's controls

Airbnb's Minerva platform makes the governance model explicit: "all definitions are
treated as version-controlled code. Modification of these configuration files must go
through a rigorous review process, just like any other code review"
([Pahwa et al., The Airbnb Tech Blog](https://medium.com/airbnb-engineering/airbnb-metric-computation-with-minerva-part-2-9afe6695b486)).
This closes the silent-edit hole that tool-local formulas leave open: a definition
change has an author, a reviewer, a diff, and a history, and the definition's single
home in version control is what makes ownership assignable at all.

## Versioned definitions and automatic backfills

A definition change is not just a text edit - it changes what the numbers mean. Minerva
tracks this with a data version derived from the definition: "when we change any field
that impacts what data is generated, the data version gets updated automatically," and
datasets that depend on the changed definition get backfilled under the new version.
Changes also pass through a staging environment, "a replica of the Production
environment built from pending user configuration modifications," so recomputation
completes before consumers see the new definition - the write-up's defense against
data downtime.

## Automated validation of the definition graph

The dbt (data build tool) Semantic Layer ships a machine-checkable half of governance.
The documentation names "three built-in validations" and runs them in that order:
parsing (config files follow the expected schema), semantic (the semantic graph
"doesn't violate any constraints," such as name uniqueness and references to metrics
that exist), and data platform (the "semantic definitions in your semantic graph exist
in the underlying physical table")
([dbt Developer Hub](https://docs.getdbt.com/docs/build/validation)). The
documentation's operational point is where these run: "you can run semantic validations
... in a CI job to guarantee any code changes made to dbt models don't break these
metrics" (CI: continuous integration). A table rename that would orphan a metric
definition fails the pull request instead of failing a dashboard.

## Parity: proving two definitions agree

Validation proves a definition is well-formed; parity testing proves it produces the
same number. The cited sources supply the machinery rather than a procedure. The
data-platform validation stage checks definitions against the physical warehouse;
Minerva's staging environment computes the changed definition's output in full before
it replaces the old one; and Minerva's prototyping tool ("reads from Production but
writes to an isolated sandbox") generates sample data so users can "validate the
outputs against their assumptions and/or existing data" before a change is merged.

What neither source states is a migration procedure: how to move a metric out of a
tool-local formula and into a semantic layer without a period where the two disagree
silently. Both describe controls for validating a definition before it lands, not a
sequence for retiring the definition it replaces. That gap is left open here rather
than filled by inference.
