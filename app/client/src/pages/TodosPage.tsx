// #/t/:tenant/todos - sections with checkboxes, a create form, park, and inline
// text editing. Every mutation carries If-Match: <raw_sha256> from the last GET;
// a 409 means the file changed on disk underneath us, so we surface that and
// revalidate rather than silently overwriting someone else's edit.
import { useState, type FormEvent } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { postJson, patchJson, ApiError } from '../api';
import type { TodosResponse } from '../../../shared/types.ts';

const TYPES: Array<'gen' | 'repo' | 'note'> = ['gen', 'repo', 'note'];

export function TodosPage({ tenant }: { tenant: string }) {
  const base = `/api/v1/${encodeURIComponent(tenant)}/todos`;
  const { data, error, loading, revalidate } = useResource<TodosResponse>(base);
  useRegisterRevalidate(revalidate);

  const [newText, setNewText] = useState('');
  const [newType, setNewType] = useState<'gen' | 'repo' | 'note'>('gen');
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');

  const sha = data?.raw_sha256;
  const ifMatch = sha ? { 'if-match': sha } : undefined;

  const handleFailure = (e: unknown): void => {
    if (e instanceof ApiError && e.status === 409) {
      setNotice('file changed on disk, reloading');
      revalidate();
      return;
    }
    setNotice(e instanceof Error ? e.message : String(e));
  };

  const create = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    if (!newText.trim()) return;
    setBusy('new');
    setNotice(null);
    try {
      await postJson(base, { text: newText.trim(), type: newType }, ifMatch);
      setNewText('');
      revalidate();
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  };

  const toggleDone = async (line: number, done: boolean): Promise<void> => {
    setBusy(line);
    setNotice(null);
    try {
      await patchJson(`${base}/${line}`, { done }, ifMatch);
      revalidate();
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  };

  const saveText = async (line: number): Promise<void> => {
    setBusy(line);
    setNotice(null);
    try {
      await patchJson(`${base}/${line}`, { text: editText }, ifMatch);
      setEditing(null);
      revalidate();
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  };

  const park = async (line: number): Promise<void> => {
    setBusy(line);
    setNotice(null);
    try {
      await postJson(`${base}/${line}/park`, {}, ifMatch);
      revalidate();
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  };

  if (loading && !data) return <p className="status-line">Loading todos...</p>;
  if (error) return <p className="status-line status-error">Could not load todos: {error}</p>;

  const sections = data?.sections ?? [];
  const totalTodos = sections.reduce((n, s) => n + s.todos.length, 0);

  return (
    <section>
      <h1>Todos</h1>
      {notice && <p className="notice">{notice}</p>}

      <form className="todo-create" onSubmit={create}>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="New todo"
          disabled={busy === 'new'}
        />
        <select value={newType} onChange={(e) => setNewType(e.target.value as 'gen' | 'repo' | 'note')} disabled={busy === 'new'}>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button type="submit" disabled={busy === 'new' || !newText.trim()}>
          Add
        </button>
      </form>

      {totalTodos === 0 ? (
        <EmptyState title={`No todos yet for ${tenant}`} body="Nothing is queued here yet." />
      ) : (
        sections.map((s) => (
          <div key={s.heading || 'untitled'} className="todo-section">
            {s.heading && <h2>{s.heading}</h2>}
            <ul className="todo-list">
              {s.todos.map((t) => (
                <li key={t.line} className={`todo-item${t.done ? ' todo-done' : ''}`}>
                  <input
                    type="checkbox"
                    checked={t.done}
                    disabled={busy === t.line}
                    onChange={() => void toggleDone(t.line, !t.done)}
                  />
                  {editing === t.line ? (
                    <input
                      type="text"
                      className="todo-edit-input"
                      value={editText}
                      onChange={(e) => setEditText(e.target.value)}
                      onBlur={() => void saveText(t.line)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveText(t.line);
                      }}
                      autoFocus
                    />
                  ) : (
                    <button
                      type="button"
                      className="todo-text-btn"
                      disabled={busy === t.line}
                      onClick={() => {
                        setEditing(t.line);
                        setEditText(t.text);
                      }}
                    >
                      {t.text}
                    </button>
                  )}
                  {t.type && <span className={`type-tag type-${t.type}`}>{t.type}</span>}
                  {t.completedOn && <span className="completed-on">{t.completedOn}</span>}
                  <button type="button" className="park-btn" disabled={busy === t.line} onClick={() => void park(t.line)}>
                    Park
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
