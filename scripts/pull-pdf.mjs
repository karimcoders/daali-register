// Pull base64 PDF out of the browser session and save locally
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const raw = execSync('agent-browser --session livecheck eval "window.__pdfB64" --json', { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const parsed = JSON.parse(raw);
// agent-browser --json wraps result somewhere in data.*; find the long base64 string
function findB64(o) {
  if (typeof o === 'string') return o.length > 1000 && /^[A-Za-z0-9+/=]+$/.test(o.slice(0, 200)) ? o : null;
  if (Array.isArray(o)) { for (const v of o) { const r = findB64(v); if (r) return r; } return null; }
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) { const r = findB64(o[k]); if (r) return r; } return null; }
  return null;
}
const b64 = findB64(parsed);
if (typeof b64 !== 'string' || b64.length < 100) {
  console.error('BAD_B64', String(raw).slice(0, 200));
  process.exit(1);
}
const buf = Buffer.from(b64, 'base64');
writeFileSync('/home/z/my-project/scripts/qa-export.pdf', buf);
console.log('PDF_SAVED', buf.length, 'bytes, head:', buf.subarray(0, 8).toString('latin1'));
