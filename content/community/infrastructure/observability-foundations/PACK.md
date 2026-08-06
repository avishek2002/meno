---
schema_version: 1
pack: infrastructure/observability-foundations
title: Observability foundations
maintainers: []
audience: developers who run a service in production but have never set up monitoring deliberately; comfortable in a shell and with YAML, no observability background assumed
hours: 16-18
created: 2026-08-05
---

# Observability foundations - pack provenance

Metrics, logs, and traces as three lenses on one problem: understanding a running
system from the outside. Module 1 defines the three signals and the cardinality cost
model that decides when each lens wins. Modules 2-4 go deep on the metrics lens -
Prometheus metric types and PromQL (Prometheus Query Language) selectors, Grafana
dashboards built from panels and template variables, and alert rules framed as query
plus threshold plus duration, evaluated against the Google Site Reliability
Engineering paging standards. Module 5 returns to traces: spans, context propagation,
and the judgment call of when tracing pays for itself.

Anchor sources are the primary documentation throughout: OpenTelemetry signal
definitions, Prometheus and Grafana documentation, the W3C (World Wide Web
Consortium) Trace Context Recommendation, and two chapters of the Google Site
Reliability Engineering book - all fetched and archived.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 15 archived anchors across OpenTelemetry,
  Prometheus, Grafana, W3C, and Google Site Reliability Engineering book sources;
  6 reference notes).
