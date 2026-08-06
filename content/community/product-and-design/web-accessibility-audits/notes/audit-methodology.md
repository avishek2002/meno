---
schema_version: 1
type: reference
title: Audit methodology - WCAG-EM, tool limits, and the confirmed-versus-judgment split
concepts:
  - audit-scoping-and-sampling
  - automated-vs-human-checks
  - findings-and-severity
sources:
  - title: "Website Accessibility Conformance Evaluation Methodology (WCAG-EM) 2.0 (W3C Group Note)"
    url: https://www.w3.org/TR/WCAG-EM/
    archived_url: https://web.archive.org/web/20260726165503/https://www.w3.org/TR/WCAG-EM/
    accessed: 2026-08-05
    source_type: web
    why: source of the five evaluation steps, the sampling approach, and the statement that most accessibility checks are not fully automatable
  - title: "Evaluating Web Accessibility Overview (W3C Web Accessibility Initiative)"
    url: https://www.w3.org/WAI/test-evaluate/
    archived_url: https://web.archive.org/web/20260802172233/https://www.w3.org/WAI/test-evaluate/
    accessed: 2026-08-05
    source_type: web
    why: source of the no-tool-alone and knowledgeable-human-evaluation statements, the evaluate-early guidance, and the recommendation to involve users with disabilities
  - title: "The WebAIM Million - annual accessibility analysis of the top 1,000,000 home pages (WebAIM)"
    url: https://webaim.org/projects/million/
    archived_url: https://web.archive.org/web/20260802181357/https://webaim.org/projects/million/
    accessed: 2026-08-05
    source_type: web
    why: a worked demonstration of what purely machine-detectable checks against the rendered DOM find at scale, grounding this note's confirmed-versus-judgment split
---

# Audit methodology - WCAG-EM, tool limits, and the confirmed-versus-judgment split

## The five steps of WCAG-EM

WCAG-EM (Website Accessibility Conformance Evaluation Methodology) 2.0, a W3C Group
Note, structures a conformance evaluation into five steps
([WCAG-EM](https://www.w3.org/TR/WCAG-EM/)): define the evaluation scope (what is
being evaluated, to which conformance level); explore the target to identify common
views, essential functionality, content variety, and technologies; select a
representative sample - structured selection covering what exploration found, plus a
random sample sized at 10 percent of the structured set, plus complete user
processes end to end; evaluate the sample against the WCAG success criteria; and
report the findings. The methodology is written to be tool-independent and usable by
consultants, developers, product owners, and compliance staff alike.

## What automation can and cannot decide

WCAG-EM is direct about the limits of tooling: evaluation tools can significantly
assist, but "most accessibility checks are not fully automatable." The WAI evaluation
overview draws the same line for tool users: "no tool alone can determine if a site
meets accessibility standards," and knowledgeable human evaluation is required
([WAI evaluating overview](https://www.w3.org/WAI/test-evaluate/)). The same page
recommends starting evaluation early in development, using simple preliminary checks
before any formal audit, and involving people with disabilities to see the experience
beyond the checklist.

The WebAIM Million shows what the automatable side looks like at scale: an automated
pass over the rendered DOM of a million home pages reliably detects failures like
low-contrast text, missing alternative text, missing labels, and empty links or
buttons ([WebAIM Million](https://webaim.org/projects/million/)). Those defects share
a shape - the evidence is present in the DOM itself, so the check is decidable by
inspection.

## Confirmed findings versus judgment calls

That shape suggests the discipline this pack teaches for audit write-ups: separate
findings by the kind of evidence behind them.

- DOM-confirmed failures: the defect is objectively present in the page as delivered -
  a form control with no programmatic label, a contrast ratio computed below 4.5 to 1,
  a button reachable only by pointer. These carry the criterion number, the selector
  or snippet as evidence, and need no hedging.
- High-confidence judgment calls: the checks automation cannot decide - whether
  alternative text actually describes the image, whether focus order preserves
  meaning, whether a dialog's focus behavior matches user expectation. These are
  exactly the majority of checks WCAG-EM says are not fully automatable; they belong
  in the report with the reasoning stated, not silently mixed in with the mechanical
  findings.

Keeping the two classes distinct keeps the report honest and actionable: a developer
can fix every confirmed finding without debate, and knows which items merit a
conversation. Severity then orders the work - how central the affected functionality
is and how completely it blocks a user - and every finding pairs its evidence with a
concrete fix, which is what turns an audit from a compliance artifact into a repair
plan.
