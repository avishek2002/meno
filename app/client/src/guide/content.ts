// The in-app guidebook's copy, as data so the page renders it uniformly.
//
// Scope rule, and the reason this file is short: this guidebook explains THE
// APP - what each screen does, what the controls mean, and what the app
// deliberately cannot do. The whole learner journey (setup, mirrors,
// multi-device study, the community tier, privacy) is owned by
// docs/how-meno-works.md, and duplicating it here would give the same system
// two descriptions that drift apart. Link out instead.

export interface GuideSection {
  id: string;
  title: string;
  paras: string[];
  list?: { label: string; body: string }[];
}

export const GUIDE_URL = 'https://github.com/avishek2002/meno/blob/main/docs/how-meno-works.md';

export const GUIDE: GuideSection[] = [
  {
    id: 'what-this-is',
    title: 'What this app is',
    paras: [
      'This is the study surface for content that already lives on your disk. It reads the markdown in your vault, renders it, grades the quick checks inside lessons, and keeps track of what is due. There is no account, no database, and no server beyond the one running on your own machine.',
      'It is one of three ways to look at the same files. Your agent writes and tutors, Obsidian shows the graph and takes your notes, and this app is the daily reading and tracking view. Nothing here is a copy: edit a lesson in Obsidian and this app shows the edit after a re-read.',
    ],
  },
  {
    id: 'the-loop',
    title: 'The loop',
    paras: ['Studying with Meno is four repeating steps, and only two of them happen in this app.'],
    list: [
      { label: '1. Read a lesson', body: 'Open a course, then a lesson. Sources are listed alongside so you can check any claim against what it was written from.' },
      { label: '2. Answer the recognition checks', body: 'Multiple choice, cloze, and flashcards, graded here and recorded as you go. They are the warm-up, not the exam.' },
      { label: '3. Ask your agent for a review session', body: 'Every few days, in your terminal. The agent quizzes you Socratically on what is due, grades your transfer answers, and writes the next module before it closes.' },
      { label: '4. Clear the mastery gate', body: 'Roughly 80 percent on agent-graded transfer items unlocks the next module. Below that, the agent offers remediation instead.' },
    ],
  },
  {
    id: 'screens',
    title: 'What each screen does',
    paras: [],
    list: [
      { label: 'Courses', body: 'Every course in your vault, with how far through you are, grouped by the domain it sits under or by groups of your own. Fold a section away with its heading, or type in the filter to narrow the list to matching titles and slugs. Your groups live in groups.yml in your vault - ask your agent to change them, or edit the file directly.' },
      { label: 'A course', body: 'The module map, the dependency graph between modules, and the lessons inside each one. Modules with no lessons yet show as planned - your agent writes them one step ahead of you.' },
      { label: 'A lesson', body: 'The lesson body, its references, its recognition checks, and its transfer prompts. Dwelling on a lesson records that you read it.' },
      { label: 'Todos', body: 'The shared queue between you, this app, and your agent. Add, edit, complete, or park items.' },
      { label: 'Progress', body: 'Per-concept mastery, what is due for review, and a feed of recent activity. Every number derives from your ledger.' },
      { label: 'Insights', body: 'Study counts and rates in one neutral palette. For a written interpretation of them, ask your agent for an insights report.' },
      { label: 'Graph', body: 'Every note in your vault as one picture, joined to your progress: colour is the course group, hollow versus solid is planned/written/mastered, and size is incoming links. Thick lines are courses you said connect; thin lines are ordinary references and course structure. Pan, zoom, drag a node, or click one to open it - a "Show in graph" link on a course or lesson opens here centred on it.' },
    ],
  },
  {
    id: 'todo-tags',
    title: 'Todo tags: kind and audience',
    paras: [
      'Every todo carries two independent tags. Kind says what the work is, and routes it to the right skill if the agent ever acts on it. Audience says who can do it, and is the actual permission gate: the agent may propose a "for agent" todo, but never a "for me" one - proposing is still the ceiling either way, it always asks before acting.',
    ],
    list: [
      { label: 'Course', body: 'New learning content to generate - a course, module, or lesson.' },
      { label: 'Content fix', body: 'Existing content is wrong or stale - a bad claim, a dead citation.' },
      { label: 'Vault', body: 'Vault work - wikilinks, hub notes, orphans, adding files to sources/.' },
      { label: 'Feature', body: 'Add or change how this Meno instance works.' },
      { label: 'Bug', body: 'Something in this Meno instance is broken.' },
      { label: 'Study', body: 'Learning or practice work to do yourself.' },
      { label: 'Admin', body: 'A personal reminder.' },
      { label: 'For agent', body: 'The agent may propose doing it. Proposing is still the ceiling - it always asks before acting.' },
      { label: 'For me', body: 'Yours. The agent reads it for context and may remind you, but never acts on it.' },
    ],
  },
  {
    id: 'what-the-app-will-not-do',
    title: 'What this app deliberately will not do',
    paras: [
      'The app can record that you recognised something. It cannot grade a transfer answer, and it cannot unlock a module. That split is enforced in the code rather than by convention: no endpoint here accepts the fields that would mark evidence as agent-graded, and mastery gates key exclusively on agent-graded transfer evidence.',
      'The reason is that the gates are only worth anything if they are hard to fake. If clicking through multiple-choice questions could unlock modules, the progress picture would measure clicking. So the easy signal is recorded and shown, and the hard one is earned in conversation with your agent.',
    ],
  },
  {
    id: 'files-are-truth',
    title: 'Files are the truth',
    paras: [
      'Every screen is rebuilt by walking your content directory when you load it. There is no watcher and no cache, which is why there is a "Re-read files" button rather than a spinner that guesses. Press it after your agent generates something or after you edit a note elsewhere.',
      'You can edit anything in this vault by hand. Regions your agent regenerates are marked in the file, and everything outside those markers is yours and is preserved. If you break something structurally, npm run validate will tell you what and where.',
    ],
  },
];
