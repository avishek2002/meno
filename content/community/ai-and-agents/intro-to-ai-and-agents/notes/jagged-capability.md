---
schema_version: 1
type: reference
title: The jagged capability profile
concepts:
  - jagged-capabilities
sources:
  - title: "Embers of Autoregression (McCoy et al.)"
    url: https://arxiv.org/abs/2309.13638
    archived_url: https://web.archive.org/web/20260711050822/https://arxiv.org/abs/2309.13638
    accessed: 2026-08-05
    source_type: web
    why: shows accuracy tracking task, input, and output probability in training data, including the 51 percent vs 13 percent cipher result this note quotes
  - title: "Ethan Mollick: Centaurs and Cyborgs on the Jagged Frontier"
    url: https://www.oneusefulthing.org/p/centaurs-and-cyborgs-on-the-jagged
    archived_url: https://web.archive.org/web/20260805094318/https://www.oneusefulthing.org/p/centaurs-and-cyborgs-on-the-jagged
    accessed: 2026-08-05
    source_type: web
    why: co-author's account of the 758-consultant field experiment behind the jagged frontier term, with the inside-vs-outside frontier numbers this note cites
---

# The jagged capability profile

A large language model's (LLM's) competence is not a smooth surface. It is jagged: the
model can be excellent at one task and fail at a superficially similar one, and nothing
about the first success predicts the second failure. Two lines of evidence pin this
down.

**The mechanism.** [McCoy et al.](https://arxiv.org/abs/2309.13638) argue that because
an LLM is shaped by next-token prediction, its accuracy tracks the probability of the
task, the input, and the required output in its training distribution - even on
deterministic problems where probability should be irrelevant. Their sharpest example:
GPT-4 decodes a simple cipher with 51 percent accuracy when the answer is a
high-probability word sequence, but only 13 percent when the answer is low-probability.
Same task, same algorithm, wildly different reliability - the difference is how common
the output looks.

**The human consequence.** A field experiment with 758 consultants (reported by
co-author [Ethan Mollick](https://www.oneusefulthing.org/p/centaurs-and-cyborgs-on-the-jagged))
found that for tasks inside the model's capability frontier, consultants using AI
completed 12.2 percent more tasks, 25.1 percent faster, at 40 percent higher measured
quality. On a task deliberately designed to sit outside the frontier, AI users scored
markedly worse than the control group (roughly 60-70 percent correct versus 84 percent
without AI): people trusted the model across a boundary they could not see. The study's
name for the boundary - the jagged frontier - is the standard term.

The operational rule that follows: capability claims are per-task, empirical, and
perishable. Test the model on your actual task before relying on it, keep verifying on
tasks near the frontier, and never infer "it can do X, so surely it can do the slightly
harder Y." The frontier does not move smoothly, and adjacent-looking tasks can sit on
opposite sides of it.
