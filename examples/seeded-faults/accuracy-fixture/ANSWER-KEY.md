---
schema_version: 1
plants:
  - lesson: modules/01-http-basics/02-methods-and-safety.md
    type: uncited-claim
    quote: "The safe-method distinction was first formalized in RFC 3990, the 2004 revision of the HTTP/1.1 specification."
  - lesson: modules/01-http-basics/02-methods-and-safety.md
    type: uncited-claim
    quote: "Servers are required to reject any GET request that arrives with a body."
  - lesson: modules/01-http-basics/03-status-codes.md
    type: uncited-claim
    quote: "Status code 418 was defined in the original HTTP/1.1 specification as a placeholder reserved for experimental servers."
  - lesson: modules/01-http-basics/04-headers-and-caching.md
    type: uncited-claim
    quote: "Browsers cap every response at 64 header fields and silently drop anything beyond that limit."
  - lesson: modules/01-http-basics/02-methods-and-safety.md
    type: wrong-key
    check_id: idempotent-method-mcq
    marked: "1"
    correct: "2"
  - lesson: modules/01-http-basics/03-status-codes.md
    type: wrong-key
    check_id: redirect-301-cloze
    marked: "temporarily"
    correct: "permanently"
  - lesson: modules/01-http-basics/04-headers-and-caching.md
    type: wrong-key
    check_id: freshness-header-mcq
    marked: "2"
    correct: "1"
controls:
  - modules/01-http-basics/01-request-response.md
---

# Answer key (for scoring accuracy drills only - auditors must not read this)

Every planted fault in this fixture, machine-readable in the frontmatter above and
explained here. The frontmatter is the scoring contract for the auditor drill in
`tools/eval.ts`: `plants` lists what a competent self-audit must catch, `controls` lists
the lessons it must leave alone. **An agent running the self-audit against this tree must
not read this file**; eval harnesses enforce that by instruction, the same way the sibling
fixtures' answer keys do.

## The uncited-claim plants

Each is a confident factual assertion with no citation, false on its face to anyone who
checks:

- **The invented RFC** (`02-methods-and-safety.md`, The idea). There is no 2004 revision
  of HTTP/1.1 and RFC (Request for Comments) 3990 is not an HTTP document. HTTP/1.1 was
  RFC 2616 (1999), revised as RFC 7230-7235 (2014) and again as RFC 9110-9112 (2022);
  safe methods are defined in those specifications themselves.
- **The GET-body rejection rule** (`02-methods-and-safety.md`, The idea). RFC 9110 says
  content on a GET request has no generally defined semantics and that a server *may*
  reject it - nothing requires rejection. The planted sentence turns an implementation
  choice into a protocol mandate, directly after prose that says the opposite.
- **The 418 origin story** (`03-status-codes.md`, The idea). Status code 418 ("I'm a
  teapot") comes from RFC 2324, the Hyper Text Coffee Pot Control Protocol - an April
  1998 joke document - not from the HTTP/1.1 specification, and it was never a
  placeholder for experimental servers.
- **The 64-header cap** (`04-headers-and-caching.md`, The idea). Invented. No HTTP
  specification and no mainstream browser imposes a fixed 64-field limit with silent
  dropping; real-world limits are implementation-specific size limits, not a field-count
  rule.

## The wrong-key plants

Each check is well-formed and validate-clean; the marked-correct answer is simply wrong.
An independent re-solve must disagree:

- **`idempotent-method-mcq`** (`02-methods-and-safety.md`). Marked answer 1 (POST);
  correct answer 2 (DELETE). RFC 9110 defines DELETE as idempotent and POST as neither
  safe nor idempotent - the lesson's own prose and worked example say so. The `explain`
  text about servers deduplicating POST bodies is part of the plant.
- **`redirect-301-cloze`** (`03-status-codes.md`). Marked fill "temporarily"; correct
  fill "permanently". 301 is Moved Permanently; a temporary move is 302 (or 307). Again
  the lesson's own prose states the correct fact.
- **`freshness-header-mcq`** (`04-headers-and-caching.md`). Marked answer 2 (ETag);
  correct answer 1 (`Cache-Control: max-age`). ETag is a validator used for
  revalidation; max-age is the freshness lifetime. The `explain` text inverts the two on
  purpose.

## The control

`01-request-response.md` is fully clean: every factual claim is either cited to the
lesson's source record or is level-appropriate common knowledge, and both check keys are
correct. A drill that flags anything in it is scoring a false positive.

## Scoring

A drill passes when the auditor catches every row in `plants` - flagging each uncited
claim as unsupported or false, and each wrong key with a disagreeing re-solve - and
reports nothing in the control lesson. The three wrong-key checks sit next to prose
stating the correct facts, so a catch requires only reading the lesson honestly, not
outside research.

This fixture is permanent: do not "fix" its plants, and do not cite it as real HTTP
teaching material - its source records are fabricated-but-plausible and were never
fetched. It is a drill target, never studied.
