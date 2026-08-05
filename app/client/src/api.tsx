// Minimal fetch wrapper. No query/data library - the app has a handful of GET
// resources (owned by useResource) plus a handful of one-shot writes (POST/PATCH
// here), and that's the whole surface.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function parseErrorBody(res: Response): Promise<string> {
  try {
    const body: unknown = await res.json();
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error;
    }
  } catch {
    // no JSON body to read from - fall through to the default message
  }
  return `request failed (${res.status})`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, cache: 'no-store' });
  if (!res.ok) throw new ApiError(res.status, await parseErrorBody(res));
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
