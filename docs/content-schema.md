# Content schema

*Stub - filled in as Phases 2 and 3 land the JSON schemas. This page will become the index of
every machine-validated format in a tenant's content tree.*

Every artifact a tenant's content tree contains is defined in exactly one place. The canonical
prose definitions live with the skill that owns each format; the machine-checkable versions
will live in `schemas/` as JSON Schema files and be enforced by `tools/validate.py`.

| Artifact | Canonical definition (owner) | JSON Schema | Status |
|---|---|---|---|
| `profile.md` frontmatter | `elicit-needs/references/profile-format.md` | `schemas/profile.schema.json` | landed (Phase 1) |
| `module.yml` | `generate-curriculum/references/manifest-format.md` | `schemas/module.schema.json` | landed (Phase 2) |
| `course.yml` | `generate-curriculum/references/manifest-format.md` | `schemas/course.schema.json` | landed (Phase 2) |
| Source records | `generate-curriculum/references/sourcing.md` | `$defs/source` in module.schema.json | landed (Phase 2) |
| Lesson frontmatter | `generate-module/references/lesson-format.md` | `schemas/lesson.schema.json` | Phase 3 |
| Check blocks (`meno-check`) | `generate-module/references/check-formats.md` | embedded in lesson schema | Phase 3 |
| `progress/ledger.jsonl` events | `generate-module/references/lesson-format.md` | `schemas/ledger.schema.json` | Phase 3 |
| `todos.md` lines | `second-brain/references/todo-format.md` | not schema-validated (line format) | - |
| Hub notes / derived regions | `second-brain/references/vault-conventions.md` | not schema-validated (prose format) | - |

Cross-cutting rules that will hold for every schema:

- Every manifest and lesson carries `schema_version`; breaking changes get a note in
  [migrations.md](migrations.md).
- Consumers tolerate stale versions and missing optional fields (permissive rendering) - a
  partial curriculum never breaks the app or a session.
