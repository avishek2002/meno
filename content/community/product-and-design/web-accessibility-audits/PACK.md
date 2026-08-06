---
schema_version: 1
pack: product-and-design/web-accessibility-audits
title: Web accessibility audits
maintainers: []
audience: developers and designers who ship web interfaces and want to audit them against WCAG (Web Content Accessibility Guidelines) 2.2 AA and fix what they find; comfortable with HTML and CSS, no prior accessibility work assumed
hours: 16-18
created: 2026-08-05
---

# Web accessibility audits - pack provenance

Audit an interface against WCAG 2.2 AA and fix what you find. Module 1 grounds the work
in who accessibility failures actually fail - the POUR principles (perceivable, operable,
understandable, robust) and the assistive technologies that consume a page. Modules 2-4
cover the three audit surfaces: keyboard and focus (operability, tab order, dialogs,
visible focus), names and roles (accessible names, semantic HTML first, ARIA - Accessible
Rich Internet Applications - as last resort), and the visual layer (contrast minimums,
the WCAG 2.2 target-size criterion, reduced motion). Module 5 turns the pieces into an
audit practice: scoping and sampling per WCAG-EM (the W3C's conformance evaluation
methodology), separating DOM-confirmed failures from high-confidence judgment calls,
and writing findings a developer can act on.

Every anchor is a fetched, archived primary source: the WCAG 2.2 Recommendation and its
Understanding documents, the ARIA Authoring Practices Guide, WCAG-EM, MDN (Mozilla
Developer Network) references, and WebAIM's large-sample survey data.

Structure and anchor sources only, per the pack model: lesson bodies generate at
adoption against the adopter's own contract.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-05 - pack created (5 modules, 19 archived anchors: the WCAG 2.2 spec and six
  Understanding documents, the APG modal dialog pattern, Using ARIA, WCAG-EM, the WAI
  evaluation overview, MDN ARIA and reduced-motion references, and four WebAIM
  articles and surveys; 5 reference notes).
