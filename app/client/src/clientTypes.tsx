// Local response/view types that the shared contract deliberately leaves loose
// (ProgressResponse.mastery and recent are `unknown` because mastery is derived
// live and owned by lib/mastery.ts, which the client does not import - see
// app/shared/types.ts). These are defensive, display-only shapes: if the server
// ever changes them, rendering degrades gracefully instead of throwing.
export interface TenantsResponse {
  tenants: { id: string; courses: number }[];
}

export interface ClientConceptMastery {
  level: 'introduced' | 'practiced' | 'mastered' | 'shaky';
  module: string | null;
  n_transfer: number;
  transfer_score: number | null;
  recognition_rate: number | null;
  next_review: string | null;
  stale: boolean;
  weak_until: string | null;
}

export interface ClientModuleMastery {
  gate: 'none' | 'pass' | 'fail' | 'insufficient-evidence';
  score: number | null;
  locked: boolean;
  overridden: boolean;
}

export interface ClientCourseMastery {
  concepts: Record<string, ClientConceptMastery>;
  modules: Record<string, ClientModuleMastery>;
}

export interface ClientMastery {
  schema_version: number;
  courses: Record<string, ClientCourseMastery>;
}

export function asMastery(raw: unknown): ClientMastery | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.courses !== 'object' || r.courses === null) return null;
  return raw as ClientMastery;
}

export interface Source {
  title: string;
  url: string;
  archived_url?: string;
  accessed?: string;
  source_type?: string;
  why?: string;
}

export function parseSources(frontmatter: Record<string, unknown>): Source[] {
  const raw = frontmatter.sources;
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is Source => {
    if (!s || typeof s !== 'object') return false;
    const o = s as Record<string, unknown>;
    return typeof o.title === 'string' && typeof o.url === 'string';
  });
}
