// ─── Offline transliteration: Roman → Devanagari / Urdu ─────────────────────
// Lets users write हिंदी / اردو on a plain English keyboard (Google Input Tools
// style). Words convert at word boundaries (space / enter / blur); the raw
// Latin text stays fully editable and is kept separately for search.
// No dictionary, no network — pure rule-based, works offline.

export type InputScript = 'hi' | 'ur' | 'off';

/** Trailing run of latin letters (the word currently being typed) */
export function trailingLatin(v: string): string {
  const m = /[A-Za-z]+$/.exec(v);
  return m ? m[0] : '';
}

/** Convert only the pure-latin words of a mixed string (helper for search etc.) */
export function translitText(text: string, script: 'hi' | 'ur'): string {
  return text
    .split(/(\s+)/)
    .map((part) => (/^[A-Za-z']+$/.test(part) ? translitWord(part, script) : part))
    .join('');
}

// ─── Devanagari (हिंदी) ────────────────────────────────────────────────────────

type TokenType = 'c' | 'v';

// ordered longest-first
const DEV_KEYS: Array<[string, string, TokenType]> = [
  ['ksh', 'क्ष', 'c'],
  ['chh', 'छ', 'c'],
  ['kh', 'ख', 'c'], ['gh', 'घ', 'c'], ['ch', 'च', 'c'], ['jh', 'झ', 'c'],
  ['Th', 'ठ', 'c'], ['Dh', 'ढ', 'c'], ['th', 'थ', 'c'], ['dh', 'ध', 'c'],
  ['sh', 'श', 'c'], ['ph', 'फ', 'c'], ['bh', 'भ', 'c'],
  ['T', 'ट', 'c'], ['D', 'ड', 'c'],
  ['k', 'क', 'c'], ['g', 'ग', 'c'], ['j', 'ज', 'c'], ['z', 'ज़', 'c'],
  ['q', 'क़', 'c'], ['x', 'क्ष', 'c'],
  ['t', 'त', 'c'], ['d', 'द', 'c'], ['n', 'न', 'c'], ['f', 'फ़', 'c'],
  ['b', 'ब', 'c'], ['p', 'प', 'c'], ['m', 'म', 'c'],
  ['y', 'य', 'c'], ['r', 'र', 'c'], ['l', 'ल', 'c'], ['v', 'व', 'c'], ['w', 'व', 'c'],
  ['s', 'स', 'c'], ['h', 'ह', 'c'],
  ['aa', 'ा', 'v'], ['ai', 'ै', 'v'], ['au', 'ौ', 'v'],
  ['ee', 'ी', 'v'], ['ii', 'ी', 'v'], ['oo', 'ू', 'v'], ['uu', 'ू', 'v'],
  ['A', 'ा', 'v'], ['I', 'ी', 'v'], ['U', 'ू', 'v'],
  ['a', 'ा', 'v'], ['i', 'ि', 'v'], ['u', 'ु', 'v'], ['e', 'े', 'v'], ['o', 'ो', 'v'],
];

const DEV_SIGN: Record<string, string> = {
  aa: 'ा', A: 'ा', ai: 'ै', au: 'ौ',
  ee: 'ी', ii: 'ी', I: 'ी', oo: 'ू', uu: 'ू', U: 'ू',
  a: 'ा', i: 'ि', u: 'ु', e: 'े', o: 'ो',
};

const DEV_IND: Record<string, string> = {
  a: 'अ', aa: 'आ', A: 'आ', i: 'इ', ee: 'ई', ii: 'ई', I: 'ई',
  u: 'उ', oo: 'ऊ', uu: 'ऊ', U: 'ऊ',
  e: 'ए', ai: 'ऐ', o: 'ओ', au: 'औ',
};

// stop consonants — 'n' before these becomes the anusvara (ं), like shankar → शंकर
const DEV_STOPS = ['k', 'kh', 'g', 'gh', 'ch', 'chh', 'j', 'jh', 't', 'th', 'd', 'dh', 'T', 'Th', 'D', 'Dh', 'p', 'ph', 'b', 'bh'];
const HALANT = '\u094D';
const ANUSVARA = '\u0902';

function translitDev(word: string): string {
  let out = '';
  let pending = false; // last emitted char is a consonant awaiting a vowel sign
  let i = 0;
  while (i < word.length) {
    const hit = DEV_KEYS.find(([rk]) => word.startsWith(rk, i));
    if (!hit) {
      out += word[i];
      pending = false;
      i += 1;
      continue;
    }
    const [rk, dv, type] = hit;
    if (type === 'c') {
      // न → ं before a stop consonant (only when a vowel was just written)
      if (rk === 'n' && !pending && out !== '') {
        const rest = word.slice(i + 1);
        const isStop = DEV_STOPS.some((s) => rest.startsWith(s));
        if (isStop) {
          out += ANUSVARA;
          i += 1;
          continue;
        }
      }
      if (pending) out += HALANT; // consonant cluster: क् + र = क्र
      out += dv;
      pending = true;
    } else {
      if (pending) {
        let sign = DEV_SIGN[rk] ?? '';
        // words end long: "ramji" → रामजी, "lalu" → लालू
        if (i + rk.length === word.length) {
          if (rk === 'i') sign = 'ी';
          else if (rk === 'u') sign = 'ू';
        }
        out += sign;
        pending = false;
      } else {
        out += DEV_IND[rk] ?? dv;
      }
    }
    i += rk.length;
  }
  return out;
}

// ─── Urdu (اردو) ───────────────────────────────────────────────────────────────

const UR_KEYS: Array<[string, string, TokenType]> = [
  ['chh', 'چھ', 'c'],
  ['kh', 'کھ', 'c'], ['gh', 'گھ', 'c'], ['ch', 'چ', 'c'], ['jh', 'جھ', 'c'], ['zh', 'ژ', 'c'],
  ['Th', 'ٹھ', 'c'], ['Dh', 'ڈھ', 'c'], ['th', 'تھ', 'c'], ['dh', 'دھ', 'c'],
  ['ph', 'پھ', 'c'], ['bh', 'بھ', 'c'], ['sh', 'ش', 'c'],
  ['T', 'ٹ', 'c'], ['D', 'ڈ', 'c'],
  ['k', 'ک', 'c'], ['g', 'گ', 'c'], ['j', 'ج', 'c'], ['z', 'ز', 'c'],
  ['q', 'ق', 'c'], ['x', 'خ', 'c'],
  ['t', 'ت', 'c'], ['d', 'د', 'c'], ['n', 'ن', 'c'], ['f', 'ف', 'c'],
  ['b', 'ب', 'c'], ['p', 'پ', 'c'], ['m', 'م', 'c'],
  ['y', 'ی', 'c'], ['r', 'ر', 'c'], ['l', 'ل', 'c'], ['v', 'و', 'c'], ['w', 'و', 'c'],
  ['s', 'س', 'c'], ['h', 'ہ', 'c'],
  ['aa', 'ا', 'v'], ['ai', 'ی', 'v'], ['au', 'و', 'v'],
  ['ee', 'ی', 'v'], ['ii', 'ی', 'v'], ['oo', 'و', 'v'], ['uu', 'و', 'v'],
  ['A', 'ا', 'v'], ['I', 'ی', 'v'], ['U', 'و', 'v'],
  ['a', 'ا', 'v'], ['i', 'ی', 'v'], ['u', '', 'v'], ['e', 'ی', 'v'], ['o', 'و', 'v'],
];

// independent vowels at the start of a word
const UR_IND: Record<string, string> = {
  a: 'ا', aa: 'ا', A: 'ا', i: 'ا', ee: 'ای', ii: 'ای', I: 'ای',
  u: 'ا', oo: 'او', uu: 'او', U: 'او',
  e: 'ا', ai: 'ا', o: 'ا', au: 'ا',
};

function translitUr(word: string): string {
  let out = '';
  let pending = false; // last emitted char is a consonant
  let first = true; // nothing emitted yet
  let i = 0;
  while (i < word.length) {
    const hit = UR_KEYS.find(([rk]) => word.startsWith(rk, i));
    if (!hit) {
      out += word[i];
      pending = false;
      first = false;
      i += 1;
      continue;
    }
    const [rk, dv, type] = hit;
    if (type === 'c') {
      // Urdu writes words without halant — clusters just concatenate
      out += dv;
      pending = true;
    } else {
      if (first) {
        out += UR_IND[rk] ?? dv;
      } else if (pending) {
        out += dv;
        pending = false;
      } else {
        // vowel after vowel — fall back to the sign form
        out += dv;
      }
    }
    first = false;
    i += rk.length;
  }
  return out;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Convert one roman word into the target script. Non-latin input passes through. */
export function translitWord(word: string, script: 'hi' | 'ur'): string {
  if (!word || !/^[A-Za-z']+$/.test(word)) return word;
  return script === 'hi' ? translitDev(word) : translitUr(word);
}
