// The one component that renders server-produced HTML (lesson bodies, hub
// notes, vault notes) and layers on every client-side enhancement it needs:
// wikilink navigation, mermaid diagrams, transfer badges, and - only when
// check/course/module/lesson are supplied - interactive check widgets.
import { useRef } from 'react';
import type { PublicCheck } from '../../../shared/types.ts';
import { useWikilinkNav } from '../wikilinks';
import { useMermaidRender } from '../mermaid';
import { useTransferBadges } from '../transferBadges';
import { useCheckMounts } from '../checkMounts';

interface RenderedHtmlProps {
  html: string;
  tenant: string;
  className?: string;
  checks?: PublicCheck[];
  course?: string;
  module?: string;
  lesson?: string;
}

export function RenderedHtml({ html, tenant, className, checks, course, module, lesson }: RenderedHtmlProps) {
  const ref = useRef<HTMLDivElement>(null);
  useWikilinkNav(ref, tenant, html);
  useMermaidRender(ref, html);
  useTransferBadges(ref, html);
  const ctx = course && module && lesson ? { tenant, course, module, lesson } : null;
  useCheckMounts(ref, checks, ctx);
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
