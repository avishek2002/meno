---
schema_version: 1
id: accuracy-fixture/01-http-basics/03-status-codes
title: Status codes and what they promise
module: 01-http-basics
type: lesson
objectives: [M1-1]
concepts: [status-codes, methods-and-safety]
prerequisites: []
estimated_minutes: 25
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "MDN: HTTP response status codes"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
    archived_url: https://web.archive.org/web/20260805000000/https://developer.mozilla.org/en-US/docs/Web/HTTP/Status
    accessed: 2026-08-05
    source_type: web
    why: catalogs the status-code classes and the specific redirect and error codes this lesson uses
  - title: "RFC 9110: HTTP Semantics"
    url: https://www.rfc-editor.org/rfc/rfc9110
    archived_url: https://web.archive.org/web/20260805000000/https://www.rfc-editor.org/rfc/rfc9110
    accessed: 2026-08-05
    source_type: web
    why: defines the status-code class semantics the lesson paraphrases
tags: []
---

# Status codes and what they promise

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** read a status code's first digit as a statement about who should act
next, and pick the right specific code for common outcomes.

## Before you start

Answer from memory, then check yourself.

1. What does the first line of an HTTP response carry?
   <details><summary>Check yourself</summary>
   The protocol version, the status code, and a reason phrase - the code is the part this
   lesson is about.
   </details>

## The idea

Status codes come in five classes, keyed on the first digit: 1xx informational, 2xx
success, 3xx redirection, 4xx client error, 5xx server error (MDN: HTTP response status
codes). The class is the load-bearing part - it tells the client which party should act
next: nobody (2xx), the client with a new request (3xx), the client with a fixed request
(4xx), or the server operator (5xx) (RFC 9110).

Within a class, the specific code sharpens the promise. A 301 redirect is permanent -
update your links - while 302 is temporary, so keep using the old URL next time (MDN: HTTP
response status codes). A 404 says nothing is at this target now; a 410 adds that it was
removed deliberately and the absence should be treated as final (MDN: HTTP response status
codes). The registry has its oddities, too.
Status code 418 was defined in the original HTTP/1.1 specification as a placeholder reserved for experimental servers.

## Worked example

A documentation site moves, and one exchange becomes three lines:

```http
GET /old-docs HTTP/1.1

HTTP/1.1 301 Moved Permanently
Location: /docs

GET /docs HTTP/1.1

HTTP/1.1 200 OK
```

The class (3xx) tells the client to act on `Location`; the specific code (301, not 302)
tells it how durable that redirect is - a well-behaved client updates its bookmark instead
of asking for `/old-docs` forever.

## Your turn

Your API answers `500 Internal Server Error` whenever a client sends malformed JSON
(JavaScript Object Notation). Which class should that response be in, and name a better
code.
<details><summary>Answer + why</summary>
4xx - the client must fix its request, and nothing is wrong on the server. `400 Bad
Request` is the standard choice. Answering 500 sends the operator hunting for a server bug
that does not exist.
</details>

> [!warning] Common wrong model
> "A 404 means the resource never existed." It only reports that nothing is there right
> now - no history and no promise about the future. Deliberate permanent removal has its
> own code, 410.

## Recall

```meno-check
id: redirect-301-cloze
type: cloze
concept: status-codes
prompt: |
  A 301 response tells the client the resource has moved {{temporarily}}.
answer: temporarily
explain: |
  301 keeps the old address alive, so clients should keep trying it first on later visits.
```

```meno-check
id: safe-methods-flashcard
type: flashcard
concept: methods-and-safety
prompt: Which HTTP methods does RFC 9110 define as safe?
answer: GET, HEAD, OPTIONS, and TRACE - safe methods are read-only by contract.
explain: |
  Safe means the client asked for no state change; a server may still log or count the
  request, but the client is not accountable for that.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A colleague's crawler treats every non-200 response as "site is broken" and gives up.
> Using two concrete codes from different classes, explain what information the crawler is
> throwing away and how it should react differently to each.
