# Progress & agenda - Meno

Living status file - the done / backlog tracker for this project. **Update it whenever work changes:**
finish a thing -> move it to Done; pick up or think of a new thing -> add it to the agenda; make a call
that isn't captured in the code -> log it. Keep entries dated, newest near the top of each section.

_Last updated: 2026-08-05_

> Maintenance: keep this file current whenever work changes. Tooling can't see conversation-only
> decisions, so logging those is on whoever made them.

## Pending decisions (needs maintainer)

- None currently open.

## Done

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
