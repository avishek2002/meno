# Acme backend style guide (excerpt): error handling

Internal excerpt, checkout team, Acme Corp. Wrap every external call in a typed result; never
let a bare `except`/`catch` swallow a payment-gateway error silently. Anything that can fail at
a service boundary gets logged and surfaced to the on-call rotation, not caught and dropped.

On-call owner for this section: Alex Kim (alex.kim@acme-corp.example.com).
