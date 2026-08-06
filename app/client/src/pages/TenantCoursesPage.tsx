// #/t/:tenant - the course list, laid out under the tenant's own groups.
//
// Two resources, joined here: /tree says which courses exist (files are the
// truth), /groups says how to lay them out. The server has already resolved
// both layers - the learner's own groups, then a section per domain directory
// for whatever they have not filed - so this page renders sections and never
// reasons about a stale slug or a fallback rule.
//
// Group management is an inline mode on this page rather than a route of its
// own: it edits exactly the list already on screen, and the router is a small
// hand-rolled table that should not grow a shape for every panel. Every
// mutation carries If-Match from the last read, and a 409 means the file
// changed underneath us - the same discipline, and the same recovery, as todos.
import { useEffect, useState, type FormEvent } from 'react';
import { useResource } from '../useResource';
import { useRegisterRevalidate } from '../RevalidateContext';
import { EmptyState } from '../components/EmptyState';
import { InfoTip } from '../components/InfoTip';
import { postJson, patchJson, deleteJson, ApiError } from '../api';
import type { CourseNode, GroupsResponse, TreeResponse } from '../../../shared/types.ts';

const NO_GROUP = '__default__';

function CourseCard({ tenant, course }: { tenant: string; course: CourseNode }) {
  return (
    <>
      <a href={`#/t/${encodeURIComponent(tenant)}/c/${encodeURIComponent(course.slug)}`}>
        <h3>{course.title}</h3>
      </a>
      <p className="course-card-meta">
        <span className={`status-badge status-${course.status}`}>{course.status}</span>
        {' · '}
        {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'}
      </p>
      <div className="module-status-row">
        {course.modules.map((m) => (
          <span key={m.slug} className={`status-dot status-${m.status}`} title={`${m.title}: ${m.status}`} />
        ))}
      </div>
    </>
  );
}

export function TenantCoursesPage({ tenant }: { tenant: string }) {
  const t = encodeURIComponent(tenant);
  const tree = useResource<TreeResponse>(`/api/v1/${t}/tree`);
  const groups = useResource<GroupsResponse>(`/api/v1/${t}/groups`);
  useRegisterRevalidate(() => {
    tree.revalidate();
    groups.revalidate();
  });

  const [managing, setManaging] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameText, setRenameText] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // where keyboard focus should land once a row stops existing - deleting a
  // group or committing a rename unmounts the control that had focus, and
  // without this it falls back to the document body
  const [refocus, setRefocus] = useState<string | null>(null);

  useEffect(() => {
    if (!refocus) return;
    document.querySelector<HTMLElement>(`[data-group-focus="${refocus}"]`)?.focus();
    setRefocus(null);
  }, [refocus]);

  const base = `/api/v1/${t}/groups`;
  const sha = groups.data?.raw_sha256;
  const ifMatch = sha ? { 'if-match': sha } : undefined;

  const refresh = (): void => {
    groups.revalidate();
    tree.revalidate();
  };

  const handleFailure = (e: unknown): void => {
    if (e instanceof ApiError && e.status === 409) {
      setNotice('groups.yml changed on disk, reloading');
      refresh();
      return;
    }
    setNotice(e instanceof Error ? e.message : String(e));
  };

  // One mutation at a time, deliberately. Every write rewrites the whole file
  // against the If-Match hash read before it, so a second write started from
  // the same render is guaranteed to 409 - disabling only its own row would
  // just turn a race into a confusing "changed on disk" notice.
  const run = async (key: string, op: () => Promise<unknown>): Promise<void> => {
    if (busy) return;
    setBusy(key);
    setNotice(null);
    try {
      await op();
      refresh();
    } catch (e) {
      handleFailure(e);
    } finally {
      setBusy(null);
    }
  };

  const create = async (ev: FormEvent): Promise<void> => {
    ev.preventDefault();
    if (!newTitle.trim()) return;
    await run('new', async () => {
      await postJson(base, { title: newTitle.trim() }, ifMatch);
      setNewTitle('');
    });
  };

  const rename = async (id: string): Promise<void> => {
    if (!renameText.trim()) {
      setRenaming(null);
      return;
    }
    await run(id, async () => {
      await patchJson(`${base}/${encodeURIComponent(id)}`, { title: renameText.trim() }, ifMatch);
      setRenaming(null);
      setRefocus(id);
    });
  };

  const remove = async (id: string): Promise<void> => {
    await run(id, async () => {
      await deleteJson(`${base}/${encodeURIComponent(id)}`, ifMatch);
      setConfirmDelete(null);
      setRefocus('new-group');
    });
  };

  const move = async (slug: string, groupId: string): Promise<void> => {
    await run(slug, () =>
      patchJson(
        `/api/v1/${t}/course/${encodeURIComponent(slug)}/group`,
        { group: groupId === NO_GROUP ? null : groupId },
        ifMatch,
      ),
    );
  };

  if (tree.loading && !tree.data) return <p className="status-line">Loading courses...</p>;
  if (tree.error) return <p className="status-line status-error">Could not load courses: {tree.error}</p>;

  const courses = tree.data?.courses ?? [];
  if (courses.length === 0) return <EmptyState title={`No courses yet for ${tenant}`} />;

  const bySlug = new Map(courses.map((c) => [c.slug, c]));
  const sectionList = groups.data?.groups ?? [];
  // only the learner's own groups are editable; the domain sections are the
  // tree showing through, and there is nothing here to rename or delete
  const groupList = sectionList.filter((g) => g.source === 'explicit');
  const ungrouped = groups.data ? groups.data.ungrouped : courses.map((c) => c.slug);
  // Ungrouped comes last and only appears when a course has no domain to fall
  // back to - a course must never be invisible because nobody filed it
  const sections = [
    ...sectionList,
    ...(ungrouped.length > 0 ? [{ id: NO_GROUP, title: 'Ungrouped', courses: ungrouped, source: 'domain' as const }] : []),
  ];
  const warnings = [...(tree.data?.warnings ?? []), ...(groups.data?.warnings ?? [])];

  return (
    <section>
      <h1>
        Courses <InfoTip entry="courseGroups" />
      </h1>
      {notice && <p className="notice">{notice}</p>}
      {warnings.length > 0 && (
        <div className="warnings-box">
          {warnings.map((w, i) => (
            <p key={i}>{w}</p>
          ))}
        </div>
      )}

      {managing && (
        <div className="group-manage">
          <h2>Manage groups</h2>
          <p className="group-hint">
            Groups are labels, not folders: moving a course between them never changes the course itself.
            A course you have not filed sits under its domain, and deleting a group returns its courses
            there.
          </p>
          <ul className="group-manage-list">
            {groupList.map((g) => (
              <li key={g.id} className="group-manage-row">
                {renaming === g.id ? (
                  <input
                    type="text"
                    className="group-rename-input"
                    value={renameText}
                    aria-label={`Rename ${g.title}`}
                    onChange={(e) => setRenameText(e.target.value)}
                    onBlur={() => void rename(g.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void rename(g.id);
                      if (e.key === 'Escape') setRenaming(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span className="group-manage-name">
                    {g.title} <span className="group-count">{g.courses.length}</span>
                  </span>
                )}
                <button
                  type="button"
                  data-group-focus={g.id}
                  disabled={busy !== null}
                  onClick={() => {
                    setRenaming(g.id);
                    setRenameText(g.title);
                  }}
                >
                  Rename
                </button>
                {confirmDelete === g.id ? (
                  <>
                    <button type="button" className="group-danger" disabled={busy !== null} onClick={() => void remove(g.id)}>
                      {g.courses.length > 0 ? 'Delete, courses move to Ungrouped' : 'Delete'}
                    </button>
                    <button type="button" onClick={() => setConfirmDelete(null)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={busy !== null} onClick={() => setConfirmDelete(g.id)}>
                    Delete
                  </button>
                )}
              </li>
            ))}
            {groupList.length === 0 && (
              <li className="group-empty">
                No groups of your own yet - courses are listed under their domain until you make some.
              </li>
            )}
          </ul>
          <form className="group-create" onSubmit={create}>
            <input
              type="text"
              value={newTitle}
              aria-label="New group name"
              placeholder="New group, for example: Version Control"
              data-group-focus="new-group"
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={busy !== null}
            />
            <button type="submit" disabled={busy !== null || !newTitle.trim()}>
              Add group
            </button>
          </form>
        </div>
      )}

      {sections.map((s) => (
        <div key={s.id} className="group-section">
          <h2>
            {s.title} <span className="group-count">{s.courses.length}</span>
            {s.source === 'domain' && s.id !== NO_GROUP && <span className="group-derived"> by domain</span>}
          </h2>
          {s.courses.length === 0 ? (
            <p className="group-empty">No courses yet.</p>
          ) : (
            <ul className="course-list">
              {s.courses.map((slug) => {
                const course = bySlug.get(slug);
                if (!course) return null;
                return (
                  <li key={slug} className="course-card">
                    <CourseCard tenant={tenant} course={course} />
                    {managing && (
                      <label className="course-move">
                        Group
                        <select
                          className="course-move-select"
                          value={s.source === 'explicit' ? s.id : NO_GROUP}
                          disabled={busy !== null}
                          onChange={(e) => void move(slug, e.target.value)}
                        >
                          {groupList.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.title}
                            </option>
                          ))}
                          <option value={NO_GROUP}>No group (use its domain)</option>
                        </select>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ))}

      <p className="group-actions">
        <button type="button" onClick={() => setManaging((m) => !m)}>
          {managing ? 'Done' : 'Manage groups'}
        </button>
      </p>
    </section>
  );
}
