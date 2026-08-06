---
schema_version: 1
type: reference
title: Trace anatomy and context propagation
concepts:
  - spans
  - context-propagation
sources:
  - title: "Traces (OpenTelemetry documentation)"
    url: https://opentelemetry.io/docs/concepts/signals/traces/
    archived_url: https://web.archive.org/web/20260803070610/https://opentelemetry.io/docs/concepts/signals/traces/
    accessed: 2026-08-05
    source_type: web
    why: source of the span anatomy - attributes, events, links, status, kind - and the statement that context propagation is the core concept enabling distributed tracing
  - title: "Context propagation (OpenTelemetry documentation)"
    url: https://opentelemetry.io/docs/concepts/context-propagation/
    archived_url: https://web.archive.org/web/20260729143007/https://opentelemetry.io/docs/concepts/context-propagation/
    accessed: 2026-08-05
    source_type: web
    why: source of the context and propagation definitions and the service-A-to-service-B parenting walkthrough quoted here
  - title: "Trace Context (W3C Recommendation)"
    url: https://www.w3.org/TR/trace-context/
    archived_url: https://web.archive.org/web/20260803070439/https://www.w3.org/TR/trace-context/
    accessed: 2026-08-05
    source_type: web
    why: source of the traceparent header fields - version, trace-id, parent-id, trace-flags - and the cross-vendor correlation problem the standard solves
---

# Trace anatomy and context propagation

## Spans, the building blocks

Per the OpenTelemetry
[traces documentation](https://opentelemetry.io/docs/concepts/signals/traces/),
"traces give us the big picture of what happens when a request is made to an
application," and "a span represents a unit of work or operation. Spans are the
building blocks of Traces." A span carries **attributes** (key-value metadata about
the operation), **events** (structured annotations marking a point in time within
the span), **links** (associations to other spans implying a causal relationship),
a **status** (Unset by default, Error on failure, Ok for an explicit success mark),
and a **kind** - Client, Server, Internal, Producer, or Consumer - which "provides a
hint to the tracing backend as to how the trace should be assembled." The first span
of a trace, the root span, represents the request end to end; every other span nests
under a parent.

## How spans from different services become one trace

The traces page names the mechanism: context propagation is "the core concept that
enables Distributed Tracing. With Context Propagation, Spans can be correlated with
each other and assembled into a trace, regardless of where Spans are generated."
The [context propagation page](https://opentelemetry.io/docs/concepts/context-propagation/)
defines the two halves: context is "an object that contains the information for the
sending and receiving service, or execution unit, to correlate one signal with
another," and propagation is "the mechanism that moves context between services and
processes," serializing and deserializing it at each hop. Concretely: "When Service
A calls Service B, Service A includes a trace ID and a span ID as part of the
context. Service B uses these values to create a new span that belongs to the same
trace, setting the span from Service A as its parent."

## The wire format - W3C traceparent

OpenTelemetry's default propagator uses the HTTP (Hypertext Transfer Protocol)
headers specified by the
[W3C (World Wide Web Consortium) Trace Context Recommendation](https://www.w3.org/TR/trace-context/),
which "defines standard HTTP headers and a value format to propagate context
information that enables distributed tracing scenarios." The `traceparent` header carries four
fields - `version`, `trace-id` (32 hexadecimal characters identifying the whole
trace), `parent-id` (16 hexadecimal characters identifying the calling span), and
`trace-flags` (currently defining the sampled bit) - for example
`00-0af7651916cd43dd8448eb211c80319c-00f067aa0ba902b7-01`. A companion `tracestate`
header carries vendor-specific key-value pairs. The Recommendation exists because,
without a shared format, traces collected by different vendors "cannot be
correlated as there is no shared unique identifier" and cannot be propagated across
vendor boundaries - the standard is what lets instrumentation from different
ecosystems assemble into one trace.
