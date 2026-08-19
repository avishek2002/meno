// #/t/:tenant/todos - sections with checkboxes, a create form, park, and inline
// text editing. Every mutation carries If-Match: <raw_sha256> from the last GET;
// a 409 means the file changed on disk underneath us, so we surface that and
// revalidate rather than silently overwriting someone else's edit.
import { useRef, useState, type FormEvent } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { AsyncStatus } from '../components/AsyncStatus';
import { EmptyState } from '../components/EmptyState';
import { ErrorState } from '../components/ErrorState';
import { postJson, patchJson, ApiError } from '../api';
import type { TodoAudience, TodoKind, TodosResponse } from '../../../shared/types.ts';
import { InfoTip } from '../components/InfoTip';
import { TODO_KIND_INFO, TODO_AUDIENCE_INFO, kindInfo, audienceInfo } from '../todoTags';
import { useWikilinkNav, wikilinkTextToHtml } from '../wikilinks';
import { tenantHref } from '../../../shared/routeHrefs.ts';

export function TodosPage({ tenant }: { tenant: string }) {
  const base = `/api/v1/${encodeURIComponent(tenant)}/todos`;
  const { data, error, loading, revalidate } = useResource<TodosResponse>(base);
  useRegisterRevalidate(revalidate);

  const [newText, setNewText] = useState('');
  const [newKind, setNewKind] = useState<TodoKind>('course');
  const [newAudience, setNewAudience] = useState<TodoAudience>('for-agent');
  const [busy, setBusy] = useState<number | 'new' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  // UI-13: 8 of 26 todos are done and were interleaved with open ones with no
  // way to separate them - default to hidden so the list opens on the work
  // still to do.
  const [hideDone, setHideDone] = useState(true);

  const sha = data?.raw_sha256;
  const ifMatch = sha ? { 'if-match': sha } : undefined;

  // One listener for the whole list rather than one per row: wikilinks in
  // todo text go through the same pipeline RenderedHtml uses (UI-13/UI-14).
  // `sha` in the dependency list is the html-equivalent signal - a new
  // fetch's todo text needs its `#wiki:` hrefs rewritten again.
  const listRef = useRef<HTMLDivElement>(null);
  useWikilinkNav(listRef, tenant, sha);

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
      await postJson(base, { text: newText.trim(), type: newKind, audience: newAudience }, ifMatch);
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

  if (loading && !data) return <AsyncStatus message="Loading todos..." />;
  if (error) {
    return (
      <ErrorState
        title="Could not load todos"
        message={`Todos for ${tenant} could not be loaded.`}
        detail={error}
        links={[{ label: 'Courses', href: tenantHref(tenant) }]}
      />
    );
  }

  const sections = data?.sections ?? [];
  const totalTodos = sections.reduce((n, s) => n + s.todos.length, 0);
  const doneCount = sections.reduce((n, s) => n + s.todos.filter((t) => t.done).length, 0);

  return (
    <section>
      <h1 aria-labelledby="todos-heading">
        <span id="todos-heading">Todos</span> <InfoTip entry="todosShared" />
      </h1>
      {notice && <p className="notice">{notice}</p>}

      <form className="todo-create" onSubmit={create}>
        <input
          type="text"
          value={newText}
          onChange={(e) => setNewText(e.target.value)}
          placeholder="New todo"
          disabled={busy === 'new'}
        />
        <label className="todo-create-select">
          Kind <InfoTip entry="todoKind" />
          <select
            aria-label="Kind"
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as TodoKind)}
            disabled={busy === 'new'}
          >
            {TODO_KIND_INFO.map((k) => (
              <option key={k.kind} value={k.kind}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="todo-create-select">
          Audience <InfoTip entry="todoAudience" />
          <select
            aria-label="Audience"
            value={newAudience}
            onChange={(e) => setNewAudience(e.target.value as TodoAudience)}
            disabled={busy === 'new'}
          >
            {TODO_AUDIENCE_INFO.map((a) => (
              <option key={a.audience} value={a.audience}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={busy === 'new' || !newText.trim()}>
          Add
        </button>
      </form>
      <p className="todo-create-helper">
        {kindInfo(newKind).blurb} {audienceInfo(newAudience).blurb}
      </p>

      {totalTodos > 0 && (
        <label className="hide-done-toggle">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} />
          Hide done ({doneCount})
        </label>
      )}

      {totalTodos === 0 ? (
        <EmptyState title={`No todos yet for ${tenant}`} body="Nothing is queued here yet." />
      ) : (
        <div ref={listRef}>
          {sections.map((s) => {
            const visible = hideDone ? s.todos.filter((t) => !t.done) : s.todos;
            if (visible.length === 0) return null;
            return (
              <div key={s.heading || 'untitled'} className="todo-section">
                {s.heading && <h2>{s.heading}</h2>}
                <ul className="todo-list">
                  {visible.map((t) => (
                    <li key={t.line} className={`todo-item${t.done ? ' todo-done' : ''}`}>
                      <input
                        type="checkbox"
                        checked={t.done}
                        disabled={busy === t.line}
                        onChange={() => void toggleDone(t.line, !t.done)}
                        aria-label={t.text}
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
                        // UI-13: text is no longer the click target for editing -
                        // that forced it to render as a plain string, so a
                        // wikilink inside it could never become a real link.
                        // Rendered through the same wikilink pipeline RenderedHtml
                        // uses (wikilinks.tsx); a dedicated button below owns edit.
                        <span
                          className="todo-text"
                          dangerouslySetInnerHTML={{ __html: wikilinkTextToHtml(t.text) }}
                        />
                      )}
                      {editing !== t.line && (
                        <button
                          type="button"
                          className="todo-edit-btn"
                          disabled={busy === t.line}
                          onClick={() => {
                            setEditing(t.line);
                            setEditText(t.text);
                          }}
                        >
                          Edit
                        </button>
                      )}
                      {t.type && <span className={`type-tag type-${t.type}`}>{kindInfo(t.type).label}</span>}
                      {t.audience && <span className={`audience-tag audience-${t.audience}`}>{audienceInfo(t.audience).label}</span>}
                      {t.completedOn && <span className="completed-on">{t.completedOn}</span>}
                      <button type="button" className="park-btn" disabled={busy === t.line} onClick={() => void park(t.line)}>
                        Park
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
