---
schema_version: 1
type: reference
title: Accessible names, roles, and the first rule of ARIA
concepts:
  - accessible-names
  - roles-and-semantics
  - aria-last-resort
sources:
  - title: "Understanding Success Criterion 4.1.2: Name, Role, Value (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
    archived_url: https://web.archive.org/web/20260730171102/https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html
    accessed: 2026-08-05
    source_type: web
    why: source of the criterion text, its Level A status, and the standard-versus-custom control distinction
  - title: "Using ARIA (W3C)"
    url: https://www.w3.org/TR/using-aria/
    archived_url: https://web.archive.org/web/20260723112820/https://www.w3.org/TR/using-aria/
    accessed: 2026-08-05
    source_type: web
    why: source of the first and second rules of ARIA use quoted in this note
  - title: "ARIA - Accessibility (MDN Web Docs)"
    url: https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA
    archived_url: https://web.archive.org/web/20260803181556/https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA
    accessed: 2026-08-05
    source_type: web
    why: source for what ARIA is (roles, states, properties), that authors must script the behavior it does not add, and the no-ARIA-is-better-than-bad-ARIA warning with the 41 percent error figure
  - title: "Creating Accessible Forms - Accessible Form Controls (WebAIM)"
    url: https://webaim.org/techniques/forms/controls
    archived_url: https://web.archive.org/web/20260723190103/https://webaim.org/techniques/forms/controls
    accessed: 2026-08-05
    source_type: web
    why: source for the label association techniques - matching for and id values, implicit wrapping, and the click-to-focus benefit
---

# Accessible names, roles, and the first rule of ARIA

## What the criterion requires

Success criterion 4.1.2 Name, Role, Value (Level A) requires that for every user
interface component, "the name and role can be programmatically determined; states,
properties, and values that can be set by the user can be programmatically set; and
notification of changes to these items is available to user agents, including
assistive technologies"
([Understanding 4.1.2](https://www.w3.org/WAI/WCAG22/Understanding/name-role-value.html)).
In audit terms: software must be able to ask any control what it is (role), what it is
called (name), and what state it is in - and be told when any of that changes. A
screen reader that announces a control as only "edit" or "clickable" is reporting a
4.1.2 failure in progress.

## Standard controls pass by construction

The same Understanding document draws the line that shapes remediation work:
"Standard HTML controls already meet this success criterion when used according to
specification." A native button, link, checkbox, or select carries its role, keyboard
behavior, and state reporting for free. Custom controls - a div made clickable, a
hand-rolled dropdown - need deliberate extra work to expose the same information;
the Understanding document defers the specifics to other specifications, naming
WAI-ARIA and the relevant platform standards.

For names specifically, WebAIM's form-controls guidance shows the native techniques:
a label element whose for attribute matches the control's id, or a label that wraps
the control implicitly ([WebAIM form controls](https://webaim.org/techniques/forms/controls)).
Association is not cosmetic - a correctly associated label also lets a click or tap on
the label text focus the control, which helps people with motor disabilities and
anyone on a small screen.

## ARIA is the fallback, not the default

ARIA (Accessible Rich Internet Applications) is a set of roles, states, and
properties that supplements HTML semantics for assistive technologies
([MDN ARIA](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA)). The
W3C's Using ARIA document states the first rule of ARIA use: "If you can use a native
HTML element or attribute with the semantics and behavior you require already built
in, instead of re-purposing an element and adding an ARIA role, state or property to
make it accessible, then do so" ([Using ARIA](https://www.w3.org/TR/using-aria/)).
Its second rule follows: do not change native semantics unless you really have to.

Two facts make the first rule an audit heuristic rather than a style preference.
First, ARIA only changes what assistive technology is told - MDN warns that an
author who reaches for ARIA is "responsible for mimicking the equivalent browser
behavior in script," so a div with a button role is still not focusable or
activatable until someone writes that behavior by hand. Second, misapplied ARIA correlates with worse outcomes in the field: MDN
cites WebAIM's finding that home pages using ARIA averaged 41 percent more detected
errors than pages without it, and condenses the lesson as "No ARIA is better than bad
ARIA." For an auditor, ARIA on an element is a prompt to verify, not a sign the work
was done: does the role match the behavior, does the name resolve, do the states
update?
