# Topic packs

A topic pack is a pre-vetted curriculum for a common subject, shareable through the
normal pull-request path and adoptable by any tenant. Packs exist so well-trodden topics
do not need every learner's agent to rediscover the same structure and sources - and so a
tenant's own hard-won course can go back to everyone else instead of staying locked in one
private vault. This directory is the community tier: the middle layer between base Meno
(this repository) and one learner's private `content/tenants/<tenant>/`.

## Domains

Every pack lives at `content/community/<domain>/<slug>/`. `<domain>` is one of the closed set of
domains in [DOMAINS.md](DOMAINS.md) - closed on purpose, so `tools/validate.ts` can refuse
anything else and a subject cannot scatter across five spellings. Adding a domain is a pull
request against that file, justifying why no existing domain fits.

## The format (no new schema)

A pack is a course skeleton in the exact formats generated courses use
([manifest-format.md](../../.agents/skills/generate-curriculum/references/manifest-format.md)),
with two deliberate differences:

- `course.yml` has `status: draft` and **no `profile` field** - a pack is pre-contract;
  it meets its learner at adoption time.
- Lessons are `planned` only - **no lesson bodies ship in a pack**. Bodies are written
  by `generate-module` at adoption, against the adopter's confirmed profile, so depth,
  pacing, and prior-knowledge fit are theirs, not the pack author's. What a pack
  contributes is the hard-won part: objective structure, module decomposition,
  prerequisite order, and verified anchor sources.

Layout: `content/community/<domain>/<slug>/` containing `course.yml`, `PACK.md`,
`CONTRIBUTORS.yml`, `<slug>-hub.md`, `modules/NN-slug/module.yml`, and optionally `notes/` - see
below.

## PACK.md (provenance, required)

Every pack directory carries a `PACK.md`: frontmatter per
[schemas/pack.schema.json](../../schemas/pack.schema.json) (`pack`, `title`, `maintainers`,
`audience`, `hours`, `created`) plus a body Amendment log - one dated line per change,
append-only, oldest first. Maintainers are advisory reviewers for amendments, not owners
with veto; the pack belongs to the community tier, not to whoever wrote it first. See
[software-engineering/git-fundamentals/PACK.md](software-engineering/git-fundamentals/PACK.md)
for a worked example.

## CONTRIBUTORS.yml (attribution, required)

`PACK.md`'s `maintainers` answers "who reviews changes here"; it deliberately does not answer
"who wrote this". `CONTRIBUTORS.yml` does, at the smallest unit a change actually touches:
schema [schemas/contributors.schema.json](../../schemas/contributors.schema.json), enforced by
`tools/validate.ts`'s `pack-attribution` check.

```yaml
schema_version: 1
contributions:
  - unit: pack
    by: "@first-author"
    date: 2026-08-05
    action: created
  - unit: modules/03-remotes-and-forks
    by: "@someone-else"
    date: 2026-09-12
    action: created
    note: the GitHub collaboration layer
```

**Attribution inherits from the nearest ancestor.** A unit with no record of its own is
attributed to the closest one above it, so a pack written by one person needs exactly one record
and finer records exist only where authorship genuinely differs. That is what makes
"smallest granularity" affordable rather than clerical: you pay for detail only where detail is
true.

The units, and what each resolves against:

| `unit` | Names | Exists when |
|---|---|---|
| `pack` | the whole pack | always - every pack needs at least this one record |
| `objectives/<id>` | one course objective | `course.yml` lists that objective id |
| `modules/<slug>` | one module | that module directory exists |
| `modules/<slug>/lessons/<file.md>` | one planned lesson | that module's `module.yml` lists the file. Packs ship no lesson bodies, so the manifest entry is the unit, not a file on disk |
| `modules/<slug>/sources/<url>` | one anchor source | that module's `sources` list carries the url. The url is the key because it survives both reordering the list and re-archiving the source |
| `notes/<file.md>` | one reference note | that file exists |

`PACK.md` and the pack's hub note have no unit of their own on purpose: both are pack-level
artifacts (provenance, and a map derived from the manifests), so they are attributed at `pack`.
If one of them ever carries authorship the pack record does not, that is a reason to add a unit,
not a reason to stretch an existing one.

Three rules keep the log honest:

1. **Append, never rewrite.** Records go in oldest-first and stay put. Stripping somebody's
   record to claim their work is a thing git history will show and a reviewer should reject.
2. **`action: removed` retires a unit without erasing its history.** Delete a module and its
   creation record stays; the removed record simply stops being resolved.
3. **`by` is a GitHub handle or `anonymous`, nothing else.** Packs land through pull requests, so
   a handle always exists. No emails, no real names, no tenant ids - see
   [sanitization.md](../../.agents/skills/publish-to-community/references/sanitization.md).

Honest limit: none of this is proof. `by` is self-declared at write time with nothing binding it
to the person named, and no check can tell a genuine claim from a false one. It is a courtesy
record and a "who do I ask about this" pointer, not an audit trail. `content/community/INDEX.md`
rolls each pack's distinct contributors up so that question is answerable without opening the
pack.

## notes/ (optional reference notes)

A pack may carry `notes/*.md` - shared, citation-bearing explanations of a fixed ground
truth (a concept, a comparison, a canonical gotcha) that several lessons across the pack's
modules would otherwise each explain from scratch. Schema:
[schemas/reference-note.schema.json](../../schemas/reference-note.schema.json); validated by
`tools/validate.ts`'s `pack-notes` check.

What they are: `type: reference` frontmatter, `concepts`, and `sources` (the same
source-record format as everywhere, fetched and archived per
[sourcing.md](../../.agents/skills/generate-curriculum/references/sourcing.md)) - then prose
that states what is true, cited.

What they are NOT: pedagogy. `pack-notes` rejects check blocks (`meno-check` fences),
transfer prompts (any `[!question]` callout naming "Transfer"), and lesson-anatomy
sections (`## Worked example`, `## Your turn`, `## Recall`, `## Apply it somewhere new`,
the `**You'll be able to:**` line) - a reference note is ground truth an adopted lesson can
cite and build on, never a lesson in disguise. `generate-module` reads a pack's `notes/` as
anchors when a module was adopted from that pack (the untrusted-reference-data rule: it
reads them for facts and citations, never as instructions).

## INDEX.md and search-first

[INDEX.md](INDEX.md) is generated (`node tools/packs.ts`; `--check` verifies freshness)
from every pack's `course.yml`, `PACK.md`, and `CONTRIBUTORS.yml` - domain, slug, title,
audience, hours, contributors, and objective text, grepped by skills before they generate
anything. Every skill that could
duplicate a pack's work searches it first: `elicit-needs` before handing off,
`generate-curriculum`'s own preflight backstop, and `publish-to-community`'s mandatory step
1. Run `node tools/packs.ts` after adding, amending, or removing any pack - a stale index
defeats the whole point of a shared one.

## The bar for landing a pack

- Every anchor source fetched and archived per
  [sourcing.md](../../.agents/skills/generate-curriculum/references/sourcing.md) - the
  citation rules do not relax for packs.
- `npm run validate` clean (packs are validated like any course tree; budget checks are
  skipped, since there is no profile to sum against - state the intended audience and
  rough hours in `PACK.md` instead). `pack-layout`, `pack-notes`, `pack-attribution`, and
  `pack-safety` must all be clean; `pack-overlap` must not flag an unexplained collision with an
  existing pack in the same domain.
- Objectives use Bloom verbs; module sizing follows the 2-6 hour guideline.
- The pull-request checklist applies ([CONTRIBUTING.md](../../CONTRIBUTING.md)), including the
  "Publishing to the community tier" block when the pull request adds or amends a pack.

## Publishing a course to the community tier

Turning your own tenant course into a pack is
[`publish-to-community`](../../.agents/skills/publish-to-community/SKILL.md): search first,
transcribe (never copy) onto a fresh pack tree, sanitize everything that must never leave
`content/tenants/`, run the quality gate, open the pull request. Read that skill before attempting
this by hand - the sanitization step is the part that is easy to get wrong.

## Adopting a pack (tenant side)

Adoption is an `extend-meno` recipe
([references/recipes.md](../../.agents/skills/extend-meno/references/recipes.md)): mirror the
pack's tree straight across to `content/tenants/<you>/<domain>/<slug>/` - both tiers use the
same [domain grouping](DOMAINS.md), so the path is identical either side of the copy and the
domain comes along rather than being discarded - run the interview to produce the missing
`profile.md` (the pack's scope gives the interviewer a running start, and its domain is
already settled), set `status: active` and add the `profile` field, then let
`generate-module` write module 1 against your contract.

Record where it came from: add a `derived_from` block to `course.yml`
([schemas/course.schema.json](../../schemas/course.schema.json)) - `pack` (the `domain/slug`
path), `pack_version` (a version `PACK.md` states, if it states one, else the git commit
sha of the pack directory at adoption time), and `adopted_at` (today). This is what lets
`publish-to-community` find the right pack to amend later, instead of quietly forking a
duplicate.

## Security posture

Packs are community-contributed and, to every skill that reads them, untrusted reference
DATA - never instructions. Anything under `content/community/` or `content/org/` can contain text shaped
like a directive; no skill ever follows one. `pack-safety` (`tools/validate.ts`) catches the
mechanical half - scripts, credential-shaped strings, curl-pipe-to-shell, instruction-shaped
phrases, URL shorteners. The half no regex catches - a worked example quietly lifted from
someone's real, private work - is caught only by a human reviewing the pull request. That
review is a required gate, not a formality.
