# Progress & agenda - Meno

Living status file - the done / backlog tracker for this project. **Update it whenever work changes:**
finish a thing -> move it to Done; pick up or think of a new thing -> add it to the agenda; make a call
that isn't captured in the code -> log it. Keep entries dated, newest near the top of each section.

_Last updated: 2026-08-18_

> Maintenance: keep this file current whenever work changes. Tooling can't see conversation-only
> decisions, so logging those is on whoever made them.

## Pending decisions (needs maintainer)

- 2026-08-18 - **Audit findings not closed by v1.13**, from the same sweep, all measured, none
  yet fixed: todo checkboxes have no accessible name (AX `name: ""`); the check widget's cloze
  input is labelled by `placeholder` alone and its radio group has no `fieldset`/`legend`; nothing
  announces async updates anywhere (filter emptying, todo notices, the graph legend dropping 228
  nodes to 101 - zero live regions in the DOM before or after); all 22 tables lack a name and any
  `th[scope]`; the module anchor lands *under* the header at 360px because `--scroll-clearance` is
  a fixed 4.5rem while the header grows to 100.95px when it wraps (v1.13 makes the header wrap,
  which makes this reachable more often, not less); `h1` -> `h4` skip on the course list; the
  course-list `h1`'s accessible name is polluted by its nested InfoTip button ("Courses What is
  Groups question mark"); white-on-`--accent` and white-on-`--violet-border` are 2.34:1 and 3.08:1
  in dark mode; the cost empty state renders no `h1`; and note page titles leak the full vault
  path including `.md`. **The decision:** which of these to batch next, and whether the
  design-system drift (20 rendered font sizes, 36 spacing literals, no `--space-*` token) is worth
  a dedicated pass or should be absorbed opportunistically.

## Done

- 2026-08-18 - **The interactive checks were never rendering, and the cause was one object
  literal.** Every `div.meno-check` on every lesson was empty, in development and in the
  production bundle, with no console error and nothing in the gate able to see it - the app's
  core feature, gone for as long as it had existed. `RenderedHtml` passed
  `dangerouslySetInnerHTML={{ __html: html }}`, a fresh literal on every render. **React compares
  that prop by object identity, not by the markup inside it**, so it re-assigned `innerHTML` on
  every re-render even when the string was byte-identical, and re-assigning `innerHTML` destroys
  every child of the element - which is exactly where the check widgets are mounted. On the lesson
  route the second of two fetches landing was enough: the widgets mounted at 470ms and were gone
  at 473ms.
  **Three wrong diagnoses were tested and discarded before this one**, which is worth recording
  because each looked right. Not StrictMode (removing `<StrictMode>` changed nothing). Not a
  synchronous `root.unmount()` racing an in-flight render (deferring it to a microtask silenced
  the warning and rendered nothing). Not the missing `html` dependency alone (adding it changed
  nothing, because `html` never changed - only the object's identity did). What settled it was an
  isolation test rather than more reading: rendering a bare `<span>` into the same containers
  failed while the identical `createRoot().render()` into a div appended to `document.body`
  succeeded 6 of 6, which moved the search off the widget and onto the container. Trapping the
  `innerHTML` setter then showed React's own `setProp` writing the same 12,699 characters twice.
  `useCheckMounts` also gained the `html` dependency it had always been missing, for the case
  where the markup genuinely changes and every placeholder is replaced by a fresh empty one -
  the same hazard `useWikilinkNav` already documents. `app/test/rendered-html.test.ts` pins both,
  and was confirmed to fail when the literal is put back. Verified operable end to end in a
  browser, not just rendered: a flashcard reveals and takes a self-report, and a cloze answer
  submits, grades server-side and returns its verdict.


- 2026-08-18 - **v1.13: the four highest-leverage findings from an agent-run UI audit.** The audit
  itself is the interesting half. Because an agent cannot see a page, the review was scoped to what
  a machine can actually assert - the accessibility tree, computed styles, geometry, keyboard
  driving, media-query emulation - against WCAG 2.2, the ARIA Authoring Practices Guide, and the
  documented axe-core rule set. That band is smaller than a human designer's but sharper inside it,
  and it turns out to be where this repo keeps losing defects: automated tooling covers ~57% of
  accessibility issues by volume, and the checks with **no axe rule at all** (focus visibility and
  order, live-region timing, non-text contrast, reflow, reduced motion, route announcement) are
  exactly the ones nothing here was testing. Four pages of findings came back; these four shipped.
  **A skip link**, which did not exist - every keyboard reader tabbed the wordmark, tenant name,
  back control and seven nav links on every route before reaching content (WCAG 2.4.1, Level A).
  It moves focus itself rather than following its fragment, because this is a hash-routed app and
  `#main-content` in `location.hash` would land the reader on not-found - the skip link would break
  the page it exists to fix. **The header wraps**: seven nav links in an unwrapped flex row measured
  715px against a 320px viewport, and because the header is sticky the overflow followed you down
  every page (WCAG 1.4.10, 10 of 13 routes). **Reduced motion covers everything**: the media block
  named `.module-card` alone, one of nine `transition` declarations, so the refresh button, InfoTip,
  meter fill, check card and both graph elements ignored the preference. Replaced with a wildcard
  that cannot be outgrown by the next transition someone adds. **`--border-strong`** (3.55:1 light,
  3.91:1 dark) now draws the edge of anything operable, where `--border` is 1.32:1 and 1.44:1 - the
  stylesheet had already measured those exact ratios in a comment for one case at `styles.css:707`
  and fixed it locally without generalising. Deliberately not applied to decorative panel edges:
  WCAG 1.4.11 covers what identifies a component, not every hairline. Everything above was
  browser-verified, including that the skip link is the first tabbable element, reveals from -64px
  to 8px on focus, and leaves `location.hash` untouched.

- 2026-08-18 - **v1.12: going up a level, and a URL that truncates.** Asked for as "a native back
  button in the top nav that goes back a page" plus "fix the url paths, what do `#`, `t`, `c`, `m`,
  `l` mean". A UI/UX review pass rejected half of it and was right to. **Back and up are different
  moves**, and the request described up while naming back: `←` in the top-left reads as temporal in
  every browser and operating system, so rebinding it would make it the one control whose
  destination cannot be guessed, and temporal back is already free on every gesture the platform
  provides. Up went into the breadcrumb, which names its target in words - the lesson breadcrumb's
  module segment now links to `#/t/:tenant/c/:course/m/:module`, a **real route segment** rather
  than the old fragment-only anchor, and the course page gained the breadcrumb it never had. That
  makes every meaningful prefix of a lesson URL a real page, which is the actual defect behind
  "I can't navigate the sitemap from the URL" - hand-truncating the address bar used to give
  not-found. **The rename was rejected**: `t`/`c`/`m`/`l` cost 88 construction sites across 29
  files including a server-emitted contract field (`GraphResponse.route`), in exchange for
  legibility one localhost user consumes approximately never. So was dropping the `#` - path
  navigation fires `popstate` rather than `hashchange`, which would mean rebuilding the depth
  guard shipped at v1.10, and this app's links are plain anchors with no `navigate()` funnel to
  intercept clicks through. **Both stay reversible**: step 2 of the change put every route URL
  behind builders in `app/shared/routeHrefs.ts`, imported by the server half too, so the rename is
  now a one-file edit if the in-app fixes turn out not to dissolve the complaint. Round-trip tests
  pin the builders to the route table, which were previously two independent transcriptions of one
  grammar with nothing forcing them to agree. **Three shipped defects were found in the path of
  this work and fixed first**: `.module-card` and `.group-section` had no `scroll-margin-top`, so
  the module anchor from UI-10 and the deep-link scroll from v1.10 both landed *under* the sticky
  header; the lesson breadcrumb's `aria-current="page"` sat on the module, so a screen reader
  announced the wrong current page; and `App.tsx`'s scroll reset avoided clobbering anchors only
  by promise-timing coincidence, now an explicit guard with its own test. Arrival at a module also
  moves focus and highlights transiently - the highlight cannot be CSS `:target`, because a hash
  router puts the whole route in the fragment so no element id ever matches it. 486 tests; the
  rendering has no DOM in the gate, so it was browser-verified over the example tenant.

- 2026-08-18 - **`validate` gains a `spec-versions` check: two rows in `docs/architecture.md`'s
  phase-to-spec table can no longer claim the same "Lands" version without failing the gate.**
  Because the table's rows sit on different lines, two parallel worktrees each landing a new spec
  and picking "the next version" for themselves merge cleanly with no git conflict, silently
  leaving two specs claiming one version - this happened for real on 2026-08-12, when the graph
  view and find-subjects both took v1.8, caught only by a human at merge time. The new check
  (`checkSpecTableText` in `tools/validate.ts`, registry key `spec-versions`) finds the table by
  its header row rather than a line number, so edits above it can't break the search, and errors
  if the table can't be found at all rather than passing silently. Phase entries (`Phase 0`..
  `Phase 8`) are excluded on purpose - phases were fixed once at bootstrap, not picked ad hoc, so
  they can't collide the way version numbers do - and the "Amended by" column is left unchecked
  because amendments legitimately repeat a version (app.md's row already lists four at once). A
  version-sequence gap (e.g. v1.9 to v1.11) is left unflagged too: nothing else in the repo already
  requires the Lands column to be sequential, so a gap rule here would invent a policy rather than
  enforce one. Spec: `docs/specs/validation.md` (new `spec-versions` check row, `v1.12` since-tag,
  data-touched entry for `docs/architecture.md`). Honest cost: proving the check fires meant hand-
  editing a scratch copy of `docs/architecture.md` to duplicate `v1.9` and confirming
  `checkSpecTableText` reported it - the real table itself has no duplicate today, so the positive
  test only proves the check stays quiet on clean input, not that it can ever fire; that scratch
  reproduction is the actual evidence.
  Verifying it fired end to end also turned up a latent flaw in the runner: `runValidation`
  runs every check once per target, and the default is two targets, so any repo-level check
  reported its finding twice - `checkTenancy` had the same problem and nobody had noticed
  because it so rarely fires. Findings are now deduplicated on level, check, path and
  message, which is the honest identity of a defect.

- 2026-08-18 - **`PROGRESS.md` now merges with the union driver, so parallel branches stop
  conflicting on it.** Every feature prepends its Done entry at the same anchor, which made this
  file the one guaranteed conflict in any parallel build - three in a single week, each resolved
  the same way, by keeping both sides. `.gitattributes` marks it `merge=union`, which does exactly
  that automatically: for a conflicting region git takes all of one side's lines then all of the
  other's, so multi-line entries survive whole. The cost is that the two blocks land in merge
  order rather than date order, which is a cosmetic fix on the next edit rather than a blocking
  one. Scoped to this file alone on purpose - union on source silently produces code that merges
  cleanly and compiles wrong, and `docs/architecture.md`'s spec table collides on version numbers,
  which is a semantic clash that has to be seen rather than concatenated.

- 2026-08-18 - **Merged the note-breadcrumb PR (#43) against wave 2's own UI-15 work; the
  "two `<h1>`s" call below is superseded.** Both sessions touched `NotePage`: #43 built
  server-side course/domain resolution (`resolveNoteCourse` in `app/server/tree.ts`,
  `NoteResponse.course`/`domain`) and kept the vault path as the page's `<h1>`, deliberately
  accepting two `<h1>`s; wave 2 (UI-15 below) dropped the path heading and promoted the note
  body's own heading instead, with a separate `Breadcrumb`. The maintainer ruling kept both:
  `notePath.ts`'s `noteBreadcrumb()` and the server-confirmed segments moved into
  `<nav aria-label="Breadcrumb">` rather than the `<h1>`, and the note body's own heading (already
  inside the rendered HTML) is the page's only `<h1>`. Net result: one `<h1>`, plus a breadcrumb
  that can never link to a course the tree does not contain - the data model #43 built, rendered
  the way UI-15 asked for. `historyDepth.ts` and the guarded back control are unchanged. The route
  table also merged: `routes.ts` (extracted by #43 for the same DOM-less-`node --test`
  reason `routeTitles.ts` was) now carries both the `course` route's `#module` fragment and the
  `tenant` route's `#course-<slug>` fragment; `routeTitle`/`routeNames`/`APP_TITLE` still source
  from `routeTitles.ts`. Course list, header nav-current, and both `course-list.test.ts` suites
  kept everything from both sides.

- 2026-08-18 - **UI navigation review, wave 2 plus three cross-track gaps closed.** UI-16: a
  second `localStorage` key (`meno.courseList.resume.v1:<tenant>`, `courseList.ts`) records the
  last lesson opened; the course list renders a "Resume: <lesson>" link. UI-17: eight pages
  (course, lesson, graph, todos, progress, insights, cost, note, guide) moved to route-level
  `React.lazy` in `App.tsx`, wrapped in one `Suspense` reusing `AsyncStatus`; entry chunk
  279.54 KB raw / 86.63 KB gzip -> 200.46 KB raw / 64.00 KB gzip. Cross-track gaps six tracks
  correctly left alone: `courseCtx.revalidate` now composes into the lesson page's registered
  revalidate, and `TenantsPage` collects every learner card's `/progress` revalidate so "Re-read
  files" reaches both; the `course` route gained an optional trailing `#module` fragment
  (mirroring `guide`'s `#section`) and module cards carry `id`, so `InsightsPage`'s planned-debt
  table can link a module cell to it via `courseModuleHref` (`CostPage` has no module-level rows,
  so nothing to anchor there); the dir-versus-slug hazard is now a comment on
  `courseDirOfPath`. Spec: `docs/specs/app.md` (course-list item, guide-fragment item, invariant
  13, data table, revalidate composition). Review: `docs/reviews/2026-08-13-ui-navigation-review.md`.

- 2026-08-13 - **UI navigation review, wave 0 contract landed** (no behaviour yet). The shared seams
  six parallel UI tracks build on: `app/client/src/courseContext.ts` (pure, unit-tested) plus
  `useCourseContext.tsx` for UI-02; `asCourseMastery` in `clientTypes.tsx` for UI-01's live bug
  (`/course/:course` sends `{concepts, modules}`, and `asMastery` rejected it, so mastery and gate
  state have never rendered); `Breadcrumb`, `AsyncStatus` and `ErrorState` components; six
  track-owned stylesheets under `styles/` so no two implementers edit `styles.css`; and
  `routeTitle()` beside the `ROUTES` table for UI-03. Work order:
  `docs/reviews/2026-08-13-ui-navigation-review.md`. Still open in wave 0: the route-change effect,
  the response cache, and adopting `AsyncStatus`/`ErrorState` across the twelve pages.

- 2026-08-18 - **v1.11: the course-list collapse state now survives a reload.** It never had. The
  decision logged here was to fix it rather than write the limitation into the spec, and the fix
  turned out to need two changes, not the one the note predicted, because two defects were lining
  up. Reproducing it in a headless browser against the example tenant was what separated them.
  React renders the list the moment `/tree` resolves, and `/groups` has not always landed by then,
  so `ungrouped` falls back to every course and a transient `Ungrouped` section renders; setting
  `open` on it fires a mount-time `toggle`; `toggleSection` read that as a click and persisted
  against a section list holding only `section:ungrouped`, so `writeOpenState` pruned the real ids
  away and called `removeItem`. The later mount toggles for the real sections then persisted
  `true`, which normalization drops as the default - which is why the list came back fully
  expanded and looked correct, and why v1.6 and the v1.10 walk both missed it. **`decideToggle`
  now takes what was rendered** and discards any toggle whose value already agrees with it: the
  browser fires `toggle` for every `open` attribute change including React's own, so a mount, a
  remount, and `Collapse all` all produce events no learner asked for. That subsumes the old
  forced-section special case rather than sitting beside it - forced means rendered open - so the
  rule is one rule now. **And the page waits for `/groups` as well as `/tree`**, which removes the
  transient section list the pruning ran against, plus a visible flash of a layout the tenant does
  not have. A `/groups` request that genuinely fails still falls through to the ungrouped
  fallback, which is what that fallback is for. Gate-covered as pure logic; the rendering that
  produces the events is not, so the reload, both bulk controls, the filter's forced expansion and
  its restore on Escape, and the deep-link force/release were re-observed in the browser.

- 2026-08-18 - **A note page was a dead end titled with a raw file path.** `NotePage` printed the
  vault path as inert text, so the screen every wikilink lands on had no way back to the course it
  belongs to. The path is now a breadcrumb: the domain segment deep-links to the course list at the
  course's own section (`#/t/:tenant#course-<slug>`, reusing the one-trailing-fragment shape the
  guidebook's section links already had), the course segment goes to the course page, and every other
  segment stays plain. **The fragment keys on the course, not the domain, and that was a correction
  made under review**: an explicit group in `groups.yml` pulls its courses out of the derived domain
  section, so a domain whose courses are all grouped has no section and the link expanded nothing -
  precisely the shape of the committed example tenant, which made the feature inert on the living
  spec. A course sits in exactly one section whichever layer claimed it, and its slug is already a
  URL surface, so no hand-edited group id leaks into a URL or a DOM id.
  **Resolution is server-side and that is the other load-bearing decision** -
  `GET :tenant/note` now returns the owning `course` and `domain` from the same walk that answers
  every other route, so the client links only what exists. The obvious alternative, guessing
  `<domain>/<course>/...` from the path's shape, is silently wrong for `sources/` and `insights/`,
  which sit at the vault root beside the domain directories; a wrong guess is a confident link to a
  404. A guarded back control joins the header: `history.back()`, hidden at in-app depth 0 so a
  bookmark or deep link cannot eject the reader out of the app, with depth stamped per
  `history.state` entry rather than counted (a counter incremented on `hashchange` reads a backward
  navigation as another step forward and defeats its own guard). Two supporting extractions follow
  the repo's existing discipline: `app/client/src/routes.ts` and `notePath.ts` are DOM-free `.ts`
  modules so `node --test` covers the route table and the breadcrumb rules the way it already covers
  `courseList.ts`. Spec: `docs/specs/app.md` behavior 13 + invariant 14.
  **Accepted then, reconciled since:** at the time this landed, the path stayed the `<h1>` while
  the note body kept its own heading, so the page carried two `<h1>`s - a deliberate divergence
  from UI-15 in `docs/reviews/2026-08-13-ui-navigation-review.md`, which prescribes dropping the
  path heading. Merging this against wave 2's own UI-15 work (see the entry above) resolved that:
  the note body's heading is now the page's only `<h1>`, and this PR's server-confirmed breadcrumb
  segments render in a `<nav>` instead. UI-15 is fully addressed as of that merge.
  **What the gate could not see.** The whole suite was green before the one real defect turned up:
  the browser fires `toggle` when React sets `open` on the remounted `<details>`, so the deep link's
  own forced open was read as a user action - releasing the force on the very render that applied it
  and persisting over the learner's stored choice. `node --test` has no DOM, so nothing in the gate
  could have caught it; a headless browser walk over the example tenant did. The rule now lives as a
  pure decision (`decideToggle`) in `courseList.ts` with unit tests, so the regression is
  gate-covered even though the rendering around it still is not.

- 2026-08-13 - **`meno:connects` had no eligibility rule, so the graph drew every course against
  every other.** The convention asked only that a reason state "the actual causal or structural
  link", which any two courses sharing a subject can satisfy - a real vault reached 13 connection
  edges across 9 courses, and the accented edge stopped distinguishing anything. `second-brain` now
  gates each candidate pair on a dependency test: name the module in the other course a learner
  would be stuck in without this one, or write no bullet in either hub. Adjacency belongs in hub
  prose, where a wikilink already draws a thin `reference` edge. The rationale and the worked
  counter-example live in `references/vault-conventions.md`; the gate itself is stated in `SKILL.md`
  ahead of the writing instructions, because the first smoke run proved an agent reads the skill and
  never opens the reference - it approved the very pair the reference rejects by name.
  `docs/specs/graph.md` is unchanged: it owns rendering, and already delegates the block's content
  rules to vault-conventions.md.

- 2026-08-12 - **The scanner counted scratch git repositories inside agent tool caches as real
  projects.** A real `find-subjects` run found 4 of 13 repositories were not projects, all under a
  coding agent's plugin cache, diluting every ratio in the report and reading a third-party
  plugin's docs as the user's own work. Two complementary fixes: `PRUNE_DIRS` gained
  `cache`/`.cache`/`caches` (honest cost: a project with a real source directory named `cache` is
  skipped too), and `SnapshotRepo.substantive` now scopes the coverage ratios to real projects
  while `total_repos` keeps its original meaning. Detail: `docs/specs/subject-finder.md`,
  "Substantive repositories" + invariant 14.

- 2026-08-12 - **find-subjects: candidates duplicated courses the tenant already held.** Two of
  three proposed candidates were courses already under contract. Protocol step 10 matched against
  `content/community/INDEX.md` but never against the tenant's own courses; a human reading
  `home.md` caught it, not the gate. `lib/course-dirs.ts`'s `listCourses` (plus `npm run courses`)
  now drives three routing outcomes: under contract, unstarted skeleton, or no match. Scope
  boundary held - it reads manifests and `profile.md`'s presence, never the ledger. Invariant 13
  says plainly that nothing re-checks a generated report's routing, rather than claiming a gate
  check that was not built.

- 2026-08-12 - **find-subjects: partial approval scanned nothing.** `collectWorkspace` vetoed an
  entire root if any sibling was unapproved, so approving a subset produced a confident empty
  report. Partial approval is the case that matters most - it is what the consent design exists to
  allow. Discovery now descends per approved child. **Why 97 tests and three reviewers missed it:**
  every test approved all children, so the suite covered the mechanism's edges and left its main
  path uncovered, and the drift test was vacuous under the fix's own logic.

- 2026-08-12 - **`find-subjects`: workspace-evidence course discovery.** Meno's front door assumed
  the learner already knows what they want; this surveys approved workspace roots instead. Spec:
  `docs/specs/subject-finder.md`. **The load-bearing decision is that the scanner is the only
  reader** - the skill never opens a workspace file, which converts the read caps and redaction
  rules from advisory prose into deterministic behaviour. No app endpoint, deliberately: a handler
  walking arbitrary user directories would be a new traversal surface on a long-running daemon.
  Topic candidates moved out of `study-insights` (one owner per format); `elicit-needs` now
  consumes an evidence packet, with precedence fixed as live probe > workspace evidence >
  self-report so the shorter interview cannot erode why that skill exists.

  **A three-lens adversarial review found more than the build did, and most of it no gate could
  catch. The pattern is the lesson:** the documented protocol could not complete a single run (the
  skill said `--read`, persistence was under an undocumented `--write`) while every test passed;
  the redaction guard barely fired and **its test had been calibrated to pass**, which is worse
  than no test because it manufactured confidence; two budgets were reported but never enforced,
  and the resulting false disclosure was already baked into the committed golden; four manifest
  parsers lied rather than missed; and the two validate checks enforcing the no-raw-paths invariant
  were dead code. Entropy at 4.0 was also specified as a redaction threshold it can never exceed on
  a hex alphabet - a guard that reads as present and does nothing.

- 2026-08-12 - **Graph view: a course-group filter, reversing a v1 cut.** The v1 cut was sized to a
  92-node estimate; the real vault renders 198, which was the stated trigger to add one back. Logic
  sits in two pure functions in `graphLayout.ts`; hiding a group removes it from the `d3-force`
  input, not just the paint. The "no cross-course connections authored yet" notice stays wired to
  the unfiltered edge list on purpose - it means no `second-brain` sweep has run, and getting that
  backwards would tell the maintainer to author edges that already exist. Spec v1.9; the checkbox
  interaction and refit are reasoned about from source, not observed in a browser.

- 2026-08-12 - **`AGENTS.md` routes agents by intent.** A cold-started agent could learn what Meno
  is but not which of the two jobs it had. A "Route by intent" section now names both tracks, the
  write boundary, and `publish-to-community` as the single crossing. Settled by grill: no new
  instruction file (a second entry point is a ranked risk) and the skill list stays flat and
  canonical. Deliberately not a validate check - a validator can only grep for the heading and
  would keep passing while the content rots. Smoke-tested in a clean clone.

- 2026-08-12 - **Knowledge graph view (`#/t/:tenant/graph`).** Spec `docs/specs/graph.md`, built in
  three parallel streams against a frozen contract. Measured before design: every wikilink in the
  real vault was course-local, so the feature had to *create* a class of edge - a hub's
  `## Connects to` block, owned by `second-brain`, is the authored source of cross-course edges.
  Two risks knowingly accepted: those edges refresh only on an explicit sweep (preferred over a
  writer that would clobber judgment it cannot reproduce from a manifest), and the picture itself
  is reasoned about rather than observed.

- 2026-08-12 - **Content-cost page: which courses cost the most to generate.** Spec
  `docs/specs/cost.md`, confirmed across two grill rounds. Attribution is at **transcript**
  granularity - crediting only the `Write` call priced a course at $0.15 against a whole-transcript
  $11.50, wrong by 77x. A cost source is an adapter, so an instance on another coding agent renders
  an empty page rather than crashing. Three adversarial passes found fifteen real defects, each
  fixed guard-first; the recurring shape was a half-applied fix (round one keyed attribution by
  directory but left validate comparing basenames, so the exact valid snapshot the fix was written
  for got rejected by the gate) and silence standing in for a signal (unreadable transcripts
  swallowed, making a partial scan indistinguishable from a complete one). Limitations by design,
  listed in the spec: every figure is a floor, a transcript's whole cost credits to its course, the
  sub-cent floor can overstate, and renaming a course orphans its evidence.

- 2026-08-06 - **Todo tags split into two orthogonal axes: seven kinds, two audiences.** The old
  three-tag namespace cut at the wrong angle - one tag cannot carry both what the work is and who
  can do it. Retagging every skill was judgment, not substitution (`generate-curriculum`'s
  empty-`sources/` reminder became `#vault #for-me`, not a mechanical swap). Canonical owner:
  `todo-format.md`. Breaking change to `GET :tenant/todos`'s `type` values, accepted because no
  in-house tooling consumes it yet.

- 2026-08-06 - **v1.6: course-list collapse and filter, and the group write surface removed.** The
  fold, match, and section assembly live in `app/client/src/courseList.ts` - no React, no DOM - the
  one piece of client logic unit-tested rather than smoke-tested. Assembling the view there fixed a
  latent bug: the page printed a section's raw `courses.length` while separately skipping unknown
  slugs, so the header count could exceed the rows rendered. The decision-20 explicit-group write
  surface was removed in the same change: the explicit layer competes with the domain layer rather
  than complementing it, so a write surface was never load-bearing. Not visually verified.

- 2026-08-06 - **Course groups (decision 20) and pack attribution (decision 21).** Groups are two
  layers: the domain directory is the default (so grouping works with zero setup) and `groups.yml`
  holds the learner's own names, explicit winning over domain. Reconciled with #24 rather than
  competing: one is where a course *sits*, the other is what the learner *calls* it. Deliberately a
  registry, not a field on `course.yml` (regenerated wholesale, so a hand-set field would be lost)
  and not a directory move (wikilinks bind to slugs). Attribution: `CONTRIBUTORS.yml` per pack,
  resolved by nearest ancestor, source units keyed on url so they survive re-archiving. Verified
  live in a browser except the manage panel.

- 2026-08-06 - **A real tenant vault failed `validate`, and the skill that caused it is fixed.**
  Three errors against a real vault. Root cause was a documentation defect, not a code one: the
  timestamp-collision rule appeared in **no skill anywhere**, only in the spec and validate's error
  string, and `lesson-format.md`'s only worked example showed a whole-second timestamp, so an agent
  following it naturally stamped a three-lesson batch identically. Fixed by making the example
  self-demonstrating and adding the rebuild step the skill never mentioned. Data repaired in place.

- 2026-08-06 - **The real-GitHub mirror drill, finally run** - `docs/specs/durability.md`'s one
  standing "Not yet verified" gap. The gate exercises a `file://` remote, which has no visibility
  concept, so `gh repo create --private` and `verify`'s PRIVATE assertion had never run once. Both
  executed end to end, then a full restore drill diffed byte-identical (151 files). Invariant 4 now
  holds against real GitHub. The spec's Verified-by still carries the old caveat and should be
  amended on the next durability change.

- 2026-08-05 - **In-app self-explanation: tooltips + a guidebook (`#/guide`).** `InfoTip` uses
  `position: fixed` from the trigger rect because the mastery tables are `overflow-x: auto` and
  would clip an absolute child. Two design calls worth keeping: help copy ships as client-side data
  rather than markdown read off disk, because rendering repository files would need a route outside
  the content root that invariant 6 exists to forbid; and the guidebook links out to
  `docs/how-meno-works.md` rather than duplicating a doc that would drift. `glossary.ts` is the
  single owner of every definition. Not visually verified.

- 2026-08-05 - **Fork-vs-privacy framing corrected across the guide and README.** The old "clone,
  do not fork" line implied content lives in the clone, so a reader solving multi-device sync was
  nudged toward the one irreversible mistake - un-ignoring `content/tenants/`, whose commits stay
  reachable from upstream via pull-request refs even after the PR closes. Replaced with the
  two-repository model stated up front, so forking and privacy are not in tension.

- 2026-08-05 - **User-guide gaps closed: environment setup, multi-device study, the content-tier
  model.** New "Studying on more than one device" section, previously undocumented anywhere, states
  the honest limitation that `meno-mirror push` is backup and not sync, gives the ledger-conflict
  resolution (union merge then `rebuild-mastery.ts`, never hand-merge the derived `mastery.yml`),
  and names the three real costs of consumer file-sync for Obsidian mobile. A `sync` verb was
  deliberately left unbuilt: one that auto-resolves ledger conflicts is a writer of learner history
  and deserves write-authority-seam scrutiny.

- 2026-08-06 - **Community tier trimmed to eight packs.** Seven packs whose subjects did not fit the
  maintainer's direction were removed from both the community tier and the tenant vault. No ledger
  event referenced a removed course, so no study history was orphaned. The wave-2 entry below is
  left as written - it records what happened at the time - and the now-unused domain slugs stay in
  `DOMAINS.md`, which is a vocabulary for future packs rather than an index of current ones.

- 2026-08-06 - **Tenant courses group by domain: one grouping across all three tiers.**
  `content/tenants/<t>/<domain>/<course-slug>/`, matching the community layout exactly. The tiers
  had drifted - packs were domain-grouped, tenant courses flat, and adopt-a-pack *discarded* the
  domain on the way in. `DOMAINS.md` is promoted to shared vocabulary. `elicit-needs` now
  classifies a domain during the interview; nothing computed one before, it was derived at publish
  time long after the directory existed. Migration table in `docs/migrations.md`.

- 2026-08-06 - **The silent regression this nearly shipped.** `wikilinks.tsx` matched lesson links
  with exactly one path segment before `/modules/`, so a domain level would have made every lesson
  wikilink fall through to the plain note route: link still resolves, page still renders, checks
  silently gone - a correctness bug wearing a styling bug's clothes, and no test covered it. Two
  deliberate asymmetries came out of the same review: the app reads a course at either depth so an
  unmigrated vault renders, and the walk never consults `DOMAINS.md` - validate owns "is this a
  legal place for a course", the runtime only answers "where are the course.yml files". The walk
  moved to `lib/course-dirs.ts` per the no-parallel-walks rule.

- 2026-08-06 - **Community pack wave 2 (decision 19, workstream 4): ten packs.** The tier goes from
  5 to 15. The maintainer's private vault nominated the *topics* only - each authoring agent worked
  from a self-contained public-source brief with no vault access, so the inspiration-only boundary
  is structural here, not a review promise. `pack-overlap` reported zero findings across all 15.

- 2026-08-06 - **`citations` gains an offline archive-match check, and it caught a merged defect.**
  Validate compares the URL embedded in `archived_url` against `url`. The failure is systematic,
  not clerical: archiving follows redirects and records where it landed while `url` keeps what was
  typed, so any moved source yields a well-formed pair pointing at two different pages. Found six,
  including one already merged. One could not be fixed by re-archiving - nature.com is
  bot-protected, so every Wayback capture is a challenge page - and moved to the open-access PMC
  mirror instead.

- 2026-08-06 - **`audit-citations` told agents to do something their tools cannot do.** The skill
  said "fetch `archived_url`"; Claude Code's WebFetch refuses `web.archive.org`, and the refusal is
  indistinguishable from a dead snapshot. Two verifiers reported healthy archives as unverifiable
  and a third called a live snapshot DEAD. The skill now mandates `curl -I`, makes the archive's own
  `link: rel="original"` header the match test, and states that concurrent failures mean rate
  limiting and never a dead archive.

- 2026-08-05 - **Community pack slate (decision 19, workstream 3): five packs live.** Every source
  fetched live and Wayback-archived, each pack independently citation-audited and
  sanitization-swept. `git-fundamentals` was AMENDED rather than forked into a competing pack - the
  search-first rule applied to ourselves.

- 2026-08-05 - **Accuracy guardrail + drill pair (decision 19, workstream 1; PR #21).**
  `generate-module` gained a blocking per-lesson self-audit: every claim traces to a cited source or
  to level-appropriate common knowledge, and every check is re-solved fresh before the authored key
  is read. Kept honest by `examples/seeded-faults/accuracy-fixture/` scored under judged-half
  discipline; baseline recall 1.0 observed, `recall_min` 0.9. `quality.md` states the drill contract
  honestly - it measures the audit prompt, not a live run.

- 2026-08-05 - **Post-consolidation reconcile: the one constraint decision 18 narrowed.** Two of the
  v1.4 security review's three items had already been absorbed by #18; the third was real.
  `course.schema.json`'s `derived_from.pack` pattern silently invalidated pre-consolidation adopted
  manifests under a migrations heading reading "layout, not schema". Recorded *why* no
  `schema_version` bump: the field is optional, shipped the same day, and the fix is a one-line edit
  with a validate error that names it - bumping would make every existing `course.yml` stale and
  oblige validate to keep blessing a path form that exists nowhere. Pinned with a test, since
  nothing under `examples/` carries a `derived_from` block, which is exactly why it went unnoticed.

- 2026-08-05 - **Content tier consolidation (decision 18): one root for all learning material.**
  `topic-packs/` -> `content/community/`, `org/packs/` -> `content/org/`, tenant vaults ->
  `content/tenants/<tenant>/`. The privacy boundary moved but stays a single absolute gitignore
  prefix, never a negation pattern; the leakage guard flipped to default-deny under `content/` with
  a `community|org` allowlist. Adversarial review found a `core.quotePath` bypass - non-ASCII
  filenames were C-quoted and evaded the `^content/` greps in both the hook and org-sync - now read
  null-delimited with unicode drills. Migration steps in `docs/migrations.md`.

- 2026-08-05 - **Security policy and the repository-level checks (follow-on to v1.4).** The settings
  half of supply-chain hardening, which no file in the tree can show: secret scanning with push
  protection, Dependabot alerts, private vulnerability reporting - all free on public repos, none
  were on. `SECURITY.md` uses the draft-advisory channel because everything here is cloned and run
  locally, so a public report is a working exploit against every instance before anyone can update.
  Its "already known, and tracked" section links the spec's Verified-by gaps rather than restating
  them, so the two documents cannot drift. Invariant 7 is honestly recorded as unverifiable from the
  tree - settings are not files, and a fork inherits none of them.

- 2026-08-05 - **v1.4: supply-chain hardening - CI enforcement, capability paths, the rebinding
  guard.** The prompting finding was structural: every gate this repo documents ran on the
  contributor's machine and reached the maintainer as a ticked checkbox.
  `.github/workflows/gate.yml` runs the *same* `npm run gate` a contributor runs, so CI and the
  local gate cannot drift; `pull_request` and never `pull_request_target`, actions pinned to shas.
  `CODEOWNERS` is advisory and says why - GitHub forbids self-approval, so required review would
  make `main` unmergeable for a solo maintainer. The app's `Origin` check turned out not to cover
  DNS rebinding at all: once the attacker's name resolves to 127.0.0.1 their page is same-origin, no
  `Origin` header is sent, and the check never fires - replaced with a loopback `Host` allowlist,
  the header a browser will not let a page forge. `docs/specs/supply-chain.md` names the remaining
  holes rather than implying coverage.

- 2026-08-05 - **v1.3: org deployment as a git-native pattern.** The maintainer ask (shared content,
  RBAC, in-house integration) read as a hosted-platform request, which PLAN.md's out-of-scope list
  rules out - delivered instead as a documented pattern plus a stable integration surface, no new
  runtime. `docs/org-deployment.md` covers the private mirror-clone, `org/` as a reserved
  downstream-owned root using the pack format verbatim, and RBAC mapped honestly onto host
  primitives, headlined by "git permissions are write control and distribution control, not read
  control after a clone exists". The load-bearing refusal is no progress telemetry to the org: a
  gradebook and an honest mastery signal cannot coexist, with a learner-run redacted export as the
  alternative. New `tools/export.ts` and `tools/org-sync.sh`; `docs/integration-surface.md` declares
  what is stable and what is not.

- 2026-08-05 - **v1.2: publish-to-community skill and the read/write closure of the community
  tier.** The write side (`publish-to-community` with search-first, transcribe-never-copy, sanitize,
  four-part gate, amend-over-fork) plus `references/sanitization.md`, which names
  worked-examples-from-real-work as the one leak class no regex catches. Read side amended into
  `generate-curriculum`, `elicit-needs`, and `generate-module`. New
  `examples/seeded-faults/publish-fixture/`: a clean tenant course seeded with six leak classes,
  scored blind against an answer key the publisher may not read. Spec: `docs/specs/community.md`.

- 2026-08-05 - **v1.1 study-insights acceptance loop**: the acceptance run caught two real bugs
  before ship - `lib/vault.ts` and the app resolver matched bare basenames only, so every path-style
  wikilink read broken, and the course hub's lesson links were folder-relative. The narrative note
  refused to fabricate on both intermediate states, reporting the traced cause instead of fake topic
  candidates, which is the cite-your-numbers design working.

- 2026-08-05 - **v1.1: study-insights feature complete.** `lib/insights-io.ts` as the shared loader
  (reimplementing ledger reads over `lib/mastery.ts` rather than importing `app/server/ledger.ts`,
  to keep the UI write path out of `lib/`), `GET /api/v1/:tenant/insights`, the CLI, `InsightsPage`
  (one neutral palette, no pass/fail coloring, every rate shown as `n/of`), and the user-invoked
  `study-insights` skill that quotes the snapshot and never computes a number. Validate's `insights`
  check enforces cite-your-numbers as a literal-substring match against the note's own embedded
  snapshot. Spec `docs/specs/insights.md` owns the metric-definitions table.
- 2026-08-05 - **Phase 8 complete (collaboration and evals) - v1 done.** CONTRIBUTING.md full (one-runtime setup, erasable-TS constraint, gate + eval requirements, deliberate-rebaseline rule, honest one-CLI smoke table), .github PR template, topic-packs/README.md spec (packs = pre-contract skeletons, no bodies - bodies generate at adoption against the adopter's profile), docs/specs/quality.md. tools/eval.ts landed: 4 fixtures, deterministic checklist half (43 items, gates absolutely) + judged half (pinned claude-sonnet-5, prompt sha, median-of-3, quantized grid, non-parsing = error not zero, identical-judge gating, 0.1 guard band under observed medians) + anchor set good/mediocre/bad with ranking-and-separation drift alarm; runs.jsonl append-only; baselines committed from a real establishment run and confirmed by an independent verification run (checklists 43/43, curriculum 0.63 vs min 0.4, lessons 0.85 vs min 0.7, anchors 0.8/0.5/0). The anchor alarm proved itself during setup: the first mediocre anchor scored 0 (tied with bad) and failed ranking until it was made genuinely mid-quality. README rewritten for v1 (quickstart, what's inside), AGENTS.md status -> v1 built, npm run eval wired. Demo topic pack lands via its own PR next (the documented path, exercised for real).
- 2026-08-05 - **Phase 7 complete (tenant durability).** Design doc written first (docs/specs/durability.md: nested-independent-repo mirror model - no submodule, no second remote, the public repo stays structurally ignorant; POSIX shell as the deliberate one-runtime exception; hooks scoped off for mirror pushes; verify-before-every-push). tools/meno-init (idempotent: leakage-guard pre-commit hook that chains to pre-existing hooks, tenant dir, CLI census, next steps) and tools/meno-mirror (init|push|restore|status|verify; gh-created private repo when no URL; PRIVATE-visibility assertion for GitHub remotes, local paths allowed for drills, anything else hard-refused; restore refuses non-empty destinations). Automated e2e drill in the gate (tools/test/mirror.test.ts): init, hook blocks a force-added tenant file, push, outer-repo-ignorance checks (no tracked content/, no mirror URL in config), wipe, refuse-overwrite, restore byte-identical, unverifiable-remote refusal. Honest gap recorded in the spec: the real-GitHub visibility drill is maintainer-manual before first real use. Guide's backup section now shows the concrete commands + 4-command manual fallback.
- 2026-08-05 - **Phase 6 complete (citation integrity).** audit-citations skill landed (adversarial live-fetch protocol: existence, claim support against why + citing prose, archive liveness, archive match; six verdicts; per-record routing into citation-refresh vs content-refresh; edge rules for multi-fault precedence, FABRICATED-vs-ROTTED evidence, orphaned sources, canonical URL comparison). Permanent seeded-fault fixture committed (examples/seeded-faults: structurally validate-clean mini-course seeding FABRICATED, MISATTRIBUTED, MISMATCHED-ARCHIVE, orphaned-MISATTRIBUTED among clean records; ANSWER-KEY for eval scoring). Acceptance: blind audit (answer key off-limits) caught ALL four faults with correct classes, flagged neither clean record, and proved never-existed via the book's canonical ToC; drill A citation-refresh diff touched exactly one archived_url line with zero prose; drill B content-refresh rewrote from live-fetched sources, removed the fabrication, re-audited all-CLEAN with anatomy intact. sourcing.md gained the CDX-API snapshot lookup (wayback/available lags). Spec: docs/specs/citations.md.
- 2026-08-05 - **Phase 5 complete (the tutor loop).** tutor-session skill landed (Socratic protocol, quantized 5-point grading with auditable rubrics, due computation + cross-module interleaving, gate math = lib/mastery.ts math, explicit-request-only overrides with reinjection, generate-ahead, session-close rebuild + validate). Scripted acceptance session against the example tenant (dated 2026-08-07): recognition warm-up + 3 graded transfer reviews (1.0/0.75/0.5), gate FAIL at 0.75 vs 0.8 with exact basis, explicit override logged with gate_ts join + ownership reinjected to 08-09, module 2 (borrowing, lifetimes) generated ahead with 9 interleaved checks, one reviewed event closing the schedule; ledger 12 events validates clean, mastery rebuilt byte-identical (ownership shaky + weak_until, module 02 gate fail + overridden true). The session surfaced a REAL latent bug: deriveMastery let any scored event reattribute a concept's module, so answering an interleaved check would corrupt gate math - fixed (module attribution now comes from the teaching module only), regression test added, write-authority test upgraded to a before/after diff. Spec: docs/specs/tutor-session.md; skill listed in AGENTS.md + symlinked.
- 2026-08-05 - **Phase 4 complete (the localhost app).** app/server (Node/TS, zero build step, node:http router, unified/remark render pipeline with wikilink/callout/check transforms, walk-on-request discovery, atomic write disciplines, 127.0.0.1-only + origin + realpath path guards) and app/client (Vite + React, deps react/react-dom/mermaid only, hash router + hand-rolled data hooks, interactive mcq/cloze/flashcard widgets mounted into server-rendered HTML, todos with If-Match 409 flow, progress views, onboarding empty states). Write authority by construction: no endpoint accepts event/source/level; appendUiEvent is the single UI write path, asserting + validating against the narrowed schemas/ledger.ui.schema.json. 16 app tests incl. hostile-injection suite, scripted-full-UI-session-unlocks-zero-gates, 50-concurrent-submit + agent-appender ledger integrity, todos line-diff round-trip, traversal/symlink suite (45 tests total repo-wide). Live smoke against a throwaway tenant copy: full API walk + built client served; in-browser rendering left to maintainer spot-check via npm start (extension cannot load plain-http localhost). Spec: docs/specs/app.md. npm scripts: start/dev/build wired; gate now typechecks the client too.
- 2026-08-05 - **Phase 3 complete (lesson generation and the ledger).** schemas/lesson.schema.json + ledger.schema.json (8-event discriminated union) + shared source.schema.json landed; check-formats gained the required authored check id; lib/lesson.ts (single parser: checks, callouts, wikilinks, 9 anatomy detectors) and lib/mastery.ts (single pure derivation, byte-identical serialization) landed with tools/rebuild-mastery.ts; validate grew lessons/checks/ledger/mastery checks (29 tests total). Example module 1 fully generated: 3 lessons, 9/9 anatomy each, 12 authored-id checks (zero mcq - produce-the-answer preferred), interleaving verified in lessons 2-3, one transfer prompt each, sourcing procedure caught and replaced a claim-unsupporting overview page; ledger seeded (3 generated events), mastery.yml derived and byte-identical-checked. Specs: lessons.md + progress.md (ledger vocabulary owner).
- 2026-08-05 - **Phase 2 complete (curriculum skeleton).** schemas/course.schema.json + module.schema.json landed; validate.ts grew manifests/refs/citations/hub checks (derived-view drift, Bloom ceiling, budget +10 percent rule, wayback-shaped archive URLs; 15 tests). Two contrasting skeletons committed and validating clean: rust-for-backend (7 modules, 26h vs 26.4 cap, 16 sources) and understanding-llm-agents (3 modules, 8.5h vs 8.8 cap, 11 sources) - every source fetched live and Wayback-archived at generation time, archives independently spot-checked resolving. Example-learner tenant vault bootstrapped (home.md, todos.md, sources/). Specs: curriculum.md + validation.md. Sourcing procedure hardened from run feedback (302 Location mechanics, throttling, redirect canonicalization, precision-over-prestige rule, preview-page trap fixed in the worked example).
- 2026-08-05 - **Phase 1 complete (the interview).** schemas/profile.schema.json + tools/validate.ts landed (Node/TS per build addenda: schema, cross-field consistency, body-section checks; 7 unit tests; npm run gate wired). Three golden personas committed (Sam Park, Priya Nair, Marcus Webb) with expected briefs. Acceptance: two simulated interviews (Sam happy path, Priya pushback path) produced valid, distinct profiles matching golden briefs exactly on all structured fields - question budgets 6 and 7, probes ran, confirmation gates fired, Priya's scope pushback fired and resolved to orient. Profiles committed as fixtures (example-learner/rust-for-backend, golden-personas/priya-nair). Skill hardened from run feedback: partial-opener rule, silent-pass feasibility, pushback counting, cascading-pushback recompute, Diagnose probe pattern, floor scaling table, time-question bundling.
- 2026-08-05 - **Phase 0 complete (skeleton and entry points).** Guides landed (how-meno-works, extending-meno, content-schema stub), specs foundation landed (docs/architecture.md, docs/specs/ template + repo-and-tenancy spec), example-learner stub with the Sam Park persona and golden brief. Acceptance: cold-start `claude -p` run in a fresh clone named the interview as entry point, covered tenant privacy, and linked the user guide (after one AGENTS.md hardening iteration; only Claude Code installed, other CLIs designed-for but unverified); dummy tenant content invisible to `git status`; all five skill symlinks survive a fresh clone on macOS (Linux by construction, not machine-verified).
- 2026-08-05 - design council at build start (4 specialists) locked the open build questions: one Node runtime for tools (validate.ts/eval.ts; mirror tooling stays shell), per-subsystem specs under docs/specs/, 8-event ledger taxonomy with authored check ids and byte-identical mastery rebuild, app design (node:http, unified/remark, walk-on-request, write authority by construction), eval judge with pinned model + anchor set. Details: docs/architecture.md and PLAN.md build addenda.
- 2026-08-05 - three open items resolved at build start: (a) static-site-generator choice is moot, superseded by decision 17 (Vite + React + local file API); (b) maintainer-machine agent CLI census: only Claude Code is installed, so Phase 0/8 acceptance runs record Claude Code results and list other CLIs as unverified; (c) video and interactive resources: decided by default - a source is any URL, video included, with no dedicated content type in v1 (additive to revisit).

- 2026-08-05 - adversarial review of the skill drafts (7-agent workflow: per-skill executability, cross-consistency, end-to-end flow simulation); 40 findings fixed, notably: vault bootstrap given an owner (elicit-needs preflight), module status moved to module.yml with course.yml as derived view, ledger events gain the level field gates key on, new-topic todos route through the interview, amend-a-course recipe added to extend-meno, CONTRIBUTING.md and docs/migrations.md stubs created.
- 2026-08-05 - five core skills drafted in `.agents/skills/` (elicit-needs, generate-curriculum, generate-module, extend-meno, second-brain) with references/ carrying the canonical formats (profile, manifests, sourcing, lesson anatomy, check blocks, vault conventions, todos); `.claude/skills/` symlinks; AGENTS.md skill listing + session-start rule. Drafts - phase acceptance criteria still gate "done".
- 2026-08-05 - second grill: three-pillar model added (Obsidian second brain / localhost app / agent). Decisions 14-17 locked: split write authority (UI recognition-level, agent gates), content/<tenant>/ IS an Obsidian vault (wikilinks canonical), todos.md as shared agent-scannable queue, Vite + React + local file API. Decision 2 superseded: static site -> local-first web app. PLAN.md Phase 4 rewritten.
- 2026-08-05 - project scaffolded: PLAN.md (phased build plan + decision record), docs/RESEARCH.md (9-agent research synthesis), AGENTS.md/CLAUDE.md entry points, README, MIT license. Public repo on avishek2002.
- 2026-08-05 - grill phase: all load-bearing decisions locked (see PLAN.md decision record). Notable: static site from day one, hybrid study loop, generate-ahead timing, gated-with-logged-override mastery, private-mirror tooling in v1 (knowingly-accepted scope risk).
- 2026-08-05 - research phase: 9-agent workflow across learning science, LMS landscape, needs elicitation, agent architecture, prior art, content schema; synthesized into docs/RESEARCH.md.

## On the agenda (backlog, not started)

- **UI navigation and content-visibility work order**
  (`docs/reviews/2026-08-13-ui-navigation-review.md`): 17 ranked findings from a headless
  traversal of every route, reviewed by a UI/UX and a frontend specialist. Scoped to adaptive
  information architecture and state-driven surfacing; visual design and mobile were out of
  scope. Sequenced as waves - **wave 0 is serial and must land first** (the shared course-context
  hook, the mastery type-guard bug, the route-change effect, a shared error state, response
  caching), then six file-disjoint parallel tracks. The collision map is in the document.
  - **UI-01 is a live bug, not a design gap**: `asMastery` (`app/client/src/clientTypes.tsx:36`)
    requires a `.courses` key the course endpoint does not send, so concept mastery and module
    gate state have never rendered on any course page - including a currently failed, locked
    gate. Fix this before anything that builds on study state.
  - **Fixture extension, deferred deliberately**: `examples/example-learner` (1 subject, 2
    courses, 15 files) cannot reproduce the density-dependent findings (UI-12, partly UI-11),
    so those ship without regression tests. Growing the fixture would break assertions in
    `tools/eval.ts` and ten test files, so it is its own change, not a prerequisite.
- **Decision 19 program** (plan: `docs/plans/content-accuracy-and-community.md`): (1) blocking
  self-audit in `generate-module` + seeded-fault fixtures + eval scorers that drill the
  auditor; (2) the five-pack community slate (git-and-github and agent-harness-craft first);
  (3) vault-candidate scan, approval-gated. Deferred pieces named in the plan: `audit-accuracy`
  skill, tutor-grading sycophancy drills.
- **`app` todos machinery mutates the committed example fixture**: running the test suite (or
  app) locally left `examples/example-learner/todos.md` modified in the working tree (a
  `## Parked` heading inserted). Fixtures should never be written by tests; find the writer
  and point it at a temp copy.

- **Extend `pack-safety`'s file scan to `.agents/skills/**`** - at minimum the error-level
  patterns (curl-pipe-to-shell, `process.env`, `~/.ssh`, credential shapes), plus a warning on
  any newly introduced URL. Skills are prose an agent executes with tool access and nothing
  scans them today; this is the largest unverified gap named in `docs/specs/supply-chain.md`.
  Held out of v1.4 only to keep a validate behavior change separate from a CI change.
- **Decide whether the gate runs `npm run validate -- --strict`** so pack warnings block a
  merge. Turns three easily-paraphrased regexes into a gate; revisit after the first
  adversarial pack pull request rather than guessing at the false-positive rate now.
- **`actionlint` in the gate**, plus a check that no workflow other than `gate.yml` exists -
  supply-chain spec invariants 1, 2, and 5 are readable but not machine-verified.
- **Turn on required code-owner review** on the `main` ruleset when a second maintainer exists.
- `tools/meno-mirror`'s help fallback prints `sed -n '2,16p'` but the usage block runs to line
  18, so the `status` and `verify` usage lines never appear in help output. Pre-existing
  off-by-two spotted during the tier-consolidation review; should be `2,18p`.
- **Nothing ever validates a real tenant vault.** `tools/validate.ts` defaults to `examples/`,
  `npm run gate` inherits that default, and no skill's session-close step points it at
  `content/tenants/<tenant>`. A learner's vault can therefore drift out of spec indefinitely with
  every gate green - which is how the 2026-08-06 ledger-collision bug survived: the fixtures were
  perfect and the only real vault was broken. Cheapest fix is a documented
  `node tools/validate.ts content/tenants/<tenant>` in the tutor-session and generate-module
  session-close steps; the stronger one is having those skills run it. Deliberately not a gate
  change: the gate runs in CI, which has no tenant.
- **`examples/example-learner` never exercises the ts-collision rule** - all 12 fixture events sit
  at distinct whole seconds, so nothing in the repository demonstrates the sub-second form, and a
  regression here is invisible to 153 passing tests. Either seed a same-second pair into the
  fixture (ripples into the byte-identical mastery rebuild) or add a targeted ledger unit test.
- **`meno-mirror`'s two auth paths can silently disagree.** `verify` shells out to `gh`, which
  follows the *ambient active gh account*, while the push itself authenticates through git's
  credential helper. On a one-account machine they always agree; with two accounts `verify` fails
  ("cannot read visibility - refusing to push blind") even when the push would have succeeded, so
  a backup stops happening for a reason unrelated to the remote's actual privacy. Fails closed, so
  it is a usability bug, not a safety one - but it makes the backup depend on shell state the
  learner forgot they set. Consider reading the account from the tenant repo's own config.
- **`meno-mirror verify` hard-stops on a remote URL carrying a username** (the
  `https://<user>@github.com/owner/repo.git` form). Its slug regex strips only a bare
  `https://github.com/` or `git@github.com:` prefix, so the userinfo survives, `gh repo view` is
  handed a non-slug, and the push is refused with "cannot read visibility". It fails *closed*,
  which is the right direction, so this is a usability bug rather than a safety one - but the
  userinfo form is exactly what a learner with more than one GitHub account reaches for. Fix is
  one `sed` clause (`s#^https://[^/@]*@#https://#`); found while setting up a real mirror,
  worked around by keeping the URL clean and pinning credentials per-repo instead.
- **Document the multi-account credential trap in the mirror section of
  `docs/how-meno-works.md`.** On a machine where git uses a credential helper that stores one
  account per host (macOS `osxkeychain` is the common case), `gh auth switch` does not change
  which account `git push` authenticates as - so a mirror pushed to a private repo owned by the
  *other* account fails with `remote: Repository not found`, which reads as a missing repo rather
  than wrong-account. This bites precisely the privacy-conscious learner who keeps personal
  learning separate from a work account. Worth three lines and the per-repo fix
  (`git config credential.https://github.com.username <user>`), since the guide already promises
  the mirror is four commands.
