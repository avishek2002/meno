---
schema_version: 1
type: reference
title: Prometheus metric types and PromQL selector grammar
concepts:
  - metric-types
  - promql-selectors
  - histogram-queries
sources:
  - title: "Metric types (Prometheus documentation)"
    url: https://prometheus.io/docs/concepts/metric_types/
    archived_url: https://web.archive.org/web/20260804032600/https://prometheus.io/docs/concepts/metric_types/
    accessed: 2026-08-05
    source_type: web
    why: source of the counter, gauge, histogram, and summary definitions, the counter-must-not-decrease rule, and the series a histogram exposes
  - title: "Querying basics - PromQL (Prometheus documentation)"
    url: https://prometheus.io/docs/prometheus/latest/querying/basics/
    archived_url: https://web.archive.org/web/20260804032549/https://prometheus.io/docs/prometheus/latest/querying/basics/
    accessed: 2026-08-05
    source_type: web
    why: source of the PromQL definition, the instant and range vector types, and the label matcher operators
---

# Prometheus metric types and PromQL selector grammar

## The four metric types

The Prometheus [metric types](https://prometheus.io/docs/concepts/metric_types/)
page defines four:

- **Counter**: "a cumulative metric that represents a single monotonically
  increasing counter whose value can only increase or be reset to zero on restart."
  The page is explicit about misuse: "Do not use a counter to expose a value that
  can decrease" - the number of currently running processes belongs in a gauge.
- **Gauge**: "a metric that represents a single numerical value that can arbitrarily
  go up and down" - temperatures, memory in use, concurrent requests.
- **Histogram**: "records observations (usually things like request durations or
  response sizes) by counting them in configurable buckets." A classic histogram
  named `basename` exposes multiple series: cumulative bucket counters
  (`basename_bucket`), the sum of observed values (`basename_sum`), and the count of
  events (`basename_count`). This is what makes latency questions answerable from
  aggregated data: the distribution ships as a set of counters.
- **Summary**: "samples observations (usually things like request durations and
  response sizes)" and calculates configurable quantiles over a sliding time window,
  exposing quantile series alongside a sum and count.

## PromQL in one paragraph

Per the [querying basics](https://prometheus.io/docs/prometheus/latest/querying/basics/)
page, "Prometheus provides a functional query language called PromQL (Prometheus
Query Language) that lets the user select and aggregate time series data in real
time." Expressions evaluate to one of four types, two of which carry the weight: an
**instant vector** is "a set of time series containing a single sample for each time
series, all sharing the same timestamp," and a **range vector** is "a set of time
series containing a range of data points over time for each time series," selected
with bracketed durations like `[5m]`.

## Selectors and matchers

Selection starts from a metric name (`http_requests_total`) and narrows with label
matchers in curly braces: `=` (exact), `!=` (negated), `=~` (regular expression,
fully anchored), and `!~` (negated regular expression). For example,
`http_requests_total{job="prometheus",group="canary"}` selects only the series
carrying both labels. A selector must specify a metric name or at least one
non-empty label matcher, so a query can never accidentally mean "everything."
