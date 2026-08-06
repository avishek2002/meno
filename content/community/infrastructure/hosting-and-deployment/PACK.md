---
schema_version: 1
pack: infrastructure/hosting-and-deployment
title: Hosting and deployment
maintainers: []
audience: developers who build applications that run on localhost and now need to choose and defend where those applications should actually run; comfortable with a shell and an HTTP API, no operations background assumed
hours: "40"
created: 2026-08-06
---

# Hosting and deployment - pack provenance

The first pack in the `infrastructure` domain. Structure and anchor sources only, per the
pack model: lesson bodies generate at adoption against the adopter's own contract.

The course teaches judgement about where an application should run rather than the
operations of running it - every objective sits at or below an `analyze` ceiling, and no
module asks the learner to deploy anything. That framing is deliberate and worth keeping
if the pack is amended: the material is a map of hosting shapes and their documented
limits, not a tutorial for any one platform.

Every anchor source is a vendor's or standards body's own page, archived at authoring
time, because the numbers this course reasons from - execution ceilings, connection
caps, cold-start figures, egress pricing - go stale within months. An adopter should
expect to re-verify them; module 10 teaches exactly that skill.

**Nearest existing coverage:** `ai-and-agents/llm-cost-and-token-engineering`, which
also touches language-model serving. The two do not overlap in substance - that pack is
about what a model call costs and how to route it between capability tiers, this one is
about where the call executes and what the surrounding host does to it (module 7 is the
point of contact: serverless timeouts against streaming responses). Adopting either does
not make the other redundant.

Maintainers listed above are advisory reviewers for amendments, not owners with veto.

## Amendment log

- 2026-08-06 - pack created, transcribed from a tenant course (10 modules, 32 archived
  anchors across NIST, MDN, RFC 9111, the Twelve-Factor App, OWASP, PostgreSQL, and the
  published limits pages of AWS, Google Cloud, Cloudflare, Vercel, Supabase, Render,
  Heroku and Fly.io). The source course had module 1 generated and modules 2-10 at
  skeleton; since packs ship structure and never lesson bodies, the pack is complete as
  transcribed.
