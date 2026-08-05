---
schema_version: 1
type: reference
title: Metric drift - the evidence that one label means many numbers
concepts:
  - metric-drift
  - tool-local-formulas
  - define-once-serve-everywhere
sources:
  - title: "How Airbnb Achieved Metric Consistency at Scale (Robert Chang et al., The Airbnb Tech Blog)"
    url: https://medium.com/airbnb-engineering/how-airbnb-achieved-metric-consistency-at-scale-f23cc53dea70
    archived_url: https://web.archive.org/web/20250918071400/https://medium.com/airbnb-engineering/how-airbnb-achieved-metric-consistency-at-scale-f23cc53dea70
    accessed: 2026-08-05
    source_type: web
    why: source of the drift incident (diverging answers to the same executive question), the trust-erosion consequence, and the define-once-use-everywhere principle behind Minerva
  - title: "dbt Semantic Layer (dbt Developer Hub)"
    url: https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl
    archived_url: https://web.archive.org/web/20260709022406/https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl
    accessed: 2026-08-05
    source_type: web
    why: source for the claim that centralizing definitions in the modeling layer propagates a change everywhere it is invoked and keeps business units on one definition regardless of tool
---

# Metric drift - the evidence that one label means many numbers

## The documented incident

Airbnb's engineering team describes the failure mode precisely. When their chief
executive "would ask simple questions like which city had the most bookings in the
previous week, Data Science and Finance would sometimes provide diverging answers using
slightly different tables, metric definitions, and business logic"
([Chang et al., The Airbnb Tech Blog](https://medium.com/airbnb-engineering/how-airbnb-achieved-metric-consistency-at-scale-f23cc53dea70)).
The same label - bookings - was backed by different formulas in different hands, so it
produced different numbers. The consequence compounded: "Over time, even data
scientists started to second guess their own data, confidence in data quality fell,
and trust from decision makers degraded."

## Why the drift happens where it does

Each BI (business intelligence) tool, spreadsheet, and ad hoc query that embeds its own
copy of a metric formula is a place that copy can be edited without the others knowing.
The dbt (data build tool) Semantic Layer documentation frames its whole purpose against
this: it exists so teams can define metrics centrally in the modeling layer rather than
scattered across tools, and states that "moving metric definitions out of the BI layer
and into the modeling layer allows data teams to feel confident that different business
units are working from the same metric definitions, regardless of their tool of choice"
([dbt Developer Hub](https://docs.getdbt.com/docs/use-dbt-semantic-layer/dbt-sl)).

## The principle a semantic layer implements

Airbnb's answer was Minerva, a metric platform whose product vision is to let users
"define metrics once, use them everywhere." At the time of the write-up the platform
carried "more than 12,000 metrics and 4,000 dimensions," used across the company as
"the single source of truth for analytics, reporting, and experimentation." The dbt
documentation states the same property in maintenance terms: "if a metric definition
changes in dbt, it's refreshed everywhere it's invoked and creates consistency across
all applications."
The shared claim across both sources is structural, not stylistic: consistency comes
from there being exactly one definition to change, with every consumer downstream of
it.
