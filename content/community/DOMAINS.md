# Course domains (closed vocabulary)

One grouping for every tier. A pack lives at `content/community/<domain>/<slug>/`, an
org pack at `content/org/<domain>/<slug>/`, and a learner's own course at
`content/tenants/<tenant>/<domain>/<course-slug>/` - the same `<domain>` list in all
three, so a course keeps its place in the tree whether it is being studied privately or
published, and adopting a pack is a straight mirror copy rather than a reshuffle.

`<domain>` must be one of the slugs below - `tools/validate.ts` errors on anything else
(`pack-layout` for the two published tiers, `course-layout` for a tenant vault). Adding a
domain is a pull request against this file that justifies why no existing domain fits;
keeping the list closed is what stops the tree from degrading into a folksonomy where the
same subject scatters across five spellings.

The tenant-side layout is specified in
[vault-conventions.md](../../.agents/skills/second-brain/references/vault-conventions.md),
which owns vault structure; this file owns only the vocabulary.

| Domain | Covers |
|---|---|
| `software-engineering` | programming languages, tooling, version control, testing, architecture |
| `data` | databases, SQL, data modeling, analytics, pipelines, statistics for data work |
| `ai-and-agents` | machine learning, large language models, agentic systems, prompt and eval practice |
| `infrastructure` | operating systems, networking, cloud, deployment, security operations |
| `product-and-design` | product management, user experience, design practice |
| `working-skills` | writing, communication, facilitation, learning-to-learn |
| `meta` | working on meno itself: contributing to the base, authoring community packs, extending an instance |
