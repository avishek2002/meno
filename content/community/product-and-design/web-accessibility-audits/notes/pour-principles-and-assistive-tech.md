---
schema_version: 1
type: reference
title: The POUR principles, assistive technologies, and how the web actually fails
concepts:
  - pour-principles
  - disability-and-assistive-tech
  - common-failure-patterns
sources:
  - title: "Introduction to Web Accessibility (W3C Web Accessibility Initiative)"
    url: https://www.w3.org/WAI/fundamentals/accessibility-intro/
    archived_url: https://web.archive.org/web/20260730163844/https://www.w3.org/WAI/fundamentals/accessibility-intro/
    accessed: 2026-08-05
    source_type: web
    why: source of the definition of web accessibility, the disability groups it covers, and the situational and temporary limits that widen who benefits
  - title: "Web Content Accessibility Guidelines (WCAG) 2.2 (W3C Recommendation)"
    url: https://www.w3.org/TR/WCAG22/
    archived_url: https://web.archive.org/web/20260804030006/https://www.w3.org/TR/WCAG22/
    accessed: 2026-08-05
    source_type: web
    why: source of the four POUR principles and the A, AA, AAA conformance levels
  - title: "The WebAIM Million - annual accessibility analysis of the top 1,000,000 home pages (WebAIM)"
    url: https://webaim.org/projects/million/
    archived_url: https://web.archive.org/web/20260802181357/https://webaim.org/projects/million/
    accessed: 2026-08-05
    source_type: web
    why: source of the failure-frequency figures - six error types account for 96 percent of detected errors across a million home pages
  - title: "Screen Reader User Survey #10 Results (WebAIM)"
    url: https://webaim.org/projects/screenreadersurvey10/
    archived_url: https://web.archive.org/web/20260630101645/https://webaim.org/projects/screenreadersurvey10/
    accessed: 2026-08-05
    source_type: web
    why: source of the screen reader usage shares, the heading-first navigation figure, and the problematic-items list topped by CAPTCHA
---

# The POUR principles, assistive technologies, and how the web actually fails

## What web accessibility means

The W3C Web Accessibility Initiative (WAI) defines web accessibility as websites, tools,
and technologies designed and developed so that people with disabilities can "perceive,
understand, navigate, and interact with the Web" and contribute to it
([WAI introduction](https://www.w3.org/WAI/fundamentals/accessibility-intro/)). The
definition spans auditory, cognitive, neurological, physical, speech, and visual
disabilities - and the same page is explicit that accessible design also serves people
without disabilities: mobile users on small screens, older adults, people with a broken
arm or lost glasses, and anyone in bright sunlight or on a slow connection.

## The four principles and three levels

WCAG (Web Content Accessibility Guidelines) 2.2, a W3C Recommendation, organizes every
requirement under four principles: content must be perceivable, operable,
understandable, and robust - POUR ([WCAG 2.2](https://www.w3.org/TR/WCAG22/)). Each
success criterion carries a conformance level: A (lowest), AA, or AAA (highest). AA is
the level this pack audits against, and the level most policies reference. WCAG 2.2 is
backward-compatible with earlier 2.x versions; auditing against 2.2 AA covers the
criteria of 2.0 and 2.1 AA plus the additions new in 2.2.

The principles are the audit's sorting bins: a low-contrast label is a perceivability
failure, a mouse-only menu an operability failure, an unlabeled input that a screen
reader announces as just "edit" a robustness failure in how the page exposes itself to
software.

## What assistive technologies need from a page

Assistive technologies consume the page's programmatic structure, not its pixels.
WebAIM's tenth screen reader user survey (1,539 respondents) found NVDA commonly used
by 65.6 percent of respondents and JAWS by 60.5 percent, with VoiceOver at 43.9
percent ([survey #10](https://webaim.org/projects/screenreadersurvey10/)). The survey's
sharpest practical finding is navigational: 71.6 percent of respondents navigate a
lengthy page by its headings first, which makes heading structure a primary interface,
not a styling nicety. Keyboard emulators - speech input, switch devices - likewise
depend on the page being fully operable through the keyboard interface.

## How the web actually fails

The WebAIM Million, an annual automated evaluation of the rendered DOM (Document
Object Model) of the top one million home pages, finds the same small set of defects
dominating year after year ([WebAIM Million](https://webaim.org/projects/million/)).
In the February 2026 edition, six error types accounted for 96 percent of all detected
errors: low-contrast text (on 83.9 percent of pages), missing image alternative text
(53.1 percent), missing form input labels (51 percent), empty links (46.3 percent),
empty buttons (30.6 percent), and missing document language (13.5 percent). An auditor
who checks nothing but these six will already have found most of what an automated
scan can detect - and the survey's barrier list (CAPTCHAs worst by a notable margin)
shows the harm lands on the users least able to route around it.
