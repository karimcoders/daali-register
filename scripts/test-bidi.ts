// Compare "identical-looking" Urdu/Devanagari strings at codepoint level
import { translitWord } from '../src/lib/daali/translit';

const cases: Array<[string, 'hi' | 'ur', string]> = [
  ['mandal', 'ur', 'منڈل'],
  ['madan', 'ur', 'مدن'],
  ['chandan', 'ur', 'چندन'],
  ['vishwanath', 'ur', 'وشوناتथ'],
  ['pradeep', 'hi', 'प्रदीप'],
  ['prakash', 'ur', 'پرکاش'],
  ['rahul', 'ur', 'راہول'],
  ['vishal', 'ur', 'وشال'],
  ['mohan', 'ur', 'موہن'],
];

for (const [roman, script, want] of cases) {
  const got = translitWord(roman, script);
  const same = got === want;
  console.log(`${same ? 'SAME' : 'DIFF'} ${roman}(${script})`);
  if (!same) {
    console.log('  got : ' + [...got].map((c) => 'U+' + c.codePointAt(0)!.toString(16).padStart(4, '0')).join(' '));
    console.log('  want: ' + [...want].map((c) => 'U+' + c.codePointAt(0)!.toString(16).padStart(4, '0')).join(' '));
  }
}
