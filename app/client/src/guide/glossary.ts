// One owner for every explanation the UI gives about itself. Tooltips and the
// guidebook both read from here, so a term can never be explained two ways -
// the same single-owner rule the repo applies to canonical formats.
//
// Wording rule: say what the thing IS and, where it matters, what it is NOT.
// Most confusion in this app comes from the write-authority seam (the app
// records recognition evidence; only the agent grades transfer and moves
// gates), so the terms that touch it say so out loud.

export interface GlossaryEntry {
  /** Short label, used as the tooltip's accessible name. */
  term: string;
  /** One or two sentences. Plain text - no markup, no links. */
  body: string;
}

export const GLOSSARY = {
  reReadFiles: {
    term: 'Re-read files',
    body: 'Your files are the only source of truth and there is no watcher, so the app reads them when you ask it to. Press this after your agent generates a lesson or you edit a note in Obsidian.',
  },
  courseGroups: {
    term: 'Groups',
    body: 'Your courses are listed by the domain each one sits under, until you say otherwise. Groups of your own - Version Control, Software Fundamentals, whatever fits - win over the domain, and anything unfiled keeps falling back to it. A group is not a folder: filing a course or deleting a group never changes a single course file. Groups live in groups.yml in your vault; this app reads them and never writes them, so ask your agent or edit the file yourself.',
  },
  recognitionCheck: {
    term: 'Recognition check',
    body: 'A quick multiple-choice, cloze, or flashcard item the app grades on the spot and records as recognition evidence. It shows you can recognise the idea, which is a weaker claim than being able to use it.',
  },
  transferPrompt: {
    term: 'Transfer prompt',
    body: 'A harder question asking you to apply the idea somewhere new. The app deliberately does not grade it - transfer is graded by your agent in a review session, and only that evidence can move a mastery gate.',
  },
  masteryLevel: {
    term: 'Level',
    body: 'Introduced means the concept has appeared but you have no evidence yet. Practiced means recognition evidence only. Shaky means transfer has been graded but is under the bar, or a weakness is still open. Mastered means transfer at 80 percent or better with no open weakness.',
  },
  transferScore: {
    term: 'Transfer score',
    body: 'Your average on agent-graded transfer answers for this concept, the evidence mastery gates actually key on. A dash means no transfer answer has been graded yet - not a zero.',
  },
  recognitionRate: {
    term: 'Recognition rate',
    body: 'The share of recognition checks you got right, counted once per item. Useful as a warm-up signal; it never unlocks anything on its own.',
  },
  nextReview: {
    term: 'Next review',
    body: 'The date this concept comes back around, spaced so it lands about when you would otherwise start forgetting. Your agent sets it during review sessions; the app only displays it.',
  },
  dueForReview: {
    term: 'Due for review',
    body: 'Concepts whose next review date has arrived. Ask your agent for a review session - the app cannot run one, because grading and gates belong to the agent.',
  },
  masteryGate: {
    term: 'Mastery gate',
    body: 'The check between modules: roughly 80 percent on agent-graded transfer items unlocks the next one. You can always override a gate, but the override is logged and the concepts you skipped come back in later reviews.',
  },
  todosPark: {
    term: 'Park',
    body: 'Moves a todo out of the active list without completing or deleting it. Lines are never removed from todos.md - parking keeps the file honest about what you decided not to do.',
  },
  todosShared: {
    term: 'Shared queue',
    body: 'todos.md is one file shared by you, this app, and your agent. The agent reads it at session start and proposes acting on what it finds; it never acts without asking.',
  },
  todoKind: {
    term: 'Kind',
    body: 'What the work is - a new course, a content fix, vault upkeep, a feature, a bug, study, or admin. It routes the todo to the right skill, if any. See the guidebook for what each of the seven means.',
  },
  todoAudience: {
    term: 'Audience',
    body: 'Who can do it: "for agent" means the agent may propose doing it (still never without asking first); "for me" means it is yours, and the agent only reads it for context.',
  },
  insights: {
    term: 'Insights',
    body: 'Counts and rates computed straight from your ledger, shown in one neutral palette with no pass or fail colouring. For a written interpretation, ask your agent for an insights report.',
  },
  vaultNote: {
    term: 'Vault note',
    body: 'Your content is an Obsidian vault as well as an app - the same markdown files, connected by wikilinks. A muted link points at a note that does not exist yet, which is authoring intent rather than an error.',
  },
} as const satisfies Record<string, GlossaryEntry>;

export type GlossaryKey = keyof typeof GLOSSARY;
