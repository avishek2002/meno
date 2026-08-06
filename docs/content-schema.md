# Content schema

*The index of every machine-validated format and its canonical owner.*

Every artifact a tenant's content tree contains is defined in exactly one place. The canonical
prose definitions live with the skill that owns each format; the machine-checkable versions
live in `schemas/` as JSON Schema files and are enforced by `tools/validate.ts`.

| Artifact | Canonical definition (owner) | JSON Schema | Status |
|---|---|---|---|
| `profile.md` frontmatter | `elicit-needs/references/profile-format.md` | `schemas/profile.schema.json` | landed (Phase 1) |
| `module.yml` | `generate-curriculum/references/manifest-format.md` | `schemas/module.schema.json` | landed (Phase 2) |
| `course.yml` | `generate-curriculum/references/manifest-format.md` | `schemas/course.schema.json` | landed (Phase 2) |
| Source records | `generate-curriculum/references/sourcing.md` | `schemas/source.schema.json` | landed (Phase 2) |
| Lesson frontmatter | `generate-module/references/lesson-format.md` | `schemas/lesson.schema.json` | landed (Phase 3) |
| Check blocks (`meno-check`) | `generate-module/references/check-formats.md` | body rules via `lib/lesson.ts` + validate `checks` | landed (Phase 3) |
| `progress/ledger.jsonl` events | semantics: `docs/specs/progress.md` | `schemas/ledger.schema.json` | landed (Phase 3) |
| `progress/mastery.yml` | derived view: `docs/specs/progress.md` | byte-identical rebuild via `lib/mastery.ts` | landed (Phase 3) |
| UI-writable ledger events (narrowed) | `docs/specs/app.md` | `schemas/ledger.ui.schema.json` | landed (Phase 4) |
| `todos.md` lines | `second-brain/references/todo-format.md` | not schema-validated (line format) | - |
| Hub notes / derived regions | `second-brain/references/vault-conventions.md` | not schema-validated (prose format) | - |
| Narrative insights-note frontmatter | `study-insights/references/narrative-format.md` | `schemas/insights.schema.json` | landed (v1.1) |
| `groups.yml` (course groups) | `second-brain/references/vault-conventions.md` | `schemas/groups.schema.json` | landed (v1.5) |
| `CONTRIBUTORS.yml` (pack attribution) | `content/community/README.md` | `schemas/contributors.schema.json` | landed (v1.5) |

Cross-cutting rules that will hold for every schema:

- Every manifest and lesson carries `schema_version`; breaking changes get a note in
  [migrations.md](migrations.md).
- Consumers tolerate stale versions and missing optional fields (permissive rendering) - a
  partial curriculum never breaks the app or a session.
