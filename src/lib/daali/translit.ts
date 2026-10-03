// ─── Offline transliteration: Roman → Devanagari / Urdu ─────────────────────
// Lets users write हिंदी / اردو on a plain English keyboard (Google Input
// Tools style). Words convert at word boundaries (space / enter / blur); the
// raw Latin text stays fully editable and is kept separately for search.
//
// Pipeline: dictionary first (dict.ts, ~450 curated Bihar-context words),
// then rule-based fallback with proper schwa handling:
//   - ramji  → रामजी   (no halant between m/j — clusters NOT auto-halanted)
//   - sanjay → संजय    (a+n+stop collapses into the anusvara)
//   - kishan → किशन    (final a+n drops)
//   - mahesh → महेश    (a before C+vowel drops)
//   - prasad → प्रसाद   (whitelisted clusters get halant; following a is inherent)
//   - singh  → सिंह     (ngh → ंह)
// No network, no ML — pure offline rules.

import { DICT } from './dict';

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

type TokenType = 'c' | 'v' | 'x';
type Tok = { raw: string; out: string; type: TokenType };

// ordered longest-first
const DEV_KEYS: Array<[string, string, TokenType]> = [
  ['ngh', 'ंह', 'c'],
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

// stop consonants — 'n' before these becomes the anusvara (शंकर, संतोष)
const DEV_STOPS = ['k', 'kh', 'g', 'gh', 'ch', 'chh', 'j', 'jh', 't', 'th', 'd', 'dh', 'T', 'Th', 'D', 'Dh', 'p', 'ph', 'b', 'bh'];

// roman clusters that really are conjuncts in Hindi — halant is inserted here,
// everywhere else C+C stays two full aksharas (रामजी, not राम्जी)
const CLUSTERS = new Set([
  'pr', 'kr', 'gr', 'tr', 'dr', 'br', 'vr', 'shr', 'sr',
  'sm', 'sw', 'sv', 'shw', 'st', 'sk', 'sp', 'sn', 'sl',
  'ny', 'jy', 'rm', 'rn',
]);

const HALANT = '\u094D';
const ANUSVARA = '\u0902';
const A_SIGN = 'ा';

function tokenize(word: string, keys: Array<[string, string, TokenType]>): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  while (i < word.length) {
    const hit = keys.find(([rk]) => word.startsWith(rk, i));
    if (!hit) {
      toks.push({ raw: word[i], out: word[i], type: 'x' });
      i += 1;
      continue;
    }
    toks.push({ raw: hit[0], out: hit[1], type: hit[2] });
    i += hit[0].length;
  }
  return toks;
}

function translitDev(word: string): string {
  const toks = tokenize(word, DEV_KEYS);
  let out = '';
  let pending = false; // last akshara is a bare consonant awaiting a matra
  let lastSingleA = false; // trailing ा came from one single 'a' (strip-able)
  let justClustered = false; // just built a halant conjunct (प्र, श्र, र्म…)

  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];
    const prev = toks[idx - 1];
    const next = toks[idx + 1];
    const isLast = idx === toks.length - 1;

    if (t.type === 'x') {
      out += t.out;
      pending = false; lastSingleA = false; justClustered = false;
      continue;
    }

    if (t.type === 'c') {
      // final 'y' right after a bare consonant → ी (pinky → पिंकी)
      if (t.raw === 'y' && isLast && pending) {
        out += 'ी';
        pending = false; lastSingleA = false; justClustered = false;
        continue;
      }
      // n → ं before a stop; the single 'a' just before it merges into the ं
      if (t.raw === 'n' && !pending && out !== '' && next && next.type === 'c' && DEV_STOPS.includes(next.raw)) {
        if (lastSingleA && out.endsWith(A_SIGN)) out = out.slice(0, -A_SIGN.length);
        out += ANUSVARA;
        pending = false; lastSingleA = false; justClustered = false;
        continue;
      }
      // whitelisted roman cluster → conjunct with halant
      if (pending && prev && prev.type === 'c' && CLUSTERS.has(prev.raw + t.raw)) {
        out += HALANT + t.out;
        pending = true; justClustered = true; lastSingleA = false;
        continue;
      }
      out += t.out;
      pending = true; justClustered = false; lastSingleA = false;
      continue;
    }

    // ── vowel token ──
    if (pending) {
      let sign = DEV_SIGN[t.raw] ?? '';
      if (isLast && t.raw === 'i') sign = 'ी'; // words end long: ramji → …जी
      if (isLast && t.raw === 'u') sign = 'ू'; // lalu → लालू
      if (t.raw === 'a') {
        // after a conjunct: inherent vowel, unless word-final (मिश्रा)
        if (justClustered && !isLast) {
          pending = false; lastSingleA = false;
          continue;
        }
        // a + final n → drop (kishan → किशन, roshan → रोशन)
        if (!isLast && next && next.raw === 'n' && idx + 1 === toks.length - 1) {
          pending = false; lastSingleA = false;
          continue;
        }
        // a + final y → drop, y becomes य (sanjay → संजय)
        if (!isLast && next && next.raw === 'y' && idx + 1 === toks.length - 1) {
          pending = false; lastSingleA = false;
          continue;
        }
        // single 'a' before C+vowel in longer words → drop (mahesh → महेश)
        if (
          toks.length >= 5 && !isLast && next && next.type === 'c' &&
          toks[idx + 2] && toks[idx + 2].type === 'v'
        ) {
          pending = false; lastSingleA = false;
          continue;
        }
        out += sign; // 'ा'
        lastSingleA = true; pending = false;
        continue;
      }
      out += sign;
      lastSingleA = false; pending = false;
      continue;
    }

    // independent vowel (word start or vowel after vowel)
    out += DEV_IND[t.raw] ?? t.out;
    lastSingleA = false; pending = false;
  }
  return out;
}

// ─── Urdu (اردو) ───────────────────────────────────────────────────────────────

const UR_KEYS: Array<[string, string, TokenType]> = [
  ['chh', 'چھ', 'c'],
  ['ngh', 'نگھ', 'c'],
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
  const toks = tokenize(word, UR_KEYS);
  let out = '';
  let pending = false; // last emitted char is a consonant
  let seenVowel = false; // any vowel emitted yet
  let firstConsonantSeen = false;

  for (let idx = 0; idx < toks.length; idx++) {
    const t = toks[idx];
    const isLast = idx === toks.length - 1;

    if (t.type === 'x') {
      out += t.out;
      pending = false;
      continue;
    }
    if (t.type === 'c') {
      out += t.out;
      pending = true;
      firstConsonantSeen = true;
      continue;
    }
    // vowel
    if (out === '') {
      out += UR_IND[t.raw] ?? t.out;
      seenVowel = true;
      pending = false;
      continue;
    }
    if (pending) {
      if (t.raw === 'a') {
        const nextIsVowel = toks[idx + 1] && toks[idx + 1].type === 'v';
        if (!seenVowel && firstConsonantSeen && !nextIsVowel) {
          out += 'ا'; // first-syllable a → alif (ram → رام)
        } else if (isLast) {
          out += 'ا'; // word-final a → alif (sita → سیتا)
        }
        // otherwise: short medial a → dropped (yadav → یادو)
        seenVowel = true;
        pending = false;
        continue;
      }
      if (t.raw === 'u' && isLast) {
        out += 'و'; // lalu → لالو
        seenVowel = true;
        pending = false;
        continue;
      }
      out += t.out;
      seenVowel = true;
      pending = false;
      continue;
    }
    // vowel after vowel
    out += t.out === '' ? 'و' : t.out;
    seenVowel = true;
  }
  return out;
}

// ─── Public API ────────────────────────────────────────────────────────────────

/** Convert one roman word into the target script. Dictionary first, then rules. */
export function translitWord(word: string, script: 'hi' | 'ur'): string {
  if (!word || !/^[A-Za-z']+$/.test(word)) return word;
  const hit = DICT[word.toLowerCase()];
  if (hit) return script === 'hi' ? hit[0] : hit[1];
  return script === 'hi' ? translitDev(word) : translitUr(word);
}
