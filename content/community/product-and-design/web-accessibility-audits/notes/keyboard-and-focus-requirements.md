---
schema_version: 1
type: reference
title: Keyboard operability and focus - the requirements and the dialog pattern
concepts:
  - keyboard-operability
  - focus-order
  - visible-focus
  - dialog-focus-management
sources:
  - title: "Understanding Success Criterion 2.1.1: Keyboard (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
    archived_url: https://web.archive.org/web/20260803052214/https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html
    accessed: 2026-08-05
    source_type: web
    why: source of the criterion text, its Level A status, the path-dependent input exception, and the keyboard-emulator rationale
  - title: "Understanding Success Criterion 2.4.3: Focus Order (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
    archived_url: https://web.archive.org/web/20260728181205/https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html
    accessed: 2026-08-05
    source_type: web
    why: source of the meaning-and-operability requirement and the modal and non-modal dialog focus sequences
  - title: "Understanding Success Criterion 2.4.7: Focus Visible (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
    archived_url: https://web.archive.org/web/20260721180058/https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html
    accessed: 2026-08-05
    source_type: web
    why: source of the visible-focus requirement and its Level AA status
  - title: "Dialog (Modal) Pattern (W3C ARIA Authoring Practices Guide)"
    url: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
    archived_url: https://web.archive.org/web/20260731145433/https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
    accessed: 2026-08-05
    source_type: web
    why: source of the canonical modal dialog keyboard and ARIA behavior this note summarizes
  - title: "Keyboard Accessibility (WebAIM)"
    url: https://webaim.org/techniques/keyboard/
    archived_url: https://web.archive.org/web/20260723185814/https://webaim.org/techniques/keyboard/
    accessed: 2026-08-05
    source_type: web
    why: source of the practitioner guidance on outlines, source order, tabindex values, and keyboard traps
---

# Keyboard operability and focus - the requirements and the dialog pattern

## Everything must work from the keyboard

Success criterion 2.1.1 Keyboard (Level A) requires that "all functionality of the
content is operable through a keyboard interface without requiring specific timings
for individual keystrokes"
([Understanding 2.1.1](https://www.w3.org/WAI/WCAG22/Understanding/keyboard.html)).
The point is wider than physical keyboards: speech input, sip-and-puff devices, and
scanning software all emulate a keyboard, so keyboard operability is the gateway for a
whole family of assistive technologies. The single exception is input that depends on
the path of the user's movement and not just the endpoints - freehand drawing
qualifies; dragging something to a known destination does not, because only the
endpoints matter there.

## Focus order must preserve meaning

Success criterion 2.4.3 Focus Order (Level A) requires that when a page can be
navigated sequentially, "focusable components receive focus in an order that preserves
meaning and operability"
([Understanding 2.4.3](https://www.w3.org/WAI/WCAG22/Understanding/focus-order.html)).
More than one order can be valid; what fails is an order that contradicts the page's
logic - a form whose submit button precedes its fields, a visually-adjacent pair of
controls separated by twenty tab stops. WebAIM's practitioner guidance is that
navigation order is determined by source order: structure the document correctly
first and use CSS (Cascading Style Sheets) for visual placement, rather than
repairing a broken sequence with positive tabindex values, which WebAIM advises
against ([WebAIM keyboard techniques](https://webaim.org/techniques/keyboard/)).
The same page warns against making non-interactive elements focusable and against
keyboard traps that focus can enter but not leave.

## Focus must be visible

Success criterion 2.4.7 Focus Visible (Level AA) requires a mode of operation in
which "the keyboard focus indicator is visible"
([Understanding 2.4.7](https://www.w3.org/WAI/WCAG22/Understanding/focus-visible.html)).
A sighted keyboard user has no other way to know where their next keystroke will
land. The recurring implementation failure is CSS that removes the browser's default
outline for aesthetic reasons and replaces it with nothing; WebAIM's guidance is to
enhance the focus indicator - stronger contrast, styling that fits the design -
never to simply remove it ([WebAIM keyboard techniques](https://webaim.org/techniques/keyboard/)).

## The modal dialog pattern

The W3C ARIA Authoring Practices Guide (APG) modal dialog pattern specifies the focus
choreography auditors should expect
([APG dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)):

- On open, focus moves to an element inside the dialog.
- While open, Tab and Shift+Tab do not move focus outside the dialog; from the last
  tabbable element, Tab wraps to the first, and Shift+Tab wraps the other way.
- Escape closes the dialog.
- On close, focus returns to the element that invoked the dialog, unless that element
  no longer exists or the workflow makes another target clearly better.

The container carries a dialog role with aria-modal set to true, and is named by
aria-labelledby referencing its visible title or by an aria-label. The APG cautions
that aria-modal belongs only on dialogs that genuinely prevent interaction with the
rest of the page, both functionally and visually - claiming modality that the page
does not enforce misleads assistive technology users. Understanding 2.4.3 describes
the same sequencing from the criterion side: a modal takes focus in, keeps the
background inert, and hands focus back on dismissal.
