---
schema_version: 1
type: reference
title: Grafana dashboard building blocks - panels, variables, and purpose
concepts:
  - panels-and-queries
  - template-variables
  - dashboard-audience
sources:
  - title: "Panels and visualizations (Grafana documentation)"
    url: https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/
    archived_url: https://web.archive.org/web/20260714225111/https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/
    accessed: 2026-08-05
    source_type: web
    why: source of the panel definition - the basic dashboard building block, composed of a query and a visualization of the query results
  - title: "Variables (Grafana documentation)"
    url: https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/
    archived_url: https://web.archive.org/web/20260710115951/https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/
    accessed: 2026-08-05
    source_type: web
    why: source of the variable definition - a placeholder referenced with dollar syntax - and the single-source-dashboard rationale
  - title: "Dashboard best practices (Grafana documentation)"
    url: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
    archived_url: https://web.archive.org/web/20260730002843/https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
    accessed: 2026-08-05
    source_type: web
    why: source of the story-or-question rule, the USE and RED methods, the alert-on-symptoms link to RED dashboards, and the dashboard-sprawl warning
---

# Grafana dashboard building blocks - panels, variables, and purpose

## Panels

Per the Grafana
[panels and visualizations](https://grafana.com/docs/grafana/latest/visualizations/panels-visualizations/)
documentation, "Panels are the basic building block in Grafana dashboards, composed
of a query and a visualization, a graphical representation of query results." The
query does the deciding (what data, over what range); the visualization does the
presenting, and the same query result can render as a time series graph, a heatmap,
a table, or a single stat depending on what the data's shape calls for.

## Template variables

A dashboard hard-coded to one service must be copied for the next service. Grafana's
[variables](https://grafana.com/docs/grafana/latest/visualizations/dashboards/variables/)
documentation defines the alternative: a variable is "a placeholder for a value that
you can use in dashboard queries, panel titles, links, and other dashboard
elements," referenced with dollar syntax (a query containing text starting with `$`
is a template). Viewers "change what the dashboard displays without editing the
dashboard," and Grafana updates every element using the variable. The payoff the
documentation names is the single-source dashboard: one dashboard serving many
scenarios, which "reduces dashboard duplication and maintenance."

## Purpose and audience

The Grafana
[best practices](https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/)
guide anchors dashboard design in intent: "A dashboard should tell a story or answer
a question," and if a dashboard has no goal, the guide's hint is to ask whether it is
needed at all. It names the common framings for system-health views: the USE method
(utilization, saturation, errors) for infrastructure resources, the RED method
(rate, errors, duration) for services and user experience, and the four golden
signals combining latency, traffic, errors, and saturation. It also connects
dashboards to alerting - "the best practice of alerting is to alert on symptoms
rather than causes, so alerting should be done on RED dashboards" - and warns
against dashboard sprawl, "the uncontrolled growth of dashboards," recommending
periodic review and removal of dashboards that no longer earn their place. A
system-health dashboard and a business-facing dashboard answer different questions
for different audiences; the story-or-question rule is what keeps them from being
mixed into one unreadable page.
