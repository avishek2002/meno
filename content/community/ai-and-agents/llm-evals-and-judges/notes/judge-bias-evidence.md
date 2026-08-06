---
schema_version: 1
type: reference
title: Judge biases - the documented evidence
concepts:
  - position-bias
  - verbosity-and-self-preference
  - judge-pinning
sources:
  - title: "Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena (Zheng et al., arXiv 2306.05685)"
    url: https://arxiv.org/abs/2306.05685
    archived_url: https://web.archive.org/web/20260802072036/https://arxiv.org/abs/2306.05685
    accessed: 2026-08-05
    source_type: web
    why: source for the named judge biases (position, verbosity, self-enhancement), the limited-reasoning caveat, and the over-80-percent judge-human agreement figure
  - title: "Large Language Models are not Fair Evaluators (Wang et al., arXiv 2305.17926)"
    url: https://arxiv.org/abs/2305.17926
    archived_url: https://web.archive.org/web/20260803170718/https://arxiv.org/abs/2305.17926
    accessed: 2026-08-05
    source_type: web
    why: source for the order-hacking result (a weaker model beating a stronger one on 66 of 80 queries by reordering) and the calibration mitigations
  - title: "Define success criteria and build evaluations (Anthropic documentation)"
    url: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    archived_url: https://web.archive.org/web/20260805034126/https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    accessed: 2026-08-05
    source_type: web
    why: source for the vendor practice of grading with a different model than the one that generated the evaluated output
---

# Judge biases - the documented evidence

## Using a model as the judge works - conditionally

Using a strong large language model (LLM) as the judge of another model's output is
attractive because it scales where human grading cannot, and the foundational study
says it can work:
[Zheng et al. (arXiv 2306.05685)](https://arxiv.org/abs/2306.05685), the paper behind
MT-Bench (a multi-turn question set) and Chatbot Arena (a crowdsourced battle
platform), found that strong judges like GPT-4 match both controlled and crowdsourced
human preferences with over 80 percent agreement - the same level of agreement humans
reach with each other. The same paper is equally clear that the judge is a measuring
instrument with documented defects.

## The documented biases

Zheng et al. name the failure modes directly. Position bias: the judge favors an
answer because of where it appears in the comparison, not what it says. Verbosity
bias: longer answers are favored beyond their content. Self-enhancement bias: a judge
tends to prefer output that its own model family produced. And beyond the biases, a
capability caveat: judges show limited ability when grading answers that require
reasoning or math, where the judge can be confidently wrong alongside the answer it
grades.

[Wang et al. (arXiv 2305.17926)](https://arxiv.org/abs/2305.17926) show position bias
is not a rounding error but an attack surface: the quality ranking of candidate
responses can be hacked simply by changing their order of appearance. In their
experiments a 13-billion-parameter model was judged the winner over a stronger
model on 66 of 80 queries after order manipulation alone.

## Containment

Both papers, and vendor guidance, converge on the same containment discipline. Wang
et al. propose calibration: require the judge to produce its evidence before its
verdict, aggregate verdicts across both answer orders (balanced position
calibration), and route high-disagreement cases to a human. Anthropic's
[evaluation documentation](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
adds the practice of grading with a different model than the one that generated the
output - which addresses self-enhancement bias directly. The practical consequence
for anyone wiring a judge into a suite: the rubric must be fixed in writing (so the
criterion cannot drift run to run), the judge model and version must be pinned (a
changed judge is a changed instrument, and its scores are not comparable with the
old one's), and comparisons must be run in both orders. A judged score without a
recorded rubric and judge version is not a measurement; it is an anecdote with
decimals.
