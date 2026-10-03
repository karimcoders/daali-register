// Scan dict.ts for script contamination: Devanagari chars inside Urdu strings
// and Arabic chars inside Devanagari strings.
import { DICT } from '../src/lib/daali/dict';

const isDev = (c: string) => /[\u0900-\u097F]/.test(c);
const isArabic = (c: string) => /[\u0600-\u06FF\u0750-\u077F]/.test(c);
const isLatin = (c: string) => /[A-Za-z0-9.]/.test(c);

let issues = 0;
for (const [key, [hi, ur]] of Object.entries(DICT)) {
  const hiBad = [...hi].filter((c) => isArabic(c));
  const urBad = [...ur].filter((c) => isDev(c));
  if (hiBad.length) {
    issues++;
    console.log(`HI-CONTAMINATED ${key}: hi="${hi}" → Arabic chars: ${hiBad.map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}`);
  }
  if (urBad.length) {
    issues++;
    console.log(`UR-CONTAMINATED ${key}: ur="${ur}" → Devanagari chars: ${urBad.map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')} at positions ${[...ur].map((c, i) => isDev(c) ? i : -1).filter((i) => i >= 0)}`);
  }
  // non-script junk
  const hiJunk = [...hi].filter((c) => !isDev(c) && !isLatin(c) && !/[\u200C\u200D\s]/.test(c));
  const urJunk = [...ur].filter((c) => !isArabic(c) && !isLatin(c) && !/[\u200C\u200D\s]/.test(c));
  if (hiJunk.length) { issues++; console.log(`HI-JUNK ${key}: ${hiJunk.map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}`); }
  if (urJunk.length) { issues++; console.log(`UR-JUNK ${key}: ${urJunk.map((c) => 'U+' + c.codePointAt(0)!.toString(16)).join(' ')}`); }
}
console.log(issues === 0 ? 'CLEAN — no contamination' : `${issues} issue(s)`);
