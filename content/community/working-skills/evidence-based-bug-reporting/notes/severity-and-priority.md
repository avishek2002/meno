---
schema_version: 1
type: reference
title: Severity and priority are different axes
concepts:
  - severity-as-impact
  - priority-as-scheduling
  - severity-priority-divergence
sources:
  - title: "Understanding a Bug (Bugzilla documentation)"
    url: https://bugzilla.readthedocs.io/en/latest/using/understanding.html
    archived_url: https://web.archive.org/web/20260707234818/https://bugzilla.readthedocs.io/en/latest/using/understanding.html
    accessed: 2026-08-05
    source_type: web
    why: source of the two field definitions quoted here - severity from blocker to trivial, priority as the field used by whoever directs the assignee's time
  - title: "Severity level definitions (Red Hat Customer Portal, production support terms)"
    url: https://access.redhat.com/support/policy/severity
    archived_url: https://web.archive.org/web/20260510104234/https://access.redhat.com/support/policy/severity
    accessed: 2026-08-05
    source_type: web
    why: source for a severity scale defined entirely by operational impact, from serious interruption to business-critical operations down to non-urgent queries
  - title: "Defect Management - Foundation Level syllabus section 5.5 (ASTQB)"
    url: https://astqb.org/5-5-defect-management/
    archived_url: https://web.archive.org/web/20260805111455/https://astqb.org/5-5-defect-management/
    accessed: 2026-08-05
    source_type: web
    why: source for classification rules being a required part of defect management and for the decision on a suitable response being a distinct workflow step
---

# Severity and priority are different axes

## Two fields, two questions

Issue trackers that carry both fields define them differently on purpose. The
[Bugzilla documentation](https://bugzilla.readthedocs.io/en/latest/using/understanding.html)
describes Severity as indicating "how severe the problem is - from blocker
('application unusable') to trivial ('minor cosmetic issue')", and Priority as the field
"used to prioritize bugs, either by the assignee, or someone else with authority to
direct their time such as a project manager." Severity answers "how bad is this for the
people it hits?"; priority answers "when does fixing it beat the other things we could
do?" The first is a property of the defect; the second is a decision about the work.

## Severity scales are impact scales

Where organizations publish severity definitions, the levels are defined by
consequence, not by anyone's schedule. Red Hat's
[severity level definitions](https://access.redhat.com/support/policy/severity) run from
Severity 1, an issue "actively causing serious interruptions to your business critical
operations," down to Severity 4, "a non-urgent query" - every boundary is drawn in terms
of what the problem does to operations. That is what makes severity assessable by the
reporter at filing time: it requires knowing the impact, not the roadmap.

## The divergence is normal, not an error

Because the axes measure different things, they routinely point in different
directions: a crash in a feature nobody uses is high severity and can still be scheduled
behind a cosmetic defect on the product's most-trafficked screen. The
[ASTQB Foundation Level syllabus section on defect management](https://astqb.org/5-5-defect-management/)
reflects this separation in the workflow itself: defect management includes "rules for
their classification," and deciding "on a suitable response such as to fix or keep it as
it is" is its own step after logging and analysis - classification informs the
scheduling decision, but does not make it. A reporter's job is to state the impact with
evidence; the priority call belongs to whoever owns the queue, and a report that
conflates the two axes hides exactly the information that call needs.
