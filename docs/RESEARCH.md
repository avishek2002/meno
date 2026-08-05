# Agent-Driven LMS: Consolidated Research and Planning Document

Research date: 2026-08-05. Synthesized from seven research reports (learning science, LMS landscape, needs elicitation, agent architecture, prior art, content schema, gap-fill) and a completeness critique. Where reports disagreed, the resolution and its rationale are stated inline.

## 1. Vision and requirements

The owner wants a Learning Management System (LMS) that lives in a GitHub repository and is driven by a coding agent. Requirements, restated precisely:

- The core is an agent in the style of Claude Code, but the design must be model-agnostic: any capable coding-agent CLI (command-line interface) must be able to operate the repo. Claude Code is first-class, never hard-required.
- Users are assumed novices in the subject. A clarification sub-system must interrogate the user to pin down exact needs, target comprehensiveness, and constraints before anything is generated.
- Users can bring their own content: user-supplied documents ground and seed generation.
- The agent generates comprehensive learning material with sources and references, structured so the LMS can visually present it.
- Content is tenant-scoped: each user's generated content is gitignored. Only shared base content is committed: a guide to how the LMS works and how to build on it, plus the skills that drive the agent.
- Skills are procedural markdown instruction files in the style of Anthropic Agent Skills, defining elicitation, generation, and presentation structure.
- The repo must be agent-legible (an agent can navigate it and understand each part by reading) and buildable collaboratively by multiple contributors.

## 2. What makes learning actually work: principles the generator must encode

The generation skills should hard-code these evidence-backed levers, roughly in order of strength:

- **Spaced retrieval practice.** Actively recalling material beats re-reading it (testing effect, systematic review: https://www.jacr.org/article/S1546-1440(23)00646-4/fulltext), and distributing that recall over time beats massing it; the combination is the strongest single lever in the literature (https://link.springer.com/article/10.1186/s40594-024-00468-5). Every lesson needs produce-the-answer checks, not recognition-only review, plus spaced-review metadata (for example next-review offsets of 2, 9, and 30 days).
- **Worked examples first, then fading (cognitive load theory).** Novices learn better from annotated worked examples than unguided problem-solving (Sweller; overview: https://www.uky.edu/~gmswan3/544/Cognitive_Load_&_ID.pdf), and guidance should fade step by step as competence is demonstrated, since full examples slow experts down (expertise reversal; https://cogscisci.wordpress.com/wp-content/uploads/2019/08/sweller-guidance-fading.pdf). Generate a fading ladder per skill, not flat example-problem pairs. This directly matches the novice-user assumption.
- **Mastery gates.** Bloom's two-sigma tutoring result likely owes much of its effect to the stricter 90 percent mastery threshold, not one-to-one format per se (https://www.justinmath.com/blooms-two-sigma-problem/). Gate unit progression on roughly 80 to 90 percent performance on transfer-level items, never on completion clicks or time-on-page.
- **Interleaving, applied with calibration.** Mixing problem types improves delayed retention; the headline "doubles retention" figure comes from one fourth-grade math study (http://uweb.cas.usf.edu/~drohrer/pdfs/Taylor&Rohrer2010ACP.pdf) and meta-analytic effects are more modest, so treat it as a reliable but medium-sized lever: shuffle practice across sibling skills once a unit has two or more.
- **Desirable difficulties, explained to the user.** Conditions that feel harder (spacing, testing, variation) produce better retention (Bjork: https://www.unh.edu/teaching-learning-resource-hub/sites/default/files/media/2023-06/itow-introducing-desirable-difficulties-into-practice-and-instruction-bjork-and-bjork.pdf). An agent's natural pull is to please the user by making things feel easy; the skills must explicitly warn that productive struggle is the design working.
- **Backward design and Bloom-leveled objectives.** Fix the objective and its assessment before drafting any explanation (Understanding by Design: https://pressbooks.pub/etsu/chapter/understanding-by-design-ubd-and-the-backward-design-framework/), and write every objective with a Bloom-taxonomy action verb so depth and assessment stay calibrated to the same target. Gagne's nine events of instruction serve as the literal lesson skeleton (https://www.niu.edu/citl/resources/guides/instructional-guide/gagnes-nine-events-of-instruction.shtml).
- **LLM-specific hazards.** Large language model (LLM) tutoring research 2023-2026 is mixed: solution-substitution produces shallow coverage while explanation-alongside-own-work deepens it (https://arxiv.org/abs/2409.09047), and LLM access can improve practice scores while reducing exam scores once removed, mitigated by withholding direct answers (https://www.brookings.edu/articles/what-the-research-shows-about-generative-ai-in-tutoring/). Khanmigo's shipped precedent is Socratic refusal to hand over answers (https://aicompetence.org/ai-socratic-tutors/).

**Resolution on the no-direct-answers rule** (learning-science's hard rule versus content-schema's answer reveals): the rule is mode-scoped. In interactive tutoring sessions the agent stays Socratic; in static retrieval-practice materials, answer feedback is required because the testing-effect literature is built on feedback-bearing flashcards. Both positions are right in their own mode.

## 3. What makes a great LMS: landscape lessons, steal and skip

**Steal:**
1. Socratic clarification before generation. Khanmigo, ChatGPT Study Mode (https://openai.com/index/chatgpt-study-mode/), Google Guided Learning, and Anthropic's Learning Mode (https://venturebeat.com/ai/anthropic-flips-the-script-on-ai-in-education-claude-learning-mode-makes-students-do-the-thinking) all converged on this pattern independently in 2025.
2. Visual sequencing. roadmap.sh's popularity shows a dependency graph is load-bearing navigation (https://roadmap.sh/computer-science); generate it as a Mermaid flowchart.
3. Spaced-recall checkpoints without building flashcard software. Anki's evidence base is real but the cited 6.2 to 10.7 percent exam gains are observational, self-selected-user data (https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12662189/), not controlled comparisons; the mechanism is worth encoding as content structure, not as a scheduler app.
4. Depth-over-volume curation (TeachYourselfCS) and right-sized scope. MOOC (massive open online course) completion medians sit near 12.6 percent, with scope mismatch and lack of time as dominant causes (https://openpraxis.org/articles/10.55982/openpraxis.16.3.606); the clarification step is the completion-rate feature.
5. Frictionless resume, no guilt streaks. Duolingo's streak statistics (3.6x engagement) come from gamification-vendor marketing (https://trophy.so/blog/duolingo-gamification-case-study) and the "hollow engagement" critique from an opinion post; the calibrated takeaway is that habit cues help and reward theater is unnecessary for a self-selected CLI user.

**Skip:** SCORM (Sharable Content Object Reference Model) packaging, gradebooks, seat management, LTI (Learning Tools Interoperability). These serve institutions, not a learner with a git clone; SCORM structurally cannot see learning outside its launch context (https://xapi.com/scorm-vs-the-experience-api-xapi/).

**Resolution on assessment emphasis** (lms-landscape's "skip auto-quizzes as primary mechanic" versus learning-science and prior-art's mastery-gate position): the mastery-gate position wins, since it rests on meta-analyses while the caution rests on a blog critique of Duolingo. Reconciled: mastery-gated assessment yes, streak-and-badge theater no.

## 4. Prior art in agentic learning systems and the gap we fill

- **anthropics/courses** (22.5k stars) proves course-as-repo is a trusted format but generates nothing and adapts to no one (https://github.com/anthropics/courses).
- **OSSU (Open Source Society University)** proves issue-driven, community-curated curriculum governance (https://github.com/ossu/computer-science).
- **learn-anything** (https://github.com/d-wwei/learn-anything) is the closest single artifact: one model-agnostic SKILL.md with graded sources, an Ebbinghaus-curve review schedule, and a reactive `progress/` directory. But it is a 4-star, 0-fork proof of concept; its "works with Claude Code, Codex, Gemini" claim is its own unverified README, and it has no clarification interview, no tenancy, no presentation schema.
- **OpenTutor** (https://github.com/zijinz456/OpenTutor) has the best assessment loop found (FSRS spaced repetition plus wrong-answer diagnostics) and a 12-block presentation layer, but it is a hosted ingestion app with a database, not a git-native skills repo.
- **Socratic clarification skills** (for example https://github.com/roy-reshef/socratic-ai-prompt-skill) prove the interrogate-then-brief idiom exists for coding tasks; none target pedagogy.

**The unclaimed gap, confirmed:** no project combines (a) a structured novice-clarification interview, (b) generated, cited material grounded in user-supplied sources, (c) a schema built for visual presentation, and (d) gitignored per-tenant content over a shared, collaboratively maintained skill core. One negative finding matters: no abandoned-at-scale precedent exists to copy a citation-integrity mitigation from; we design that ourselves (section 9).

**Resolution on FSRS (Free Spaced Repetition Scheduler)**: prior-art's "FSRS from day one" is the least supported position given the no-daemon architecture (section 6); the synthesis is spacing metadata plus a due-date snapshot, with scheduling checked at session start and optional delegation to the Obsidian Spaced Repetition plugin.

## 5. Designing the clarification sub-system

The crux failure mode: a true novice cannot answer open questions about depth or scope, because the knowledge needed to answer is what they lack. The fix, consistent across survey design and AI-product onboarding, is closed questions with concrete anchored menus (https://www.surveymonkey.com/mp/comparing-closed-ended-and-open-ended-questions/), one at a time (Typeform's "double completion rate" claim is growth-marketing sourced, but the direction is corroborated by cognitive-load reasoning), with performance probes replacing self-report where possible (Duolingo's adaptive placement: https://duolingo-papers.s3.amazonaws.com/reports/Duolingo_whitepaper_test_scoring_2024_v1.pdf) and behavioral can-do anchors in the CEFR (Common European Framework of Reference) style (https://www.coe.int/en/web/common-european-framework-reference-languages/table-2-cefr-3.3-common-reference-levels-self-assessment-grid).

**Recommended protocol (the elicitation skill):**
- **Phase 0, job and motivation (1-2 questions).** Jobs to Be Done framing: "What will 'done' let you do that you can't do today?", anchored with example answers. Outcome, not topic.
- **Phase 1, prior knowledge (1 self-report + 1 live probe).** Behavioral menu (never touched it / know the vocabulary / built small things / comfortable), then one micro-task pitched at the claimed level to confirm or correct it. The live probe is the highest-leverage addition, since novice self-assessment is exactly what fails.
- **Phase 2, depth and time budget (1-2 closed questions).** Depth menu (follow along / build a small real thing / teach it or pass a certification) plus total hours and cadence. Time budget drives module granularity.
- **Phase 3, format preference (1 skippable question with stated default),** including whether user-supplied sources exist to ground generation (section 6).
- **Phase 4, confirmation (mandatory).** Restate the plan as a compact brief; one yes/no/adjust gate before generation.

**Stop conditions:** hard cap of 5 to 7 questions; two vague answers in a row on a phase triggers a stated default ("assuming X, correct me if wrong") rather than more probing. LLMs demonstrably lack principled stop criteria on their own (https://openreview.net/forum?id=dc8ebScygC), so the budget lives in the skill, not the model's judgment. Codify two mid-course re-clarification triggers: struggle (repeated misses trigger a targeted prerequisite re-probe) and drift (off-goal requests trigger a scope check). The brief persists as `profile.md` in the tenant directory: it is the contract every generation skill reads first.

## 6. Agent-native, model-agnostic repo architecture

**Entry-point strategy, corrected.** AGENTS.md is a Linux Foundation-stewarded open spec read natively by Codex CLI, Gemini CLI, Cursor, and 30-plus tools (https://agents.md), but Claude Code does not natively read it: that is a verified open feature request (https://github.com/anthropics/claude-code/issues/34235). Claude Code reads CLAUDE.md and `.claude/skills/`. The corrected design:

1. `AGENTS.md` at repo root is the canonical, model-agnostic entry point: purpose, navigation map, an instruction to enumerate skills, and one line telling any agent to check `progress/` for due review items at session start.
2. `CLAUDE.md` is a one-line shim, `@AGENTS.md` (Claude Code's documented import syntax; pattern verified at https://gist.github.com/yurukusa/d36197848911f025add142abefcde685), plus an optional Claude-specific section. One source of truth, zero drift.
3. Skills live canonically in `.agents/skills/<name>/SKILL.md`, the one directory both Codex CLI (https://learn.chatgpt.com/docs/build-skills) and Gemini CLI (https://geminicli.com/docs/cli/skills/) discover natively; `.claude/skills/` holds symlinks into it for Claude Code. SKILL.md follows the open Agent Skills spec (https://agentskills.io/specification): name plus description frontmatter, body under 5,000 tokens, progressive disclosure via `references/`. Load-bearing instructions go in plain body prose so an agent without native skill support succeeds by just reading the file.
4. Contributor docs require a three-CLI smoke test (Claude Code, Codex CLI, Gemini CLI) before any skill merges, because learn-anything's multi-CLI claim is unverified marketing. Note the interview needs interactive mode: `codex`, not `codex exec`.

**Recommended layout** (content-schema's tree wins over agent-architecture's `/learners/` variant because its manifests and rich frontmatter are the generation target; Open Knowledge Format (OKF) permissiveness, https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md, is adopted as the renderer contract: tolerate missing optional fields and broken links so partial curricula never break anything. OKF is a v0.2 spec with unknown adoption, so it is a pattern to borrow, not a dependency):

```
AGENTS.md                      canonical entry point
CLAUDE.md                      one-line @AGENTS.md shim
README.md                      thin human overview
docs/                          architecture, extending, content-schema
.agents/skills/                elicit-needs/  generate-curriculum/  generate-module/
                               tutor-session/  audit-citations/  (SKILL.md each)
.claude/skills/                symlinks into .agents/skills/
schemas/                       lesson.schema.json, curriculum.schema.json
examples/example-learner/      committed fake-persona tenant, the living spec
content/tenants/<tenant-id>/   gitignored
  profile.md                   the elicited brief
  sources/                     user-supplied documents + manifest.md
  <course-slug>/course.yml, modules/NN-name/{module.yml, lessons/, activities/}
  progress/ledger.jsonl, mastery.yml
```

The example tenant lives under `examples/`, not inside the gitignored tree, so no glob mistake can leak a real tenant or hide the example.

**Bring-your-own-content ingestion.** Use agentic retrieval, not an index: coding-agent CLIs already glob and read files, and a personal corpus does not justify vector infrastructure (NotebookLM-style grounding, https://www.kzsoftworks.com/blog/notebooklm-this-ai-is-grounded-in-your-documents-not-the-whole-internet, and OpenTutor's ingestion service both assume servers we deliberately lack). Generation skills read `sources/` before drafting and cite user material with `source_type: user` pointing at a relative path, versus `source_type: web` with URL plus archive. Copyright: personal, transformative study use is favored; verbatim reproduction and redistribution are not (https://libguides.nyu.edu/fairuse), which the architecture already satisfies since tenant content never leaves the machine, provided raw uploads in `sources/` are explicitly gitignored too.

**Study-time loop without a daemon.** Two skill families, both hand-invoked: generation-time skills (elicit, generate) write content and seed `progress/` with due dates; a `tutor-session` skill owns study time, and on activation reads the ledger, computes due items against today's date, runs Socratic review, grades, and appends events before offering new material. This mirrors learn-anything's reactive `progress/` mechanism (https://github.com/d-wwei/learn-anything). Optional additive interop: emitting Obsidian Spaced Repetition plugin syntax gives users a real review queue with zero core dependency (https://stephenmwangi.com/obsidian-spaced-repetition/).

**Generation economics.** Recommend skeleton-upfront, modules just-in-time: the clarification brief yields a full committed curriculum skeleton (objectives, dependency map, module manifests), but lesson bodies generate at first study of each module. Cheaper, faster to first lesson, and lets ledger evidence steer later modules. This is a recommendation for the owner to confirm (question 5).

**Tenancy and updates.** Users clone (or fork) and pull base updates from upstream; gitignored tenant content is untouchable by merges, so conflicts only ever land in base files. Two verified caveats: forks of public repositories cannot be made private (https://github.com/orgs/community/discussions/34584), so a fork-based tenant who commits anything personal publishes it; and client-side pre-commit hooks do not auto-install on clone, so the leakage guard is opt-in. Mitigations: ship an `init` step in the guide that installs the hook and optionally configures a second, private remote (or a dedicated private repo) for tenant content backup; gitignore-only tenancy otherwise means a lost laptop loses the corpus (question 6).

**Co-versioning.** Add `schema_version` to every manifest and lesson frontmatter, and a `docs/migrations.md` noting what a skill or schema change means for previously generated tenant content; the tutor-session skill flags stale-schema content instead of choking on it (OKF permissiveness again).

## 7. Content schema and visual presentation

Every lesson is markdown with YAML frontmatter (the Docusaurus/Jekyll/Obsidian-compatible pairing): `id`, `title`, `type`, Bloom-leveled `objectives`, `prerequisites`, `estimated_minutes`, `difficulty`, `status` (draft/generated/reviewed/stale), `generated_at`, `review_after`, structured `sources` (title, url, `archived_url`, accessed, `source_type`), `tags`, `schema_version`. Structured sources let a renderer build a references panel and let the agent refresh one field without touching prose.

Ordering by numeric directory prefixes (`01-foundations/`), decentralized per-module `module.yml` manifests rather than one mdBook-style `SUMMARY.md` (a merge-conflict magnet under parallel agent writes; https://rust-lang.github.io/mdBook/format/summary.html versus https://docusaurus.io/docs/sidebar), plus a regenerable, never-hand-edited `course.yml` overview.

**Render path, three tiers, one authoring discipline:** (1) plain GitHub today: native Mermaid flowcharts for curriculum maps (`graph TD`, not `mindmap`, which GitHub does not render: https://github.com/mermaid-js/mermaid/issues/6646), GitHub alerts for misconception and worked-example callouts, GFM (GitHub Flavored Markdown) tables, `<details>` answer reveals; (2) Obsidian next: same files as a vault, graph view and review queue free, flashcards in the Spaced Repetition plugin's `Question::Answer` syntax which degrades to readable plain text; (3) static site later (Quartz or Docusaurus) with no schema change. Lesson bodies follow the nine-part template from section 2 (objective, prerequisite check, chunked explanation, worked example, faded practice, misconception trap, retrieval check, spaced-review hook, transfer prompt). Progress uses event sourcing: append-only `ledger.jsonl` (audit trail) plus derived `mastery.yml` (disposable render cache, rebuildable from the ledger).

Citations carry a Wayback Machine `archived_url` captured at generation time via the Save Page Now endpoint, the same pattern Wikipedia used to repair a million links (https://blog.archive.org/2016/10/26/more-than-1-million-formerly-broken-links-in-english-wikipedia-updated-to-archived-versions-from-the-wayback-machine/).

## 8. Collaboration model

A central upstream repo with pull-request-reviewed contributions, on the OSSU issue-driven precedent. Two contribution surfaces: `.agents/skills/` and optional `content/community/` topic packs (pre-vetted curricula for common subjects). Because "same review bar as code" is unactionable for generation quality, add a lightweight eval gate: each generation skill ships golden examples (a fixed brief in, a reference output judged on rubric criteria such as objective quality, citation presence, and template completeness), and the contributor checklist requires the three-CLI smoke test plus the eval run before merge. Tenant directories are untracked, so contributors' personal content never collides with PRs. The committed `examples/example-learner/` doubles as the living spec and the eval fixture. Licensing needs an owner decision (question 11): the repo license covers skills and docs; generated tenant content is the user's, and the guide should say so explicitly.

## 9. Risks and failure modes, ranked

1. **Hallucinated citations.** The top risk, with no prior-art mitigation to copy. Mitigate in layers: required structured `sources` frontmatter; a fetch-before-cite rule in the generation skill (only cite URLs actually retrieved this session); Wayback archiving at generation time; and a separate `audit-citations` skill for post-generation spot checks.
2. **Scope mismatch.** The dominant MOOC failure mode. Mitigate with the clarification protocol's depth-and-hours contract and drift-triggered re-scoping.
3. **Illusion of learning.** Fluent generated prose that substitutes for thinking (https://arxiv.org/abs/2409.09047). Mitigate with mastery gates, retrieval checks, mode-scoped Socratic tutoring, and explicit desirable-difficulty messaging.
4. **Entry-point drift across CLIs.** Mitigate with the AGENTS.md-canonical shim design and the three-CLI smoke test; revisit when Claude Code ships native AGENTS.md support (issue #34235).
5. **Tenant data loss and leakage.** Gitignore is not backup, hooks are opt-in, public forks cannot go private. Mitigate via the `init` step, private-remote guidance, and the example-tenant-outside-gitignore layout. Related privacy note for the guide: profile and source content is sent to whichever model provider the user's CLI uses.
6. **Skill and content version skew.** Mitigate with `schema_version`, migration notes, and permissive rendering.
7. **Stale content.** Mitigate with `review_after` dates the agent can query without reading bodies.

## 10. Open questions for the owner

1. **V1 presentation surface and persona:** plain GitHub, Obsidian-first, or static site? Every schema bet hangs on what "visually present" means, and on whether users are developer-fluent (comfortable with a CLI) despite being subject novices.
2. **Is the agent present at study time?** Confirm the two-skill-family design (tutor-session owns grading, ledger, and due reviews) versus generation-only with self-graded static checks.
3. **Bring-your-own-content in v1?** Confirm the `sources/` inbox plus agentic-retrieval design now, or document deferral.
4. **Comprehensiveness dial semantics:** depth enum, hours budget, or the recommended two-axis contract (depth menu times hours)? The elicitation skill cannot ask for an undefined quantity.
5. **Generation economics:** confirm skeleton-upfront with just-in-time module bodies, versus one long upfront run.
6. **Tenancy durability:** is gitignore-only acceptable, or ship the private-second-remote / private-mirror install path in v1?
7. **Governance:** central eval-gated upstream (recommended) versus federated forks; who reviews topic packs?
8. **Generate versus curate:** prose-first generation with citations, an annotated external reading list with generated practice layers, or the hybrid? Curation shrinks the hallucination surface; generation maximizes tailoring. Related: is linking external video and interactive resources in scope?
9. **Hard mastery gates or advisory checks**, and confirmation that the no-direct-answers rule is scoped to interactive tutoring only.
10. **Citation-integrity depth:** schema-only, schema plus fetch-before-cite plus archiving (recommended), or additionally the post-generation audit skill on every run?
11. **Licensing:** repo license for skills and docs, and an explicit statement that generated tenant content belongs to the user.
