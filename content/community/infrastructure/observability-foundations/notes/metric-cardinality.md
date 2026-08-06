---
schema_version: 1
type: reference
title: Cardinality - why labels are the cost center of a metrics system
concepts:
  - cardinality
sources:
  - title: "Data model (Prometheus documentation)"
    url: https://prometheus.io/docs/concepts/data_model/
    archived_url: https://web.archive.org/web/20260704050216/https://prometheus.io/docs/concepts/data_model/
    accessed: 2026-08-05
    source_type: web
    why: source of the mechanism - every change of any label value, including adding or removing a label, creates a new time series
  - title: "Instrumentation best practices (Prometheus documentation)"
    url: https://prometheus.io/docs/practices/instrumentation/
    archived_url: https://web.archive.org/web/20260801040020/https://prometheus.io/docs/practices/instrumentation/
    accessed: 2026-08-05
    source_type: web
    why: source of the budget numbers - keep cardinality below about 10, investigate over 100 - and the per-user-label example that produces tens of millions of series
---

# Cardinality - why labels are the cost center of a metrics system

## The mechanism

Prometheus stores all data as time series: per its
[data model](https://prometheus.io/docs/concepts/data_model/), streams of
timestamped values belonging to the same metric and the same set of labeled
dimensions. A series is identified by its metric name plus its full label set, in
notation like `api_http_requests_total{method="POST", handler="/messages"}`. The
consequence that matters: "the change of any label's value, including adding or
removing labels, will create a new time series." Cardinality is the count of those
distinct label combinations - and it multiplies, because each label's possible
values multiply against every other label's.

## The cost

The Prometheus
[instrumentation practices](https://prometheus.io/docs/practices/instrumentation/)
page states the cost plainly: "Each labelset is an additional time series that has
RAM, CPU, disk, and network costs" - RAM being random-access memory and CPU the
central processing unit. Its guidance is numeric: "try to keep the cardinality of
your metrics below 10," and for a metric over 100 - or with the
potential to grow that large - "investigate alternate solutions such as reducing the
number of dimensions or moving the analysis away from monitoring and to a
general-purpose processing system."

## The canonical blowup

The same page works the example of labeling a filesystem metric by user quota across
a fleet: 10,000 nodes times 10,000 users yields a double-digit number of millions of
time series - beyond what a Prometheus server is expected to handle. Unbounded label
values (user identifiers, email addresses, request identifiers) are the classic way a
well-intentioned metric becomes one: the label set turns the metric into one series
per entity, which is the workload of an events system, not a metrics system. This is
the structural reason high-cardinality questions ("what happened to this one user's
request?") belong to logs or traces, while metrics stay the lens for bounded,
aggregate dimensions.
