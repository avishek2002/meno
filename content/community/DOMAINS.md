# Pack domains (closed vocabulary)

Every pack lives at `content/community/<domain>/<slug>/`, and `<domain>` must be one of the
slugs below - `tools/validate.ts` errors on anything else. Adding a domain is a pull
request against this file that justifies why no existing domain fits; keeping the list
closed is what stops the tier from degrading into a folksonomy where the same subject
scatters across five spellings.

| Domain | Covers |
|---|---|
| `software-engineering` | programming languages, tooling, version control, testing, architecture |
| `data` | databases, SQL, data modeling, analytics, pipelines, statistics for data work |
| `ai-and-agents` | machine learning, large language models, agentic systems, prompt and eval practice |
| `infrastructure` | operating systems, networking, cloud, deployment, security operations |
| `product-and-design` | product management, user experience, design practice |
| `working-skills` | writing, communication, facilitation, learning-to-learn |
| `meta` | working on meno itself: contributing to the base, authoring community packs, extending an instance |
