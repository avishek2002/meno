// Renders `pre > code.language-mermaid` blocks (the shape remark/rehype emits
// for fenced ```mermaid blocks) into diagrams, in place. mermaid is dynamically
// imported so it's only pulled in when a page actually has a diagram to draw.
import { useEffect, type RefObject } from 'react';

export function useMermaidRender(ref: RefObject<HTMLElement | null>, html: string): void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const blocks = el.querySelectorAll<HTMLElement>('pre > code.language-mermaid');
    if (blocks.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { default: mermaid } = await import('mermaid');
      if (cancelled) return;
      const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'default' });
      const nodes: HTMLElement[] = [];
      blocks.forEach((code) => {
        const pre = code.parentElement;
        if (!pre) return;
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = code.textContent ?? '';
        pre.replaceWith(div);
        nodes.push(div);
      });
      if (nodes.length > 0 && !cancelled) await mermaid.run({ nodes });
    })();
    return () => {
      cancelled = true;
    };
  }, [ref, html]);
}
