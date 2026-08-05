// The ONLY code path through which the UI reaches the ledger. Three layers, all
// here: (1) callers cannot pass event/source/level - the literals are
// constructed below; (2) the assertion throws on anything but ui recognition
// shapes; (3) the built line validates against the narrowed ui schema before it
// touches disk.
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsExport from 'ajv-formats';
import { appendLine } from './atomic.ts';
import { parseLedger, type LedgerEvent } from '../../lib/mastery.ts';

const addFormats = ((addFormatsExport as unknown as { default?: unknown }).default ??
  addFormatsExport) as (ajv: Ajv2020) => void;

const schemasDir = new URL('../../schemas/', import.meta.url).pathname;
let uiValidator: ValidateFunction | null = null;
function validateUi(): ValidateFunction {
  if (!uiValidator) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    ajv.addSchema(JSON.parse(readFileSync(join(schemasDir, 'ledger.schema.json'), 'utf8')));
    uiValidator = ajv.compile(JSON.parse(readFileSync(join(schemasDir, 'ledger.ui.schema.json'), 'utf8')));
  }
  return uiValidator;
}

function rfc3339WithOffset(d: Date): string {
  const pad = (n: number, w = 2): string => String(Math.abs(n)).padStart(w, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}

let lastTs = '';
function nextTs(): string {
  // ts is unique per file (it is a join key); bump 1ms on collision
  let d = new Date();
  let ts = rfc3339WithOffset(d);
  while (ts <= lastTs) {
    d = new Date(d.getTime() + 1);
    ts = rfc3339WithOffset(d);
  }
  lastTs = ts;
  return ts;
}

export interface UiScoredInput {
  course: string;
  module: string;
  lesson: string;
  concepts: string[];
  item: string;
  item_type: 'mcq' | 'cloze' | 'flashcard';
  correct: boolean;
  attempt: number;
}

export interface UiReadInput {
  course: string;
  module: string;
  lesson: string;
  seconds?: number;
}

export function appendUiEvent(
  tenantDir: string,
  kind: 'scored' | 'read',
  input: UiScoredInput | UiReadInput,
): LedgerEvent {
  if (kind !== 'scored' && kind !== 'read') {
    throw new Error(`appendUiEvent: event "${kind}" is not UI-writable`);
  }
  const forbidden = input as unknown as Record<string, unknown>;
  for (const key of ['event', 'source', 'level', 'score']) {
    if (key in forbidden && !(kind === 'scored' && key === 'level')) {
      // no caller-supplied typing fields, ever - they are constructed below
      throw new Error(`appendUiEvent: caller may not supply "${key}"`);
    }
  }
  const event: LedgerEvent =
    kind === 'scored'
      ? ({
          v: 1,
          ts: nextTs(),
          event: 'scored',
          source: 'ui',
          level: 'recognition',
          course: (input as UiScoredInput).course,
          module: (input as UiScoredInput).module,
          lesson: (input as UiScoredInput).lesson,
          concepts: (input as UiScoredInput).concepts,
          item: (input as UiScoredInput).item,
          item_type: (input as UiScoredInput).item_type,
          correct: (input as UiScoredInput).correct,
          score: null,
          attempt: (input as UiScoredInput).attempt,
          session: null,
        } as LedgerEvent)
      : ({
          v: 1,
          ts: nextTs(),
          event: 'read',
          source: 'ui',
          course: (input as UiReadInput).course,
          module: (input as UiReadInput).module,
          lesson: (input as UiReadInput).lesson,
          ...((input as UiReadInput).seconds !== undefined ? { seconds: (input as UiReadInput).seconds } : {}),
        } as LedgerEvent)
  ;
  if (event.source !== 'ui' || (event.event === 'scored' && event.level !== 'recognition')) {
    throw new Error('appendUiEvent: constructed a non-ui-recognition event (bug)');
  }
  const check = validateUi();
  if (!check(event)) {
    const msg = (check.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('; ');
    throw new Error(`appendUiEvent: event fails the narrowed ui schema: ${msg}`);
  }
  const ledgerPath = join(tenantDir, 'progress', 'ledger.jsonl');
  mkdirSync(dirname(ledgerPath), { recursive: true });
  appendLine(ledgerPath, JSON.stringify(event));
  return event;
}

export function readLedgerEvents(tenantDir: string): LedgerEvent[] {
  const ledgerPath = join(tenantDir, 'progress', 'ledger.jsonl');
  if (!existsSync(ledgerPath)) return [];
  return parseLedger(readFileSync(ledgerPath, 'utf8')).events;
}
