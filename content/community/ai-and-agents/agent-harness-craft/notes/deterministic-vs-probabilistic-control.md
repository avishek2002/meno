---
schema_version: 1
type: reference
title: Deterministic vs probabilistic control
concepts:
  - lifecycle-hooks
  - permission-rules
  - fail-closed-design
sources:
  - title: "Hooks reference (Claude Code docs)"
    url: https://code.claude.com/docs/en/hooks
    archived_url: https://web.archive.org/web/20260805093521/https://code.claude.com/docs/en/hooks
    accessed: 2026-08-05
    source_type: web
    why: specifies lifecycle events and the exit-code contract, including which exit codes block and which let the action proceed
  - title: "Configure permissions (Claude Code docs)"
    url: https://code.claude.com/docs/en/permissions
    archived_url: https://web.archive.org/web/20260804212553/https://code.claude.com/docs/en/permissions
    accessed: 2026-08-05
    source_type: web
    why: documents allow/ask/deny rule evaluation order, client-side enforcement, and managed settings no lower layer can override
  - title: "How Claude remembers your project (Claude Code docs)"
    url: https://code.claude.com/docs/en/memory
    archived_url: https://web.archive.org/web/20260803184145/https://code.claude.com/docs/en/memory
    accessed: 2026-08-05
    source_type: web
    why: states that instruction files are context the model tries to follow, not enforced configuration - the contrast this note is built on
---

# Deterministic vs probabilistic control

A harness offers two fundamentally different control surfaces, and confusing them is
the root of most guardrail failures.

**Instructions are probabilistic.** The Claude Code
[memory documentation](https://code.claude.com/docs/en/memory) is explicit that
instruction files are context, not enforced configuration: the model reads them and
tries to comply, but nothing guarantees compliance, especially for vague or
conflicting rules. An instruction is a request to a stochastic process. It shapes
behavior; it cannot bound it.

**Hooks and permission rules are deterministic.** They execute in the harness
itself, outside the model, so they apply regardless of what the model decides.

[Hooks](https://code.claude.com/docs/en/hooks) are shell commands registered
against lifecycle events - session start and end, each user prompt, each tool call
before and after, turn end. The exit-code contract is the load-bearing detail: exit
code 0 means success (with structured output optionally feeding decisions back to
the harness); exit code 2 is a blocking error that stops the gated action and feeds
the error text back to the model; any other exit code is a non-blocking error and
**the action proceeds anyway**. A hook script that crashes therefore fails open by
default. Designing fail-closed means the script exits 2 both when the check finds a
violation and when the check itself cannot run - an unreachable linter, a missing
dependency, a timeout must block, not wave through.

[Permission rules](https://code.claude.com/docs/en/permissions) gate what tools the
agent may use at all. Rules are evaluated deny first, then ask, then allow, and the
first match wins - specificity does not reorder them, so a broad deny cannot be
punched through by a narrower allow. Enforcement is by the harness client, not the
model: prompt text and instruction files change what the model attempts, never what
the harness permits. Organization-managed settings sit above user and project
settings, and a deny at any level cannot be overridden by a lower one.

The two deterministic layers compose: a blocking hook stops a tool call even when an
allow rule would have permitted it, and a deny rule still blocks even when a hook
approved. The documentation's own division of labor is the design rule worth
keeping: use permission rules for hard allow-or-deny boundaries, hooks for checks
that need to run code or inspect the specific call, and instructions only for
guidance where occasional non-compliance is acceptable.
