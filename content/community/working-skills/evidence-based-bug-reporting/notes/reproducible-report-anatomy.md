---
schema_version: 1
type: reference
title: The anatomy of a reproducible defect report
concepts:
  - minimal-repro-steps
  - expected-vs-actual
  - environment-record
sources:
  - title: "Bug writing guidelines (Mozilla, Bugzilla page)"
    url: https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html
    archived_url: https://web.archive.org/web/20260712083111/https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html
    accessed: 2026-08-05
    source_type: web
    why: source of the field list - summary, steps to reproduce, expected versus actual results, build and operating-system details - and of the claims that steps are the most important part and that a reproducible bug is very likely to be fixed
  - title: "Bug reporting guidelines (the Chromium Projects)"
    url: https://www.chromium.org/for-testers/bug-reporting-guidelines/
    archived_url: https://web.archive.org/web/20260803040747/https://www.chromium.org/for-testers/bug-reporting-guidelines/
    accessed: 2026-08-05
    source_type: web
    why: independent confirmation of the same anatomy from a second major project - detailed steps, expected behavior, current-build verification, simplified tests and screenshots as attachments
  - title: "How to Report Bugs Effectively (Simon Tatham)"
    url: https://www.chiark.greenend.org.uk/~sgtatham/bugs.html
    archived_url: https://web.archive.org/web/20260803213444/https://www.chiark.greenend.org.uk/~sgtatham/bugs.html
    accessed: 2026-08-05
    source_type: web
    why: source for why "it does not work" fails as a report and for the instruction to say exactly what you saw and exactly what you expected to see
---

# The anatomy of a reproducible defect report

## The parts every major guideline agrees on

Mozilla's [bug writing guidelines](https://bugzilla.mozilla.org/page.cgi?id=bug-writing.html)
prescribe a stable anatomy: a short summary that uniquely identifies the problem without
proposing a solution, steps to reproduce, expected versus actual results, and the
environment - build identifier, operating system, and whether the problem still appears
in a fresh profile. The guidelines call steps to reproduce "the most important part of
any bug report" and ask for the intent of each action, not just the click. They also
require one bug per report, so each issue gets its own fix workflow.

The [Chromium bug reporting guidelines](https://www.chromium.org/for-testers/bug-reporting-guidelines/)
independently prescribe the same skeleton for a different project: a description of the
problem, detailed steps to replicate it, the expected behavior, verification against the
latest build and against other browsers, and attachments - screenshots when they might
help, or a simplified test that demonstrates the problem for complex cases.

## Why the anatomy is shaped this way

The report is written for a stranger who was not at the keyboard. Simon Tatham's essay
[How to Report Bugs Effectively](https://www.chiark.greenend.org.uk/~sgtatham/bugs.html)
explains the failure the anatomy exists to prevent: "it doesn't work" carries almost no
information, because "if the program really didn't work at all, they would probably have
noticed." The fix is specificity on both sides of the comparison: "Tell them exactly
what you saw. Tell them why you think what you saw is wrong; better still, tell them
exactly what you expected to see." Error messages go in verbatim, numbers intact,
because those details are diagnostic.

The payoff claim is explicit in the Mozilla guidelines: "if a developer is able to
reproduce the bug, the bug is very likely to be fixed." Reproducibility is not a
formality of good reports; it is the property the whole anatomy - minimal steps, a
precise expected-versus-actual pair, and an environment record - is engineered to
deliver.
