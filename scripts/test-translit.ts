// Transliteration quality test — run: bun scripts/test-translit.ts
import { translitWord, translitText } from '../src/lib/daali/translit';
import { DICT } from '../src/lib/daali/dict';

// [roman, expected hi] — hi hand-typed; ur derived from DICT when present
const CASES: Array<[string, string]> = [
  // relations
  ['mama', 'मामा'], ['chacha', 'चाचा'], ['bhai', 'भाई'], ['didi', 'दीदी'],
  ['bhabhi', 'भाभी'], ['sasur', 'ससुर'], ['dada', 'दादा'], ['nana', 'नाना'], ['fua', 'फुआ'],
  // surnames
  ['yadav', 'यादव'], ['sharma', 'शर्मा'], ['verma', 'वर्मा'], ['gupta', 'गुप्ता'],
  ['singh', 'सिंह'], ['kumar', 'कुमार'], ['mishra', 'मिश्रा'], ['pandey', 'पांडे'],
  ['prasad', 'प्रसाद'], ['paswan', 'पासवान'], ['mandal', 'मंडल'],
  ['chaudhary', 'चौधरी'], ['das', 'दास'], ['ram', 'राम'], ['prakash', 'प्रकाश'],
  // names — rules must nail these
  ['ramji', 'रामजी'], ['sanjay', 'संजय'], ['vijay', 'विजय'], ['ajay', 'अजय'],
  ['bijay', 'बिजय'], ['jay', 'जय'], ['samay', 'समय'], ['anand', 'आनंद'],
  ['sandeep', 'संदीप'], ['santosh', 'संतोष'], ['sandesh', 'संदेश'], ['ranjeet', 'रंजीत'],
  ['manoj', 'मनोज'], ['madan', 'मदन'], ['gagan', 'गगन'], ['pawan', 'पवन'],
  ['mohan', 'मोहन'], ['sohan', 'सोहन'], ['kishan', 'किशन'], ['roshan', 'रोशन'],
  ['charan', 'चरन'], ['chandan', 'चंदन'], ['priyanka', 'प्रियंका'], ['priya', 'प्रिया'],
  ['pramod', 'प्रमोद'], ['pradeep', 'प्रदीप'], ['prakash', 'प्रकाश'], ['pinku', 'पिंकू'],
  ['pinky', 'पिंकी'], ['rahul', 'राहुल'], ['ramesh', 'रमेश'], ['mahesh', 'महेश'],
  ['satish', 'सतीश'], ['rakesh', 'राकेश'], ['vishal', 'विशाल'], ['kishor', 'किशोर'],
  ['sunil', 'सुनील'], ['anil', 'अनील'], ['sagar', 'सागर'], ['motilal', 'मोतीलाल'],
  ['vishwanath', 'विश्वनाथ'], ['lakshman', 'लक्ष्मन'], ['shyam', 'श्याम'],
  ['shaadi', 'शादी'], ['byah', 'ब्याह'], ['gaon', 'गांव'], ['ghar', 'घर'],
  ['paise', 'पैसे'], ['rupaye', 'रुपये'], ['daali', 'दाली'],
  // females
  ['sita', 'सीता'], ['gita', 'गीता'], ['radha', 'राधा'], ['puja', 'पूजा'],
  ['pooja', 'पूजा'], ['rita', 'रीता'], ['meena', 'मीना'], ['deepa', 'दीपा'],
  ['reena', 'रीना'], ['jyoti', 'ज्योती'], ['shanti', 'शांती'], ['mangal', 'मंगल'],
  // places
  ['patna', 'पटना'], ['gaya', 'गया'], ['bihar', 'बिहार'], ['madhopur', 'माधोपुर'],
  ['madhubani', 'मधुबनी'], ['siwan', 'सिवान'], ['nalanda', 'नालंदा'],
];

let pass = 0, fail = 0;
const failures: string[] = [];

function check(tag: string, got: string, want: string) {
  if (got === want) { pass++; return; }
  fail++;
  failures.push(`  ${tag} → got "${got}", want "${want}"`);
}

for (const [roman, hi] of CASES) {
  check(`hi "${roman}"`, translitWord(roman, 'hi'), hi);
  // Urdu: if in dict, engine must return the dict value verbatim
  if (DICT[roman]) check(`ur "${roman}" (dict)`, translitWord(roman, 'ur'), DICT[roman][1]);
}

console.log(`\n=== DICTIONARY + RULES: ${pass} passed, ${fail} failed ===`);
if (failures.length) { console.log('FAILURES:'); console.log(failures.join('\n')); }

// hand-typed Urdu spot checks (most critical words)
const UR_SPOT: Array<[string, string]> = [
  ['mama', 'ماما'], ['bhai', 'بھائی'], ['yadav', 'یادو'], ['shadi', 'شادی'],
  ['patna', 'پٹنہ'], ['gaon', 'گاؤں'], ['singh', 'سنگھ'], ['chacha', 'چاچا'],
];
let up = 0, uf = 0;
for (const [w, want] of UR_SPOT) {
  const got = translitWord(w, 'ur');
  if (got === want) up++; else { uf++; console.log(`  UR SPOT FAIL "${w}" → got "${got}" want "${want}"`); }
}
console.log(`=== URDU SPOT CHECKS: ${up} passed, ${uf} failed ===`);

// Show rule-engine behavior on unseen words (visual check)
console.log('\n--- Rule fallbacks (unseen words) ---');
const unseen = ['ramji', 'sanjay', 'manojkumar', 'sahadev', 'jhoolan', 'dhanesh', 'nayan', 'manan'];
for (const w of unseen) {
  console.log(`  ${w.padEnd(14)} hi→ ${translitWord(w, 'hi')}   ur→ ${translitWord(w, 'ur')}`);
}

// multi-word text
console.log('\n--- Sentences ---');
console.log('  ', translitText('ram kumar yadav', 'hi'));
console.log('  ', translitText('shadi daali patna', 'hi'));
console.log('  ', translitText('ram kumar yadav', 'ur'));
