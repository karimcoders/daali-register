// Self-hosted fonts with build-time basePath prefix.
// GitHub Pages serves the app under /daali-register/, so absolute /fonts/
// URLs would 404 — NEXT_PUBLIC_BASE_PATH is injected at build time and
// React hoists this <style> into <head>.
const BP = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

const LATIN_RANGE =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';
const DEVANAGARI_RANGE =
  'U+0900-097F, U+1CD0-1CF9, U+200C-200D, U+20A8, U+20B9, U+20F0, U+25CC, U+A830-A839, U+A8E0-A8FF, U+11B00-11B09';
const ARABIC_RANGE =
  'U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC';

function face(family: string, weight: string, file: string, range: string): string {
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('${BP}/fonts/${file}') format('woff2');unicode-range:${range};}`;
}

const CSS = [
  face('Kalam', '400', 'kalam-400-devanagari.woff2', DEVANAGARI_RANGE),
  face('Kalam', '400', 'kalam-400-latin.woff2', LATIN_RANGE),
  face('Kalam', '700', 'kalam-700-devanagari.woff2', DEVANAGARI_RANGE),
  face('Kalam', '700', 'kalam-700-latin.woff2', LATIN_RANGE),
  face('Noto Sans Devanagari', '400', 'noto-sans-devanagari-400-devanagari.woff2', DEVANAGARI_RANGE),
  face('Noto Sans Devanagari', '400', 'noto-sans-devanagari-400-latin.woff2', LATIN_RANGE),
  face('Noto Sans Devanagari', '500', 'noto-sans-devanagari-500-devanagari.woff2', DEVANAGARI_RANGE),
  face('Noto Sans Devanagari', '500', 'noto-sans-devanagari-500-latin.woff2', LATIN_RANGE),
  face('Noto Sans Devanagari', '700', 'noto-sans-devanagari-700-devanagari.woff2', DEVANAGARI_RANGE),
  face('Noto Sans Devanagari', '700', 'noto-sans-devanagari-700-latin.woff2', LATIN_RANGE),
  face('Noto Nastaliq Urdu', '400 700', 'noto-nastaliq-urdu-arabic.woff2', ARABIC_RANGE),
  face('Noto Nastaliq Urdu', '400 700', 'noto-nastaliq-urdu-latin.woff2', LATIN_RANGE),
].join('\n');

export function FontFaces() {
  return <style href="daali-fonts" precedence="medium" dangerouslySetInnerHTML={{ __html: CSS }} />;
}
