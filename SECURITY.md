# Security policy

## Reporting a vulnerability

Use GitHub's private vulnerability reporting:
**[open a draft advisory](https://github.com/avishek2002/meno/security/advisories/new)**. It is
private between you and the maintainer until a fix ships.

Please do not open a public issue for something exploitable. Everything in this repository is
cloned and run locally by its users, so a public report is a working exploit against every
instance before anyone can update.

One maintainer, best effort, no bounty. Expect a first reply within a few days, and a fix or a
written decision not to fix - "not a vulnerability, here is why" is a legitimate outcome and you
will get the reasoning.

## What Meno is, so the threat model is clear

Meno is a repository you clone and run yourself. There is no server, no accounts, no hosted
instance. Three things are worth attacking:

1. **The learner's private content.** `content/tenants/` is a personal vault - notes, study
   history, and whatever the learner told the interview about their job and goals. It is
   gitignored, guarded by a pre-commit hook, and never leaves the machine unless the learner
   exports or mirrors it deliberately.
2. **The machine running the agent.** An agent CLI reads this repository's skills and acts on
   them with tool access. Anything that gets a directive into that path is code execution by
   another name.
3. **Everyone downstream of `main`.** A merged change reaches every clone and, through
   `tools/org-sync.sh`, every private org deployment - which merges and runs the gate.

## In scope

- The localhost app under `app/` - path handling, the write surface, the header guards, the
  render pipeline.
- Anything under `tools/` that a user or maintainer runs, including the leakage guard installed
  by `tools/meno-init` and the mirror tooling in `tools/meno-mirror`.
- Tenant isolation: any way to make content under `content/tenants/` reachable, committable, or
  transmittable when it should not be.
- Content that becomes instructions: a community or org pack, or a cited source, that steers an
  agent into acting against the user.
- The contribution path itself: a way to land a change that a reviewer following
  [CONTRIBUTING.md](CONTRIBUTING.md) would not catch.

## Already known, and tracked

[docs/specs/supply-chain.md](docs/specs/supply-chain.md) has a "Verified by" section that names
the gaps this project knows about and has not closed - `.agents/skills/**` is not scanned by any
check, the instruction-shaped-phrase patterns in `pack-safety` are non-blocking warnings, and a
cited URL is reviewed at one time and fetched by an agent at another. Reporting one of those as
news is not necessary. A **working demonstration** of one of them is very welcome, and so is a
gap that section fails to mention.

## Out of scope

- Anything that assumes the attacker already runs code as the learner. The app binds `127.0.0.1`
  and is unauthenticated on purpose: it is a single-user tool over the user's own files, and any
  local process can already read those files directly. This is a stated design assumption
  ([docs/specs/app.md](docs/specs/app.md)), not an oversight - if you can break the assumption
  itself, that is in scope.
- An organization's own private `content/org/` content. Reviewing it is that organization's job
  ([docs/org-deployment.md](docs/org-deployment.md)); upstream never sees it.
- What a learner deliberately exports or publishes. `tools/export.ts --redact` strips exactly two
  fields and says so; `publish-to-community` sanitizes against a named catalog with a human
  review step it names as the gate for the class it cannot catch.
- Social engineering, physical access, and vulnerabilities in dependencies with no exploitable
  path through Meno (report those upstream; Dependabot tracks them here).
