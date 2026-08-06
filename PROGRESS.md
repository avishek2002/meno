# Progress & agenda - Meno

Living status file - the done / backlog tracker for this project. **Update it whenever work changes:**
finish a thing -> move it to Done; pick up or think of a new thing -> add it to the agenda; make a call
that isn't captured in the code -> log it. Keep entries dated, newest near the top of each section.

_Last updated: 2026-08-06_

> Maintenance: keep this file current whenever work changes. Tooling can't see conversation-only
> decisions, so logging those is on whoever made them.

## Pending decisions (needs maintainer)

- None currently open.

## Done

- 2026-08-06 - **v1.6: course-list collapse and filter, and the group write surface removed.**
  The course list is now native `<details>`/`<summary>` sections with a `Collapse all` /
  `Expand all` control and a filter input that substring-matches course titles and slugs,
  case- and diacritic-insensitively; a section with no match hides entirely, a matching one
  forces open without touching stored state, and Escape clears the filter. Open/closed state
  persists per tenant in the browser's `localStorage` under one versioned key,
  `meno.courseList.open.v1:<url-encoded tenant>`, holding only the sections that differ from
  the default (open) - the app's only browser-persisted state, a view preference and never
  evidence. All of this - the fold, the substring match, the section assembly, the default-open
  rule, and the key scheme - lives in new `app/client/src/courseList.ts`, a module with no React
  and no DOM references (the root tsconfig compiles `app/**/*.ts` without the DOM lib, so naming
  one there fails typecheck), covered by new `app/test/course-list.test.ts` with `node --test` -
  the one piece of client logic in this repo unit-tested rather than smoke-tested. Assembling the
  view in that module fixes a real latent bug: the page used to print a section's raw
  `courses.length` while separately skipping slugs `/tree` no longer knew about, so the header
  count could exceed the rows actually rendered when the two fetches disagreed for one render;
  the join now happens once, in the module, so the count is always the row count.
  In the same change, the explicit-group write surface from decision 20 is removed: the four
  write routes (`POST`/`PATCH`/`DELETE :tenant/groups*`, `PATCH :tenant/course/:course/group`)
  and their handlers are gone from `app/server/routes.ts`, along with the inline manage panel,
  `deleteJson` (its only caller), and the `addGroup`/`renameGroup`/`removeGroup`/
  `setCourseGroup`/`serializeGroups` mutations and their private helpers from `lib/groups.ts` -
  the explicit layer competes with the domain layer rather than complementing it, so a write
  surface for it was never load-bearing, and the panel was never visually verified to begin with.
  `GET :tenant/groups` survives byte-identical, `raw_sha256` included, and is now the entire
  group surface; `groups.yml` is agent-edited and hand-edited only. Specs amended: app (behavior
  8 rewritten, new behavior 9, invariants 8-10 rewritten, invariant 13 appended, data-touched and
  verified-by updated), architecture's write-authority table, migrations (one sentence corrected
  in the existing 2026-08-06 entry, no new entry), integration-surface (`:tenant/groups` named
  stable), how-meno-works, `second-brain` and `generate-curriculum` skill copy, PLAN decision 20
  amended. Gate green: typecheck, 163 tests (up from 153; `app/test/groups.test.ts` reduced from
  16 to 6 route/structural tests with the parse- and resolve-level coverage re-homed to
  `tools/test/groups.test.ts`), validate.
  **The v1.6 collapse and filter behaviour is unit-tested but not yet visually verified in a
  browser** - keyboard operation of the `<details>` summaries, focus-visible rings, and both
  colour schemes are reasoned about rather than observed. Worth one manual pass.

- 2026-08-06 - **Course groups (decision 20) and pack attribution (decision 21).** Two features,
  one change. *Groups*: two layers. A course's **domain directory** is the default grouping, so
  the course list is grouped from the moment a vault exists with no setup at all; a
  `content/tenants/<tenant>/groups.yml` registry holds the learner's own named groups for what a
  domain cannot say ("Version Control", "Software Fundamentals"), and an explicit group always
  wins over the domain a course falls back to. Only a course with no domain - one still at the
  vault root, pre-migration - is Ungrouped. Both layers resolve server-side into one ordered
  section list tagged `source: explicit | domain`. An inline manage mode does create / rename /
  delete / move, and lists only the explicit groups, because a domain section is the tree
  showing through and has nothing to rename. This shape was **reconciled with #24** (which
  landed the domain directories mid-build) rather than competing with it: one is where a course
  *sits*, the other is what the learner *calls* it. Deliberately
  a registry, not a field on `course.yml` (regenerated wholesale, so a hand-set field would be
  lost) and not a directory move (wikilinks bind to slugs). Five new write routes, guarded by the
  same atomic + `If-Match` discipline as todos and asserted not to touch the ledger or any course
  file - the todos class of write, which is why this extends decision 16 rather than amending the
  write-authority seam. `generate-curriculum` files new courses; the `extend-meno` recipes file
  hand-made and adopted ones. *Attribution*: every pack carries `CONTRIBUTORS.yml` naming who made
  what at pack / objective / module / planned-lesson / anchor-source / reference-note granularity,
  resolved by nearest ancestor so a single-author pack needs one record. Source units key on the
  url (survives reordering and re-archiving); lesson units resolve against the module manifest,
  since packs ship no bodies. All five existing packs backfilled; `INDEX.md` now rolls contributors
  up. New: `lib/groups.ts`, `lib/attribution.ts`, `app/server/groups.ts`,
  `schemas/groups.schema.json`, `schemas/contributors.schema.json`, validate's `groups` and
  `pack-attribution` checks, 77 new tests (164 total). Specs amended: app, curriculum, community,
  validation, architecture's write-authority table, PLAN decisions 20-21, migrations.
  **Verified live** - the two-layer grouping driven in a browser against a five-course,
  four-domain vault (zero-setup domain sections with no groups.yml at all, then a "Version
  Control" group overriding one of them), and the routes exercised over HTTP against a real
  vault. **Not verified**: the manage-mode panel's
  rendering (browser automation could not reach a loopback page to click into it) - one manual
  pass wanted, noted in `docs/specs/app.md`.

- 2026-08-06 - **A real tenant vault failed `validate`, and the skill that caused it is fixed.**
  Pointing `node tools/validate.ts` at a real `content/tenants/<tenant>` (rather than its default
  target, `examples/`) produced three errors: two `generated` events sharing a whole-second `ts`,
  and a `mastery.yml` stale against the ledger. Root cause was a documentation defect, not a code
  one - `generate-module/references/lesson-format.md` describes the seed event as appended *per
  lesson*, so a three-lesson module writes three lines in one pass, but its only worked example
  showed a whole-second timestamp and the collision rule ("bump 1 millisecond", owned by
  `docs/specs/progress.md`) appeared in **no skill anywhere**, only in the spec and validate's
  error string. An agent following the example naturally stamped all three identically. Fixed by
  making the example self-demonstrating (three lines at `.000`/`.001`/`.002`) plus a note that
  validate rejects the batch after the lessons are written, and by adding the rebuild-mastery step
  the skill also never mentioned. `tutor-session`'s append rule already said "strictly later than
  the last line" but not how to resolve a tie; extended with the same one-millisecond bump for its
  own same-second batches. Data repaired in place: the two timestamps bumped with a byte-level
  edit asserted to touch no other field and no other line, then `rebuild-mastery.ts`; tenant now
  validates 0/0. Gate green (153 tests).
- 2026-08-06 - **The real-GitHub mirror drill, finally run - `docs/specs/durability.md`'s one
  standing "Not yet verified" gap.** Everything the gate exercises runs against a `file://` bare
  remote, which has no visibility concept, so two things had never been executed once: `gh repo
  create --private` against real GitHub, and `verify`'s PRIVATE-visibility assertion against a real
  repository. Both were run end to end against a freshly created private repository - `verify`
  correctly read `PRIVATE` and allowed the push - followed by a full restore drill: a fresh clone of
  the pushed mirror diffed **byte-identical** against the live tenant tree (151 files), with every
  restored `ledger.jsonl` line re-parsed as JSON. Invariant 4 now holds against real GitHub, not just
  a local path. The spec's Verified-by section still carries the old caveat and should be amended to
  match on the next durability change (deliberately not edited from an unrelated branch).
- 2026-08-05 - **In-app self-explanation: tooltips + a guidebook (`#/guide`).** New `InfoTip`
  disclosure (hover, focus, or click-to-pin; Escape closes and restores focus; 24px hit area;
  `position: fixed` from the trigger rect because the mastery tables are `display: block;
  overflow-x: auto` and would clip an absolute child) placed on the terms that actually confuse:
  Re-read files, the mastery table's four columns, Due for review, Todos, Insights. New
  `GuidePage` covering what the app is, the four-step loop, what each screen does, what the app
  deliberately will not do (write-authority seam in plain language), why re-reading is manual,
  and a glossary. Header gained a Guide link visible even with no tenant (help matters most on the
  empty state) plus `aria-current="page"` on real anchors. Two design calls worth keeping: help
  copy ships as client-side data in `app/client/src/guide/` rather than markdown read off disk,
  because rendering repository files would need a route outside the content root that invariant 6
  exists to forbid; and the guidebook is scoped to the app, linking out to `docs/how-meno-works.md`
  for the journey rather than duplicating a doc that would drift. `glossary.ts` is the single owner
  of every definition, read by both the tooltips and the guidebook glossary. Spec amended
  (`docs/specs/app.md`: behavior 9, architecture, invariants 9-10, verified-by). Typecheck, build,
  86 tests, validate all green. **Not visually verified** - no browser automation was available, so
  the both-colour-schemes pass is still owed.
- 2026-08-05 - **Fork-vs-privacy framing corrected across the guide and README.** The old
  "clone, do not fork - a public fork can never be made private, and your learning content
  deserves privacy" implied content lives in the clone, so a reader solving multi-device sync
  was nudged toward the one irreversible mistake (un-ignoring `content/tenants/`, whose commits
  stay reachable from upstream via the pull-request refs even after the PR closes). Replaced with
  the two-repository mental model stated up front - the code clone is public and forkable, the
  tenant vault is a separate private repo nested inside the gitignored path, and they never learn
  about each other - so forking and privacy are not in tension. New
  "Contributing to Meno from a machine that holds your content" subsection gives the fork-and-PR
  flow and names the three fail-closed mechanisms that make it safe without care. `Owning your
  content` and the README quickstart comment updated to match. `npm run validate` clean.
- 2026-08-05 - **User-guide gaps closed: environment setup, multi-device study, the content-tier
  model.** `docs/how-meno-works.md` gained a full "Setting up" section (prereqs with the reasons,
  clone-not-fork, what each setup command actually does, a check-it-worked list, and the
  `core.hooksPath` warning with its trade-off named), a commands-you-will-actually-use table, a
  "Where your content lives" section explaining the three tiers and both directions of travel
  (downstream = base + pack skeletons with no bodies; upstream = only via `publish-to-community`,
  human-confirmed twice, skeleton only), and a new **"Studying on more than one device"** section -
  previously undocumented anywhere. That section states the honest limitation that `meno-mirror push`
  is backup, not sync (it never pulls, so a diverged second machine fails non-fast-forward), gives the
  ledger-conflict resolution (union merge, then `node tools/rebuild-mastery.ts <tenant-dir>`, never
  hand-merge the derived `mastery.yml`), and covers file-sync options for Obsidian mobile with their
  three real costs (unencrypted consumer sync changes the privacy posture; consumer sync corrupts a
  nested `.git`; no consistent snapshots can truncate a mid-append ledger line). `docs/specs/durability.md`
  amended in the same change per the spec-with-behavior rule: new behavior item 6 (multi-device is a
  documented manual procedure, not tooling) and a new open question on whether `meno-mirror` should
  gain a `sync` verb - deliberately unbuilt, because a verb that auto-resolves ledger conflicts is a
  writer of learner history and deserves write-authority-seam scrutiny. README quickstart points at
  the new section. `npm run validate` clean.
- 2026-08-06 - **Community tier trimmed to eight packs.** The seven packs whose subjects did
  not fit the maintainer's actual direction were removed from both the community tier and the
  tenant vault: `data/sql-joins-and-grain`, `data/analytics-engineering-with-dbt`,
  `data/semantic-layers-and-metric-governance`, `infrastructure/observability-foundations`,
  `product-and-design/web-accessibility-audits`,
  `software-engineering/browser-e2e-testing-with-playwright`, and
  `working-skills/evidence-based-bug-reporting`. What remains is the six `ai-and-agents`
  courses now under contract plus `software-engineering/git-fundamentals` and
  `meta/contributing-to-meno`. `INDEX.md` regenerated; no ledger event referenced a removed
  course, so no study history was orphaned. The wave-2 entry below is left as written - it
  records what happened at the time, and the four now-unused domain slugs stay in
  `DOMAINS.md`, which is a vocabulary for future packs rather than an index of current ones.

- 2026-08-06 - **Tenant courses group by domain: one grouping across all three tiers.**
  `content/tenants/<t>/<course-slug>/` became `content/tenants/<t>/<domain>/<course-slug>/`,
  matching `content/community/<domain>/<slug>/` exactly. The tiers had drifted: packs were
  domain-grouped, tenant courses were a flat list, and adopt-a-pack *discarded* the domain
  on the way in; adoption is now a straight mirror copy. `content/community/DOMAINS.md` is
  promoted from a pack file to the shared vocabulary governing community, org, and tenant
  trees. New `course-layout` validate check enforces shape and vocabulary, finding vault
  roots by their `home.md` so bare course fixtures stay exempt. Both committed vaults moved
  (`examples/example-learner`, `examples/seeded-faults/publish-fixture`) under
  `software-engineering/`. Spec owner: `vault-conventions.md` (per `repo-and-tenancy.md`'s
  delegation); `docs/migrations.md` carries the Was/Now table and the per-instance `mv`.
  `elicit-needs` now classifies a course into a domain during the interview - nothing
  computed a domain before, it was derived at publish time long after the directory existed.
- 2026-08-06 - **The silent regression this nearly shipped.** `wikilinks.tsx` matched lesson
  links with exactly one path segment before `/modules/`. A domain level would have made
  every lesson wikilink fall through to the plain note route: link still resolves, page
  still renders, checks silently gone - a correctness bug wearing a styling bug's clothes,
  and no test covered it. The regex now takes an optional domain segment (it backtracks
  correctly on ungrouped paths, since "modules" cannot satisfy the literal `/modules/`
  that follows). Two deliberate asymmetries came out of the same review: the app reads a
  course at either depth so an unmigrated vault renders instead of showing an empty list,
  and the walk never consults DOMAINS.md - validate owns "is this a legal place for a
  course", the runtime only answers "where are the course.yml files". The walk itself moved
  to `lib/course-dirs.ts` rather than being patched into `tree.ts` and `insights-io.ts`
  separately, per the repo's no-parallel-walks rule.

- 2026-08-06 - **Community pack wave 2 (decision 19, workstream 4): ten packs, and the archive-match
  gate that wave 1 needed.** The tier goes from 5 packs to 15. New: `data/sql-joins-and-grain`,
  `data/analytics-engineering-with-dbt`, `data/semantic-layers-and-metric-governance`,
  `ai-and-agents/llm-cost-and-token-engineering`, `ai-and-agents/rag-grounding-and-faithfulness`,
  `ai-and-agents/llm-evals-and-judges`, `software-engineering/browser-e2e-testing-with-playwright`,
  `infrastructure/observability-foundations`, `product-and-design/web-accessibility-audits`,
  `working-skills/evidence-based-bug-reporting`. The maintainer's private vault nominated the
  *topics* only: each authoring agent worked from a self-contained public-source brief with no
  access to the vault, so the inspiration-only boundary is structural here, not a review promise.
  Scope fences held - `pack-overlap` reports zero findings across all 15.
- 2026-08-06 - **`citations` gains an offline archive-match check, and it caught a merged defect.**
  Validate now compares the URL embedded in `archived_url` against `url` (canonically: scheme and
  trailing slash ignored). The failure it catches is systematic, not clerical - archiving follows
  redirects and records where it landed while `url` keeps what was typed, so *any* source that has
  moved silently yields a well-formed pair pointing at two different pages. It found six: three
  Grafana docs paths and two anthropic.com paths in wave 2, plus one in already-merged
  `limits-of-agent-generated-content` whose snapshot was a `?error=cookies_not_supported` variant.
  That last one could not be fixed by re-archiving - nature.com is bot-protected, so every Wayback
  capture of it is a Cloudflare "Client Challenge" page - so the citation moved to the open-access
  PMC mirror of the same paper, whose snapshot contains all four cited figures verbatim. Spec:
  `docs/specs/validation.md`; two new cases in `tools/test/courses.test.ts` (mismatch caught,
  scheme/slash-only difference tolerated).
- 2026-08-06 - **`audit-citations` told agents to do something their tools cannot do.** The skill
  said "fetch `archived_url`"; Claude Code's WebFetch refuses `web.archive.org` outright, and the
  refusal is indistinguishable from a dead snapshot. Two independent verifiers duly reported healthy
  archives as unverifiable, and a third called a live snapshot DEAD after the availability API
  returned empty under throttling - its proposed replacement timestamp did not exist. The skill now
  mandates `curl -I`, makes the archive's own `link: rel="original"` header the match test (the
  Wayback Machine stating what it captured beats eyeballing rendered content), and states that
  concurrent failures mean rate limiting and never a dead archive.

- 2026-08-05 - **Community pack slate (decision 19, workstream 3): five packs live.** The tier goes
  from one pack to a full intern-onboarding slate, every source fetched live and Wayback-archived
  this session, each pack independently citation-audited and sanitization-swept (zero hits for
  workplace identifiers), INDEX regenerated, gate green. `git-fundamentals` was AMENDED (modules
  03-05: remotes/forks, pull-request flow, repo hygiene) rather than forked into a competing pack -
  the search-first rule applied to ourselves. New: `ai-and-agents/intro-to-ai-and-agents`,
  `ai-and-agents/agent-harness-craft` (the maintainer's craft re-derived from public sources only),
  `ai-and-agents/limits-of-agent-generated-content` (hallucination, sycophancy, cognitive
  offloading, Dunning-Kruger, the compounding loop - every empirical claim cites the actual paper),
  `meta/contributing-to-meno` (exercise-driven, links to canonical owners, never restates).
- 2026-08-05 - **Accuracy guardrail + drill pair (decision 19, workstream 1; PR #21).**
  `generate-module` gains a blocking per-lesson self-audit: claim audit (trace to a cited source,
  level-appropriate common knowledge - never anything surprising, quantitative, version-specific,
  or safety-relevant - or fix/cite/remove) and check re-solve (fresh answer before reading the
  authored key; disagreement blocks). Kept honest by the auditor drill:
  `examples/seeded-faults/accuracy-fixture/` (4 planted uncited falsehoods, 3 wrong keys, 1 clean
  control) scored by `tools/eval.ts` via the pinned claude CLI under judged-half discipline.
  Baseline established: recall 1.0 observed, `recall_min` 0.9. Adversarial review hardened the
  quote matcher (three-token containment minimum). Specs: `lessons.md` invariant 7, `quality.md`
  drill contract stated honestly (measures the audit prompt, not a live run).

- 2026-08-05 - **Post-consolidation reconcile: the one constraint decision 18 narrowed.** Follow-up
  to the v1.4 security review. Two of its three items had already been absorbed by #18 (the stale
  `topic-packs/`/`org/` paths in `docs/specs/supply-chain.md`, and `SECURITY.md`, which was written
  against the post-consolidation layout and became correct when that layout landed) - only the third
  was real. `course.schema.json`'s `derived_from.pack` pattern moved from
  `^topic-packs/…|^org/packs/…` to `^content/community/…|^content/org/…`, which silently turns a
  pre-consolidation adopted `course.yml` invalid, under a migrations heading reading "layout, not
  schema" and with no migration step covering it. Amended the heading to "layout, plus one narrowed
  pattern", added the one-line rewrite users need, and recorded *why* no `schema_version` bump:
  `derived_from` is optional, shipped the same day, and the fix is a one-line edit with a validate
  error that names the field - whereas bumping would make every existing `course.yml` stale and
  oblige validate to keep blessing a path form that exists nowhere in the layout. Pinned the pattern
  with a test in `tools/test/courses.test.ts` (both consolidated roots accepted, both
  pre-consolidation forms rejected), since nothing under `examples/` carries a `derived_from` block -
  which is exactly why the change went unnoticed.
- 2026-08-05 - **Content tier consolidation (decision 18): one root for all learning material.**
  `topic-packs/` -> `content/community/`, `org/packs/` -> `content/org/`, tenant vaults
  `content/<tenant>/` -> `content/tenants/<tenant>/`; the directory tree now mirrors the tier
  model. The privacy boundary moved from `content/` to `content/tenants/` but stays a single
  absolute gitignore prefix (never a negation pattern); the leakage-guard hook flipped to
  default-deny under `content/` with an explicit `community|org` allowlist, so an unexpected
  subdir like `content/alice/` is refused at commit time; the tenancy validate check errors on
  unknown top-level entries under `content/`; `tools/org-sync.sh` now refuses only
  `content/tenants/` + `content/org/` while legitimate upstream `content/community/` changes
  merge normally (new positive test). Adversarial review found and fixed a `core.quotePath`
  bypass (non-ASCII filenames were C-quoted and evaded the `^content/` greps in both the hook
  and org-sync; both now read null-delimited raw bytes, with unicode drills in the tests).
  `examples/` deliberately stays outside `content/`. 58 tracked files updated across tools,
  app, skills, specs, and docs; migration steps for existing instances in `docs/migrations.md`.
- 2026-08-05 - **Security policy and the repository-level checks (follow-on to v1.4).** The
  settings half of supply-chain hardening, which no file in the tree can show: secret scanning
  with push protection (a credential is blocked at `git push` rather than reported once it is
  already public - worth having in a repository whose design has agents writing files that get
  committed), Dependabot alerts and security updates, private vulnerability reporting. All four
  are free on public repositories and none were on. Added `SECURITY.md`: the draft-advisory
  channel instead of a public issue (everything here is cloned and run locally, so a public
  report is a working exploit against every instance before anyone can update), the three
  things worth attacking (the learner's vault, the machine running the agent, everyone
  downstream of `main` via `tools/org-sync.sh`), and explicit scope - including an
  "already known, and tracked" section that links `docs/specs/supply-chain.md`'s Verified-by
  gaps rather than restating them, so a reporter can tell a known gap from a new one and the
  two documents cannot drift. Out-of-scope names the loopback-and-unauthenticated design
  assumption as an assumption, with breaking the assumption itself explicitly back in scope.
  Spec amended: two new behaviors, invariants 7-8, and an honest Verified-by entry saying
  invariant 7 is unverifiable from the tree (settings are not files; a fork inherits none of
  them) with the `gh api` commands to check it by hand.
- 2026-08-05 - **v1.4: supply-chain hardening - CI enforcement, capability paths, the rebinding
  guard.** Prompted by a security review of v1.3 whose finding was structural: every gate this
  repository documents ran on the contributor's own machine and reached the maintainer as a ticked
  checkbox, because `.github/` held nothing but a pull request template. Landed
  `.github/workflows/gate.yml` - `npm ci` + `npm run gate` + `npm run build` +
  `node tools/packs.ts --check` on every pull request and every push to `main`; `pull_request`
  and never `pull_request_target` (which would hand an untrusted branch the base repo's secrets
  and a write token), `permissions: contents: read`, `persist-credentials: false`, actions pinned
  to commit shas rather than mutable tags, Node 24 as the floor CONTRIBUTING documents, and
  deliberately the *same* `npm run gate` a contributor runs, so CI and the local gate cannot
  drift. `npm run eval` stays manual and CI says so - it shells out to the `claude` CLI, which no
  runner has. `.github/CODEOWNERS` names the capability-bearing paths (`.github/`, `tools/`
  including the `tools/test/**` that `npm test` globs and executes, `.agents/skills/`, `.claude/`,
  the lockfile, `app/client/vite.config.ts`, the entry-point markdown, `schemas/`); advisory today
  and the file says why - GitHub forbids self-approval, so required code-owner review would make
  `main` unmergeable for a solo maintainer. App: the `Origin` check turned out not to cover DNS
  rebinding at all (once the attacker's name resolves to 127.0.0.1 their page is same-origin, so
  no `Origin` header is sent and the check never fires) - added a loopback `Host` allowlist ahead
  of routing, which is the header a browser will not let a page forge; 4 new tests in
  write-authority.test.ts, needing a new `rawRequest` helper because `fetch`/undici silently
  replaces a caller-supplied `Host`. New spec `docs/specs/supply-chain.md` states the trust
  boundary and, in "Verified by", names the holes rather than implying coverage: `.agents/skills/**`
  is scanned by nothing (`pack-safety` is scoped to `topic-packs/` and `org/`), its
  instruction-shaped-phrase patterns are non-blocking warnings, and a cited URL is reviewed at one
  time and fetched by an agent at another. `.gitignore` gained `.claude/worktrees/`.
- 2026-08-05 - **v1.3: org deployment as a git-native pattern (docs/org-deployment.md +
  docs/integration-surface.md).** The third maintainer ask ("managed shared content at
  organizational level, RBAC, incorporated into in-house systems") read as a hosted-platform
  request, which PLAN.md's locked out-of-scope list rules out (no accounts, no server, no
  database) - delivered instead as a documented pattern plus a stable integration surface, no
  new runtime. `docs/org-deployment.md`: (a) the private mirror-clone (bare-clone + push to a
  new private repo, `upstream` remote kept for pulls - distinct from `tools/meno-mirror`'s
  per-tenant backup, disambiguated explicitly); (b) `org/` as a reserved downstream-owned root
  using the pack format verbatim (`org/README.md`, `org/packs/<domain>/<slug>/`) - this was
  already-landed plumbing (`checkPacks`'s dual-root walk, `pack.schema.json` and
  `course.schema.json`'s `org/packs/` patterns, org domains already exempt from
  `topic-packs/DOMAINS.md`'s closed vocabulary), now finally documented; one format, three
  distributions (upstream community / org-private / tenant-local), contributing upstream is a
  directory move; (c) RBAC mapped honestly onto GitHub/GitLab primitives (a table: KB admin =
  Maintain + CODEOWNERS on `org/` / GitLab Maintainer, contributor = Write + required-review
  branch protection, learner = Read / Reporter), stating plainly that a domain-scoped team is
  not expressible in one repository, and that server-side branch protection on a private repo
  is a paid GitHub tier but free on GitLab - headlined by "git permissions are write control
  and distribution control, not read control after a clone exists"; (d) the org never sees a
  learner's progress, structurally (content/ stays gitignored in every clone including the
  org's); (e) upstream updates via `tools/org-sync.sh`; (f) "What Meno will not do, and why" -
  no accounts, no read enforcement after distribution, no progress telemetry to the org (the
  load-bearing refusal - a gradebook and an honest mastery signal cannot coexist, full
  argument given, learner-run redacted export as the alternative), no SCORM/LTI/seat
  management. `docs/integration-surface.md`: schemas (additive within `schema_version`),
  the ledger read format (8 event types, unknown-type-tolerant, external systems never write
  it - two writers with disjoint authority is the correctness argument, not a convention), the
  stable `GET /api/v1/*` read routes (write routes are explicitly not surface; server binds
  `127.0.0.1` only, so integration means same-machine or exports), and exports via
  `tools/export.ts`; a "not committed surface" list (`lib/*` signatures, the client bundle,
  `mastery.yml` as a file, CLI stdout). `tools/export.ts` (new): `<tenant-dir>
  [--format jsonl|csv] [--redact] [--out <dir>]`, emits `ledger.jsonl`/`ledger.csv` (flat,
  documented columns), `mastery.csv` (derived live via `deriveMastery`, never read from disk),
  `insights.json` (`computeInsights` via `lib/insights-io.ts`); `--redact` strips only
  `rubric` and `reason`; `npm run export` wired. `tools/org-sync.sh` (new, POSIX shell,
  meno-mirror's voice): fetches `upstream`, refuses any merge whose diff touches `content/` or
  `org/` (`MENO_SYNC_SKIP_GATE=1` test-only escape hatch, documented in the script), else
  merges and runs `npm run gate`. Tests: `tools/test/export.test.ts` (5 tests - redact is a
  byte-diff of events minus exactly those two fields, determinism across two runs, CSV column
  shape, mastery.csv matches `deriveMastery` directly, `examples/` never mutated, all against a
  throwaway tenant copy) and `tools/test/org-sync.test.ts` (4 tests - refuses on `org/` touch,
  refuses on `content/` touch, merges a clean change, reports up-to-date; a tiny
  upstream+downstream repo pair per test, `GIT_CONFIG_GLOBAL=/dev/null` isolation following
  `mirror.test.ts`'s `makeFreshMeno` pattern). Amended:
  `docs/specs/repo-and-tenancy.md` (`org/` named alongside `content/` as a reserved
  downstream-owned root - behavior line + invariant 3 extended), `docs/architecture.md`
  (`org/` in the repository layout block, one line in the three-content-tiers prose, a
  phase-to-spec row for v1.3), `docs/how-meno-works.md` ("Using Meno in an organization"
  pointer section), `CONTRIBUTING.md` (one line routing org deployments to the new doc),
  `README.md` ("For the curious" gains the org doc), `AGENTS.md` (docs list gains
  org-deployment.md + integration-surface.md), `docs/specs/community.md` (open question 2
  resolved - `org/` documented in `docs/org-deployment.md`, not here, same as `content/`).
  Gate green: `npm run typecheck`, `node --test tools/test/*.test.ts app/test/*.test.ts`
  (81/81), `npm run validate` (0 errors, 0 warnings).

- 2026-08-05 - **v1.2: publish-to-community skill and the read/write closure of the community
  tier.** Built on top of the coordinator-landed contract (domain-scoped `topic-packs/<domain>/<slug>/`,
  `DOMAINS.md`, `PACK.md`, generated `INDEX.md` via `tools/packs.ts`, `pack.schema.json` +
  `reference-note.schema.json`, `course.yml`'s `derived_from`, and validate's `pack-layout` /
  `pack-notes` / `pack-overlap` / `pack-safety` checks). Landed the write side:
  `.agents/skills/publish-to-community/SKILL.md` (search-first mandatory step 1, transcribe-never-copy,
  sanitize, four-part quality gate, amend-over-fork) plus `references/sanitization.md` (the
  never-leaves-`content/` catalog, naming worked-examples-from-real-work as the one class no
  regex catches) and `references/amendment.md` (amendment-log mechanics, `derived_from`
  provenance lookup); symlinked and listed in `AGENTS.md`. Read side amended into three existing
  skills: `generate-curriculum` gained a step-0 preflight search (backstop for direct invocation)
  and the untrusted-reference-data rule; `elicit-needs` gained the same search between
  confirmation and handoff; `generate-module` gained the rule for reading a pack's `notes/` at
  adoption. `extend-meno/references/recipes.md` gained a full "Adopt a pack" recipe
  (domain-scoped path, `derived_from` capture including the `PACK.md`-version-or-commit-sha
  rule) and cross-linked its existing "Draft a topic pack" recipe against the new skill.
  `topic-packs/README.md` rewritten for the landed reality (domains, `PACK.md`, `notes/`,
  `INDEX.md` search-first, the publish path, `derived_from`, a security-posture section). PR
  template gained a "Publishing to the community tier" block (search-first result line, eight
  sanitization attestations with the real-work-example one marked human-review-only, audit
  verdicts, validate + INDEX freshness). `examples/seeded-faults/publish-fixture/` - a second
  red-team fixture alongside `audit-fixture/` (parent README now introduces both): an ordinary,
  fully `npm run validate`-clean tenant course (profile, one module, one 9/9-anatomy lesson,
  a 4-event ledger with a rubric string and an override reason, `mastery.yml` rebuilt via
  `tools/rebuild-mastery.ts`) seeded with six leak classes - personal name+email, employer name,
  a machine path, a `source_type: user` record citing `sources/`, a real-work worked example,
  and a credential-shaped string that would trip `pack-safety` if it were ever transcribed.
  `ANSWER-KEY.md` scores blind publish drills (answer key off-limits to the publisher, same
  discipline as the audit fixture). Specs: new `docs/specs/community.md` (the three-tier model,
  amend-over-fork, search-first, the publish/adopt/amend mermaid flow); amended
  `docs/specs/validation.md` (four pack-check rows), `docs/specs/curriculum.md` (step-0 preflight
  in behavior, an untrusted-data invariant), `docs/specs/interview.md` (the pre-handoff search
  step), `docs/architecture.md` (a "three content tiers" section, phase-to-spec row v1.2),
  `CONTRIBUTING.md` (packs section points at the skill and template block; the eval-gate section
  now names the blind publish drill requirement alongside the existing blind audit one). Found
  and fixed one unrelated pre-existing bug while getting the gate green: a coordinator-added test
  in `tools/test/courses.test.ts` used `new URL(...).pathname` directly (breaks on paths with
  spaces), tripping the repo's own no-`URL.pathname` hygiene test - fixed to use `fileURLToPath`
  like every other source file. Gate green: `npm run typecheck`, `node --test
  tools/test/*.test.ts app/test/*.test.ts` (72/72), `npm run validate` (0 errors, 0 warnings on
  `examples/` + `topic-packs/`), `node tools/packs.ts --check` (fresh).

- 2026-08-05 - **v1.1 study-insights acceptance loop**: the skill's acceptance run (committed as the 2026-08-08 fixture note under examples/example-learner/insights/) caught two real bugs before ship - lib/vault.ts and the app resolver only matched bare basenames so every path-style wikilink read broken (both now resolve path targets like Obsidian; regression test added), and the course hub's five lesson links were folder-relative (fixed to unique basenames). The ledger fixture's item ids were also corrected to the spec's fully-qualified form (check_usage now honestly 1/21). The narrative note refused to fabricate on both intermediate states - it reported the traced cause instead of fake topic candidates - which is the cite-your-numbers design working.
- 2026-08-05 - **v1.1: study-insights feature complete.**
  `lib/insights.ts` (`computeInsights`, pure) and `lib/vault.ts` (graph walk) already existed as the
  contract; this pass built everything around them. `lib/insights-io.ts`: the shared loader (ledger via
  a minimal `lib/mastery.ts`-based reimplementation, not `app/server/ledger.ts`, to avoid pulling the UI
  write path into `lib/`; vault via `loadVaultFiles`+`buildVaultGraph`; todos via a value import of
  `app/server/todos.ts`'s `parseTodos` - safe one-way edge, confirmed no cycle since `todos.ts` has zero
  runtime imports of its own; manifests via a `course.yml`/`module.yml` walk that also parses each
  non-planned lesson for fully-qualified authored check ids). `GET /api/v1/:tenant/insights` (read-only,
  no POST sibling, adds a `notes: string[]` field for narrative reports under `insights/`).
  `tools/insights.ts` CLI (`npm run insights --`) sharing the same loader. `InsightsPage.tsx`
  (`#/t/:tenant/insights`, one neutral palette, no pass/fail coloring, every rate shown as `n/of`) +
  router + header nav. `schemas/insights.schema.json` for narrative-note frontmatter. `study-insights`
  skill (user-invoked only, quotes the snapshot, never computes a number, writes dated
  `content/<tenant>/insights/YYYY-MM-DD-insights.md` notes + an `insights-hub.md`) with
  `references/narrative-format.md`, symlinked into `.claude/skills/`, listed in AGENTS.md. validate
  gained an `insights` check (frontmatter schema, six required body sections, cite-your-numbers as a
  literal-substring match against the note's own embedded `metrics_snapshot` - a warning by default,
  escalating under `--strict`). 12 new tests in `tools/test/insights.test.ts` (determinism, min_n on the
  example tenant's one session, `insufficient_data` Rate, the example tenant's real unrepaid ownership
  override at `gate_ts: 2026-08-07T09:35:00+10:00`, a clock-purity source grep, the vanity denylist, a
  mastery-never-imports-insights grep, and the validate check's schema/sections/citation paths) plus 4 in
  `app/test/insights.test.ts` (GET 200 with ledger/mastery bytes unchanged, POST 404). `docs/specs/insights.md`
  written per the template, owning the metric-definitions table; `docs/specs/validation.md`,
  `docs/specs/app.md`, `docs/architecture.md`'s phase-to-spec table, and `docs/specs/progress.md`'s open
  question 1 (read events stay counts-only, resolved) all amended. `npm run typecheck && node --test
  tools/test/*.test.ts app/test/*.test.ts && npm run validate && npm run build` all green (70 tests
  passing). Known pre-existing quirk, not touched: the committed example tenant's hand-authored ledger
  fixture uses short-form `item` ids (`03-ownership#string-move-invalidates`) rather than the
  fully-qualified `<course>/<module>/<lesson>#<check>` form the live app's `postCheckSubmit` route
  actually writes, so `usage.check_usage` reports `0/21` for that fixture specifically - an honest
  reflection of the fixture, not a bug in the new code.
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
