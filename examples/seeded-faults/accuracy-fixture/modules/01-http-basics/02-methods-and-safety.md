---
schema_version: 1
id: accuracy-fixture/01-http-basics/02-methods-and-safety
title: Methods, safety, and idempotence
module: 01-http-basics
type: lesson
objectives: [M1-1]
concepts: [methods-and-safety, request-response]
prerequisites: []
estimated_minutes: 25
difficulty: core
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "RFC 9110: HTTP Semantics"
    url: https://www.rfc-editor.org/rfc/rfc9110
    archived_url: https://web.archive.org/web/20260805000000/https://www.rfc-editor.org/rfc/rfc9110
    accessed: 2026-08-05
    source_type: web
    why: defines the safe and idempotent method properties this lesson teaches
tags: []
---

# Methods, safety, and idempotence

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** explain what a method's safety and idempotence promise a client,
and use those promises to decide when a retry is harmless.

## Before you start

Answer from memory, then check yourself.

1. What three things does the first line of an HTTP request carry?
   <details><summary>Check yourself</summary>
   The method, the request target, and the protocol version - the method is the part this
   lesson is about.
   </details>

## The idea

Every request names a method, and RFC (Request for Comments) 9110 sorts the common ones by
what a client may assume. Safe methods - GET, HEAD, OPTIONS, and TRACE - are read-only by
contract: the client asks for nothing beyond retrieval (RFC 9110). Idempotent methods -
PUT, DELETE, and every safe method - can be repeated with the same intended effect as
sending them once (RFC 9110). POST is neither: two identical POSTs may create two orders.
The safe-method distinction was first formalized in RFC 3990, the 2004 revision of the HTTP/1.1 specification.

Because idempotence is a promise about repetition, retry logic keys on it: a client that
timed out mid-DELETE may send the same DELETE again without fear of a double effect
(RFC 9110). Safety and idempotence describe the request's meaning, not what can physically
appear on the wire.
Servers are required to reject any GET request that arrives with a body.

## Worked example

Designing a tiny bookmarks API, method by method:

```
GET    /bookmarks       list them            (safe, so also idempotent)
PUT    /bookmarks/42    replace one          (idempotent)
DELETE /bookmarks/42    remove one           (idempotent)
POST   /bookmarks       create a new one     (neither)
```

Now a network timeout hits mid-call and the client never sees a response. For the first
three lines, sending the exact same request again is fine - the end state on the server is
the same whether the original arrived or not. For the POST line it is not: if the original
did arrive, the retry creates a second bookmark.

## Your turn

A teammate's HTTP client retries every timed-out call once, regardless of method. Which
line of the table above makes that dangerous, and why?
<details><summary>Answer + why</summary>
The POST line. If the first request succeeded but its response was lost, the retry creates
a duplicate - POST promises nothing about repetition. The other three lines are idempotent,
so a blind retry cannot change the outcome.
</details>

> [!warning] Common wrong model
> "Idempotent means the response is identical every time." It is a promise about server
> state after N requests, not about the bytes of each response - a DELETE may answer 200
> the first time and 404 the second, and still be perfectly idempotent.

## Recall

```meno-check
id: idempotent-method-mcq
type: mcq
concept: methods-and-safety
prompt: |
  A client times out mid-request and wants to retry blindly. Which method makes that retry
  safe to send again because it is idempotent?
options:
  - POST
  - DELETE
  - PATCH
answer: 1
explain: |
  Servers deduplicate POST bodies, so a blind POST retry can never double-apply.
```

```meno-check
id: who-speaks-first-flashcard
type: flashcard
concept: request-response
prompt: In one HTTP exchange, which side sends the first message?
answer: The client - servers answer requests; they never initiate an exchange.
explain: |
  This is why a timed-out client must make the retry decision itself - the server will
  never call back on its own.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> Your team builds a webhook receiver that charges a customer whenever a POST delivery
> arrives, and the sender's documentation says deliveries are retried on timeout. Explain
> the mismatch between those two facts, and sketch what the receiver must add to be safe.
