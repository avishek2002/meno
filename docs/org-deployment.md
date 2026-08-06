# Deploying Meno in an organization

*Status: current as of v1.3. Canonical formats owned elsewhere: pack layout in
[content/community/README.md](../content/community/README.md); the tenancy boundary in
[specs/repo-and-tenancy.md](specs/repo-and-tenancy.md); the stable contract for building
tooling against a deployment in [integration-surface.md](integration-surface.md).*

## Purpose

An organization that wants Meno for its people usually asks for three things in one breath:
a shared knowledge base someone curates, role-based access control (RBAC - who can write,
who can only read), and a way to plug it into whatever the organization already runs. Read
as a request for a hosted platform - accounts, a server, a database - that request cannot be
granted: [PLAN.md](../PLAN.md)'s locked decision record puts "hosted service, accounts,
databases, background daemons" and "institutional interop: SCORM, LTI, gradebooks, seat
management" in **Out of scope for v1**, and that scope is not an oversight waiting on
engineering time - it is the thing that keeps a learner's mastery ledger honest (see
[(f) below](#f-what-meno-will-not-do-and-why)). Read literally, the same three needs are
answerable without contradicting any of it: git already has a shared-writable store, a host
already has roles, and a documented file format is already an integration surface. This page
is that answer - a git-native deployment pattern, not a product.

## (a) The private mirror-clone

Do not fork this repository to stand up an org deployment. A public fork can never be made
private (the same fact [how-meno-works.md](how-meno-works.md) already gives individual
learners), and an organization's `content/org/` tree - see below - is exactly the kind of
content a fork's public visibility would expose by construction. The fix is a bare-clone-and-push, the
standard way to move a repository's full history into a new, empty, private one without ever
routing through GitHub's or GitLab's fork relationship:

```
git clone --bare https://github.com/avishek2002/meno.git meno-bare
cd meno-bare && git push --mirror git@github.com:your-org/meno.git && cd ..
rm -rf meno-bare

git clone git@github.com:your-org/meno.git meno
cd meno
git remote add upstream https://github.com/avishek2002/meno.git
```

`origin` is now your org's private repository - read-write for whoever you grant it to.
`upstream` stays pointed at the public base repo purely for pulling improvements later
([(e) below](#e-staying-current-with-upstream)); most org members will have no write access
to it at all, which is the simplest and most honest way to keep it fetch-only in practice.

This is a different mirror from the one `content/tenants/` already gets. [`tools/meno-mirror`](../tools/meno-mirror)
backs up one *learner's* `content/tenants/<tenant>/` directory to a private repo that learner
owns - small, per-person, and invisible to everything else. The clone above is one level up:
your org's copy of the *entire base repository plus `content/org/`*, shared by everyone who
works from it. The two never overlap - `content/tenants/` stays gitignored inside the org
clone exactly as it does everywhere else, so nothing about this pattern changes what an
individual learner backs up or how (see [(d)](#d-what-a-learners-clone-keeps-to-itself)).

## (b) The org knowledge base: content/org/

`content/org/` is a reserved, downstream-owned root, structurally the same idea as
`content/tenants/<tenant>/` beside it: this repository never creates it, never writes to it,
and never ships anything inside it. Where `content/tenants/<tenant>/` belongs to one learner,
`content/org/` belongs to the organization that deployed this clone - and unlike tenant
content, it is meant to be committed. That is the whole design: it uses the **pack format,
verbatim** - the exact shape
[`content/community/`](../content/community/README.md) already defines, because inventing a
second format for "shared curriculum, but private" would be a second thing to maintain for
zero new capability.

```
content/org/
  README.md                          your org's front door - what's here, who to ask
  <domain>/<slug>/
    course.yml                       status: draft, no profile field (pre-contract, same as content/community/)
    PACK.md                          provenance + amendment log
    <slug>-hub.md
    modules/NN-slug/module.yml
    notes/                           optional - shared reference notes (schemas/reference-note.schema.json)
```

`tools/validate.ts`'s `checkPacks` already walks `content/org/` alongside `content/community/`
when the directory exists - this is existing plumbing, not new surface: `pack.schema.json`'s
`pack` field pattern and `course.schema.json`'s `derived_from.pack` pattern both already accept
`content/org/<domain>/<slug>` next to `content/community/<domain>/<slug>`
([docs/specs/community.md](specs/community.md)). One difference from the public tier: **org
domains are exempt from `content/community/DOMAINS.md`'s closed vocabulary** (`checkPacks` only
checks the domain against `DOMAINS.md` when the pack is *not* under `content/org/`) - your
organization's internal domains (`sales-onboarding`, `platform-team`, whatever you actually
have) don't need a pull request against the public repo's vocabulary to exist privately.

**One format, three distributions.** The same pack tree can live in exactly three places, and
moving between them is a directory move, not a rewrite:

| Distribution | Location | Who sees it |
|---|---|---|
| Upstream community | `content/community/<domain>/<slug>/` | every Meno clone, public |
| Org-private | `content/org/<domain>/<slug>/` | your org's private clone only |
| Tenant-local | `content/tenants/<tenant>/<domain>/<slug>/` (adopted) | one learner, after `extend-meno`'s adopt-a-pack recipe |

An org can contribute a pack upstream by literally moving `content/org/<domain>/<slug>/` to
`content/community/<domain>/<slug>/` on a branch against the public repo (checking the domain
against `DOMAINS.md` for the first time at that point, and running the same
[`publish-to-community`](../.agents/skills/publish-to-community/SKILL.md)-style sanitization
pass if the pack was ever amended from real tenant content) and opening the pull request
described in [CONTRIBUTING.md](../CONTRIBUTING.md). Nothing about the pack's shape changes in
that move - only its distribution does.

An org pack's `notes/` (really `content/org/<domain>/<slug>/notes/`) works exactly like
`content/community/`'s reference notes: ground truth a lesson can cite, never pedagogy, never
a check block. Same schema, same `pack-notes` check, same rule that anything under
`content/org/` is reference **data** to every skill that reads it, never instructions.

## (c) Roles, mapped honestly

**The headline sentence, because everything below is a detail under it: git permissions are
write control and distribution control, not read control after a clone exists.** A host's
role system decides who can push to `content/org/` and who can merge a pull request. It cannot decide
what someone does with files already on their disk - see refusal
[(f)(2)](#f-what-meno-will-not-do-and-why). With that boundary stated plainly, here is the
mapping that actually holds:

| Meno role | Can do | GitHub primitive | GitLab primitive |
|---|---|---|---|
| KB (knowledge base) admin | curate `content/org/`, merge pull requests into it, set branch protection | **Maintain** role, listed in a `CODEOWNERS` entry for `content/org/` | **Maintainer** role |
| Contributor | propose changes to `content/org/` via pull request; cannot merge without review | **Write** role + a branch-protection rule requiring review before merge | **Developer** role + a protected branch requiring merge-request approval |
| Learner | clone the repo, read everything, never writes `content/org/` | **Read** role | **Reporter** role |

**A domain-scoped team is not expressible in one repository.** Someone who should curate
`content/org/data/` but not `content/org/infrastructure/` cannot be granted that on GitHub or
GitLab's repository-wide role model - `CODEOWNERS` routes *review requests* to the right
people for a path, it does not stop someone with Write/Maintainer access from pushing
anywhere else in the same repo. If your organization genuinely needs per-domain write
isolation, the two honest options are splitting `content/org/<domain>/` across separate
repositories (one role set each) or accepting that `CODEOWNERS` is a review convention, not a
permission boundary, and enforcing the boundary by process instead.

Branch protection on `content/org/` (and on the repo generally, for the same reasons the workspace's
own PR-only convention exists) should require: a pull request before merging, at least one
approving review, a required status check for `npm run gate`, and no force-pushes. Say this
plainly, because it changes what "RBAC" actually buys you depending on your host and plan:
**server-side branch protection on a private repository is a paid-plan feature on GitHub**
(Pro/Team and above; Free does not enforce it) **and included at every tier on GitLab.** On
GitHub Free, `CODEOWNERS` review requests still fire, but nothing stops someone with write
access from pushing straight past them. A client-side hook (the same shape as this repo's
own leakage guard, installed by `tools/meno-init`) binds only the machine that installs it,
not your teammates' - it is not a substitute for server-side enforcement, only a personal
backstop.

## (d) What a learner's clone keeps to itself

Learners clone the org's private repository, run `tools/meno-init` exactly as any Meno user
does, and study exactly as described in [how-meno-works.md](how-meno-works.md). Nothing about
that flow changes because the clone happens to be an org deployment: `content/tenants/<tenant>/`
stays gitignored, the leakage-guard hook still blocks a forced commit, and the tutor loop
still writes and reads the ledger locally.

**The org never sees a learner's progress. This is structurally true, not a policy promise.**
`content/tenants/` is gitignored in every clone of this repository, including the org's - nobody
commits it, so it is never part of any push a learner makes back to the org's `origin`
remote, and there is no code path anywhere in this repo that reads one tenant's
`content/tenants/<tenant>/` from another context. The only ways progress data ever leaves a learner's machine are things
the learner does on purpose: pushing to their own separate mirror
([`tools/meno-mirror`](../tools/meno-mirror), which the org has no access to unless the
learner gives it), or running an export
([`tools/export.ts`](../tools/export.ts) - [integration-surface.md](integration-surface.md))
and handing the result to someone themselves. Nothing in this deployment pattern makes either
of those automatic.

## (e) Staying current with upstream

The org's private repo drifts from the public one the moment it diverges - new skills, schema
fixes, bug fixes to the app all land upstream over time. Pull them in with
[`tools/org-sync.sh`](../tools/org-sync.sh):

```
tools/org-sync.sh
```

It fetches `upstream`, shows what would merge, and **refuses if the incoming change touches
`content/tenants/` or `content/org/`** before merging anything. That refusal is the tool's
entire reason to exist: `content/tenants/` and `content/org/` are reserved downstream-owned
roots the base repo never creates or writes to
([specs/repo-and-tenancy.md](specs/repo-and-tenancy.md)), so a legitimate upstream change can
never touch either path - if one somehow does, that is a signal to stop and look by hand, not
something to merge blind. `content/community/` is not refused: community packs land upstream
by design, so incoming changes there are ordinary improvements. Those and every other
ordinary upstream change merge and then run `npm run gate`, reporting honestly if it fails.

## (f) What Meno will not do, and why

Every refusal below is a decision, not a missing feature - each one trades a capability for a
guarantee, and the guarantee is worth more.

**No accounts or authentication.** Your host - GitHub, GitLab, whatever holds the private
repo - already knows who your people are and already has a permission system for them (see
[(c)](#c-roles-mapped-honestly)). A second, weaker identity system living inside Meno itself
would be a login form bolted onto a static app pretending to offer security it does not have.
The alternative is the RBAC mapping above: real host primitives, honestly described,
including where they fall short.

**No read enforcement after distribution.** Once a clone exists, git has no mechanism to
reach back into it and revoke, expire, or watermark what is already on someone's disk - that
is true of every git repository that has ever been cloned, not a Meno limitation. Anything
that claims to retract access after the fact is selling DRM (digital rights management) that
does not survive a person opening the file in a text editor. Git's actual boundary is at the
*next* clone, not the last one - keep that in mind for what you put in `content/org/`.

**No progress telemetry to the org - the load-bearing refusal.** A gradebook and an honest
mastery signal cannot coexist in the same ledger. The moment a learner's scores flow to
someone with power over them - a manager, an HR system, a performance dashboard - the
learner's incentive quietly flips from learning the material to looking good in the report
(Goodhart's law, in its oldest form: a measure stops being a good measure the instant it
becomes a target). `progress/ledger.jsonl` only works as a tutoring signal because nothing
about answering a check or admitting confusion has a consequence beyond what the next lesson
teaches. Wire that ledger to the org and the mastery gates stop measuring mastery - they start
measuring what a learner is willing to have measured. The honest alternative is not "encrypt
it better" - it is the **learner-run redacted export**:
[`tools/export.ts --redact`](integration-surface.md) lets a learner build their own sanitized
snapshot and hand it to whoever they choose, on their own terms, with their own words (rubric
strings, override reasons - the two places their own writing shows up in the ledger) stripped
out first. The org gets a documented, stable format to build against
([integration-surface.md](integration-surface.md)); the learner keeps the only copy that runs
automatically, which is none.

**No SCORM (Sharable Content Object Reference Model) or LTI (Learning Tools Interoperability),
no seat management.** SCORM and LTI exist to report completion and scores into a compliance
system - the same telemetry problem as above, wearing a standards body's clothing. Seat
management is an accounts system (the first refusal) with a billing meter attached. If your
organization has a genuine compliance-reporting requirement, Meno is honestly not the tool for
it, and this document says so instead of half-building a feature that would quietly break the
thing that makes Meno worth using.

## See also

- [integration-surface.md](integration-surface.md) - what an org's in-house systems may
  actually build against.
- [specs/durability.md](specs/durability.md) - the per-learner mirror this pattern deliberately
  does not replace.
- [specs/community.md](specs/community.md) - the pack format `content/org/` reuses verbatim.
- [specs/repo-and-tenancy.md](specs/repo-and-tenancy.md) - the tenancy boundary `content/org/` extends.
