---
schema_version: 1
type: reference
title: Why the pack bar is high
concepts:
  - pack-validation
  - citation-audit
  - sanitization-attestation
sources:
  - title: "content/community/README.md (the bar for landing a pack)"
    url: https://github.com/avishek2002/meno/blob/main/content/community/README.md
    archived_url: https://web.archive.org/web/20260805102347/https://github.com/avishek2002/meno/blob/main/content/community/README.md
    accessed: 2026-08-05
    source_type: web
    why: names the pack checks, the citation bar, and the security posture whose reasoning this note lays out
  - title: "generate-curriculum sourcing.md (fetch-before-cite)"
    url: https://github.com/avishek2002/meno/blob/main/.agents/skills/generate-curriculum/references/sourcing.md
    archived_url: https://web.archive.org/web/20260805102125/https://github.com/avishek2002/meno/blob/main/.agents/skills/generate-curriculum/references/sourcing.md
    accessed: 2026-08-05
    source_type: web
    why: the citation-integrity procedure that does not relax for packs - the discipline the audit exercise checks was actually followed
  - title: "publish-to-community sanitization.md (the sanitization catalog)"
    url: https://github.com/avishek2002/meno/blob/main/.agents/skills/publish-to-community/references/sanitization.md
    archived_url: https://web.archive.org/web/20260805102125/https://github.com/avishek2002/meno/blob/main/.agents/skills/publish-to-community/references/sanitization.md
    accessed: 2026-08-05
    source_type: web
    why: the canonical catalog of what never leaves a private tenant tree, including the leak class only a human reviewer can catch
---

# Why the pack bar is high

A pack is content that other people's agents will treat as ground truth and other
people's courses will be built on. That is a different risk profile from your own
notes, and every part of the pack gate maps to one slice of it.

The mechanical slice is the validate gate's pack checks - layout, notes, safety,
overlap - which exist because community content is, to every skill that reads it,
untrusted data: the safety check hunts scripts, credential-shaped strings, and
instruction-shaped text precisely because a pack can reach an agent's context. The
citation slice exists because a curriculum's value is its sources, and a source cited
from memory is a guess wearing a citation's clothes: every source record must have been
fetched in the session that cited it and archived, per the fetch-before-cite procedure
owned by
[sourcing.md](https://github.com/avishek2002/meno/blob/main/.agents/skills/generate-curriculum/references/sourcing.md) -
a bar that does not relax for packs, as
[content/community/README.md](https://github.com/avishek2002/meno/blob/main/content/community/README.md)
states. The privacy slice exists because packs published from a real tenant course can
carry fragments of a real person's life in the least expected fields; the catalog of
what must never leave a private tree is owned by
[sanitization.md](https://github.com/avishek2002/meno/blob/main/.agents/skills/publish-to-community/references/sanitization.md),
which is also honest about the one class no regex catches - a worked example quietly
drawn from someone's real work - and why a human reading the pull request is a required
gate rather than a formality. The attestations in the pull request template are how
that honesty is put on the record.

The exercise, run against the skeleton you drafted in the previous module: make its
gate green and its record honest. Run the repository's validate command and resolve
every finding that names your pack, attributing each to the check that raised it.
Then audit one of your own citations the adversarial way - fetch the live source
again, confirm it still supports the exact claim your note hangs on it, and confirm
the archived snapshot shows the same content. Finally, fill in the community-tier
attestation block as if the pull request were real, and note anything you would flag
for the human reviewer. If any step feels like theater, reread the failure it exists
to catch.
