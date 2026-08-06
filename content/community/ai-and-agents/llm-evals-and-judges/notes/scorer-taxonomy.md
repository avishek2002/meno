---
schema_version: 1
type: reference
title: The scorer taxonomy - from exact match to model judges
concepts:
  - deterministic-scorers
  - rubric-scoring
  - scorer-trust
sources:
  - title: "Define success criteria and build evaluations (Anthropic documentation)"
    url: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    archived_url: https://web.archive.org/web/20260805034126/https://platform.claude.com/docs/en/test-and-evaluate/develop-tests
    accessed: 2026-08-05
    source_type: web
    why: source for the graded ladder of methods - exact match, cosine similarity, ROUGE-L, and model-graded Likert, binary, and ordinal scales - and for grading with a different model than the one evaluated
  - title: "Assertions and metrics (promptfoo documentation)"
    url: https://www.promptfoo.dev/docs/configuration/expected-outputs/
    archived_url: https://web.archive.org/web/20260622160312/https://www.promptfoo.dev/docs/configuration/expected-outputs/
    accessed: 2026-08-05
    source_type: web
    why: source for a framework's deterministic-versus-model-assisted assertion split and for composing scorers with weights and thresholds
  - title: "Demystifying evals for AI agents (Anthropic engineering)"
    url: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    archived_url: https://web.archive.org/web/20260728233804/https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
    accessed: 2026-08-05
    source_type: web
    why: source for the three-way grader trade-off - code-based fast but brittle, model-based flexible but non-deterministic, human gold-standard but expensive - and for grading outcomes rather than steps
---

# The scorer taxonomy - from exact match to model judges

## Two families

Eval frameworks split scorers into two families. promptfoo's
[assertions reference](https://www.promptfoo.dev/docs/configuration/expected-outputs/)
draws the line explicitly: deterministic metrics are programmatic tests run directly
on the output - equals, contains, regex, is-json, or an arbitrary code hook - while
model-assisted metrics rely on a language model or another machine-learned model to
grade, as in llm-rubric, factuality, or semantic-similarity checks. The deterministic
family is cheap, fast, and gives the same verdict every run; the model-assisted
family can grade qualities no regex can reach, at the price of non-determinism.

## The ladder in practice

Anthropic's
[evaluation documentation](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
walks the same ground as a ladder of grading methods with worked code. Exact match
(normalized string comparison) fits categorical answers with clear-cut correctness,
like sentiment labels. Embedding cosine similarity checks consistency where
paraphrases should agree. ROUGE-L, a longest-common-subsequence overlap score, grades
summaries against references while allowing wording variation. When the quality being
judged is genuinely subjective - tone, empathy, context use - the documentation moves
to model-graded rubrics: a Likert scale for degree, a binary yes/no for compliance
boundaries, an ordinal scale with semantically defined levels. In every model-graded
variant the rubric is written into the grading prompt, and the guidance is to grade
with a different model than the one that produced the output.

## Trust and composition

Anthropic's
[agent-evals engineering guide](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
states the trade-off that should drive scorer choice: code-based graders are fast and
objective but brittle to valid variations in a correct answer; model-based graders
are flexible and nuanced but non-deterministic and in need of human calibration;
human grading is the gold standard and too expensive to run on every change. It also
warns against grading an agent's specific steps rather than its outcomes - rigid
path-checking penalizes valid alternative solutions. Frameworks compose scorers
rather than forcing one choice: promptfoo assigns each assertion a weight (default
1.0) and lets a test pass or fail on whether the combined weighted score clears a
threshold, so a suite can mix cheap deterministic checks with a few model-graded
rubrics where nothing else can see.
