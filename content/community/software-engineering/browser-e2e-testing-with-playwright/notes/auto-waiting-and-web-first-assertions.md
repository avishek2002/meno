---
schema_version: 1
type: reference
title: Auto-waiting actions and web-first assertions
concepts:
  - role-based-locators
  - auto-waiting
  - web-first-assertions
sources:
  - title: "Playwright docs: Locators"
    url: https://playwright.dev/docs/locators
    archived_url: https://web.archive.org/web/20260801203901/https://playwright.dev/docs/locators
    accessed: 2026-08-05
    source_type: web
    why: source for the built-in locator list, the strictness rule, and the claim that role locators reflect how users and assistive technology perceive the page
  - title: "Playwright docs: Auto-waiting"
    url: https://playwright.dev/docs/actionability
    archived_url: https://web.archive.org/web/20260728001710/https://playwright.dev/docs/actionability
    accessed: 2026-08-05
    source_type: web
    why: source for the actionability checks each action performs and the TimeoutError behavior when they never pass
  - title: "Playwright docs: Assertions"
    url: https://playwright.dev/docs/test-assertions
    archived_url: https://web.archive.org/web/20260731171442/https://playwright.dev/docs/test-assertions
    accessed: 2026-08-05
    source_type: web
    why: source for the auto-retrying versus non-retrying assertion split and the five-second default timeout
---

# Auto-waiting actions and web-first assertions

Playwright's answer to the classic flakiness of browser tests is that waiting is
built into the primitives, not written by the test author. Three pieces cooperate:
locators, action-time actionability checks, and retrying assertions.

## Locators re-query, and role comes first

A locator is a description of how to find an element, not a handle to one:
"every time a locator is used for an action, an up-to-date DOM element is located"
([Locators](https://playwright.dev/docs/locators)). DOM stands for Document Object
Model, the browser's live tree of the page. The documentation's recommended locator
is getByRole, because role-based locators are "the closest way to how users and
assistive technology perceive the page" - they survive markup refactors that break
CSS selectors, and they fail when accessibility does. The other built-ins
(getByLabel, getByText, getByPlaceholder, getByAltText, getByTitle, getByTestId)
follow the same user-facing philosophy, with test identifiers as the fallback.
Locators are strict by default: an action on a locator matching several elements
throws, which turns accidental ambiguity into a visible failure instead of a click
on the wrong button. Chaining and filter narrow a match without loosening
strictness.

## Actions wait for actionability

Before acting, Playwright "auto-waits for all the relevant checks to pass and only
then performs the requested action"
([Auto-waiting](https://playwright.dev/docs/actionability)). For a click that
means the element is visible, stable ("maintained the same bounding box for at
least two consecutive animation frames"), enabled, and actually the target that
receives pointer events rather than being covered by an overlay; form actions add
an editable check. If the checks never pass, the action "fails with the
TimeoutError" - so a timeout is a diagnosis, naming the check that never became
true, not a random failure. A force option exists that "disables non-essential
actionability checks," which is precisely why it belongs in edge-case tests, not
in routine ones.

## Assertions retry; generic ones do not

Web-first assertions such as toBeVisible and toHaveText re-fetch the element and
re-test the condition until it holds or the timeout (five seconds by default)
expires ([Assertions](https://playwright.dev/docs/test-assertions)). The same page
draws the line that matters for flakiness: "most of the time, web pages show
information asynchronously, and using non-retrying assertions can lead to a flaky
test." A pattern like asserting on the awaited value of a visibility check
captures one instant of a page still in motion; the web-first form keeps checking
as the page settles. For conditions no built-in covers, expect.poll converts a
custom read into a polling assertion and expect.toPass retries a whole block until
it succeeds.
