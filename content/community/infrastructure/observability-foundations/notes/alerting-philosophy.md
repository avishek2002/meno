---
schema_version: 1
type: reference
title: Alerting philosophy - rule anatomy, symptoms vs causes, and the paging standards
concepts:
  - alert-rule-anatomy
  - symptom-vs-cause
  - alert-fatigue
sources:
  - title: "Alerting rules (Prometheus documentation)"
    url: https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
    archived_url: https://web.archive.org/web/20260708190934/https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
    accessed: 2026-08-05
    source_type: web
    why: source of the concrete rule anatomy - an expr condition with a threshold and a for duration - and the pending state semantics
  - title: "Monitoring distributed systems (Google Site Reliability Engineering book)"
    url: https://sre.google/sre-book/monitoring-distributed-systems/
    archived_url: https://web.archive.org/web/20260803101906/https://sre.google/sre-book/monitoring-distributed-systems/
    accessed: 2026-08-05
    source_type: web
    why: source of the what-versus-why distinction, the four golden signals, and the paging standards quoted here - urgent, actionable, requiring intelligence
  - title: "Practical alerting from time-series data (Google Site Reliability Engineering book)"
    url: https://sre.google/sre-book/practical-alerting/
    archived_url: https://web.archive.org/web/20260531211804/https://sre.google/sre-book/practical-alerting/
    accessed: 2026-08-05
    source_type: web
    why: source of the anti-flap minimum duration - a rule must hold true for at least two evaluation cycles before an alert is sent - and the white-box blind-spot caveat
---

# Alerting philosophy - rule anatomy, symptoms vs causes, and the paging standards

## An alert rule is a query, a threshold, and a duration

In Prometheus's
[alerting rules](https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/),
a rule names an alert, gives an `expr` (a PromQL (Prometheus Query Language)
expression whose result is the condition, threshold included, such as
`job:request_latency_seconds:mean5m{job="myjob"} > 0.5`), and an optional `for`
duration. The `for` clause "causes Prometheus to wait for a certain duration between
first encountering a new expression output vector element and counting an alert as
firing for this element"; until then the element "is active, but not firing yet" -
the pending state. Labels route the alert (for example a severity), annotations
carry the human-facing summary.

The duration is not decoration. The Google Site Reliability Engineering book's
[practical alerting chapter](https://sre.google/sre-book/practical-alerting/)
explains the failure it prevents: alerts "can 'flap' (toggle their state quickly);
therefore, the rules allow a minimum duration for which the alerting rule must be
true before the alert is sent," recommending "at least two rule evaluation cycles"
so a missed collection cannot fire a false alert.

## Symptoms versus causes

The book's
[monitoring chapter](https://sre.google/sre-book/monitoring-distributed-systems/)
frames monitoring around two questions: what is broken, and why. Serving HTTP
(Hypertext Transfer Protocol) 500 errors is a what - a symptom users experience;
database servers refusing connections is a why - one possible cause behind it. The
chapter calls this "one of the most important distinctions in writing good
monitoring with maximum signal and minimum noise," and its paging advice follows
from it: "it's better to spend much more effort on catching symptoms than causes."
A symptom-based page fires only when users are actually affected; a cause-based
alert fires on conditions that may or may not matter, which is where noise comes
from. Its companion guidance for what to measure is the four golden signals -
latency, traffic, errors, and saturation: "If you can only measure four metrics of
your user-facing system, focus on these four." The practical alerting chapter adds
the boundary of the approach: white-box monitoring only sees what arrives - a
failed DNS (Domain Name System) lookup being its example, "the queries that never
make it due to a DNS error are invisible" - so some external, user-perspective
probing has to back it up.

## The paging standards and alert fatigue

The monitoring chapter sets a bar for every page: "Every time the pager goes off, I
should be able to react with a sense of urgency"; "Every page should be
actionable"; and "Every page response should require intelligence. If a page merely
merits a robotic response, it shouldn't be a page." Pages that fail these tests -
non-urgent, non-actionable, or robotic - train responders to ignore the pager, which
is precisely the fatigue that lets a real incident slip through. The standards are
the working test for pruning an alert set: an alert that cannot meet them belongs in
a dashboard or a ticket queue, not on a pager.
