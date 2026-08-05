// Rebuild progress/mastery.yml from progress/ledger.jsonl - the only writer of
// mastery.yml besides the tutor session. Usage: node tools/rebuild-mastery.ts <tenant-dir>
// Kept separate from validate.ts on purpose: validate never writes.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseLedger, deriveMastery, serializeMastery } from '../lib/mastery.ts';

const tenantDir = process.argv[2];
if (!tenantDir) {
  console.error('usage: node tools/rebuild-mastery.ts <tenant-dir>');
  process.exit(1);
}
const ledgerPath = join(tenantDir, 'progress', 'ledger.jsonl');
if (!existsSync(ledgerPath)) {
  console.error(`no ledger at ${ledgerPath}`);
  process.exit(1);
}
const { events, warnings } = parseLedger(readFileSync(ledgerPath, 'utf8'));
for (const w of warnings) console.error(`warning: ${w}`);
const out = join(tenantDir, 'progress', 'mastery.yml');
writeFileSync(out, serializeMastery(deriveMastery(events)));
console.log(`rebuilt ${out} from ${events.length} events`);
