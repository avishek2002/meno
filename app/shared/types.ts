// API payload types shared by the server and the client. The server constructs
// these; the client consumes them. Content formats stay owned by the skill
// references - these are transport shapes only.

export interface TenantInfo {
  id: string;
  courses: number;
}

export interface LessonEntry {
  file: string;
  title: string;
  concept: string;
  status: string;
}

export interface ModuleNode {
  slug: string;
  title: string;
  status: string;
  est_hours: number;
  serves: string[];
  prerequisites: string[];
  concepts: string[];
  lessons: LessonEntry[];
}

export interface CourseNode {
  slug: string;
  title: string;
  status: string;
  hub: string;
  objectives: { id: string; text: string; bloom: string; assessed_by?: string }[];
  modules: ModuleNode[];
}

export interface TreeResponse {
  tenant: string;
  courses: CourseNode[];
  warnings: string[];
}

// answer and explain are deliberately absent: grading is server-side and the
// answer returns only in the submit response.
export interface PublicCheck {
  id: string;
  type: 'mcq' | 'cloze' | 'flashcard';
  concept: string;
  prompt: string;
  options?: string[];
}

export interface LessonResponse {
  frontmatter: Record<string, unknown>;
  html: string;
  checks: PublicCheck[];
  transfers: { title: string }[];
  links: { resolved: Record<string, string>; broken: string[] };
  warnings: string[];
}

export interface NoteResponse {
  path: string;
  html: string;
  links: { resolved: Record<string, string>; broken: string[] };
}

export interface SubmitRequest {
  course: string;
  module: string;
  lesson: string; // lesson file slug without .md
  check_id: string;
  response: string;
}

export interface SubmitResponse {
  correct: boolean;
  answer: string;
  explain: string;
  event_ts: string;
}

export interface Todo {
  line: number; // 0-based index into the raw file
  text: string;
  type: 'gen' | 'repo' | 'note' | null;
  done: boolean;
  completedOn: string | null;
}

export interface TodosResponse {
  sections: { heading: string; todos: Todo[] }[];
  raw_sha256: string;
}

export interface DueConcept {
  course: string;
  concept: string;
  next_review: string;
}

export interface ProgressResponse {
  mastery: unknown; // lib/mastery.ts Mastery - derived live, never read from disk
  due: DueConcept[];
  recent: unknown[];
}

export interface HealthResponse {
  ok: boolean;
  version: number;
  root: string;
  node: string;
}
