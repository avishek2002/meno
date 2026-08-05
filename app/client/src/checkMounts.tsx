// Mounts one interactive CheckWidget per PublicCheck into its
// `div.meno-check[data-check-id]` mount point inside rendered lesson HTML. The
// mount points come from raw dangerouslySetInnerHTML content, outside React's
// own tree, so each gets its own react-dom root (per the design brief) rather
// than portal children of the page's component tree.
import { useEffect, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { PublicCheck, SubmitResponse } from '../../shared/types.ts';
import { postJson } from './api';
import { CheckWidget } from './components/CheckWidget';

interface CheckContext {
  tenant: string;
  course: string;
  module: string;
  lesson: string;
}

export function useCheckMounts(ref: RefObject<HTMLElement | null>, checks: PublicCheck[] | undefined, ctx: CheckContext | null): void {
  useEffect(() => {
    const el = ref.current;
    if (!el || !checks || checks.length === 0 || !ctx) return;
    const roots: Root[] = [];
    for (const check of checks) {
      const mount = el.querySelector<HTMLElement>(`div.meno-check[data-check-id="${CSS.escape(check.id)}"]`);
      if (!mount) continue;
      const root = createRoot(mount);
      root.render(
        <CheckWidget
          check={check}
          onSubmit={(response) =>
            postJson<SubmitResponse>(`/api/v1/${encodeURIComponent(ctx.tenant)}/check/submit`, {
              course: ctx.course,
              module: ctx.module,
              lesson: ctx.lesson,
              check_id: check.id,
              response,
            })
          }
        />,
      );
      roots.push(root);
    }
    return () => {
      roots.forEach((r) => r.unmount());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, checks, ctx?.tenant, ctx?.course, ctx?.module, ctx?.lesson]);
}
