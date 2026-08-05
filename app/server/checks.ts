// Deterministic grading - the canonical implementation. Grading happens only
// here, server-side; the client never sees an answer before submitting.
import type { CheckBlock } from '../../lib/lesson.ts';

export interface GradeResult {
  correct: boolean;
  answer: string;
  explain: string;
}

const normalize = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function gradeCheck(check: CheckBlock, response: string): GradeResult {
  const explain = String(check.explain ?? '').trim();
  switch (check.type) {
    case 'mcq': {
      const answerIndex = Number(check.answer);
      const options = check.options ?? [];
      return {
        correct: Number(response) === answerIndex,
        answer: options[answerIndex - 1] ?? String(check.answer),
        explain,
      };
    }
    case 'cloze': {
      const answer = String(check.answer ?? '');
      return { correct: normalize(response) === normalize(answer), answer, explain };
    }
    case 'flashcard': {
      // the learner self-reports after flipping; the report is the deterministic input
      return { correct: response === 'got-it', answer: String(check.answer ?? ''), explain };
    }
    default:
      throw Object.assign(new Error(`unknown check type "${check.type}"`), { status: 400 });
  }
}
