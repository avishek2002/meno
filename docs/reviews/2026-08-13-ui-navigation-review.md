# UI navigation review - 13 August 2026

A review of the study app's navigation and content visibility, run as a headless browser
traversal of every route by two specialists: a UI/UX reviewer and a frontend engineer.
This document is a work order. Each finding carries the evidence that proves it, the files
that own it, and a checkable acceptance criterion, so that implementing agents can pick up
a numbered item and know when they are done.

## What was reviewed, and what was not

**In scope.** Two things, both named by the maintainer:

- **Adaptive information architecture** - breadcrumbs, in-course navigation, prev and next
  lesson, grouping, and whether "where am I" is answerable at a glance.
- **State-driven surfacing** - whether the interface reorders and highlights itself from
  study state: due reviews first, mastery visible where courses are chosen, resume where
  you left off, empty states that name the next action.

**Deliberately out of scope.** Visual design, colour, typography, animation and transitions.
Mobile and responsive layout - the traversal ran at 1440x900 only, so nothing here says
anything about a narrow window. These are omissions by decision, not oversights.

**Method.** A headless Chromium pass over 15 route captures recorded a full-page screenshot,
the accessibility tree, the rendered DOM, console errors and API timings per route. Both
specialists worked from that shared evidence set and ran their own follow-up probes.
Playwright was borrowed from a neighbouring project; the repository gains no dependency.

**Corpus.** The traversal ran against a real vault of 4 subjects, 9 courses and 95 markdown
files, because the problems under review only have symptoms at density - a two-course fixture
cannot show whether a course list scales. Nothing from that corpus appears in this document;
courses are described structurally throughout.

## How to work through this

The findings are ranked by learner impact, not by effort. They do **not** partition cleanly
by file: four of them want to change `App.tsx` and three want to change `useResource.tsx`.
So the work splits into waves.

**Wave 0 is serial and has one owner.** It builds the shared seams every other finding
depends on. Nothing in wave 1 should start before wave 0 lands, or five implementers will
each invent their own course-context fetch, their own error component and their own idea of
which navigation item is current.

**Wave 1 runs in parallel** across six file-disjoint tracks. **Wave 2** is deferrable polish.

One shared-file caveat that applies to every track: `app/client/src/styles.css` is touched by
almost every finding. Append a clearly commented section per track rather than editing shared
rules, and expect to reconcile once at the end.

---

## Wave 0 - the seam (serial, single owner)

### UI-01 - Course mastery and module gate state never render, because the client rejects the server's own payload

**Severity: highest.** This is a live bug, not a design gap, and it silently disables the
feature most of the rest of this document builds on.

**Evidence.** `GET /api/v1/:tenant/course/:course` returns `mastery` shaped
`{concepts, modules}` (`app/server/routes.ts:111` sends `mastery.courses[p.course] ?? null`,
already unwrapped). `CoursePage.tsx:37` calls `asMastery(data.mastery)`, and
`clientTypes.tsx:36-41` returns `null` unless the object has a `.courses` key. Verified
against the live server: the payload's mastery keys are `['concepts','modules']` and
`.courses` is absent. So `courseMastery` is always `null`, `concepts` is always empty, and
the entire "Concept mastery" section at `CoursePage.tsx:102-134` is unreachable code. A sweep
of all nine courses found mastery displayed on none of them, including courses the API
reports tracked concepts for.

The same rejected payload carries `modules`, which includes gate outcomes. One course
currently holds a failed, locked gate. That state appears nowhere in the interface except a
single undifferentiated line in the progress activity feed.

**Why it hurts the learner.** A failed and locked module gate is the most action-determining
fact the system produces - it means "you may not proceed, go back and review". The course
page renders as though nothing had ever been studied, so a stuck learner is given no reason
they are stuck.

**Change.** Add `asCourseMastery(raw): ClientCourseMastery | null` to `clientTypes.tsx`,
guarding on `concepts` being an object, and switch `CoursePage` to it. Then surface `modules`
where it is actionable: a gate chip on each module card carrying both a word and a shape, never
colour alone.

**Owning files.** `app/client/src/clientTypes.tsx`, `app/client/src/pages/CoursePage.tsx`.
Amend `docs/specs/app.md` with the course-route mastery shape, per CONTRIBUTING.

**Acceptance.** On a course with recorded ledger events, the course page shows one row per
tracked concept, and every module whose gate is not `none` carries a gate chip. A course whose
gate has failed says so above the fold.

**Density-dependent.** No.

---

### UI-02 - There is no shared course context, so breadcrumbs and prev/next cannot be built without duplication

**Evidence.** `LessonPage.tsx:19-21` fetches only the lesson; nothing in the component ever
sees the ordered lesson list. That list already exists in the `/course/:course` response and
is already fetched one click earlier by `CoursePage.tsx:75-100`. The route table
(`router.tsx:17-38`) is a flat list of independent regexes: `course`, `lesson` and `note`
share no common "within this course" shape, and `App.tsx`'s switch hands each page only its
own route params.

**Why it matters.** This is the structural reason breadcrumbs and prev/next do not exist. It
is a missing data dependency, not a missing component - and it is the single biggest
collision risk in wave 1, since four separate findings want the same course structure.

**Change.** Introduce one hook, `useCourseContext(tenant, course)`, wrapping the existing
`/course` fetch and shaping it for navigation: ordered lessons across module boundaries,
skipping entries whose `status` is `planned` exactly as `CoursePage.tsx:85` already does.
`CoursePage`, `LessonPage` and any new breadcrumb component consume it. No server change - the
data is already in the existing response.

**Owning files.** New `app/client/src/useCourseContext.ts`; consumed by
`app/client/src/pages/CoursePage.tsx` and `app/client/src/pages/LessonPage.tsx`.
Candidate shared type in `app/shared/types.ts`.

**Acceptance.** `CoursePage` and `LessonPage` both derive course structure from the same
module, with no duplicated `/course/:course` fetch logic across the two files.

**Density-dependent.** No.

---

### UI-03 - A route change does none of the things a page load does

**Evidence.** `router.tsx:62-64`'s `navigate()` only assigns `window.location.hash`. Nothing
calls `focus()` or `scrollTo`. Measured live: clicking a course card leaves
`document.activeElement` as `BODY`; scrolling to the bottom of a long lesson
(`scrollY` 5750) and clicking a header link renders the new page already scrolled to 666px
rather than the top. `document.title` is the literal string `meno` on all 14 non-guide routes
- only `GuidePage.tsx:11-13` sets its own. `aria-current` is empty on the course, lesson and
note routes, because `Header.tsx:20` compares route names by exact equality against six
names that do not include them. A repository-wide grep finds exactly one `aria-live`, in
`GraphPage.tsx:609`.

**Why it hurts the learner.** On the three routes where a session is actually spent, the
persistent navigation renders as though the learner were nowhere. Every browser tab and every
history entry is labelled `meno`, so returning to a lesson from history is guesswork. A
keyboard or screen-reader user gets no signal at all that navigation happened - no title
change, no focus move, no announcement.

**Change.** One central effect in `App.tsx` on route change: set `document.title` per route
from a small lookup beside the `ROUTES` table, reset scroll to the top, and move focus to a
`tabIndex={-1}` heading in the new view (on route change only, never first paint). Pass a
`section` prop derived once from `route.name` so `course`, `lesson` and `note` all light up
the `Courses` navigation item. Add a shared `AsyncStatus` component wrapping the
`status-line` pattern that all 12 pages already repeat, with `role="status"` and
`aria-live="polite"`.

**Owning files.** `app/client/src/App.tsx`, `app/client/src/router.tsx`,
`app/client/src/components/Header.tsx`, new `app/client/src/components/AsyncStatus.tsx`.

**Acceptance.** After clicking through to a course, `document.activeElement` is inside the new
view, `window.scrollY` is 0, `document.title` distinguishes the route from every other, and
exactly one main-navigation item carries `aria-current`.

**Density-dependent.** No.

---

### UI-04 - Every error state is a bare red sentence with no heading and no way out

**Evidence.** `fu.json → lessonError`: text `Could not load lesson: no such lesson`, `h1Count`
0, `recoveryLinks` empty, `role` null. The captured document has no heading at all. The same
pattern repeats in `CoursePage.tsx:34`, `TenantCoursesPage.tsx:78`, `ProgressPage.tsx:17` and
every other page: `<p className="status-line status-error">`. `NotFoundPage` is the only one
that offers a way back.

**Why it hurts the learner.** A stale bookmark, a hand-edited URL, or a lesson the agent has
not generated yet all land on a dead end with zero exits and no heading structure. Because it
is a plain paragraph swapped into the DOM, assistive technology is never told anything
changed.

**Change.** A shared `ErrorState` component: an `<h1>` naming what failed, one plain-language
sentence of cause, a `role="alert"` wrapper, and recovery links appropriate to the route. When
a lesson 404s, say the likely reason in the app's own vocabulary - the lesson has not been
generated yet - rather than echoing the server string.

**Owning files.** New `app/client/src/components/ErrorState.tsx`, adopted by every page in
`app/client/src/pages/`.

**Acceptance.** Every error state renders an `<h1>` and at least one link back into the app,
and the failure is announced to assistive technology.

**Density-dependent.** No.

---

### UI-05 - No response caching, so every back-navigation refetches everything

**Evidence.** `api.tsx:26` sets `cache: 'no-store'` on every request. `useResource.tsx`
fetches on every mount with no cross-mount cache and no in-flight deduplication. Measured:
course list to course and back produced five full round-trips - `/tree`, `/groups`, `/course`,
then `/tree` and `/groups` again - for data that had not changed. `/tree` is 47KB.

**Why it matters here.** This is wave 0 rather than a performance footnote because every
finding in wave 1 adds a consumer of the same data. Without a cache, a breadcrumb, an
in-course tree and a prev/next control each add their own fetch of a course the page next
door just loaded.

**Change.** A small keyed cache inside or beside `useResource`, invalidated only by the
existing "Re-read files" revalidate mechanism. Files are the source of truth and there is no
watcher, so an explicit refresh is already the model - the cache should follow it rather than
introduce a TTL.

**Owning files.** `app/client/src/useResource.tsx`, `app/client/src/api.tsx`.

**Acceptance.** Course list to course and back issues at most one `/tree` and one `/groups`
request per session until "Re-read files" is clicked.

**Density-dependent.** No, though the wasted bytes scale with `/tree`.

---

## Wave 1 - parallel tracks

Six tracks, file-disjoint once wave 0 has landed. Each can be an independent agent and an
independent pull request.

### Track A - the lesson page

#### UI-06 - The lesson page is a navigational dead end

**Evidence.** The only in-content application link on a lesson is "Show in graph": zero links
to its own course, no prev/next, no table of contents. The document is 6,650px - 7.4 viewport
heights. The header's `Courses` link goes to the tenant course list, skipping the course the
learner is inside.

**Why it hurts the learner.** This is the screen daily study happens on. Finishing a lesson
leaves the reader at the bottom of a seven-screen document with no next step, and the only
route onward is the browser back button - which lands at the top of a course page whose lesson
list is itself 2,700px down (UI-08). Sequential study, the thing the app exists for, is its
worst-supported action.

**Change.** Two pieces of chrome, both computed from `useCourseContext` (UI-02). Above the
`<h1>`, a breadcrumb: `Courses / <course> / <module>`. Below the references panel, a prev/next
pair naming the adjacent lessons, crossing module boundaries and skipping planned entries.
When the next lesson in sequence is not yet written, render a note naming the module that has
to be generated rather than a dead arrow.

**Owning files.** `app/client/src/pages/LessonPage.tsx`, new
`app/client/src/components/LessonNav.tsx`, new `app/client/src/components/Breadcrumb.tsx`
(shared with track F - build it here, consume it there).

**Acceptance.** From any lesson, a learner reaches both the next written lesson and the parent
course in one click, without the browser back button.

**Density-dependent.** No.

---

### Track B - the course page

#### UI-07 - The course page buries its lesson list under roughly 2,600px of reference prose

**Evidence.** Measured across all nine courses: the first clickable lesson link sits between
2,595px and 2,914px from the top, 2.9 to 3.2 viewport heights. For the densest course
(10 modules, 3 written lessons): objectives at 195px, hub note at 976px, modules section at
2,604px, first lesson link at 2,703px, document 4,226px. The single-module course is no better
at 2,744px - the offset comes from the objectives list plus the hub note, not from course size.

**Why it hurts the learner.** The course page's job in a daily session is "pick the next
lesson". Every visit pays three screens of material that is read once, at course start, and
never again.

**Change.** Reorder to: header, a `Continue` block naming one lesson, modules, concept mastery
(now that UI-01 makes it render), then objectives and the hub map in `<details>` elements
closed by default. Keep both open the first time a course is visited - with no ledger events
for it, a new course should still read as a briefing.

**Owning files.** `app/client/src/pages/CoursePage.tsx`.

**Acceptance.** On every course in the corpus, at least one lesson link is visible at
1440x900 without scrolling.

**Density-dependent.** No - it reproduced on all nine courses, including the one-module one.
It would not reproduce on a fixture course with no hub note and no objectives.

---

### Track C - the course list and learner list

#### UI-08 - Study state is invisible on the entire default path into the app

**Evidence.** The strings "due" and "review" appear nowhere in the course list or the learner
list. A course card's entire text is its title, a status badge and a module count. Meanwhile
`/api/v1/:tenant/progress` reports 18 concepts overdue across 6 of the 9 courses, all five
days overdue. The learner list is a single card with one link.

**Why it hurts the learner.** The daily path is learner list, course list, course. Along that
whole path nothing indicates that two thirds of the courses have overdue reviews, or which to
open. Spaced repetition is the core mechanic and the default screens are blind to it.

**Change.** Fetch `/progress` alongside `/tree` and `/groups` and join it - no new endpoint:
`getProgress` (`routes.ts:157-168`) already computes mastery for every course from the same
`deriveMastery` call, and measures 1ms. Add a due count to each card, sort courses with due
reviews to the top of their group under a `Due now` sub-heading so the reordering is explained
rather than mysterious, and put a line under the page heading naming the total and linking to
progress. Add the same count to the learner card. If exactly one learner exists, redirect the
home route straight to it - the interstitial is a guaranteed dead click every session.

**Owning files.** `app/client/src/pages/TenantCoursesPage.tsx`,
`app/client/src/pages/TenantsPage.tsx`, `app/client/src/courseList.ts` (the sort belongs with
the pure list logic that already has tests).

**Acceptance.** A learner who opens the app and clicks nothing but the single visible link can
name, from the course list alone, how many reviews are due and which courses they belong to.

**Density-dependent.** No.

---

#### UI-09 - The only progress indicator on a course card is a 10px colour-only dot

**Evidence.** A card renders a row of `<span class="status-dot">` - 43 of them on the list
page, 10px square, distinguished purely by `background` colour in `styles.css`, with the
meaning available only through a native `title` attribute. None are focusable.

**Why it hurts the learner.** Meaning carried by colour alone fails WCAG 1.4.1, and roughly
8% of men cannot reliably separate the generated and failed colours. The label is reachable
only by hovering with a mouse; a keyboard user gets nothing.

**Change.** Replace the dot row with a labelled line - written-module count and due count as
text - plus a segmented bar whose segments carry both fill and a distinguishing outline for
the failed state, with an `aria-label` naming the counts. Make the whole card the click
target rather than only the heading.

**Owning files.** `app/client/src/pages/TenantCoursesPage.tsx`.

**Acceptance.** Each course's written-module count and due count are readable as text with no
hover, and no state on the card is distinguished by colour alone.

**Density-dependent.** No, though the dot row worsens as module count grows.

---

### Track D - the reporting pages

#### UI-10 - The insights page holds the richest study state in the app and contains no links

**Evidence.** Zero links in the main content of both insights and cost. The insights page runs
4,333px and names courses and modules across roughly 60 rows - an overdue table, per-concept
transfer scores, a backlog of 106 planned lessons, 18 lessons never opened, 65 orphaned notes
- every one of them plain text. Separately, the insights overdue table computes a
`days overdue` column that the progress page's own due table does not.

**Why it hurts the learner.** Insights exists to say what to do next, then makes the learner
retype it: read a course name, go to the course list, find it, click. And the better of the
two due tables is the one the navigation does not point at.

**Change.** Render every course and module cell as a link. Move the days-overdue arithmetic
into a shared `due.ts` and use it on both tables. Cross-link the two pages explicitly.

**Owning files.** `app/client/src/pages/InsightsPage.tsx`,
`app/client/src/pages/ProgressPage.tsx`, `app/client/src/pages/CostPage.tsx`, new
`app/client/src/due.ts`.

**Acceptance.** Every course or module named on the insights page links to it, and the
progress due table shows days overdue per row.

**Density-dependent.** No.

---

#### UI-11 - The due list names the work but never the next action, and is not ordered by urgency

**Evidence.** `ProgressPage.tsx:46-55`: the course cell is a link, the concept cell is plain
text, the next-review cell is a raw ISO date. 18 identical-looking rows, all dated the same
day, with no sort. The per-course sections below iterate `Object.entries(mastery.courses)` in
map order - not by urgency, not alphabetically. And `ProgressPage.tsx:62` renders the raw
course slug as its heading, the one identifier every other page deliberately hides.

**Why it hurts the learner.** Clicking a due row lands on a course page that says nothing
about that concept, so the trail goes cold one click in. The app deliberately cannot run a
review - the tutor is the agent - but "you cannot do it here" is not the same as "here is what
to do", and the page currently says neither.

**Change.** Link the concept cell to the lesson that introduced it (`ClientConceptMastery`
carries `module`, which resolves through course context). Add a days-overdue column and sort
by it descending. Group rows by course with a count so 18 rows read as six courses. Add one
action line naming the real next step in the learner's vocabulary - ask the agent for a review
session - matching the phrasing `EmptyState.tsx` already uses. Resolve slugs to titles for
section headings.

**Owning files.** `app/client/src/pages/ProgressPage.tsx`, `app/client/src/due.ts`.

**Acceptance.** From a due row a learner reaches the lesson teaching that concept in one
click; the page names the action that clears the row; headings show titles, not slugs.

**Density-dependent.** Partly - ordering matters more as courses compete for space above the
fold.

---

### Track E - the graph

#### UI-12 - The graph is decorative at this corpus size: 200 nodes, median diameter 2px, zero labels

**Evidence.** 200 nodes rendered at a median and minimum diameter of 2px in a 694x630 canvas,
with no text labels at all; the legend panel covers 27% of the canvas and hides 8 nodes.
There is no search box and no zoom control. The focused deep-link does work, but even the
focused view renders unlabelled circles and a fan of dashed ghosts with no text saying what
any of them is. 94 of the 200 nodes carry `tabIndex={0}` (`GraphPage.tsx:570`) inside the
canvas with no bypass - a keyboard probe needed 104 tab presses to escape the node set.

On performance, which is the more obvious suspicion and turns out not to be the problem: the
synchronous force layout (`GraphPage.tsx:59`, 300 ticks with no yielding) produced one 152ms
frame on load out of 120 sampled. A single perceptible hitch, not sustained jank. It will
degrade as the vault grows, since the charge force scales worse than linearly, but the
graph's problem today is legibility, not speed.

**Change.** Label any node above a size threshold, and every node in the focused
neighbourhood regardless of size. Enforce a minimum radius and pad the hit area with a
transparent circle so targets reach 24x24 CSS px without growing the glyph. Add a search
input that filters and focuses through the same path the deep link uses. Take the node group
out of the sequential tab order in favour of a single roving-focus entry point with arrow-key
movement, plus a skip link. Move the legend beside the canvas or make it collapsible.

**Owning files.** `app/client/src/pages/GraphPage.tsx`, `app/client/src/graphLayout.ts`.
Amend `docs/specs/graph.md`, which fixes the ghost-node interaction contract.

**Acceptance.** At 200 nodes every node has a hit area of at least 24x24 CSS px, the focused
node and its neighbours are labelled in text, a named note can be found by typing, and a
keyboard user passes the graph in fewer than five tab stops.

**Density-dependent.** Yes. At 20 nodes the layout spreads and the dots are legible; this
failure is a function of node count.

---

### Track F - rendered content, todos and notes

#### UI-13 - Todos referencing courses render as raw wikilink syntax and are not clickable

**Evidence.** Zero links in the todos main content, and eight rows containing literal
`[[...|...]]` text. `TodosPage.tsx:151-176` renders todo text as a plain string inside a
`<button>`, while `wikilinks.tsx` and `RenderedHtml` already resolve exactly this syntax
elsewhere. Of 26 todos, 8 are done and stay interleaved with open ones; there is no hide
control.

**Change.** Render todo text through the existing wikilink pipeline, moving the edit
affordance to a small dedicated button - text-as-button is what forces plain-text rendering
today. Add a `Hide done` toggle defaulting to hidden.

**Owning files.** `app/client/src/pages/TodosPage.tsx`, reusing
`app/client/src/wikilinks.tsx`.

**Acceptance.** A todo containing a wikilink renders the link text and navigates in one
click; completed todos do not appear above open ones.

**Density-dependent.** No.

---

#### UI-14 - Wikilinks break cmd-click, middle-click and shift-click

**Evidence.** `wikilinks.tsx:27` calls `e.preventDefault()` unconditionally, with no check of
`e.button`, `metaKey`, `ctrlKey`, `shiftKey` or `altKey`, then navigates the current window.
Verified by reading the handler. Wikilinks are the only route between hub notes, lesson bodies
and courses in rendered content.

**Why it hurts the learner.** Opening a cross-course connection in a new tab - the natural
move when a lesson points at a related course mid-read - silently navigates away instead and
loses the reader's place in a 6,650px document. It looks like the app ignored the click.

**Change.** Return early when any modifier is held or the button is not primary, and rewrite
`#wiki:` hrefs to real application routes at render time so default browser behaviour is
correct and the handler becomes an optimisation rather than the only path.

**Owning files.** `app/client/src/wikilinks.tsx`,
`app/client/src/components/RenderedHtml.tsx`.

**Acceptance.** Cmd-click or middle-click on a wikilink opens the target in a new tab and
leaves the current page and scroll position untouched.

**Density-dependent.** No.

---

#### UI-15 - Note pages are orphans titled with a raw file path

**Evidence.** `NotePage.tsx:20` renders the note's path as its `<h1>`, above a second real
`<h1>` from the note body. No links back to the course, no navigation item marked current.

**Why it hurts the learner.** A hub note is the map of a course, and reaching one happens on
every wikilink follow. The vault pillar becomes a one-way trip out of the app's structure.

**Change.** Drop the path heading in favour of the note's own first heading, showing the path
as muted metadata. Add the breadcrumb from UI-06 when the note path resolves to a course.

**Owning files.** `app/client/src/pages/NotePage.tsx`, consuming
`app/client/src/components/Breadcrumb.tsx` from track A.

**Acceptance.** A note page shows one `<h1>` - its own - and any note under a course directory
links back to that course in one click.

**Density-dependent.** No.

---

## Wave 2 - deferrable

### UI-16 - No resume-where-you-left-off affordance

Nothing records the last opened lesson. The mechanism already exists:
`app/client/src/courseList.ts:34-39` persists per-learner interface state to `localStorage`
behind a guard that already handles private-mode failure. Record the lesson route on mount and
surface a resume card on the course list. **Owning files.** `courseList.ts`, `LessonPage.tsx`,
`TenantCoursesPage.tsx`. **Acceptance.** After visiting a lesson and returning to the course
list, a resume affordance links directly to it.

### UI-17 - Every page component is statically imported into the entry bundle

`App.tsx` eagerly imports all 11 pages; the entry chunk is 262KB raw, 81KB gzipped. Note that
the >500KB chunk the build warns about is mermaid's, already behind a dynamic import
(`mermaid.tsx:14`), as is d3-force (`GraphPage.tsx:275`) - so the build warning is not on the
critical path and the real cost is more modest than it looks. Route-level `React.lazy` for the
heavier pages would shrink it. **Acceptance.** The entry chunk drops below 200KB raw once the
graph page is split out.

---

## What is already good, and should not be restructured

The course list's domain grouping, its `<details>` persistence, its filter input and its
zero-results copy (`TenantCoursesPage.tsx:137-143`, with logic tested in `courseList.ts`) are
the strongest information architecture in the application, and already distinguish
zero-results from zero-data correctly. UI-08 and UI-09 add state to that structure. They
should not rebuild it.

## Known omissions and accepted debt

- **Mobile and responsive layout was not reviewed.** Desktop 1440x900 only, by decision.
- **Visual design was not reviewed** - no findings on colour, type, spacing or motion.
- **No automated test proves any of this at density.** The committed fixture under
  `examples/example-learner` has 1 subject, 2 courses and 15 files; the review ran against a
  corpus of 4 subjects, 9 courses and 95 files. Implementers verify locally. Findings marked
  density-dependent - UI-12, and partly UI-11 - cannot be regression-tested until the fixture
  grows. That is tracked as its own item rather than blocking this work.
- **One borderline layout observation, recorded but not counted as a finding.** All seven
  per-course tables on the progress page clip their rightmost column, worst case 99px, because
  `styles.css` sets tables to `display: block; overflow-x: auto` inside a content column
  capped at 46rem - 736px of a 1440px viewport. Columns are cut off and need horizontal
  scrolling inside each table while 700px of viewport sits empty. Raising the cap on the
  table-heavy routes would recover them. It sits on the visual-layout line that was declared
  out of scope, so it is noted here rather than ordered.
