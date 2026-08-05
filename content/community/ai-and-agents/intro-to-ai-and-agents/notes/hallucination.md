---
schema_version: 1
type: reference
title: Hallucination
concepts:
  - hallucination
sources:
  - title: "A Survey on Hallucination in Large Language Models (Huang et al.)"
    url: https://arxiv.org/abs/2311.05232
    archived_url: https://web.archive.org/web/20260805093131/https://arxiv.org/abs/2311.05232
    accessed: 2026-08-05
    source_type: web
    why: defines hallucination as plausible yet nonfactual content and surveys its causes, detection benchmarks, and mitigation families, the framing this note follows
  - title: "Anthropic docs: Reduce hallucinations"
    url: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
    archived_url: https://web.archive.org/web/20260805093817/https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations
    accessed: 2026-08-05
    source_type: web
    why: the concrete mitigation playbook this note lists - allowing uncertainty, grounding in quotes, citation verification, consistency checks
---

# Hallucination

Hallucination is a large language model (LLM) generating plausible yet nonfactual
content - text that is fluent, confident, and wrong, or inconsistent with the material it
was given ([Huang et al., survey](https://arxiv.org/abs/2311.05232)). The word matters
less than the mechanism: a model trained to produce likely text has no built-in
distinction between "likely because true" and "likely because it sounds like the training
data." Fluency is therefore not evidence of accuracy, and the failure appears even in
the most capable models
([Anthropic guide](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations)).

The research literature organizes the problem into contributing factors (in data,
training, and inference), detection methods and benchmarks, and mitigation families -
hallucination is a studied, structural property of the method, not an occasional glitch
individual vendors have simply failed to patch
([survey](https://arxiv.org/abs/2311.05232)).

Mitigations a caller controls, from the
[Anthropic guide](https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations):

- **Give explicit permission to say "I don't know."** Models pushed to always answer
  will answer; allowing uncertainty drastically reduces false information.
- **Ground answers in supplied documents.** For long-document tasks, have the model
  extract word-for-word quotes first and base its answer only on them.
- **Verify with citations.** Require each claim to cite a supporting quote or source;
  claims that cannot find support get retracted, making the output auditable.
- **Check consistency.** Chain-of-thought explanations expose faulty reasoning; running
  the same prompt several times and comparing outputs flags unstable claims.
- **Restrict to provided knowledge.** Instruct the model to use only the given documents
  rather than its general training knowledge when the task allows it.

None of these eliminate hallucination; they reduce its rate and make remaining errors
easier to catch. Critical facts still need validation outside the model.
