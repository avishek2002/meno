# App spec

*Status: current as of Phase 4; amended at v1.5 (course groups), v1.6 (course-list collapse and
filter; the group write surface removed), v1.10 (note-path breadcrumb, course deep-link, guarded
back control), v1.11 (collapse state actually persists), v1.12 (breadcrumb up-navigation,
truncatable routes, centralized href builders), v1.13 (skip link, header reflow,
reduced-motion coverage, operable-control contrast), v1.14 (scroll clearance measured from
the header), v1.15 (accessible names on controls, tables and headings), v1.17 (the
tenant-scoped guidebook, so the nav bar survives a visit to Guide, and the header nav landmark
renamed off "Main"), and v1.18 (the personal-notes side panel). Canonical formats owned elsewhere: check blocks and
callouts in
[generate-module/references/check-formats.md](../../.agents/skills/generate-module/references/check-formats.md),
todos in
[second-brain/references/todo-format.md](../../.agents/skills/second-brain/references/todo-format.md),
vault conventions in
[second-brain/references/vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md),
ledger semantics in [progress.md](progress.md).*

## Purpose

The daily study surface (decision 2): a local-first web app that renders a tenant's vault,
runs recognition checks, tracks progress, and manages todos - reading and writing the same
files Obsidian and the agent use, with no database and no daemon. It is also where the
write-authority seam (decision 14) is enforced in code.

## How it behaves

1. `npm install && npm run build && npm start` serves `http://127.0.0.1:7373`; when no
   built client exists (a fresh clone that skipped the build), the server mounts Vite in
   middleware mode automatically so the documented start path always serves the app
   (`--port` to override; a busy
   port fails loudly rather than silently hopping). `npm run dev` mounts Vite in
   middleware mode in the same process: one port, hot reload.
2. Structure is derived by walking the content root (`content/tenants/` by default,
   `--root` to override - the app browses tenants only, never the community or org
   tiers) fresh on every request - new courses,
   modules, and lessons appear with no registration step. There is no watcher and no
   cache; a "Re-read files" action re-fetches, and files remain the only truth. A page
   registers one revalidate function with `RevalidateContext` (`app/client/src/RevalidateContext.tsx`)
   and must compose every fetch it depends on into it, not only its own - the lesson page's own
   lesson fetch and its `useCourseContext` course fetch both run, and the learner list's own
   `/tenants` fetch and every card's independent `/progress` fetch all run, so "Re-read files"
   never leaves part of a page stale against the rest.
3. With no tenant content, every screen shows the onboarding empty state pointing at the
   interview as the way to begin.
4. Lesson pages render sanitized HTML; recognition checks mount as interactive widgets
   (mcq, cloze, flashcard). Grading is server-side: `answer` and `explain` never appear in
   any GET response - they return only in the submit response. Flashcards reveal the
   answer only after the learner self-reports.
   Those widgets live inside HTML the server produced, so each one gets its own react-dom
   root mounted into a `div.meno-check` placeholder rather than being a child of the page's
   component tree. That arrangement has one sharp edge, and it is the reason this spec
   mentions it at all (v1.13): **the object passed to `dangerouslySetInnerHTML` must be
   memoized on the HTML string.** React compares that prop by object identity, not by the
   markup inside it, so a fresh `{__html: html}` literal makes React re-assign `innerHTML`
   on every render - and re-assigning `innerHTML` destroys every child of the element,
   which is precisely where the mounted widgets are. One redundant re-assignment removed
   every check on the page, silently and in both the development and production builds,
   for as long as the feature had existed. `app/test/rendered-html.test.ts` pins it, because
   the gate has no DOM and could not otherwise see it.
5. Each graded submission appends one `scored` event (`source: ui`,
   `level: recognition`); dwelling on a lesson appends one `read` event. Transfer callouts
   render as styled prompts with a "graded in your next review session" badge and no
   input. Progress views derive mastery in memory from the ledger; the server never
   writes `mastery.yml`. The Insights page (`#/t/:tenant/insights`) reads
   `GET :tenant/insights` and renders it in one neutral palette with no pass/fail
   coloring - see [insights.md](insights.md) for the metrics themselves.
6. Wikilinks resolve against a basename index of the vault (unique basename wins,
   ambiguity is treated as unresolved) and navigate in-app; broken links render muted,
   never as errors. Mermaid fences render client-side.
7. Todos: create, edit, complete, and park over `todos.md`, line-precise. Every mutation
   carries an `If-Match` content hash; an Obsidian edit between read and write returns
   409 and the client re-reads. Lines are never deleted - only checked off or parked.
   `GET :tenant/todos` is declared stable surface in
   [docs/integration-surface.md](../integration-surface.md), and the two-axis tag rewrite
   (todo-format.md) changes that response's `type` field to a new value set - a breaking
   change to that surface, accepted because no in-house tooling consumes it yet.
8. Course groups, in two layers, read-only to the app. A course already sits under a domain
   directory, so the course list groups by domain with no setup at all; `groups.yml` holds the
   learner's own named groups for what a domain cannot say ("Version Control", "Software
   Fundamentals"), and an explicit group always wins over the domain a course would otherwise
   fall back to. Only a course with no domain - one still at the vault root, from before the
   domain layout - lands in Ungrouped. Both layers are resolved server-side into one ordered
   list of sections, each tagged `source: explicit | domain`, so the client renders sections and
   never re-derives the rule. Membership joins to the tree walk, so a slug the walk no longer
   knows drops out with a warning rather than a dangling entry, and a malformed `groups.yml`
   degrades to the domain layer plus a warning rather than an error page.
   **The app reads this file and never writes it** (v1.6; it had create, rename, delete and move
   routes plus an inline manage panel from v1.5). The explicit layer competes with the domain
   layer rather than complementing it - a course belongs to exactly one group - so a write
   surface for it was the wrong half of the feature to spend four routes and a panel on, and the
   layer that costs the learner nothing is the one that earns its keep. `groups.yml` is authored
   by an agent following `second-brain` or by hand in a text editor, and it remains parsed,
   resolved, schema'd and validated exactly as before. `GET :tenant/groups` is now the whole
   group surface; its `raw_sha256` stays as an honest content hash of the bytes the response was
   read from, useful to a client that wants to notice a hand edit, no longer an `If-Match` token
   because no route takes one for this file.
9. The course list collapses and filters. Each section is a native `<details>`/`<summary>`: the
   summary carries the section title, the number of courses listed under it, and the `by domain`
   marker where the section is the tree showing through. Native is the point - keyboard
   operation, focus order, and the screen-reader disclosure semantics come from the platform
   rather than from a state machine we would have to get right twice. A `Collapse all` /
   `Expand all` control acts on every section at once. A filter input above the list
   substring-matches course titles and slugs, case- and diacritic-insensitively (NFKD with
   combining marks stripped - the same normalization discipline `lib/groups.ts` applies to
   titles and ids, so "cafe" finds "Café" and the other way round). Sections with no match are
   hidden entirely; sections with a match render open whatever their stored state says, and that
   forced opening is never written back. Escape clears the filter. A query that matches nothing
   anywhere gets a no-results line naming the query, never a blank page.
   Open and closed state persists in the browser's `localStorage` under one versioned key per
   tenant (`meno.courseList.open.v1:<url-encoded tenant>`), holding only the sections that differ
   from the default, which is open. A second, distinct key
   (`meno.courseList.resume.v1:<url-encoded tenant>`) holds the lesson last opened - course,
   module, file, and its title - which the course list reads to render a "Resume: <lesson>" link.
   It is written from the lesson page on mount and read from the course list, so it is the one
   piece of view state with two owning pages rather than one: `app/client/src/pages/LessonPage.tsx`
   writes it, `app/client/src/pages/TenantCoursesPage.tsx` reads and writes open state as before.
   Both browser-persisted keys are deliberately disposable: a view preference, never evidence,
   never content, never read by anything that derives progress or moves a gate. Clearing either
   loses a preference and nothing else; a browser that refuses storage degrades to session-only
   and every screen still renders, the resume link simply absent.
   A `toggle` event counts as the learner's own action only when the element's new state
   disagrees with the state the last render gave it (v1.11). The browser fires `toggle` for every
   change to the `open` attribute, React's own writes included, so a mount, a remount, or
   `Collapse all` each produce one that no learner asked for - and writing those back is what used
   to erase the stored preference on every page load. For the same reason the list waits for both
   `/tree` and `/groups` before it renders a section at all: on the render where only the tree has
   landed, every course falls back to one transient `Ungrouped` section, and pruning stale ids
   against that list would drop the learner's real sections.
   All of the pure logic - the fold, the match, the section assembly, the default-open rule, the
   toggle decision, the pruning of stale ids, and both key schemes - lives in
   `app/client/src/courseList.ts`, a module with no React and no DOM references, so `node --test`
   covers it like the server. It is the one piece of client logic in this repository that is
   unit-tested rather than smoke-tested, and it is a `.ts` file among `.tsx` files on purpose: the
   root `tsconfig` compiles `app/**/*.ts` without the DOM lib, so naming a browser global there
   fails typecheck instead of failing review.
10. Degraded paths: malformed YAML or check payloads render inert with a warning attached
   to the response; a partial curriculum never breaks a page.
11. Self-explanation, in two layers. **Tooltips**: an `InfoTip` disclosure sits beside the
   terms whose meaning is not self-evident (the "Re-read files" action, the mastery table's
   Level / Transfer score / Recognition rate / Next review columns, Due for review, Todos,
   Insights). It is a disclosure button, not a hover-only tooltip - it opens on hover, on
   keyboard focus, or on click (click pins it so the pointer can leave), closes on Escape
   returning focus to the trigger, and carries a 24 by 24 pixel hit area. The bubble is
   positioned `fixed` from the trigger's rect because the mastery tables are
   `display: block; overflow-x: auto` and would clip an absolutely positioned child.
   **The guidebook**: `#/guide` explains what the app is, the four-step loop, what each
   screen does, what the app deliberately will not do (the write-authority seam, in plain
   language), and why re-reading is manual, plus a glossary. Its section links are real URLs
   (`#/guide#glossary`), so the route pattern tolerates one trailing fragment and the page
   scrolls to it, honoring `prefers-reduced-motion`. A "Guide" nav link is present on every
   screen including the no-tenant empty state, which is exactly when help is most wanted.
   **The guidebook is also reachable in a tenant-scoped form (v1.17, UI-18)**:
   `#/t/:tenant/guide`, a second `RouteDef` sharing the name `guide` rather than a widened
   pattern, for the same reason `course` further down is two entries - one alternative can only
   declare one named capture group, and both forms independently need their own `#section`
   group. Before this, the header's Guide link always pointed at the tenant-less URL, which
   dropped the tenant from `route.params` on arrival and took the other six nav links (Courses,
   Graph, Todos, Progress, Insights, Cost) down with it - visiting Guide from inside a tenant
   left only the browser's own back button as a way out, since the nav block that would have
   linked back to any of those pages had rendered nothing. The header now links whichever form
   matches where the reader is (`tenantGuideHref` inside a tenant, `guideHref` outside one -
   `app/shared/routeHrefs.ts`), and the guidebook's own table-of-contents links do the same, so
   the tenant survives not only the first click into Guide but every section click inside it
   too. The decision behind which entries the nav bar renders, in what order, and with what
   `aria-current`, is a pure function (`app/client/src/headerNav.ts`) `Header.tsx` renders by
   mapping over - the one piece of this that a DOM-free test can actually pin down, since this
   repo has no DOM test library. The tenant-less form is unchanged and still the one link that
   is always present regardless of where the reader is, per the reasoning two sentences up.
   `#/t/:tenant/c/:course` tolerates the same shape of trailing fragment
   (`#/t/:tenant/c/:course#<module-slug>`) as a module anchor: each module card on the course
   page carries `id={module.slug}`, `CoursePage` scrolls to it on load the same way `GuidePage`
   does for a section, and a module cell elsewhere in the app (the insights page's planned-debt
   table) links through `courseContext.ts`'s `courseModuleHref` instead of landing on the top of
   the course.
12. `#/t/:tenant/graph` renders the whole tenant vault as one picture, joined to the ledger -
    what is planned but unwritten, what is mastered, and how courses connect. See
    [graph.md](graph.md) for the full behavior.
12a. `#/t/:tenant/glossary` lists the vocabulary the tenant's generated lesson bodies
    introduced (v1.17). One entry per term per course: the first definition encountered in
    curriculum order is canonical, and every later lesson defining the same term becomes a
    backlink, so a word appears once with its history rather than once per lesson. **Ordering is
    curriculum order, never alphabetical** - grouped by course, then by module in teaching
    sequence, then by lesson within a module - because a glossary read alongside a course is
    read in the order the course teaches, and alphabetizing separates a term from the lesson
    that motivates it. A search input narrows it by plain case-insensitive substring over the
    term and its definition, the same rule the course filter applies to a title and slug; there
    is no fuzzy matching and no search dependency.
    **The page reads no ledger.** It shows every term from every generated lesson body,
    including lessons the learner has not opened, and it carries no read, due, or mastery state
    of any kind. That is a deliberate scope choice, not an oversight: a term is display
    vocabulary, and wiring the glossary to progress would make a reference surface into
    evidence. The mastery-bearing list is `concepts:`, which lives in the manifest and is
    untouched by this feature.
13. Getting out of a note, and one step back (v1.10). A note is reached by following a wikilink
    from anywhere in the vault, so it is the screen most likely to be entered with no idea where
    it sits. The note body's own heading (already inside the rendered HTML) is the page's only
    `<h1>` (UI-15); the vault path renders below it as a breadcrumb in a `<nav aria-label="Breadcrumb">`,
    with one segment per path component, where a segment the server confirmed is a real place
    becomes a link: the domain directory to the course list deep-linked at the course's own
    section (`#/t/:tenant#course-<slug>`, the same one-trailing-fragment shape the guidebook's
    section links already use), and the course directory to the course page. Every other segment -
    the intermediate directories, and the file itself - is plain text; the breadcrumb's own link
    styling (not colour alone) is what tells the reader what is clickable before clicking.
    **Resolution is server-side**: `GET :tenant/note` returns the owning course and
    its domain from the same walk that answers every other route, so the client links only what
    exists, and a note outside every course (`home.md`, `insights/`, `sources/`) degrades to a
    wholly plain breadcrumb rather than a confident link to a 404. The deep link forces the section
    holding that course open over the stored collapse state and scrolls to it, moving focus
    there and honoring `prefers-reduced-motion`; that forcing is never written back, exactly as
    the filter's is not (item 9), because a visit is not a preference. A fragment naming a
    course this tenant does not have renders the ordinary list and nothing else.
    **The fragment keys on the course, not the domain**, which is the non-obvious half. Keying
    on the domain reads as the natural choice - it is the segment being clicked - but an
    explicit group in `groups.yml` removes its courses from the derived domain section, so a
    domain whose courses are all filed into groups has no section at all and the link would
    expand nothing. The example tenant is exactly that shape, which is how this was caught. The
    course, unlike the domain, is always in exactly one section whichever layer claimed it. It
    also keeps the property the domain form had: a course slug is already a URL surface
    (`#/t/:tenant/c/:course`), while an arbitrary group id from a hand-edited file never becomes
    one - not in a URL, and not as a DOM id either, which is why the scroll target is held as an
    element reference rather than looked up by id.
    The header carries a back control alongside the wordmark: `history.back()`, hidden entirely
    at in-app depth 0, so a bookmark or a deep link cannot eject the reader out of Meno on their
    first click. Depth is stamped per history entry on `history.state` rather than counted,
    because a counter incremented on every `hashchange` reads a backward navigation as another
    step forward and defeats the guard it exists to provide. The stamping happens on
    `hashchange` rather than at navigation time because this app's links are plain anchors that
    never pass through `navigate()`.
14. Going up, and a URL that truncates (v1.12). Every page more than one level below the tenant
    root carries a breadcrumb - lesson, note, and course - and the flat siblings under the tenant
    root (Graph, Todos, Progress, Insights, Cost) carry none, because the nav bar's `aria-current`
    already answers "where am I" for those and a one-segment breadcrumb says nothing. **The
    breadcrumb is the up control, and the header's back control is not.** The `←` beside the
    wordmark stays exactly what item 13 describes, `history.back()`: a left arrow in the top-left
    reads as temporal in every browser and every operating system, so binding it to "up" would
    make it the one control on the page whose destination cannot be guessed before clicking,
    where a breadcrumb names its target in words. Temporal back is also already free on every
    gesture, key and mouse button the platform provides; hierarchical up is the move the platform
    cannot make.
    **The module is a route segment, not only a fragment.** `#/t/:tenant/c/:course/m/:module`
    resolves to the course page scrolled to that module, which is what the lesson breadcrumb's
    module segment links to. That makes every meaningful prefix of a lesson URL a real page -
    deleting `/l/<file>` lands on the module, deleting `/m/<module>` on the course, deleting
    `/c/<course>` on the course list - where before, truncating a lesson URL by one segment gave
    not-found. Hand-editing the address bar is a real navigation gesture and it now works.
    The `#<module>` fragment form of item 9's anchor keeps matching, so bookmarks written before
    this change still resolve; it is the older spelling of the same destination, not a second
    destination. Arriving at a module by either spelling scrolls it into view, moves focus to it
    (`tabIndex={-1}`, `preventScroll`) so a keyboard reader is not returned to the top of the
    document, and marks it with a highlight class cleared after about 1.5 seconds - all three
    honoring `prefers-reduced-motion`, read through the one helper that owns that query. The
    highlight cannot be CSS `:target`: the browser treats everything after the first `#` as the
    fragment, so with a hash router no element id ever matches it. Nor can the programmatic
    `focus()` be relied on to draw a ring, because `:focus-visible` frequently does not fire on
    focus a script moved.
    Every route URL the app emits is built by a named builder in `app/shared/routeHrefs.ts` -
    including the ones `lib/graph.ts` writes into `GraphResponse.route`, which is why the module
    lives under `app/shared/` rather than beside the client's other route logic: it is the one
    directory the server half may import from. The route table and the builders are two
    transcriptions of one grammar, so they are pinned together by round-trip tests asserting
    `matchRoute(builder(...))` recovers what went in. Nothing else in the client may write a
    route URL by hand.

15. The accessibility floor, and where it is enforced (v1.13). Four properties hold on every
    route, each of them checkable by a machine rather than by eye, which is the only reason they
    can be trusted: a **skip link** is the first tab stop, hidden until focused, and moves focus
    into `<main>` rather than following its own fragment (this is a hash-routed app - letting
    `#main-content` reach `location.hash` would hand the router a hash it cannot match and land
    the reader on not-found); the **header wraps** rather than pushing the document sideways, so
    no route scrolls horizontally at 320 CSS px (WCAG 1.4.10); **`prefers-reduced-motion` is
    honored by every animated element**, through one wildcard rule that cannot be outgrown by the
    next transition somebody adds; and **`--border-strong` (3:1 against its background in both
    schemes) draws the edge of anything a person operates** - text fields, selects, and buttons
    whose only boundary is a border - where the decorative `--border` is 1.32:1 light and 1.44:1
    dark and would leave those controls with no perceptible edge (WCAG 1.4.11). The split is
    deliberate: 1.4.11 covers what identifies a component, not every hairline, so panel and
    separator edges keep the lighter token.
    **Every in-page scroll target clears the sticky header at any width** (v1.14), because the
    header publishes its own measured height as `--header-height` and `--scroll-clearance` is that
    height plus a gap. A constant cannot work here: the header wraps, so it is 60px tall on a
    laptop and 188px at 360px wide, and `scroll-margin-top` cannot reference another element's
    height. The previous fixed 4.5rem left an anchored module card 28.5px underneath the header on
    a narrow screen - `elementsFromPoint` returned `.app-header` over the very target the
    navigation had been asked to reveal - and wrapping the header at v1.13 made the mismatch
    larger, not smaller. The gap stays in CSS because it is a design decision; the height comes
    from JavaScript because it is a fact about the DOM. All three consumers (the guidebook's
    `#section` anchors, the module anchor, the course-list deep link) share the one expression.
    **Nothing a person operates, and no table, is nameless** (v1.15). An accessible name is
    computed, not authored, so three separate mechanisms had each been quietly producing the
    wrong one. A control given no name at all computes to the empty string, which is what the
    todo checkboxes and the two todo filter selects did; screen-reader users heard the role and
    nothing else. A control named only by its `placeholder` computes to that placeholder, which
    is worse than nothing when it repeats: all three cloze inputs on a lesson page answered to
    "Your answer", so the name identified the widget type rather than the question, and the
    prompt each one belongs to was never announced. And name-from-content recurses into
    descendants including interactive ones, so every heading, `<th>` and `<label>` wrapping an
    `InfoTip` absorbed that button's own `aria-label` into its name: the course list's `h1`
    announced as `Courses What is "Groups"?`, and four mastery column headers carried their
    glossary tooltip's question inside the column's name. The fix is the same shape in all three
    places and adds no visible markup - `aria-label` where the name is a plain string the
    component already holds, `aria-labelledby` pointing at a span around the visible text where
    it is not, and `InfoTip` itself left untouched, because `aria-hidden` on a focusable button
    would trade one violation for another. Tables take an `aria-label` rather than a visible
    `<caption>` for the same reason: the name was the defect, and adding visible titles is a
    design change that belongs with the missing subheadings it would expose. Every `<th>` in the
    nine authored tables now carries `scope`; tables rendered from lesson markdown come through
    `app/server/markdown.ts` and have no per-table markup to edit, so they are untouched and
    still open. Full-page empty states now render their heading at `h1`, so a page whose entire
    body is an empty state is no longer topped by an `h2`; `EmptyState` keeps `h2` as its default
    for the two call sites that nest under a heading that already exists.
    The gate cannot verify any of this. `node --test` carries no DOM, so the committed tests are
    source assertions and the computed names were confirmed once, by hand, by reading Chromium's
    accessibility tree over the DevTools protocol with Playwright borrowed from a neighbouring
    project. That is the same borrow-and-return arrangement the v1.13 audit used, and it leaves
    the same gap: a future regression here fails silently unless somebody looks again.

    **The header's nav landmark is named "Primary" (v1.17, UI-18).** It was "Main", which was
    the wrong name twice over: it duplicated what the `<main>` element already carries, and a
    reader asked for it to go. Renamed rather than deleted, because an unnamed `<nav>` is
    announced as a bare "navigation" next to the three named ones a page can also carry
    (`Breadcrumb`, `Lesson navigation`, `Guidebook sections`), which is worse than a redundant
    name. Not "Sections" either: the guidebook's own table of contents is `Guidebook sections`,
    and on that one page a landmark list would show two names where one is a substring of the
    other, with nothing marking which is the site-wide chrome. Not "Primary navigation": the
    role is already announced, so the longer form reads as "Primary navigation navigation".
    Unlike the v1.15 names above, this one is gated - `a11y-names-and-semantics.test.ts` pins
    both the name and the substring relationship to the guidebook's, since the collision, not
    the wording, is the part a later edit would reintroduce by accident.

    These came out of an agent-run audit of all twelve pages against WCAG 2.2, the ARIA Authoring
    Practices Guide, and the documented axe-core rule set. What that audit could check was
    structure, names, focus, contrast, geometry and motion; what it could not check was whether
    any of it looks good. The findings it raised and this change does not close are recorded in
    PROGRESS.md rather than silently dropped.

16. A notes side panel, present on the course page and on every lesson page (v1.18). It writes
    plain markdown into one file per course, sectioned so a note stays attached to the anatomy
    part of the lesson that provoked it - never to selected text, and never to stored heading text
    (a reworded heading keeps its note). Full format, anchoring model, and HTTP surface:
    [notes.md](notes.md). At 1200 CSS pixels and above the panel pushes, taking the right margin
    the reading column already leaves empty (`main.content`'s `max-width: 46rem` unchanged in
    both states); below that it overlays over a scrim. Saving debounces about 2 seconds after the
    last keystroke, plus an immediate flush on blur, on panel close, on route change, and on
    `pagehide`. Every write carries an `If-Match` content hash; on a 409 the client keeps the
    unsaved text in `localStorage` and offers exactly two choices - reload from disk (discard the
    buffer, adopt the server's copy) or overwrite (re-send the same text against the conflict
    body's hash) - never an auto-merge or a diff view.

## Architecture

One process, two halves, one root `package.json`:

- `app/server/` - Node, TypeScript, zero build step (Node type stripping,
  `erasableSyntaxOnly`), `node:http` with a regex route table - no framework. Modules:
  `routes.ts` (the whole surface), `tenant.ts` (discovery + path guard), `tree.ts`
  (walk-on-request + vault index), `markdown.ts` (unified pipeline: remark-parse,
  frontmatter, gfm, three local transforms - wikilinks, callouts, check mounts -
  remark-rehype, rehype-raw, rehype-sanitize, stringify), `checks.ts` (grading),
  `ledger.ts` (the only UI write path to the ledger), `todos.ts` (line-precise ops),
  `groups.ts` (reads the course-group file, over `lib/groups.ts`), `notes.ts` (v1.18, the
  personal-notes file: parse, serialize, upsert - [notes.md](notes.md)), `atomic.ts` (the two
  write disciplines).
- `app/client/` - Vite + React, dependencies react, react-dom, mermaid only; hash
  routing and data fetching hand-rolled. `src/guide/` holds the help copy as client-side
  data: `glossary.ts` (one entry per explained term, read by both the tooltips and the
  guidebook's glossary, so a term can never be explained two ways) and `content.ts` (the
  guidebook's sections). Shipping this as data rather than markdown on disk is deliberate -
  rendering it from the repository would mean a route that reads outside the content root,
  which invariant 6 exists to prevent. Scope is equally deliberate: the guidebook explains
  the app, and links out to `docs/how-meno-works.md` for the journey, rather than
  duplicating a document that would then drift.
- `app/shared/types.ts` - the transport shapes both halves compile against.
- `app/test/` - `node --test` against a real server instance on an ephemeral port, over a
  throwaway copy of the example tenant.

The HTTP surface (base `/api/v1`): reads - `health`, `tenants`, `:tenant/tree`,
`:tenant/course/:course`, `:tenant/lesson/:course/:module/:file`, `:tenant/note?path=`,
`:tenant/todos`, `:tenant/progress`, `:tenant/insights`, `:tenant/ledger`, `:tenant/groups`,
`:tenant/graph`, `:tenant/glossary`, `:tenant/notes/:course` (v1.18, read-only half; see
[notes.md](notes.md)). `:tenant/note?path=` also answers with the note's owning `course` and `domain`,
or nulls, resolved from the same walk rather than from the path's shape (invariant 14).
`:tenant/insights`
has no write counterpart - it computes `lib/insights.ts`'s `computeInsights` fresh over the
same walk and adds the list of narrative report files under `insights/` (spec:
[insights.md](insights.md)). `:tenant/glossary` (v1.17) has no write counterpart either - it
reads each module's `terms.yml` sidecar off the same walk and merges them through
`lib/terms.ts`'s `mergeTerms`, so the format's rules are stated once and both the app and
`tools/validate.ts` answer from them. Writes (the entire write surface) - `POST :tenant/check/submit`,
`POST :tenant/lesson/read`, `POST :tenant/todos`, `PATCH :tenant/todos/:line`,
`POST :tenant/todos/:line/park`, `PUT :tenant/notes/:course` (v1.18). Six routes across three
files: the ledger, `todos.md`, and the notes file (`app/server/notes.ts`, [notes.md](notes.md)) -
not evidence, so it appends no ledger event either.
`groups.yml` was the third from v1.5 until v1.6 and is now read-only to the app, which is worth
stating rather than leaving as an absence - a group write was never load-bearing, and an agent
or a text editor authors that file better than four routes and a panel did. The smallest write
surface that does the job is the one that can still be reasoned about. There is
deliberately no generic ledger endpoint: no route accepts `event`, `source`, or `level` from a client, and
`ledger.appendUiEvent` - the single exported writer - hard-sets `source: ui`, asserts the
shape, and validates against the narrowed `schemas/ledger.ui.schema.json` before any byte
reaches disk. Three layers; a widening of the main ledger schema can never widen the UI's.

Write disciplines: the ledger is appended with a single sub-4096-byte `write()` on an
`O_APPEND` descriptor (atomic against the agent appending concurrently - no lockfile);
everything else is same-directory temp file + fsync + rename, guarded by `If-Match`.

Security posture for a private vault: bind `127.0.0.1` only; require a loopback `Host`
header; reject foreign `Origin` headers; every request-derived path is rejected on `..`
before resolution, must stay under the content root after resolution, and must not escape
via symlink after `realpath`.

The `Host` check is what closes DNS rebinding, and it is not redundant with the `Origin`
check. Once an attacker's name resolves to `127.0.0.1`, their page is same-origin with the
app, so its requests carry no `Origin` header at all and the `Origin` check never fires;
the `Host` header still names the attacker's domain, and a browser will not let a page
forge it. `Origin` covers ordinary cross-site requests, `Host` covers rebound ones, and
both run before routing so they cover writes and unrouted paths equally.

## Data touched

| Path or endpoint | Access | Owner | Format |
|---|---|---|---|
| `content/tenants/**` (tree, lessons, notes, manifests) | read | server | owned formats |
| `content/tenants/<tenant>/progress/ledger.jsonl` | append (ui events only) | server via `appendUiEvent` | ledger.ui.schema.json |
| `content/tenants/<tenant>/todos.md` | replace (atomic, If-Match) | server | todo-format.md |
| `content/tenants/<tenant>/<domain>/<course>/<course>-notes.md` | replace (atomic, If-Match) | server, and the learner in Obsidian | [notes.md](notes.md) |
| `content/tenants/<tenant>/groups.yml` | read | agents via second-brain, or the learner by hand | vault-conventions.md, groups.schema.json |
| `content/tenants/<tenant>/<domain>/` (as the default grouping) | read | `lib/course-dirs.ts` walk | vault-conventions.md |
| `content/tenants/<tenant>/progress/mastery.yml` | never (derives in memory) | tutor only | progress.md |
| `app/client/dist` | read (static) | build | - |
| browser `localStorage`, key `meno.courseList.open.v1:<tenant>` | replace | client | one JSON object, section id to open flag |
| browser `localStorage`, key `meno.courseList.resume.v1:<tenant>` | replace | client | one JSON object: course, module, file, lesson title |
| browser `localStorage`, key `meno.notes.open.v1:<tenant>` | replace | client | one boolean, panel open or closed |
| browser `localStorage`, key `meno.notes.buffer.v1:<tenant>:<course>` | replace | client | one JSON object mapping a section key to unsaved note text, cleared on write success (invariant 13) |

## Invariants

1. No HTTP endpoint accepts `event`, `source`, or `level` from a client; the literals are
   constructed server-side at exactly two call sites.
2. `appendUiEvent` is the only UI write path to the ledger; it throws on any non-ui,
   non-recognition shape and validates against the narrowed schema.
3. `answer` and `explain` never appear in a GET response body.
4. The server never writes `mastery.yml` and never read-modifies-rewrites the ledger.
5. Correctness never depends on a watcher or cache; every read endpoint rebuilds truth by
   walking the tree.
6. Every request-derived path stays under the content root after realpath.
7. The server binds `127.0.0.1` only, rejects foreign-origin requests, and rejects any
   request whose `Host` header is not a loopback name - both checks run before routing.
8. Exactly one implementation exists for grading, lesson parsing, mastery derivation, markdown
   rendering, and course-group resolution - the app imports `lib/`, never re-implements it.
   `lib/groups.ts` is what the server resolves through, what `tools/validate.ts` checks with, and
   what defines the format an agent hand-edits.
9. No route builds a filesystem path from a group id or a course slug supplied by a client. The
   only file the group surface names is the tenant's own `groups.yml`, reached through the tenant
   path guard alone. Section ids are never read as bare object keys either - the client's
   open-state map is read with `Object.hasOwn` - so no id, from a stored value or a hand-edited
   file, can reach `Object.prototype`.
10. The app never writes `groups.yml`. No route mutates it and `lib/groups.ts` exports no mutation,
    so the file has exactly two authors: an agent, and the learner's own text editor.
11. Help content is client-side data only; no endpoint serves a file from outside the
    content root to render the guidebook or a tooltip.
12. Every explained term has exactly one definition, in `src/guide/glossary.ts`; tooltips
    and the guidebook glossary both render from it rather than restating it.
13. The client persists disposable view state, in `localStorage`, under keys prefixed
    `meno.courseList.open.v1`, `meno.courseList.resume.v1`, or `meno.notes.open.v1`, plus - the one
    narrowing v1.18 makes to this invariant - unsaved note text under `meno.notes.buffer.v1`, held
    only between a failed write and its resolution and deleted the moment that write succeeds or
    the learner chooses "reload from disk". No other content, evidence, progress, or todo is ever
    kept in the browser, and every screen renders correctly with the store empty, full of stale
    ids, missing a resume record, or unavailable entirely.
14. The note breadcrumb links only what the server resolved. The client never infers a course
    from the shape of a path; `GET :tenant/note` answers with the owning course and domain or
    with nulls, and any segment without a server-confirmed target renders as text. A course slug
    is emitted as a fragment only when it matches the route pattern's own character class, so a
    link this app renders can never land on not-found. No group id from `groups.yml` appears in
    a URL or in the document, at either end of this feature.
15. No route URL is written by hand. Every one is built by a named builder in
    `app/shared/routeHrefs.ts`, on both sides of the process - the client's links and the
    `GraphResponse.route` field the server emits - and every meaningful prefix of a lesson URL,
    truncated at a `/<letter>/<value>` boundary, matches a named route rather than falling
    through to not-found.
16. Parsing then serializing a notes file with no edit is byte-identical to the input, for every
    input, and a write to one block changes only that block's body bytes - every other byte,
    recognized or not, survives unchanged. No block is ever deleted; clearing a note empties its
    body. Full detail: [notes.md](notes.md), invariants 1-3.
17. A note is addressed by anatomy part key, never by comparing stored heading text to a lesson's
    current heading text. Rewording a `##` heading that matches the anatomy table keeps its
    section key, and its note keeps resolving to that heading, across the reword. Full detail:
    [notes.md](notes.md), invariant 4.

## Verified by

- Invariants 9, 10: `app/test/groups.test.ts` - a structural assertion that the route table
  exposes exactly one `groups` route and that it is a `GET`, and that `lib/groups.ts` exports no
  mutation; plus the read-side degraded paths (a malformed file rendering inert, a deleted course
  dropping out with a warning, a traversal-shaped tenant refused). The v1.5 runtime assertion -
  diffing the ledger and `course.yml` across a full round of group operations - retired with the
  operations it exercised. A route that does not exist cannot write, and the structural check is
  what stops one coming back unnoticed; that is the honest way to record an invariant that went
  from enforced to true by construction, rather than leaving a claim pointing at deleted code.
- Invariants 1-2: `app/test/write-authority.test.ts` - hostile injected fields on every
  write route, the appendUiEvent throw, a no-agent-literal source assertion, and a full
  scripted UI session asserting zero gates unlocked, zero transfer evidence gained.
- Invariants 3, 5, 6, 7: `app/test/api.test.ts` - answer-stripping, discovery
  mid-process, traversal/symlink suite, todos line-diff round-trip, If-Match 409, and a
  50-submit + concurrent-agent-appender ledger integrity test. Invariant 7's two header
  checks live in `app/test/write-authority.test.ts`: foreign-origin rejection, rebound
  `Host` rejection with no `Origin` present, the loopback forms that must still pass, and
  coverage of a write route and an unrouted path. Forging a `Host` header needs
  `helpers.ts`'s `rawRequest`, because `fetch` replaces a caller-supplied one.
- Invariant 4: by construction (no code path); the ledger check re-asserts at rest.
- Invariant 14 and behavior 13: `app/test/api.test.ts` for the server half (a note inside a course
  dir resolving to its slug, title and domain; a note outside every course - both at the vault root
  and in a non-course subdirectory - resolving to nulls; plus direct `resolveNoteCourse` cases for
  the longest-prefix tie-break, an ungrouped course dir, and a sibling-prefix near miss that must not
  claim the path). `app/test/note-path.test.ts` covers the breadcrumb rules, `app/test/route-table.test.ts`
  the `tenant` route's fragment - including the assertion that a greedy `tenant` class does not swallow
  `#domain-x` - and `app/test/history-depth.test.ts` the back button's depth decision. The DOM behavior
  around all of it - the forced-open override, its release, the scroll, the button appearing and
  hiding - is **browser-verified rather than gate-covered**: `node --test` has no DOM, so a headless
  walk over the example tenant is what actually observed it. That walk is not committed and does not
  run in CI, which is the honest limit of this claim. It is also what caught the one defect this
  change had after the gate was already green: the browser fires `toggle` when React sets `open` on
  the remounted `<details>`, so the deep link's own forced open was being read as a user action -
  releasing the force on the render that applied it and persisting over the learner's stored choice.
  The rule now lives as a pure decision (`decideToggle`) in `courseList.ts` with its own unit tests,
  so that regression is gate-covered even though the rendering is not.
- **The collapse state surviving a reload (behavior 9, invariant 13), fixed at v1.11** after the
  v1.10 walk found it broken and left it alone. It had never worked: closing a section stored the
  preference correctly, and the next page load threw it away. The mechanism took a browser to see,
  because two separate defects had to line up. React renders the list as soon as `/tree` resolves,
  and on that render `/groups` may not have, so `ungrouped` falls back to every course and one
  transient `Ungrouped` section renders. Setting `open` on it fires a mount-time `toggle`, the
  handler read that as a click, and `writeOpenState` pruned the learner's real section ids against
  a section list that held only `section:ungrouped` - emptying the object, so `removeItem` ran.
  The remaining mount toggles then reported `true`, which normalization drops as the default, and
  the list came back fully expanded looking entirely correct. That is why it survived v1.6 and the
  v1.10 walk: the pure logic under it was right the whole time, and no test in the gate has a DOM.
  Both halves are closed - `decideToggle` now discards any toggle whose value already matches what
  was rendered, and the page waits for `/groups` as well as `/tree` before rendering a section.
  The first half is gate-covered as a pure decision; the rendering that produces it is not, so this
  was re-verified by a headless walk over the example tenant (collapse and reload, `Collapse all`
  and `Expand all` and reload, filter forcing a stored-closed section open without writing it back,
  Escape restoring it, and the deep link forcing, releasing and re-forcing). That walk is not
  committed and does not run in CI, the same honest limit as the bullet above.
- Invariants 11-12: by construction (no route reads outside the content root; both
  renderers import `GLOSSARY`). Not machine-asserted - a future contributor could add a
  second copy of a definition and nothing would fail.
- Behavior 11's tenant-scoped guidebook (v1.17, UI-18): `app/test/route-table.test.ts` proves the
  ordering claim in the `guide` RouteDef's own comment directly - `#/t/alice/guide` resolves to
  `guide` with `{ tenant: 'alice' }`, not to `tenant`, `note`, or `not-found` - rather than leaving
  it argued only in prose; `app/test/route-hrefs.test.ts` covers `tenantGuideHref`'s encoding and
  round-trips it through `matchRoute` with and without a section, and pins `guideHrefFor`, the
  chooser both call sites go through. That last one is the load-bearing line of this change and
  the reason it is a shared function rather than a ternary in each caller: the header's copy
  would have been gate-covered and the guidebook's, living in a `.tsx` file `node --test` cannot
  strip, would not - which is exactly the asymmetry the original bug hid in. The nav bar's own shape - which
  entries render, in what order, current on which route, and which href Guide carries - is
  `app/client/src/headerNav.ts`, a pure extraction with no DOM and no React import, covered by
  `app/test/header-nav.test.ts`: all seven entries on the tenant-scoped guide route, Guide alone
  with none, Guide current on both forms, and the Courses sub-route grouping (UI-03) preserved.
  `Header.tsx` renders by mapping over that module's output, so what the test pins down is what
  the header actually draws, not a parallel description of it - the same discipline
  `courseList.ts`'s pure decisions get. Rendering itself - the header actually reappearing on
  screen after a Guide click, and staying up through a section click - is not gate-covered, the
  same DOM-free limit every other page-level behavior in this file carries. It was
  **browser-verified** instead, the borrow-and-return arrangement v1.13 and v1.15 both used:
  Playwright from a neighbouring project, driving the dev server over the `examples/` fixtures
  through the exact journey the bug was reported on - open a tenant, click Guide, click a
  guidebook section, click back to Courses - plus the tenant-less `#/guide` and a bookmarked deep
  link to `#/t/<tenant>/guide#glossary`. All seven nav entries present and Guide marked current on
  every tenant-scoped state, Guide alone on the tenant-less one, no console errors. The same gap
  the other audits leave applies: a future regression in the rendering half fails silently unless
  somebody drives it again.
- Behavior 14 and invariant 15 (v1.12): `app/test/route-hrefs.test.ts` round-trips every builder
  through `matchRoute` and asserts the encoding of a value carrying a space, a `#`, a `/` and a
  non-ASCII character; `app/test/route-table.test.ts` walks a lesson URL's `/<letter>/<value>`
  boundaries and asserts each prefix resolves to a named route; `app/test/scroll-reset.test.ts`
  covers the anchored-route guard on the scroll reset; `app/test/reduced-motion.test.ts` is a
  source grep asserting exactly one file queries `prefers-reduced-motion`, the same technique
  `course-list.test.ts` uses to keep `localStorage` in one file. What no test in the gate covers
  is the rendering: the breadcrumb links, the focus move, and the highlight have no DOM to fail
  in, so they were **browser-verified** over the example tenant - the lesson breadcrumb's module
  link navigating to the truncated form, the module card landing clear of the sticky header
  (top 72px against a header bottom of 60px), `document.activeElement` becoming the card, the
  highlight class present on arrival and gone 1.8 seconds later, and zero breadcrumbs on all five
  flat sibling pages. That walk is not committed and does not run in CI, the same honest limit
  the v1.10 and v1.11 walks carry.
- The guidebook and tooltips: typecheck, build, and the full suite pass, and the built
  bundle was confirmed to carry the copy. **Not visually verified in a browser** - the
  usual "drive it in both colour schemes" pass could not run in the session that added it
  (no browser automation available), so keyboard operation, the pinned-open behavior, and
  dark-mode contrast of the bubble are reasoned-about rather than observed. Worth one
  manual pass before trusting them.
- "Example course fully navigable": live smoke run recorded in the Phase 4 pull request
  (API walk of tree, course, lesson, submit, todos, progress against the example tenant,
  plus the built client served). Client-side rendering is smoke-verified, not
  unit-tested - a deliberate v1 economy (the logic lives server-side).
- Invariants 12-13 and the collapse/filter behaviour: `app/test/course-list.test.ts` - the fold,
  substring matching on title and slug, diacritic folding both directions, section hiding, forced
  expansion while filtering with the stored state left intact, stale-id pruning measured against
  every section rather than the visible ones, prototype-shaped keys in a stored value, an absent
  and a throwing store, the resume-state round trip and its own degraded paths, and a source grep
  asserting that `localStorage` appears only in `LessonPage.tsx` and `TenantCoursesPage.tsx` (the
  two owners UI-16 gives it) and that `courseList.ts` names no browser global and imports no
  React.

- The grouped course list was driven live in a browser against a five-course vault at v1.5: three
  groups plus a fallback section, correct counts and ordering, dark mode, and the `Groups`
  tooltip. The two-layer resolution (explicit over domain, ordering, id collision, and the
  Ungrouped remainder) is unit-tested in `tools/test/groups.test.ts` and asserted end to end over
  HTTP in `app/test/groups.test.ts`. The v1.5 inline manage panel was never visually verified and
  has been removed at v1.6 rather than verified - the browser automation available in that session
  could not reach a loopback page, and a panel nobody could drive was not worth keeping on the
  strength of the bundle carrying its copy.
  **The v1.6 collapse and filter behaviour was driven in a browser at v1.11**, which is how the
  reload bug above was pinned down and confirmed fixed: collapse, `Collapse all` / `Expand all`,
  the filter's forced expansion, Escape, the no-results line, and the deep-link override were all
  observed against the example tenant. Keyboard operation of the `<details>` summaries,
  focus-visible rings, and both colour schemes still are not - that walk was scripted, not driven
  by hand. Worth one manual pass, as with the guidebook above.

- Invariants 16-17 and behavior 16: `app/test/notes-format.test.ts` (round-trip over the worked
  example plus fixtures with no blocks, an unterminated marker, duplicate addresses, CRLF, and no
  trailing newline; preservation under edit diffed region by region; empty-note and
  creating-a-block cases), `app/test/notes-api.test.ts` (every status code in the `PUT` table, the
  If-Match conflict round trip, the first-write-creates-the-file-and-one-todo property, and the
  anatomy-key rewording property against a running server), and `app/test/section-ids.test.ts`
  (rendered heading ids and `data-meno-section`, the `user-content-` clobber guard, and the
  rewording property at the markdown-rendering layer). `app/test/notes-panel.test.ts` covers the
  client half: section list assembly, both `localStorage` key schemes, the debounce and flush
  decision, the conflict state machine, and source assertions for no `:target`, no
  `document.getElementById`, and one `prefersReducedMotion()` call site.

## Open questions

1. Whether a course slug should carry a durable identity beyond the slug itself. Today, deleting
   a course and later creating a different one that reuses its slug silently inherits the old
   group membership. Renaming a course directory is a pre-existing non-goal (slugs are stable
   once created, because wikilinks bind to them), so this is narrow - but it is a real, quiet
   wrong answer rather than a visible failure, and worth revisiting if slug reuse ever happens.
2. Whether the explicit group layer earns its place at all now that the app only reads it. Array
   order in `groups.yml` is display order, and both order and membership are a hand edit or an
   agent edit away. If the domain directories turn out to carry the whole load in practice, the
   honest next step is to retire `groups.yml` rather than to grow it back a UI.
3. Whether the "Re-read files" action should gain a server-sent-events hint later - only
   if the manual refresh becomes annoying in practice (cut from v1 by design).
4. Whether the loopback `Host` allowlist needs a documented escape hatch. It deliberately
   has none: reaching a `127.0.0.1`-bound socket under some other name is what rebinding
   looks like, so a custom `/etc/hosts` alias or a reverse proxy in front of the app is
   refused today. Revisit if a real deployment needs one, and add an explicit opt-in flag
   rather than widening the default.
