---
schema_version: 1
id: accuracy-fixture/01-http-basics/01-request-response
title: The request-response cycle
module: 01-http-basics
type: lesson
objectives: [M1-1]
concepts: [request-response]
prerequisites: []
estimated_minutes: 20
difficulty: intro
status: generated
generated_at: 2026-08-05
review_after: 2026-08-07
review_offsets: [2, 9, 30]
sources:
  - title: "MDN: An overview of HTTP"
    url: https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
    archived_url: https://web.archive.org/web/20260805000000/https://developer.mozilla.org/en-US/docs/Web/HTTP/Overview
    accessed: 2026-08-05
    source_type: web
    why: describes the request-response model, message structure, and statelessness this lesson teaches
tags: []
---

# The request-response cycle

> Heads-up: the recall questions here are supposed to feel effortful - that difficulty is
> the method working, not you failing.

**You'll be able to:** explain what travels in each direction during one HTTP (Hypertext
Transfer Protocol) exchange, and what the protocol itself does and does not remember.

## Before you start

Answer from memory, then check yourself.

1. When your browser loads a page, how many parties are talking, and who speaks first?
   <details><summary>Check yourself</summary>
   Two - the client and the server - and the client always speaks first. Servers only
   answer; they never open a conversation.
   </details>

## The idea

HTTP is a client-server protocol: the client sends a request - a method, a target, headers,
and sometimes a body - and the server answers with a response - a status code, headers, and
usually a body (MDN (Mozilla Developer Network): An overview of HTTP). One request, one
response, in that order, every time.

The protocol is also stateless: each request is handled independently of the ones before
it, and any continuity - logins, shopping carts - is layered on top with cookies and
sessions rather than built into the protocol itself (MDN: An overview of HTTP).

## Worked example

One complete exchange, as text on the wire:

```http
GET /greeting HTTP/1.1
Host: example.com
Accept: text/plain
```

```http
HTTP/1.1 200 OK
Content-Type: text/plain
Content-Length: 5

hello
```

The request line names the method (`GET`), the target (`/greeting`), and the protocol
version; the status line answers with the version, a code (`200`), and a reason phrase.
Headers on both sides are plain `Name: value` metadata, and a blank line separates them
from the body.

## Your turn

Sketch, on paper or in your head, the request a browser sends when you submit a login form
to `/login`, and the shape of the response you would expect back.
<details><summary>Answer + why</summary>
A `POST /login HTTP/1.1` request whose body carries the form fields, and a response such as
`200 OK` (or a redirect) whose headers may set a cookie - which is exactly how state gets
layered onto a stateless protocol.
</details>

> [!warning] Common wrong model
> "The server remembers our conversation." It does not - the protocol hands it one
> self-contained request at a time. If the tenth request behaves differently from the
> first, something outside HTTP (a cookie, a session store) is doing the remembering.

## Recall

```meno-check
id: stateless-protocol-cloze
type: cloze
concept: request-response
prompt: |
  HTTP is a {{stateless}} protocol: each request must carry everything the server needs to
  handle it.
answer: stateless
explain: |
  The server treats each request independently; continuity comes from data the client
  re-sends (cookies, tokens), not from the protocol.
```

```meno-check
id: request-line-flashcard
type: flashcard
concept: request-response
prompt: What three things does the first line of an HTTP request carry?
answer: The method, the request target, and the protocol version.
explain: |
  Everything else about the request follows in order - header metadata, a blank line, then
  the optional body.
```

## Apply it somewhere new

> [!question] Transfer (graded in your next review session)
> A monitoring dashboard polls an internal service every two seconds, and its author
> complains that HTTP "keeps forgetting" it already authenticated. Explain what
> statelessness does and does not promise, and where the authentication actually has to
> live.
