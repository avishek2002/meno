---
schema_version: 1
type: reference
title: Observation versus hypothesis in a defect report
concepts:
  - observation-vs-hypothesis
  - confidence-labeling
  - evidence-provenance
sources:
  - title: "How to Report Bugs Effectively (Simon Tatham)"
    url: https://www.chiark.greenend.org.uk/~sgtatham/bugs.html
    archived_url: https://web.archive.org/web/20260803213444/https://www.chiark.greenend.org.uk/~sgtatham/bugs.html
    accessed: 2026-08-05
    source_type: web
    why: source of the facts-versus-speculations rule and of the guidance that intermittency patterns are worth reporting because even probabilistic information helps reproduction
  - title: "Bug writing guidelines (Mozilla, Bugzilla page)"
    url: https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html
    archived_url: https://web.archive.org/web/20260712083111/https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html
    accessed: 2026-08-05
    source_type: web
    why: source for the instruction to separate facts (observations) from speculations when writing expected and actual results, and for evidence arriving tied to a build identifier and issue-specific attachments
  - title: "Flaky Tests at Google and How We Mitigate Them (Google Testing Blog)"
    url: https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
    archived_url: https://web.archive.org/web/20260802232124/https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html
    accessed: 2026-08-05
    source_type: web
    why: source for nondeterministic pass/fail on identical code and for reruns as the way to distinguish environmental noise from genuine defects
---

# Observation versus hypothesis in a defect report

## Two kinds of claim

A defect report mixes two kinds of statement: what the reporter directly observed, and
what the reporter believes explains it. Simon Tatham's
[How to Report Bugs Effectively](https://www.chiark.greenend.org.uk/~sgtatham/bugs.html)
states the discipline: "try to make very clear what are actual facts ('I was at the
computer and this happened') and what are speculations." Mozilla's
[bug writing guidelines](https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html) build
the same separation into the report's structure, asking writers to keep "facts
(observations)" apart from "speculations" in the expected and actual results. A
hypothesis is welcome in a report - it can save the fixer time - but only when labeled
as one, because a wrong theory presented as fact aims the investigation at the wrong
place.

## Confidence is part of the claim

"It fails" and "it failed once in ten tries" are different observations, and the
difference matters to whoever reproduces it. Tatham advises reporting the pattern even
when it is only statistical - how often the failure occurs and under what conditions -
because probabilistic information still narrows the search. Industrial testing practice
supports the caution: the Google Testing Blog's
[account of flaky tests](https://testing.googleblog.com/2016/05/flaky-tests-at-google-and-how-we.html)
documents tests that pass and fail nondeterministically on identical code, and describes
deliberate reruns as the way to distinguish environmental noise from a genuine defect. A
single run, in either direction, is weak evidence; a report that states its trial count
lets the reader weigh it correctly.

## Evidence carries its provenance

A screenshot or log excerpt is itself a claim - "this is what the system produced" - and
like any claim it needs provenance: which build, which environment, which steps produced
it. The Mozilla guidelines make this concrete by tying every report to a build
identifier and operating system and by requiring issue-specific artifacts, such as a
stack trace for a crash or a performance profile for a performance problem. An
attachment whose origin is unstated cannot be matched against the fixer's own attempt to
reproduce, which is the only use the fixer has for it.
