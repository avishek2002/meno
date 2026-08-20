// Minimal fetch wrapper. No query/data library - the app has a handful of GET
// resources (owned by useResource) plus a handful of one-shot writes (POST/PATCH
// here), and that's the whole surface.
export class ApiError extends Error {
  status: number;
  /**
   * The parsed JSON error body, when there was one - undefined for a
   * non-JSON or empty body. Added for the notes panel's 409 handling: a
   * conflict response carries `code` and `current` (CourseNotesConflict)
   * alongside `error`, and a caller that needs that shape narrows this by
   * `status` first, the same way `useResource` already narrows on `status`
   * to phrase a 404 without importing ApiError itself.
   */
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function parseErrorBody(res: Response): Promise<{ message: string; body?: unknown }> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return { message: (body as { error: string }).error, body };
    }
    return { message: `request failed (${res.status})`, body };
  } catch {
    // no JSON body to read from - fall through to the default message
    return { message: `request failed (${res.status})` };
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (!res.ok) {
    const { message, body } = await parseErrorBody(res);
    throw new ApiError(res.status, message, body);
  }
  return (await res.json()) as T;
}

export function getJson<T>(url: string): Promise<T> {
  return request<T>(url);
}

export function postJson<T>(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  return request<T>(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

export function patchJson<T>(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  return request<T>(url, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}

// The notes panel's one write route (docs/specs/notes.md): every PUT carries
// `If-Match: <sha256 of the whole file>` as an extra header, the same
// convention postJson/patchJson already use for todos.
export function putJson<T>(url: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  return request<T>(url, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...extraHeaders },
    body: JSON.stringify(body),
  });
}
