# Check formats (canonical)

The two levels of checks and their exact on-disk formats ("level" matches PLAN.md decision 14 and the ledger's `level` field). The split implements decision 14: the app grades what a machine can grade deterministically; only agent-graded transfer work moves mastery gates.

## Recognition level (app-graded)

Fenced code blocks with the `meno-check` language tag and a YAML payload. The app parses and renders them interactively and appends `source: ui` ledger events; Obsidian and GitHub show them as code blocks, which is the accepted degraded view; an agent reads the YAML directly.

````markdown
```meno-check
type: mcq                # mcq | cloze | flashcard
concept: ownership       # ties the result to a concept for review scheduling
prompt: |
  `let s2 = s1;` where s1 is a String. What happens to s1?
options:                 # mcq only, 3-5 options, one correct
  - It is copied; both are valid
  - It is moved; s1 is no longer valid
  - It is borrowed until s2 drops
answer: 2                # 1-based index (mcq) | exact string (cloze) | back text (flashcard)
explain: |
  String owns heap data; assignment moves ownership rather than copying it.
```
````

Cloze uses `prompt` with `{{...}}` for the gap and `answer` as the exact fill. Flashcard uses `prompt` as the front, `answer` as the back. `explain` is required on every check - feedback is what makes retrieval practice work.

Authoring rules:

- Produce-the-answer beats recognize-the-answer: prefer cloze and flashcard over mcq; when mcq, make distractors real misconceptions, not filler.
- `concept` must match a `concepts` entry from a lesson in this course - review scheduling keys on it.
- Interleave: once two or more concepts are taught in the module, a lesson's Recall section mixes them.

## Transfer level (agent-graded)

Obsidian-native callouts, rendered by the app as a styled prompt with no input widget:

```markdown
> [!question] Transfer (graded in your next review session)
> Your team inherits a service that clones every String it passes between
> functions "to be safe". Explain the cost, and sketch the ownership-based fix.
```

Rules:

- The callout title always contains the word "Transfer" - the app and the tutor detect the level by it.
- The task must place the concept in a context the lessons never used (that displacement is what makes it transfer, and what makes it gate-worthy).
- No answer reveal in the file: grading and feedback happen in the tutor session, where mastery-gate events (source: agent, transfer level) are written.

## Why two formats instead of one

A machine can grade "which option" and "fill the gap" honestly; it cannot honestly grade "explain and sketch the fix". Collapsing the levels either dumbs gates down to recognition (illusion of mastery - the failure mode the research flagged) or pretends deterministic grading of judgment. The seam is the design.
