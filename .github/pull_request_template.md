## What this changes

<!-- one or two sentences; link the spec section it amends -->

## Checklist

- [ ] `npm run gate` is green (typechecks, tests, validate)
- [ ] Generation-skill change: `npm run eval` run and reported (baselines diff included
      if rebaselined, with the why)
- [ ] Skill or entry-point change: fresh-clone smoke test run; CLI named
- [ ] The owning spec under `docs/specs/` reflects the new behavior
- [ ] Schema change: `schema_version` bumped + `docs/migrations.md` line
- [ ] No content under `content/`; no format restated outside its canonical owner

## Publishing to the community tier

<!-- only for pull requests that add or amend a topic-pack under topic-packs/; delete this
     section otherwise -->

- **Search-first result:** none found / amending `<domain>/<slug>` / new pack, differs from
  `<domain>/<slug>` because \_\_\_
- Sanitization attestations (all true, or the exception is explained below):
  - [ ] No `profile.md` content (packs are pre-contract)
  - [ ] No `progress/` content, or anything derived from it
  - [ ] No rubric strings or override reasons
  - [ ] No journal blocks (home "Notes to self", hub free text)
  - [ ] No `todos.md` content
  - [ ] No `sources/` paths or `source_type: user` records (public equivalents substituted
        where a claim still needed one)
  - [ ] No personal identifiers (names, emails, employers, machine paths, keys)
  - [ ] No worked examples drawn from the learner's real work - **reviewer: check this one
        by eye, it is not machine-checkable**
- [ ] `audit-citations` run in full against the pack tree; verdicts pasted below
- [ ] `npm run validate` clean on the pack tree
- [ ] `node tools/packs.ts` run; `topic-packs/INDEX.md` diff included
