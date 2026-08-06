---
schema_version: 1
type: reference
title: The visual criteria - contrast, target size, and reduced motion
concepts:
  - contrast-minimums
  - target-size
  - reduced-motion
sources:
  - title: "Understanding Success Criterion 1.4.3: Contrast (Minimum) (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
    archived_url: https://web.archive.org/web/20260801002749/https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html
    accessed: 2026-08-05
    source_type: web
    why: source of the 4.5 to 1 and 3 to 1 ratios, the large-text definition, and the incidental and logotype exceptions
  - title: "Understanding Success Criterion 2.5.8: Target Size (Minimum) (WCAG 2.2, W3C)"
    url: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
    archived_url: https://web.archive.org/web/20260731183510/https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
    accessed: 2026-08-05
    source_type: web
    why: source of the 24 by 24 CSS pixel requirement and the five exceptions summarized in this note
  - title: "prefers-reduced-motion - CSS media query (MDN Web Docs)"
    url: https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
    archived_url: https://web.archive.org/web/20251102043347/https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion
    accessed: 2026-08-05
    source_type: web
    why: source for the media query's values, the vestibular-disorder motivation, and the animation-swap usage pattern
  - title: "Contrast and Color Accessibility (WebAIM)"
    url: https://webaim.org/articles/contrast/
    archived_url: https://web.archive.org/web/20260705190057/https://webaim.org/articles/contrast/
    accessed: 2026-08-05
    source_type: web
    why: source for the contrast ratio scale, the AAA and non-text thresholds, and the color-alone restriction
---

# The visual criteria - contrast, target size, and reduced motion

## Contrast minimums

Success criterion 1.4.3 Contrast (Minimum), Level AA, requires text to have a
contrast ratio against its background of at least 4.5 to 1, relaxed to 3 to 1 for
large-scale text - at least 18 point, or 14 point bold, roughly 120 to 150 percent of
default body size
([Understanding 1.4.3](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)).
The ratio scale runs from 1 to 1 (identical colors) to 21 to 1 (black on white), as
WebAIM's contrast article explains with worked examples
([WebAIM contrast](https://webaim.org/articles/contrast/)). Two exceptions matter in
audits: incidental text (inactive controls, pure decoration, text inside a photograph
with significant other content) and logotypes, which carry no contrast requirement.

Adjacent criteria complete the visual picture. WebAIM's article summarizes them: the
AAA enhanced criterion (1.4.6) raises the bars to 7 to 1 and 4.5 to 1; non-text
contrast (1.4.11, AA) requires user interface components and meaningful graphics to
reach 3 to 1 against adjacent colors; and color may never be the only visual means of
conveying information - a state or error signaled by hue alone needs a second cue
such as text, an icon, or an underline.

## Target size

Success criterion 2.5.8 Target Size (Minimum), Level AA and new in WCAG 2.2, requires
pointer targets to be at least 24 by 24 CSS pixels
([Understanding 2.5.8](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
Five exceptions bound it, and applying them precisely is most of the audit work:

- Spacing: an undersized target passes if a 24 CSS pixel diameter circle centered on
  it intersects no other target - tightly packed small controls fail, spaced ones pass.
- Equivalent: a small target passes when the same function is available through
  another control on the same page that meets the minimum.
- Inline: targets inside a sentence, or whose size is constrained by the line height
  of surrounding text, are exempt.
- User agent control: targets whose size the browser determines and the author has
  not modified are exempt.
- Essential: a presentation that is legally required or essential to the information
  being conveyed, such as dense map pins, is exempt.

The Understanding document adds that meeting the minimum size regardless of spacing
remains the best practice.

## Reduced motion

The prefers-reduced-motion CSS media query lets a stylesheet detect that the user has
asked their operating system to minimize non-essential motion
([MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)).
It has two values: no-preference, and reduce. The motivation is concrete: animation -
especially scaling and panning effects - can cause discomfort or disorientation for
people with vestibular motion disorders and other motion sensitivities. MDN's usage
pattern is to serve the full animation by default and, inside a reduce block, replace
it with a calmer alternative (a cross-fade instead of movement) or none at all. In an
audit, autoplaying movement that ignores the setting is the finding; the media query
is the fix.
