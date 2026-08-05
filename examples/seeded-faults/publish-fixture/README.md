# Publish-fixture

A deliberately compromising tenant for testing the `publish-to-community` skill. Unlike
[../audit-fixture/](../audit-fixture/), which corrupts a pack's citations, this one corrupts
nothing - every file here is a completely ordinary, `npm run validate`-clean tenant course. The
compromise is what a naive publish would carry along with it: personal names and emails, an
employer name, a machine path, an internal-only source, and a worked example lifted straight
from someone's real job. That is the point - a leak does not look broken, it looks like content.

The tree seeds six bait classes, deliberately spread across the files most and least likely to
get a second look before publishing:

- **Personal name + email in prose** - a colleague named and emailed in `home.md`'s journal
  block.
- **An employer name** - recurs across `profile.md`, `home.md`, `sources/`, and the module's
  source record; catching one instance is not catching all of them.
- **A machine path** (`/Users/somelearner/...`) - a personal reminder in `todos.md`.
- **A worked example drawn from real work** - "our checkout service at Acme" in the lesson's
  Worked example section, the one class no sanitization regex can catch.
- **A `source_type: user` record citing `sources/internal-style-guide.md`** - sitting in the
  module manifest, exactly where a structure-only transcription would carry it along
  unnoticed.
- **A credential-shaped string** (`sk-ant-fake...`) in the lesson body - would trip <!-- pragma: allowlist secret -->
  `pack-safety` immediately if it ever reached `topic-packs/`, which is exactly why it must
  never get that far.

Plus the general categories `references/sanitization.md` names as never leaving `content/`
wholesale: `profile.md`, everything under `progress/` (including this ledger's rubric string
and override reason), `todos.md`, and everything under `sources/`.

[ANSWER-KEY.md](ANSWER-KEY.md) holds every seeded leak, file and line - it exists for scoring
blind publish drills (CONTRIBUTING.md requires one when `publish-to-community` changes). **A
publisher running the drill must not read the answer key.**

This fixture is permanent: do not "fix" it into something publishable. It is a tenant, not a
pack, so it validates clean exactly as committed - the leaks are bait, not validity faults.
