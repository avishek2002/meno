// The whole HTTP surface. Writes are exactly nine routes across three files -
// the ledger (two), todos.md (three), and groups.yml (four) - and none of them
// accepts event, source, or level from the client: there is no generic ledger
// endpoint, and that absence is the enforcement mechanism (decision 14). The
// group routes write organization, never evidence; see app/server/groups.ts.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { listTenants, safePath } from './tenant.ts';
import { walkTenant, vaultIndex } from './tree.ts';
import { renderMarkdown } from './markdown.ts';
import { gradeCheck } from './checks.ts';
import { appendUiEvent, readLedgerEvents } from './ledger.ts';
import { parseTodos, addTodo, patchTodo, parkTodo, sha256 } from './todos.ts';
import { readGroups, writeGroups } from './groups.ts';
import { addGroup, renameGroup, removeGroup, setCourseGroup, resolveGroups, type GroupsDoc } from '../../lib/groups.ts';
import { parseLesson } from '../../lib/lesson.ts';
import { deriveMastery } from '../../lib/mastery.ts';
import { computeInsights } from '../../lib/insights.ts';
import { loadInsightsInputs } from '../../lib/insights-io.ts';
import type { LessonResponse, PublicCheck, SubmitRequest, SubmitResponse, InsightsResponse, GroupsResponse } from '../shared/types.ts';
import { writeFileAtomic } from './atomic.ts';

interface Ctx {
  root: string; // the content root (content/tenants/ in a real clone - the app browses tenants only)
  clientDist: string | null;
  version: number;
}

type Handler = (req: IncomingMessage, res: ServerResponse, params: Record<string, string>, ctx: Ctx) => Promise<void> | void;

const json = (res: ServerResponse, status: number, body: unknown): void => {
  const data = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(data);
};

const httpError = (res: ServerResponse, e: unknown): void => {
  const status = (e as { status?: number }).status;
  if (status) return json(res, status, { error: (e as Error).message });
  // unexpected errors log server-side; clients never see filesystem paths
  console.error('internal error:', e);
  json(res, 500, { error: 'internal error' });
};

// every date in the system is local (ledger ts carries the local offset);
// "today" must be local too or due reviews hide for hours around midnight UTC
const localToday = (): string => {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw Object.assign(new Error('body too large'), { status: 413 });
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw Object.assign(new Error('invalid JSON body'), { status: 400 });
  }
}

const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string' || v === '') throw Object.assign(new Error(`missing or invalid "${name}"`), { status: 400 });
  return v;
};

// --- handlers ---

const getTenants: Handler = (_req, res, _p, ctx) => {
  const tenants = listTenants(ctx.root).map((id) => ({
    id,
    courses: walkTenant(join(ctx.root, id), id).courses.length,
  }));
  json(res, 200, { tenants });
};

const getTree: Handler = (_req, res, p, ctx) => {
  json(res, 200, walkTenant(safePath(ctx.root, p.tenant), p.tenant));
};

// courses are addressed by slug, but live in a directory that may differ
// (hand-made courses); the walk is the resolver
function resolveCourse(ctx: Ctx, tenant: string, courseSlug: string) {
  const tenantDir = safePath(ctx.root, tenant);
  const tree = walkTenant(tenantDir, tenant);
  const course = tree.courses.find((c) => c.slug === courseSlug);
  if (!course) throw Object.assign(new Error(`no course "${courseSlug}"`), { status: 404 });
  return { tenantDir, course };
}

const getCourse: Handler = (_req, res, p, ctx) => {
  const { tenantDir, course } = resolveCourse(ctx, p.tenant, p.course);
  let hubHtml = '';
  const hubPath = safePath(ctx.root, p.tenant, course.dir, course.hub.replace(/^\.\//, ''));
  if (course.hub && existsSync(hubPath)) {
    hubHtml = renderMarkdown(readFileSync(hubPath, 'utf8'), vaultIndex(tenantDir)).html;
  }
  const events = readLedgerEvents(tenantDir);
  const mastery = deriveMastery(events);
  json(res, 200, { ...course, hubHtml, mastery: mastery.courses[p.course] ?? null });
};

const getLesson: Handler = (_req, res, p, ctx) => {
  const { tenantDir, course } = resolveCourse(ctx, p.tenant, p.course);
  const file = safePath(ctx.root, p.tenant, course.dir, 'modules', p.module, `${p.file}.md`);
  if (!existsSync(file)) throw Object.assign(new Error('no such lesson'), { status: 404 });
  const text = readFileSync(file, 'utf8');
  const lesson = parseLesson(text);
  const { html, links } = renderMarkdown(text, vaultIndex(tenantDir));
  const checks: PublicCheck[] = lesson.checks
    .filter((c) => c.id && c.type && c.concept && c.prompt)
    .map((c) => ({
      id: c.id!,
      type: c.type as PublicCheck['type'],
      concept: c.concept!,
      prompt: c.prompt!,
      ...(c.type === 'mcq' ? { options: c.options ?? [] } : {}),
    }));
  const payload: LessonResponse = {
    frontmatter: lesson.frontmatter ?? {},
    html,
    checks,
    transfers: lesson.transfers.map((t) => ({ title: t.title })),
    links,
    warnings: lesson.warnings,
  };
  json(res, 200, payload);
};

const getNote: Handler = (req, res, p, ctx) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const notePath = str(url.searchParams.get('path'), 'path');
  const file = safePath(ctx.root, p.tenant, notePath);
  if (!existsSync(file) || !file.endsWith('.md')) throw Object.assign(new Error('no such note'), { status: 404 });
  const tenantDir = safePath(ctx.root, p.tenant);
  const { html, links } = renderMarkdown(readFileSync(file, 'utf8'), vaultIndex(tenantDir));
  json(res, 200, { path: notePath, html, links });
};

const getTodos: Handler = (_req, res, p, ctx) => {
  const file = safePath(ctx.root, p.tenant, 'todos.md');
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '';
  json(res, 200, parseTodos(raw));
};

const getProgress: Handler = (_req, res, p, ctx) => {
  const tenantDir = safePath(ctx.root, p.tenant);
  const events = readLedgerEvents(tenantDir);
  const mastery = deriveMastery(events);
  const today = localToday();
  const due: { course: string; concept: string; next_review: string }[] = [];
  for (const [course, c] of Object.entries(mastery.courses)) {
    for (const [concept, st] of Object.entries(c.concepts)) {
      if (st.next_review && st.next_review <= today) due.push({ course, concept, next_review: st.next_review });
    }
  }
  json(res, 200, { mastery, due, recent: events.slice(-20).reverse() });
};

// Read-only, walks fresh like every other GET. No POST sibling: insights is a
// snapshot over existing files, never a write path (docs/specs/insights.md).
const getInsights: Handler = (_req, res, p, ctx) => {
  const tenantDir = safePath(ctx.root, p.tenant);
  const { events, vault, todos, manifests } = loadInsightsInputs(tenantDir);
  const report = computeInsights(events, vault, todos, manifests, localToday());
  // narrative reports the study-insights skill has written, surfaced for the
  // client's "Narrative reports" list - sourced from the same vault walk so
  // there is no second file-listing implementation
  const notes = vault.files.filter((f) => /^insights\/[^/]+-insights\.md$/.test(f)).sort();
  const payload: InsightsResponse = { ...report, notes };
  json(res, 200, payload);
};

const getLedger: Handler = (req, res, p, ctx) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const since = url.searchParams.get('since');
  const rawLimit = Number(url.searchParams.get('limit') ?? 200);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 5000) : 200;
  let events = readLedgerEvents(safePath(ctx.root, p.tenant));
  if (since) events = events.filter((e) => e.ts > since);
  const truncated = events.length > limit;
  json(res, 200, { events: events.slice(-limit), truncated });
};

// --- the write surface (all of it) ---

const postCheckSubmit: Handler = async (req, res, p, ctx) => {
  const body = (await readBody(req)) as unknown as SubmitRequest & Record<string, unknown>;
  const course = str(body.course, 'course');
  const module_ = str(body.module, 'module');
  const lessonSlug = str(body.lesson, 'lesson');
  const checkId = str(body.check_id, 'check_id');
  const response = str(body.response, 'response');

  const { course: courseNode } = resolveCourse(ctx, p.tenant, course);
  const file = safePath(ctx.root, p.tenant, courseNode.dir, 'modules', module_, `${lessonSlug}.md`);
  if (!existsSync(file)) throw Object.assign(new Error('no such lesson'), { status: 404 });
  const lesson = parseLesson(readFileSync(file, 'utf8'));
  const check = lesson.checks.find((c) => c.id === checkId);
  if (!check) throw Object.assign(new Error(`no check "${checkId}" in this lesson`), { status: 404 });

  const graded = gradeCheck(check, response);
  const attempts = readLedgerEvents(safePath(ctx.root, p.tenant)).filter(
    (e) => e.event === 'scored' && e.item === `${lesson.frontmatter?.id}#${checkId}`,
  ).length;
  const event = appendUiEvent(safePath(ctx.root, p.tenant), 'scored', {
    course,
    module: module_,
    lesson: lessonSlug,
    concepts: [check.concept ?? 'unknown'],
    item: `${lesson.frontmatter?.id}#${checkId}`,
    item_type: check.type as 'mcq' | 'cloze' | 'flashcard',
    correct: graded.correct,
    attempt: attempts + 1,
  });
  const payload: SubmitResponse = { ...graded, event_ts: event.ts };
  json(res, 200, payload);
};

const postLessonRead: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  const course = str(body.course, 'course');
  const module_ = str(body.module, 'module');
  const lessonSlug = str(body.lesson, 'lesson');
  // a read event must point at a lesson that exists - same rule as submit
  const { course: courseNode } = resolveCourse(ctx, p.tenant, course);
  const file = safePath(ctx.root, p.tenant, courseNode.dir, 'modules', module_, `${lessonSlug}.md`);
  if (!existsSync(file)) throw Object.assign(new Error('no such lesson'), { status: 404 });
  if (body.seconds !== undefined && (!Number.isFinite(body.seconds as number) || (body.seconds as number) < 0)) {
    throw Object.assign(new Error('seconds must be a finite non-negative number'), { status: 400 });
  }
  const event = appendUiEvent(safePath(ctx.root, p.tenant), 'read', {
    course,
    module: module_,
    lesson: lessonSlug,
    ...(typeof body.seconds === 'number' ? { seconds: body.seconds } : {}),
  });
  json(res, 200, { event_ts: event.ts });
};

function withTodosFile(
  ctx: Ctx,
  tenant: string,
  req: IncomingMessage,
  mutate: (raw: string) => string,
  opts: { requireMatch?: boolean } = {},
): { raw_sha256: string } {
  const file = safePath(ctx.root, tenant, 'todos.md');
  const raw = existsSync(file) ? readFileSync(file, 'utf8') : '# Todos\n';
  const ifMatch = req.headers['if-match'];
  if (opts.requireMatch && (typeof ifMatch !== 'string' || ifMatch === '')) {
    // a line index is only meaningful against a known file version
    throw Object.assign(new Error('If-Match required for line-addressed todo operations'), { status: 428 });
  }
  if (typeof ifMatch === 'string' && ifMatch !== '' && ifMatch !== sha256(raw)) {
    throw Object.assign(new Error('todos.md changed since you read it (409)'), { status: 409 });
  }
  const next = mutate(raw);
  writeFileAtomic(file, next);
  return { raw_sha256: sha256(next) };
}

const postTodos: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  const text = str(body.text, 'text');
  const type = str(body.type, 'type');
  if (!['gen', 'repo', 'note'].includes(type)) throw Object.assign(new Error('type must be gen|repo|note'), { status: 400 });
  const result = withTodosFile(ctx, p.tenant, req, (raw) =>
    addTodo(raw, text, type as 'gen' | 'repo' | 'note', typeof body.section === 'string' ? body.section : undefined),
  );
  json(res, 200, result);
};

const patchTodoRoute: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  const today = localToday();
  const result = withTodosFile(
    ctx, p.tenant, req,
    (raw) => patchTodo(raw, Number(p.line), { done: body.done as boolean | undefined, text: body.text as string | undefined }, today),
    { requireMatch: true },
  );
  json(res, 200, result);
};

const postTodoPark: Handler = async (req, res, p, ctx) => {
  const result = withTodosFile(ctx, p.tenant, req, (raw) => parkTodo(raw, Number(p.line)), { requireMatch: true });
  json(res, 200, result);
};

// --- course groups (the second app-writable file; organization, not evidence) ---

const getGroups: Handler = (_req, res, p, ctx) => {
  const tenantDir = safePath(ctx.root, p.tenant);
  const { raw, doc, warnings } = readGroups(tenantDir);
  // the walk is the truth about which courses exist and where they sit; the
  // registry only overrides how they are laid out, so the join happens here
  // rather than in the file - and the course's domain directory is what an
  // unclaimed course falls back to
  const tree = walkTenant(tenantDir, p.tenant);
  const resolved = resolveGroups(doc, tree.courses.map((c) => ({ slug: c.slug, dir: c.dir })));
  const payload: GroupsResponse = {
    groups: resolved.groups,
    ungrouped: resolved.ungrouped,
    warnings: [...warnings, ...resolved.warnings],
    raw_sha256: sha256(raw),
  };
  json(res, 200, payload);
};

// Every group write is If-Match guarded, not just the id-addressed ones: the
// whole file is rewritten each time, so a create is exactly as capable of
// clobbering an Obsidian edit as a rename is.
function withGroupsFile(
  ctx: Ctx,
  tenant: string,
  req: IncomingMessage,
  mutate: (doc: GroupsDoc) => GroupsDoc,
): { raw_sha256: string } {
  const tenantDir = safePath(ctx.root, tenant);
  if (!existsSync(tenantDir)) throw Object.assign(new Error(`no tenant "${tenant}"`), { status: 404 });
  const { raw, doc } = readGroups(tenantDir);
  const ifMatch = req.headers['if-match'];
  if (typeof ifMatch !== 'string' || ifMatch === '') {
    throw Object.assign(new Error('If-Match required for group operations'), { status: 428 });
  }
  if (ifMatch !== sha256(raw)) {
    throw Object.assign(new Error('groups.yml changed since you read it (409)'), { status: 409 });
  }
  return { raw_sha256: sha256(writeGroups(tenantDir, mutate(doc))) };
}

const postGroup: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  json(res, 200, withGroupsFile(ctx, p.tenant, req, (doc) => addGroup(doc, body.title)));
};

const patchGroup: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  json(res, 200, withGroupsFile(ctx, p.tenant, req, (doc) => renameGroup(doc, p.id, body.title)));
};

// Deleting a group deletes the grouping and nothing else: its courses fall back
// to Ungrouped on the next read. No course file is touched, ever.
const deleteGroup: Handler = (req, res, p, ctx) => {
  json(res, 200, withGroupsFile(ctx, p.tenant, req, (doc) => removeGroup(doc, p.id)));
};

const patchCourseGroup: Handler = async (req, res, p, ctx) => {
  const body = await readBody(req);
  if (body.group !== null && typeof body.group !== 'string') {
    throw Object.assign(new Error('"group" must be a group id or null'), { status: 400 });
  }
  // a course can only be filed if it exists - resolveCourse is the same walk the
  // rest of the surface resolves against, so a slug the app cannot see is a 404
  // here rather than a dangling entry written to disk
  const { course } = resolveCourse(ctx, p.tenant, p.course);
  json(res, 200, withGroupsFile(ctx, p.tenant, req, (doc) => setCourseGroup(doc, course.slug, body.group as string | null)));
};

const getHealth: Handler = (_req, res, _p, ctx) => {
  json(res, 200, { ok: true, version: ctx.version, root: ctx.root, node: process.version });
};

// --- router ---

const ROUTES: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/v1\/health$/, getHealth],
  ['GET', /^\/api\/v1\/tenants$/, getTenants],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/tree$/, getTree],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/course\/(?<course>[^/]+)$/, getCourse],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/lesson\/(?<course>[^/]+)\/(?<module>[^/]+)\/(?<file>[^/]+)$/, getLesson],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/note$/, getNote],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/todos$/, getTodos],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/progress$/, getProgress],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/insights$/, getInsights],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/ledger$/, getLedger],
  ['GET', /^\/api\/v1\/(?<tenant>[^/]+)\/groups$/, getGroups],
  ['POST', /^\/api\/v1\/(?<tenant>[^/]+)\/groups$/, postGroup],
  ['PATCH', /^\/api\/v1\/(?<tenant>[^/]+)\/groups\/(?<id>[^/]+)$/, patchGroup],
  ['DELETE', /^\/api\/v1\/(?<tenant>[^/]+)\/groups\/(?<id>[^/]+)$/, deleteGroup],
  ['PATCH', /^\/api\/v1\/(?<tenant>[^/]+)\/course\/(?<course>[^/]+)\/group$/, patchCourseGroup],
  ['POST', /^\/api\/v1\/(?<tenant>[^/]+)\/check\/submit$/, postCheckSubmit],
  ['POST', /^\/api\/v1\/(?<tenant>[^/]+)\/lesson\/read$/, postLessonRead],
  ['POST', /^\/api\/v1\/(?<tenant>[^/]+)\/todos$/, postTodos],
  ['PATCH', /^\/api\/v1\/(?<tenant>[^/]+)\/todos\/(?<line>\d+)$/, patchTodoRoute],
  ['POST', /^\/api\/v1\/(?<tenant>[^/]+)\/todos\/(?<line>\d+)\/park$/, postTodoPark],
];

// loopback names only, with or without a port; `[::1]` is how IPv6 appears in a
// Host header
const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/;

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

export function makeHandler(ctx: Ctx) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      // Rebinding guard. The Origin check below stops an ordinary drive-by
      // request, but not DNS rebinding: once evil.example resolves to
      // 127.0.0.1 the attacker's page is same-origin with us, so its GETs
      // carry no Origin header at all and would sail through. The Host header
      // still names the attacker's domain, which is why pinning it to loopback
      // is the check that actually closes rebinding (a browser cannot forge
      // it). Anything reaching a 127.0.0.1-bound socket under another name is
      // either an attack or a proxy this private vault has no reason to trust.
      const host = req.headers.host;
      if (!host || !LOOPBACK_HOST.test(host)) {
        return json(res, 403, { error: 'non-loopback Host rejected' });
      }
      // drive-by guard: a foreign Origin is rejected outright
      const origin = req.headers.origin;
      if (origin && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin)) {
        return json(res, 403, { error: 'foreign origin rejected' });
      }
      const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
      for (const [method, pattern, handler] of ROUTES) {
        if (req.method !== method) continue;
        const m = path.match(pattern);
        if (!m) continue;
        await handler(req, res, (m.groups ?? {}) as Record<string, string>, ctx);
        return;
      }
      if (path.startsWith('/api/')) return json(res, 404, { error: 'no such endpoint' });

      // static client
      if (ctx.clientDist && req.method === 'GET') {
        const rel = path === '/' ? 'index.html' : path.slice(1);
        let file: string;
        try {
          file = safePath(ctx.clientDist, rel);
        } catch {
          return json(res, 400, { error: 'bad path' });
        }
        if (!existsSync(file) || statSync(file).isDirectory()) file = join(ctx.clientDist, 'index.html');
        if (existsSync(file)) {
          res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
          return void res.end(readFileSync(file));
        }
      }
      json(res, 404, { error: 'not found' });
    } catch (e) {
      httpError(res, e);
    }
  };
}

export type { Ctx };
