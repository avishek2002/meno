// The interactive widget mounted into one `div.meno-check` per PublicCheck (see
// checkMounts.tsx). Answers are never known client-side before submit - even
// for flashcards, whose "answer" text arrives only in the submit response.
import { useState, type FormEvent } from 'react';
import type { PublicCheck, SubmitResponse } from '../../../shared/types.ts';

interface CheckWidgetProps {
  check: PublicCheck;
  onSubmit: (response: string) => Promise<SubmitResponse>;
}

export function CheckWidget({ check, onSubmit }: CheckWidgetProps) {
  const [result, setResult] = useState<SubmitResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mcqChoice, setMcqChoice] = useState('');
  const [clozeText, setClozeText] = useState('');
  const [flashRevealed, setFlashRevealed] = useState(false);

  const submit = async (response: string): Promise<void> => {
    setPending(true);
    setError(null);
    try {
      const res = await onSubmit(response);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPending(false);
    }
  };

  const onMcqSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (mcqChoice) void submit(mcqChoice);
  };

  const onClozeSubmit = (e: FormEvent): void => {
    e.preventDefault();
    if (clozeText.trim()) void submit(clozeText);
  };

  const verdictClass = result ? (result.correct ? ' check-correct' : ' check-incorrect') : '';

  return (
    <div className={`check-card check-${check.type}${verdictClass}`}>
      <p className="check-prompt" id={`meno-check-prompt-${check.id}`}>{check.prompt}</p>

      {check.type === 'mcq' && !result && (
        <form onSubmit={onMcqSubmit}>
          <div className="check-options">
            {(check.options ?? []).map((opt, i) => (
              <label key={i} className="check-option">
                <input
                  type="radio"
                  name={check.id}
                  value={String(i + 1)}
                  checked={mcqChoice === String(i + 1)}
                  onChange={() => setMcqChoice(String(i + 1))}
                  disabled={pending}
                />
                {opt}
              </label>
            ))}
          </div>
          <button type="submit" disabled={pending || !mcqChoice}>
            Submit
          </button>
        </form>
      )}

      {check.type === 'cloze' && !result && (
        <form onSubmit={onClozeSubmit}>
          <input
            type="text"
            className="check-cloze-input"
            value={clozeText}
            onChange={(e) => setClozeText(e.target.value)}
            disabled={pending}
            placeholder="Your answer"
            aria-labelledby={`meno-check-prompt-${check.id}`}
          />
          <button type="submit" disabled={pending || !clozeText.trim()}>
            Submit
          </button>
        </form>
      )}

      {check.type === 'flashcard' &&
        !result &&
        (!flashRevealed ? (
          <button type="button" onClick={() => setFlashRevealed(true)} disabled={pending}>
            Show answer
          </button>
        ) : (
          <div className="flashcard-actions">
            <button type="button" onClick={() => void submit('got-it')} disabled={pending}>
              I had it
            </button>
            <button type="button" onClick={() => void submit('not-yet')} disabled={pending}>
              Not yet
            </button>
          </div>
        ))}

      {error && <p className="check-error">{error}</p>}

      {result && (
        <div className="check-feedback">
          <p className="check-verdict">{result.correct ? 'Correct' : 'Incorrect'}</p>
          <p className="check-answer">
            <strong>Answer:</strong> {result.answer}
          </p>
          {result.explain && <p className="check-explain">{result.explain}</p>}
        </div>
      )}
    </div>
  );
}
