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

## Setting up

### What you need

- **Node.js 24 or newer** (`node -v`). The server and every tool run TypeScript directly
  through Node's type stripping, so only the React client has a build step.
- **git.** Optionally the **GitHub CLI** (`gh`) - it is what lets `tools/meno-mirror`
  create a private backup repository for you and prove a remote really is private before
  pushing your vault to it. Without `gh` you can still mirror by hand.
- **An agent CLI.** Claude Code is first-class; any agent that can read files and follow
  instructions works, because every skill is plain markdown readable without native skill
  support.
- **Obsidian** (optional) if you want the graph view of your vault.

### Get the code

```
git clone https://github.com/avishek2002/meno
cd meno
```

Fork it as well if you plan to contribute changes back. Forking is safe and is the normal
pull-request path - it is not in tension with keeping your learning private, because
**your content never lives in a Meno clone's tracked files, forked or not.**

That is the mental model worth having from the start. You end up with two repositories,
nested but completely disjoint:

```
meno/                      the code. public, forkable, where pull requests come from.
  content/tenants/<you>/   gitignored by the repo above - invisible to it
    .git/                  YOUR private repository. content only. never contributed anywhere.
```

The inner one is created for you by `tools/meno-mirror` (step 9 below). It is what gives
you free multi-device sync **and** an ordinary open-source contribution flow at the same
time, with neither endangering the other - see
[Studying on more than one device](#studying-on-more-than-one-device).

The one move to avoid is un-ignoring `content/tenants/` because it looks like the easy way
to sync two machines. A fork of a public repository can never be made private, so content
committed there is published rather than stored; and any commit that reaches a pull request
stays reachable from the upstream repository permanently, even after the pull request is
closed or the branch deleted. The mirror gives you the same sync for free and cannot fail
that way.

### Run the setup

```
tools/meno-init [your-name]     # once; default tenant name is "main"
npm install && npm run build
npm start                       # http://127.0.0.1:7373
```

What each step actually does:

- **`tools/meno-init`** installs the leakage-guard pre-commit hook (into both hook
  locations, because git consults only one of them), creates your tenant directory at
  `content/tenants/<your-name>/`, reports which agent CLIs it can find, and points at the
  backup walkthrough. It is idempotent - rerun it any time.
- **`npm run build`** builds the React client once. You can skip it: the server will
  lazily mount Vite instead and tell you so. `npm run dev` gives you hot reload.
- **`npm start`** binds `127.0.0.1` only, reads your markdown straight off disk, and
  serves every tenant found under `content/tenants/` (`--root` and `--port` override
  both). No account, no daemon, no database.

### Check it worked

- `npm run gate` runs typecheck, the test suite, and validate. Green means your clone is
  sound before you have generated anything.
- The app loads at `http://127.0.0.1:7373` and is empty until your first course exists.
  That is correct, not a failure.
- Your tenant directory is invisible to git by design: after the interview writes files
  into `content/tenants/<you>/`, `git status` still reports a clean tree.

### If meno-init warns about core.hooksPath

Some setups point git's `core.hooksPath` at a personal global hooks directory, which
makes git ignore `.git/hooks` entirely - so the leakage guard would never run. `meno-init`
detects this and tells you. Fix it either by having your global hook chain to this
repository's `.githooks/pre-commit`, or by running:

```
git config --local core.hooksPath .githooks
```

The trade-off is stated plainly because it is real: a local `hooksPath` disables your
global hooks for this repository.

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
contract: `content/tenants/<you>/<domain>/<course>/profile.md`.

### 3. The curriculum skeleton

From the confirmed profile the agent builds the course structure: objectives fixed before
content (backward design), modules sized to your time budget, and 2 to 4 anchor sources per
module that the agent actually fetched and verified this session - never citations from
memory. Every source is archived to the Wayback Machine at generation time so links cannot
rot silently. You get a visual dependency map of the modules, and module 1's lessons are
written immediately so you can start studying in the same sitting. Later modules are written
one step ahead of you, during review sessions, so the course can adapt to how you are
actually doing.

Your courses are grouped in the app from the moment they exist, by the domain each one sits
under - the same domains the shared topic packs use. When that stops matching how you think
about your own learning, make your own groups: "Version Control", "Software Fundamentals",
whatever fits. Your group always wins over the domain, and anything you have not filed keeps
falling back to it, so there is no setup to do and nothing to maintain. A group is only ever a
label - moving a course between groups, or deleting a group entirely, never changes a single
course file. Groups live in one small file in your vault (`groups.yml`): ask your agent to make,
rename or delete one, or edit the file yourself in Obsidian. The app reads it and never writes
it, so nothing it does can ever surprise a hand edit.

### 4. Daily study on the local app

One command in `app/` starts the study surface: a local web app that reads your content
directly from disk. It shows your courses grouped - by your own groups where you have made
them, by domain everywhere else - plus the course map, the lessons with their references, your
progress, and which reviews are due. Sections fold away and a filter narrows the list to what you
type, matching course titles and slugs, so a long shelf stays one screen. Which sections you left
open is remembered by your browser and nowhere else - it is a view preference, not part of your
record. Lessons carry interactive recognition checks (multiple choice,
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

`content/tenants/<you>/` is itself an Obsidian vault. Open it in Obsidian and every lesson, hub note,
and concept is connected by wikilinks; the graph view shows your knowledge as a network, not
a syllabus. The agent maintains the hub notes and keeps the graph connected. You can write
your own notes alongside - anything outside the marked derived regions is yours and is never
overwritten.

### 8. Todos

`content/tenants/<you>/todos.md` is a shared queue between you, the app, and the agent - plain
markdown checkboxes. Jot "go deeper on X" there from the app or Obsidian; the agent scans it
at session start and proposes acting on what it finds. It proposes - it never acts on a todo
without your confirmation.

### 9. Backing up: the private mirror

Your content directory is gitignored - it can never be committed to this public
repository (and `tools/meno-init` installs a hook that blocks even a forced attempt).
To survive a lost laptop, back `content/tenants/<you>/` up to a private repository of your own:

```
tools/meno-init                      once, after cloning
tools/meno-mirror init <you>         creates a private mirror repo (via gh) and wires it
tools/meno-mirror push <you>         snapshot and push - run it after study sessions
tools/meno-mirror restore <url> <you>   on a fresh machine
```

The mirror refuses to push unless it can prove the remote is private. Until you set it
up, your content exists only on your machine - set it up early. No tooling handy? The
manual fallback is four commands: create a private repo by hand, then inside
`content/tenants/<you>/` run `git init`, `git remote add origin <url>`, and
`git add -A && git commit -m backup && git push -u origin main`.

## The commands you will actually use

| Command | When |
|---|---|
| `npm start` | every study session (the app) |
| ask your agent for a review session | every few days |
| `tools/meno-mirror push <you>` | after a session, so a lost laptop costs nothing |
| `tools/meno-mirror status <you>` | "did my last backup actually happen?" |
| `npm run insights` then ask your agent for an insights report | when you want to know how you are doing |
| `npm run cost -- content/tenants/<you> --write` | to see which courses cost the most to generate |
| `npm run gate` | after you change the instance yourself |

Everything else is your agent's job, driven by conversation rather than commands.

**`npm run cost` reads your whole coding-agent session history, not just this tenant.** It scans
every session transcript your coding agent has kept on this machine, across every project, to
find the ones that wrote into this tenant - nothing is uploaded, and only aggregate dollar
figures and counts ever get written to the snapshot, but the scan itself sees everything your
agent has kept. If that machine holds other clients' work or other private projects, that is the
trade-off: attribution needs the same evidence your agent already has, and there is nowhere else
to get it.

## Studying on more than one device

Meno has no sync service, no account, and no server - so syncing is something you set up,
not something that happens. Two workable approaches, and one combination to avoid.

### Option A: the private mirror as your sync (recommended)

Your mirror is an ordinary private git repository, so a second machine is a clone away.

Once, on the second machine:

```
git clone https://github.com/avishek2002/meno
cd meno
tools/meno-init <you>                            # creates an EMPTY tenant directory
tools/meno-mirror restore <mirror-url> <you>     # refuses if that directory is non-empty
npm install && npm run build
```

Then the daily discipline is: push before you leave a machine, pull when you arrive.

```
tools/meno-mirror push <you>                     # leaving
git -C content/tenants/<you> pull --rebase       # arriving
```

**The honest limitation:** `meno-mirror push` is a *backup* command, not a sync command.
It stages, commits, and pushes - it never pulls. If the other machine pushed since you
last pulled, your push fails as a non-fast-forward. The fix is the `pull --rebase` above,
then push again. Automating that pull is not in the tooling today.

**Resolving the one conflict that matters.** `progress/ledger.jsonl` is append-only, so
two machines studying independently both append at the end of the same file and git
reports a conflict there. Keep **both** sides' lines - order does not matter, every event
carries its own timestamp - then regenerate the derived file instead of merging it:

```
node tools/rebuild-mastery.ts content/tenants/<you>
```

Never hand-merge `mastery.yml`. It is derived from the ledger, and rebuilding it is
byte-identical by design; a hand-merged copy is the one way to make your mastery picture
disagree with your actual history.

### Option B: file sync (Obsidian Sync, iCloud Drive, Dropbox, Syncthing)

The thing Option A cannot give you is Obsidian on a phone or tablet. For that, sync
`content/tenants/<you>/` as a vault with a file-sync service. Three caveats, in order of
how much they should worry you:

- **Privacy posture.** Obsidian Sync is end-to-end encrypted. iCloud Drive, Dropbox, and
  Google Drive are not - your private vault sits on their servers in readable form. That
  is your call to make, but it is a genuine change to the local-first stance the rest of
  Meno holds.
- **File sync and a nested `.git` are a bad pair.** If you also mirror this directory,
  the mirror's `.git` lives inside it, and consumer sync services are well known for
  corrupting git repositories they copy mid-operation. Exclude `.git` from the sync, or
  do not run both in the same directory.
- **No consistent snapshots.** File sync copies a file whenever it changes, with no
  notion of a transaction. The app appends to `ledger.jsonl` while you study; a sync that
  copies mid-append can leave a truncated last line. The ledger parser skips unparseable
  lines with a warning rather than crashing, so nothing breaks - but that event is gone.

### Do not stack both on the same directory

Pick one. Two sync mechanisms writing the same files disagree eventually, and the
disagreement surfaces as a corrupted mirror or a silently lost ledger event rather than
as an error message.

### The rule that makes either option safe

Study on one device at a time, and finish the sync before you switch. Meno's state is
plain files with an append-only ledger, which recovers from almost anything - but only if
one writer is working on it at a time.

### Contributing to Meno from a machine that holds your content

These are separate repositories, so this needs no special care - which is the point. From
the same working copy you study in:

```
gh repo fork avishek2002/meno --remote-name fork    # once; or fork in the web UI
git switch -c feat/your-improvement
git push -u fork feat/your-improvement
gh pr create
```

Your vault cannot ride along on that pull request, and not because you were careful about
it. Three mechanisms fail closed: `content/tenants/` is gitignored as one absolute prefix
with no negation patterns, the leakage-guard hook is default-deny under `content/` so even
`git add -f` on a tenant file is refused at commit time, and your mirror's `.git` lives
inside the ignored path where the outer repository cannot see it at all.

So the two roles compose without conflict. Fork for the code; mirror for the content; they
never learn about each other. If you want to share a *course* rather than a code change,
that is a different path with its own sanitization gate - see
[Where your content lives](#where-your-content-lives-and-what-moves-between-machines).

## Where your content lives, and what moves between machines

Meno keeps learning material in three tiers, and knowing which is which explains
everything about what is private, what is shared, and what travels.

| Tier | Path | In git? | Who writes it |
|---|---|---|---|
| Base | skills, app, docs, schemas, tools | tracked, public | maintainers, via upstream pull requests |
| Community | `content/community/` | tracked, public | contributors, via pull requests only |
| Yours | `content/tenants/<you>/` | **gitignored** | your agent and the app, on your disk |

**Downstream (the repository to you).** Cloning or pulling brings the base plus every
community topic pack. A pack is a course *skeleton* - objectives, module decomposition,
prerequisite order, and verified anchor sources - and deliberately ships **no lesson
bodies**. When you adopt one, it is copied into your own tenant directory, you are
interviewed for the missing learning contract, and the lessons are written against
*your* profile. That is why adopting a pack does not hand you someone else's prose.

**Upstream (you to the repository) happens only when you ask for it.** Generating a
course writes to `content/tenants/<you>/` and nowhere else - a whole course leaves
`git status` clean. Nothing you generate is uploaded, published, or shared by any
automatic path. If you later decide a finished course is worth sharing, the
`publish-to-community` skill transcribes its *structure* onto a fresh pack tree, strips
everything tenant-only (your profile, your progress ledger, your todos, your own source
material), runs a quality gate, and opens a pull request that a human reviews. You say
yes twice - once to publish, once when it merges - and even then what leaves is the
skeleton, never your prose or your history.

Three mechanisms keep that boundary honest rather than merely intended: `content/tenants/`
is gitignored as one absolute prefix with no negation patterns; the leakage-guard hook is
default-deny under `content/`, so even `git add -f` on a tenant file is refused; and the
committed example learner lives under `examples/`, outside `content/` entirely, so no
ignore rule can ever hide it or leak a real tenant alongside it. The full picture is in
[specs/repo-and-tenancy.md](specs/repo-and-tenancy.md) and
[specs/community.md](specs/community.md).

## What leaves your machine

Meno itself sends nothing anywhere. But your agent's model provider processes what the agent
reads and writes - that is true of any agent workflow, and it includes your interview answers
and generated lessons. If that matters for your subject matter, read your provider's data
policy before starting.

## Owning your content

The Meno base - skills, schemas, app, docs - is MIT licensed. Everything generated for you
under `content/tenants/` belongs to you, full stop. It is gitignored so it cannot leak into the
public repo, it is backed up only to a private mirror you own, and no part of the base system
ever reads another tenant's content. None of that changes if you fork: a fork is a copy of
the code, and your content was never in the code.

## Using Meno in an organization

Everything above describes one learner's own clone. An organization that wants a shared,
curated knowledge base with roles and review - without a hosted platform, accounts, or a
database, none of which this project builds - can deploy Meno as a git-native pattern
instead: a private mirror-clone of this repository, a reserved `content/org/` knowledge base in
the same pack format `content/community/` already uses, and roles mapped honestly onto your host's
real permissions. See [org-deployment.md](org-deployment.md) for the full pattern, including
the one refusal that makes it trustworthy: an org deployment never sees an individual
learner's progress, and cannot be configured to.

## Extending your instance

Want a hand-made course, a custom skill, or different behavior? See
[extending-meno.md](extending-meno.md). Improvements useful to everyone belong upstream - see
[CONTRIBUTING.md](../CONTRIBUTING.md).
