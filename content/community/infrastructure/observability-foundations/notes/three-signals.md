---
schema_version: 1
type: reference
title: The three signals - what metrics, logs, and traces each record
concepts:
  - signal-definitions
  - choosing-a-lens
sources:
  - title: "Signals (OpenTelemetry documentation)"
    url: https://opentelemetry.io/docs/concepts/signals/
    archived_url: https://web.archive.org/web/20260626061613/https://opentelemetry.io/docs/concepts/signals/
    accessed: 2026-08-05
    source_type: web
    why: source of the one-line signal definitions - traces as the path of a request, metrics as a measurement captured at runtime, logs as a recording of an event
  - title: "Observability primer (OpenTelemetry documentation)"
    url: https://opentelemetry.io/docs/concepts/observability-primer/
    archived_url: https://web.archive.org/web/20260624134334/https://opentelemetry.io/docs/concepts/observability-primer/
    accessed: 2026-08-05
    source_type: web
    why: source of the observability definition and the fuller descriptions - logs as timestamped messages that lack context until correlated, metrics as aggregations of numeric data, a trace as the path of a request through multiple services
---

# The three signals - what metrics, logs, and traces each record

## Observability, defined

The OpenTelemetry
[observability primer](https://opentelemetry.io/docs/concepts/observability-primer/)
defines the goal all three signals serve: "Observability lets you understand a system
from the outside by letting you ask questions about that system without knowing its
inner workings." The signals are not three separate disciplines; they are three ways
of recording what one running system did, each answering a different shape of
question.

## The three definitions

The OpenTelemetry [signals page](https://opentelemetry.io/docs/concepts/signals/)
gives each signal a one-line identity:

- A **trace** is "the path of a request through your application."
- A **metric** is "a measurement captured at runtime."
- A **log** is "a recording of an event."

The primer fills these out. A log is "a timestamped message emitted by services or
other components" - a statement that something happened, at a moment, in one place.
Metrics are "aggregations over a period of time of numeric data about your
infrastructure or application" - request rate, error rate, CPU (central processing
unit) utilization - numbers summarized across many events rather than records of any
single one. A distributed trace "records the path taken by a single request (made
by an application or end user) as it propagates through multiple services in an
architecture," built from spans, where "a span represents a single unit of work or
operation."

## What each lens misses

The definitions themselves mark the boundaries. Because a metric is an aggregation,
it can say that some requests were slow without being able to show any particular
slow request. Because a log is a single timestamped message, the primer notes logs
lack broader context on their own and become far more useful when correlated with a
span or trace - one line rarely explains a cross-service failure by itself. Because a
trace follows one request's path, it is the lens that reconstructs what happened to a
specific request across services, which neither an aggregate number nor an isolated
message can do. Which lens wins depends on whether the question is about a trend
(metrics), a specific local event (logs), or the journey of one request (traces).
