import fs from 'fs';
import { computeFingerprint, canonicalJsonStringify } from '../src/utils/fingerprint';
import { FullBackupEnvelopeSchema } from '../src/domain/schemas';

const filePath = 'C:/Users/Fede/Downloads/HandStat_RespaldoCompleto_2026-10-15T17-37-28-541Z.json';
const raw = fs.readFileSync(filePath, 'utf-8');
const parsed = JSON.parse(raw);

console.log('Keys in parsed:', Object.keys(parsed));
console.log('schema_version:', parsed.schema_version);
console.log('backup_kind:', parsed.backup_kind);
console.log('created_at:', parsed.created_at);
console.log('app_version:', parsed.app_version);
console.log('fingerprint:', parsed.fingerprint, 'length:', parsed.fingerprint?.length);
console.log('counts:', parsed.counts);

const fpRawData = computeFingerprint(parsed.data);
console.log('computeFingerprint(parsed.data):', fpRawData, 'matches?', fpRawData === parsed.fingerprint);

const zodResult = FullBackupEnvelopeSchema.safeParse(parsed);
console.log('Zod safeParse success?', zodResult.success);
if (zodResult.success) {
  const fpZodData = computeFingerprint(zodResult.data.data);
  console.log('computeFingerprint(zodResult.data.data):', fpZodData, 'matches?', fpZodData === parsed.fingerprint);
  
  if (fpRawData !== fpZodData) {
    console.log('Diff between raw parsed.data and zod parsed.data:');
    const rawCan = canonicalJsonStringify(parsed.data);
    const zodCan = canonicalJsonStringify(zodResult.data.data);
    console.log('rawCan length:', rawCan.length, 'zodCan length:', zodCan.length);
    for (let i = 0; i < Math.max(rawCan.length, zodCan.length); i++) {
      if (rawCan[i] !== zodCan[i]) {
        console.log(`First diff at index ${i}:`);
        console.log('rawCan snippet:', rawCan.substring(Math.max(0, i - 30), i + 50));
        console.log('zodCan snippet:', zodCan.substring(Math.max(0, i - 30), i + 50));
        break;
      }
    }
  }
} else {
  console.log('Zod error:', zodResult.error);
}

import { sha256Sync } from './test_sha256';
const can = canonicalJsonStringify(parsed.data);
const t0 = performance.now();
const sha = sha256Sync(can);
const dt = performance.now() - t0;
console.log('sha256 of canonical parsed.data:', sha);
console.log('time for 122KB sha256:', dt.toFixed(2), 'ms');
