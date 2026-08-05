# How Meno works

This is the user guide. It walks the whole journey, from cloning the repo to restoring your
content on a new machine. For the system's internals, see the specs in [specs/](specs/); for
the build plan and decision record, see [PLAN.md](../PLAN.md).

## The idea in one paragraph

Meno is a learning system that lives entirely in this git repository. Your coding agent
(Claude Code, or any capable agent CLI) interviews you to pin down what you actually need to
learn, generates a cited curriculum sized to your goal and time budget, and tutors you through
it with spaced reviews and mastery gates. A local web app renders the course on your machine;
an append-only progress ledger keeps the picture honest. There is no server, no account, no
database - files are the only source of truth, and the files are yours.

## What you need

- A git clone of this repository (clone, do not fork - a public fork can never be made
  private, and your learning content deserves privacy; see
  [Owning your content](#owning-your-content)).
- An agent CLI. Claude Code is first-class; any agent that can read files and follow
  instructions works, because every skill is plain markdown readable without special support.
- Node.js 20 or newer, for the local study app.

## The journey

### 1. Tell your agent what you want to learn

Open your agent in the repo and say what you are curious about, in whatever words you have.
The agent reads [AGENTS.md](../AGENTS.md), finds the `elicit-needs` skill, and starts the
interview.

### 2. The interview

A novice cannot spec their own curriculum - that is Meno's founding problem. So the interview
never asks you open questions. It asks 5 to 7 closed questions with anchored options (goal,
prior knowledge, depth, weekly time), runs one small live probe to check your actual starting
level rather than trusting self-report, and pushes back if your ambitions and your calendar
disagree. It ends with a confirmation brief you approve explicitly. The result is a learning
contract: `content/<you>/<course>/profile.md`.

### 3. The curriculum skeleton

From the confirmed profile the agent builds the course structure: objectives fixed before
content (backward design), modules sized to your time budget, and 2 to 4 anchor sources per
module that the agent actually fetched and verified this session - never citations from
memory. Every source is archived to the Wayback Machine at generation time so links cannot
rot silently. You get a visual dependency map of the modules, and module 1's lessons are
written immediately so you can start studying in the same sitting. Later modules are written
one step ahead of you, during review sessions, so the course can adapt to how you are
actually doing.

### 4. Daily study on the local app

One command in `app/` starts the study surface: a local web app that reads your content
directly from disk. It shows the course map, the lessons with their references, your progress,
and which reviews are due. Lessons carry interactive recognition checks (multiple choice,
cloze, flashcards) that the app grades on the spot and records to your ledger. Harder
transfer-level prompts are shown but deliberately not graded by the app - those belong to
your agent, in review sessions.

### 5. Review sessions with the agent

Every few days, ask your agent for a review session. It reads your ledger, computes which
concepts are due, and quizzes you Socratically - it will not hand you answers, because
retrieving them yourself is what makes memory stick. It grades your transfer-level answers,
appends the results to the ledger, and writes the next module before it closes.

### 6. Mastery gates

The next module unlocks at roughly 80 percent on transfer-level items, graded by the agent.
If you are below the bar, the agent offers remediation instead. You can override a gate -
your call, always - but the override is logged, and the concepts you skipped are re-injected
into future reviews rather than quietly forgotten.

### 7. Your second brain

`content/<you>/` is itself an Obsidian vault. Open it in Obsidian and every lesson, hub note,
and concept is connected by wikilinks; the graph view shows your knowledge as a network, not
a syllabus. The agent maintains the hub notes and keeps the graph connected. You can write
your own notes alongside - anything outside the marked derived regions is yours and is never
overwritten.

### 8. Todos

`content/<you>/todos.md` is a shared queue between you, the app, and the agent - plain
markdown checkboxes. Jot "go deeper on X" there from the app or Obsidian; the agent scans it
at session start and proposes acting on what it finds. It proposes - it never acts on a todo
without your confirmation.

### 9. Backing up: the private mirror

Your content directory is gitignored - it can never be committed to this public repository.
To survive a lost laptop, Meno ships mirror tooling that backs `content/<you>/` up to a
private repository of your own and restores it on a fresh machine. Until you set that up,
your content exists only on your machine - set it up early.

## What leaves your machine

Meno itself sends nothing anywhere. But your agent's model provider processes what the agent
reads and writes - that is true of any agent workflow, and it includes your interview answers
and generated lessons. If that matters for your subject matter, read your provider's data
policy before starting.

## Owning your content

The Meno base - skills, schemas, app, docs - is MIT licensed. Everything generated for you
under `content/` belongs to you, full stop. It is gitignored so it cannot leak into the
public repo, it is backed up only to a private mirror you own, and no part of the base system
ever reads another tenant's content.

## Extending your instance

Want a hand-made course, a custom skill, or different behavior? See
[extending-meno.md](extending-meno.md). Improvements useful to everyone belong upstream - see
[CONTRIBUTING.md](../CONTRIBUTING.md).
