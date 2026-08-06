---
schema_version: 1
pack: working-skills/evidence-based-bug-reporting
title: Evidence-based bug reporting
maintainers: []
audience: anyone who files defects for someone else to fix - testers, developers, support staff, or users of any software project; no formal quality-assurance background needed
hours: 14-16
created: 2026-08-05
---

# Evidence-based bug reporting - pack provenance

Writing a defect report a stranger can reproduce and fix. Five modules: the anatomy of
a reproducible report (minimal steps, current versus expected behavior, environment),
evidence discipline (verified observation versus hypothesis, labeled confidence,
attachments that carry their provenance), severity versus priority as separate axes,
tracing a symptom toward the failing layer before filing and knowing when to stop, and
the report's life after filing - retests, corrections when a retest refutes you, and
closing the loop. Anchors are long-lived practitioner references: the Mozilla and
Chromium bug-writing guidelines, a classic essay on reporting symptoms rather than
theories, the Bugzilla field and status documentation, vendor severity policy, the
testing-certification syllabus's defect-management section, compiler-project
test-case-reduction docs, the git bisect manual, and industry writing on flaky tests
and blameless postmortems.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 11 archived anchors: bug-writing guidelines,
  symptom-versus-theory essay, field and lifecycle documentation, severity policy,
  defect-management syllabus section, test-case reduction and bisection docs, flaky-test
  and postmortem writing; 4 reference notes).
