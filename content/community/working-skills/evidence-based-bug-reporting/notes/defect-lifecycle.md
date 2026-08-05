---
schema_version: 1
type: reference
title: The defect report lifecycle - states, retests, and corrections
concepts:
  - lifecycle-states
  - retest-verification
  - publishing-corrections
sources:
  - title: "Bug statuses and resolutions (Mozilla wiki, BMO user guide)"
    url: https://wiki.mozilla.org/BMO/UserGuide/BugStatuses
    archived_url: https://web.archive.org/web/20260802181914/https://wiki.mozilla.org/BMO/UserGuide/BugStatuses
    accessed: 2026-08-05
    source_type: web
    why: source of the status and resolution definitions quoted here - UNCONFIRMED, RESOLVED, VERIFIED, REOPENED, and the no-fix resolutions INVALID, WONTFIX, DUPLICATE, WORKSFORME, INCOMPLETE
  - title: "Defect Management - Foundation Level syllabus section 5.5 (ASTQB)"
    url: https://astqb.org/5-5-defect-management/
    archived_url: https://web.archive.org/web/20260805111455/https://astqb.org/5-5-defect-management/
    accessed: 2026-08-05
    source_type: web
    why: source for the discovery-to-closure workflow framing and for reported anomalies sometimes resolving as something other than a defect, such as a false-positive result
  - title: "Postmortem Culture: Learning from Failure (Google Site Reliability Engineering book)"
    url: https://sre.google/sre-book/postmortem-culture/
    archived_url: https://web.archive.org/web/20260803100934/https://sre.google/sre-book/postmortem-culture/
    accessed: 2026-08-05
    source_type: web
    why: source for the written, reviewed, and shared record as the mechanism that turns a failure into learning, and for the blameless premise that systems and processes get fixed rather than people
---

# The defect report lifecycle - states, retests, and corrections

## Filing is the start, not the end

The [ASTQB Foundation Level syllabus](https://astqb.org/5-5-defect-management/) defines
defect management as "a workflow for handling individual defects or anomalies from their
discovery to their closure": log the reported anomalies, analyze and classify them,
decide on a suitable response, and finally close the report. It also states plainly that
reported anomalies "may turn out to be real defects or something else" - a
false-positive result, or a change request - and that this is resolved during the
process. A reporter who treats filing as the end of the job never learns which of those
their report was.

## The state machine

Mozilla's [status and resolution definitions](https://wiki.mozilla.org/BMO/UserGuide/BugStatuses)
document one fully specified example; the state names below are Mozilla's own, not an
industry standard, and trackers differ in both the states they define and what they
mean by them. A report enters as UNCONFIRMED ("nobody has validated that
this bug is true"), and when work concludes it becomes RESOLVED - "a resolution has been
performed, and it is awaiting verification by QA" - then VERIFIED once someone has
retested and "agrees that the appropriate resolution has been taken." REOPENED exists
for the case where "this bug was once resolved, but the resolution was deemed
incorrect." Not every resolution is a fix: INVALID ("the problem described is not a
bug"), WONTFIX, DUPLICATE, WORKSFORME (reproduction attempts failed), and INCOMPLETE
(not enough information to proceed) all close a report without changing the software.
The retest between RESOLVED and VERIFIED is the reporter's side of the contract: the
claim "this is fixed" gets the same evidence discipline as the claim "this is broken."

## Corrections close the loop

When a retest refutes the original claim - the failure was environmental, the report was
a duplicate, the fix does not hold - the honest move is a published correction, not a
quiet exit. The Google Site Reliability Engineering book's
[postmortem chapter](https://sre.google/sre-book/postmortem-culture/) describes the
general mechanism: a written record of what happened, its impact, and its root causes,
reviewed and shared so the organization learns from it, under the blameless premise that
"you can't 'fix' people, but you can fix systems and processes" - and it warns that "an
unreviewed postmortem might as well never have existed." Scaled down to a single defect
report, the same logic holds: a report reclassified without a stated reason teaches
nobody anything, while a one-line correction - what was claimed, what the retest showed,
what the record now says - lets everyone who acted on the original claim update with it.
