// ─── Real PDF download — register drawn DIRECTLY on Canvas 2D ───────────────
// Pehle html2canvas se DOM ka snapshot lete the — phone par viewport/scroll/
// devicePixelRatio/font-race ki wajah se PDF baar-baar kharab aati thi:
// crop, blank pages, content andar khiskna (paanch baar user complaint).
// Ab koi DOM capture NAHI: har A4 sheet Canvas 2D par khud draw hoti hai.
// Geometry 100% deterministic — har device, har browser par bilkul ek jaisi.
// Devanagari/Urdu shaping browser ke HarfBuzz se milti hai (canvas fillText
// wahi shaping engine use karta hai jo DOM text use karta hai).
'use client';

import type { jsPDF } from 'jspdf';
import type { DaaliEntry, DaaliEvent, Language } from './types';
import {
  backupStamp,
  entryAmountText,
  formatNumber,
  formatRupees,
  isoToDisplayDate,
  isoToHindiDate,
} from './format';
import { makeT } from './strings';

const PAGE_W = 794; // A4 @96dpi logical units
const PAGE_H = 1123;
const SCALE = 2; // actual pixels 1588×2246 — ~192dpi, print-sharp
const ROWS_PER_SHEET = 20;

// paper palette (canvas fillStyle — hex strings, no CSS parsing involved)
const C = {
  paper: '#fdf9ee',
  ink: '#241c12',
  soft: '#6b5d49',
  red: '#b3402f',
  line: '#d9cba3',
  lineBold: '#4a4030',
};

type TString = ReturnType<typeof makeT> extends (k: infer K) => string ? K : never;

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  if (out.length === 0) out.push([]);
  return out;
}

// ── fonts ────────────────────────────────────────────────────────────────────
// Screen par headings Kalam (handwriting) — PDF par bhi Kalam title ke liye,
// body Noto Sans Devanagari (print-clear; Kalam ki जि/ने door se galat padhe
// jaate the — purana user report). Urdu par Noto Nastaliq Urdu.
function bodyFont(rtl: boolean, weight: 400 | 500 | 700, size: number): string {
  return rtl
    ? `${weight} ${size}px 'Noto Nastaliq Urdu', 'Noto Sans Devanagari', sans-serif`
    : `${weight} ${size}px 'Noto Sans Devanagari', sans-serif`;
}
function handFont(rtl: boolean, weight: 400 | 700, size: number): string {
  return rtl
    ? `${weight} ${size}px 'Noto Nastaliq Urdu', 'Noto Sans Devanagari', sans-serif`
    : `${weight} ${size}px 'Kalam', 'Noto Sans Devanagari', sans-serif`;
}

/**
 * Web fonts unicode-range subsets mein hain. document.fonts.load(font) bina
 * text ke sirf latin subset load karta hai (space ke liye) — canvas phir
 * Devanagari ke liye system fallback (jo phone par missing ho sakta hai)
 * use karega. Isliye hamesha representative text pass karo.
 */
const FONT_SAMPLE_HI = 'शुभ लाभ दाली रजिस्टर नाम गाँव रिश्ता रकम ₹0123456789';
const FONT_SAMPLE_UR = 'شوبھ لابھ دالی رجسٹر نام رقم گاؤں رشتہ ₹0123456789';

async function loadPdfFonts(rtl: boolean): Promise<void> {
  const sample = rtl ? `${FONT_SAMPLE_UR} ${FONT_SAMPLE_HI}` : FONT_SAMPLE_HI;
  const loads: Array<Promise<unknown>> = [
    document.fonts.load("400 30px 'Kalam'", sample),
    document.fonts.load("700 30px 'Kalam'", sample),
    document.fonts.load("400 15px 'Noto Sans Devanagari'", sample),
    document.fonts.load("500 15px 'Noto Sans Devanagari'", sample),
    document.fonts.load("700 15px 'Noto Sans Devanagari'", sample),
    document.fonts.load("400 14px 'Noto Nastaliq Urdu'", sample),
    document.fonts.load("700 14px 'Noto Nastaliq Urdu'", sample),
  ];
  try {
    await Promise.all(loads);
    await document.fonts.ready;
  } catch {
    /* fonts API unavailable — system fallback chalega */
  }
}

// ── text helpers ─────────────────────────────────────────────────────────────
function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  const ELL = '…';
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ELL).width <= maxW) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo) + ELL;
}

/** word-wrap into ≤2 lines (totals line kabhi page se bahar nahi jayega) */
function wrap2Lines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (ctx.measureText(text).width <= maxW) return [text];
  const words = text.split(' ');
  let line1 = '';
  let i = 0;
  while (i < words.length) {
    const next = line1 ? `${line1} ${words[i]}` : words[i];
    if (ctx.measureText(next).width > maxW && line1) break;
    line1 = next;
    i++;
  }
  const rest = words.slice(i).join(' ');
  return [line1, ellipsize(ctx, rest, maxW)];
}

// ── layout constants ─────────────────────────────────────────────────────────
const CONTENT_L = 86; // red margin (64) + inner pad — DOM version jaisa
const CONTENT_R = 764;
const INNER_W = CONTENT_R - CONTENT_L;
const COL_FR = [0.08, 0.34, 0.22, 0.16, 0.2]; // क्र, नाम, गाँव, रिश्ता, रकम

// ── the sheet painter ────────────────────────────────────────────────────────
function drawSheet(opts: {
  event: DaaliEvent;
  sheet: DaaliEntry[];
  sheetIndex: number;
  sheetCount: number;
  serialStart: number;
  grandCount: number;
  grandSum: number;
  itemCount: number;
  lang: Language;
}): HTMLCanvasElement {
  const { event, sheet, sheetIndex, sheetCount, serialStart, grandCount, grandSum, itemCount, lang } = opts;
  const t = makeT(lang) as (k: TString) => string;
  const rtl = lang === 'ur';
  const pageNum = `${t('page')} ${sheetIndex + 1}/${sheetCount}`;

  const canvas = document.createElement('canvas');
  canvas.width = PAGE_W * SCALE;
  canvas.height = PAGE_H * SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('daali-pdf-canvas-unavailable');
  ctx.scale(SCALE, SCALE);
  ctx.direction = rtl ? 'rtl' : 'ltr';
  ctx.textBaseline = 'middle';

  // paper
  ctx.fillStyle = C.paper;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);

  // red margin lines — physical side depends on direction (DOM version jaisa)
  ctx.globalAlpha = 0.55;
  ctx.strokeStyle = C.red;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(rtl ? PAGE_W - 64 : 64, 0);
  ctx.lineTo(rtl ? PAGE_W - 64 : 64, PAGE_H);
  ctx.stroke();
  ctx.globalAlpha = 0.35;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(rtl ? 26 : PAGE_W - 26, 0);
  ctx.lineTo(rtl ? 26 : PAGE_W - 26, PAGE_H);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // column rects — LTR order; RTL par mirror (रकम left, क्र right)
  const rects: Array<{ x: number; w: number }> = [];
  let cx = CONTENT_L;
  for (const fr of COL_FR) {
    rects.push({ x: cx, w: fr * INNER_W });
    cx += fr * INNER_W;
  }
  const cols = [t('colCr'), t('colName'), t('colVillage'), t('colRelation'), t('colAmount')];
  if (rtl) {
    rects.reverse();
    cols.reverse();
  }

  const rowH = rtl ? 44 : 40;
  // header block heights
  const headH = sheetIndex === 0 ? (rtl ? 116 : 122) : 64;
  const rowsTop = 34 + headH;
  const rowsEnd = rowsTop + ROWS_PER_SHEET * rowH;

  // ── header ──
  if (sheetIndex === 0) {
    const cxm = (CONTENT_L + CONTENT_R) / 2;
    ctx.fillStyle = C.ink;
    ctx.font = handFont(rtl, 700, rtl ? 24 : 30);
    ctx.textAlign = 'center';
    ctx.fillText(t('daaliRegister'), cxm, 34 + (rtl ? 24 : 28));
    // thin divider under the title
    ctx.strokeStyle = 'rgba(36,28,18,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cxm - 80, 34 + (rtl ? 48 : 54));
    ctx.lineTo(cxm + 80, 34 + (rtl ? 48 : 54));
    ctx.stroke();
    // event meta — कार्यक्रम • तारीख़ • गाँव
    const dateStr = event.date
      ? `${t('dateLabel')}: ${lang === 'hi' ? isoToHindiDate(event.date) || isoToDisplayDate(event.date) : isoToDisplayDate(event.date)}`
      : '';
    const locStr = event.location ? `${t('villageLabel')}: ${event.location}` : '';
    const meta = [`${t('eventLabel')}: ${event.name}`, dateStr, locStr].filter(Boolean).join('  •  ');
    ctx.fillStyle = C.ink;
    ctx.font = bodyFont(rtl, 500, rtl ? 14 : 16);
    ctx.textAlign = 'center';
    ctx.fillText(ellipsize(ctx, meta, INNER_W), cxm, 34 + (rtl ? 84 : 88));
  } else {
    ctx.fillStyle = C.soft;
    ctx.font = bodyFont(rtl, 400, 13);
    ctx.textAlign = rtl ? 'left' : 'right';
    ctx.fillText(`${event.name} — ${pageNum}`, rtl ? CONTENT_L : CONTENT_R, 34 + 18);
  }

  // ── column header ──
  const colHeadY = rowsTop - 16;
  ctx.fillStyle = C.ink;
  ctx.font = bodyFont(rtl, 700, 14);
  cols.forEach((label, i) => {
    const r = rects[i];
    let align: CanvasTextAlign;
    let x: number;
    if (i === (rtl ? 4 : 0)) {
      // क्र — center
      align = 'center';
      x = r.x + r.w / 2;
    } else if (label === t('colAmount')) {
      align = rtl ? 'left' : 'right';
      x = rtl ? r.x + 6 : r.x + r.w - 6;
    } else {
      align = rtl ? 'right' : 'left';
      x = rtl ? r.x + r.w - 6 : r.x + 6;
    }
    ctx.textAlign = align;
    ctx.fillText(label, x, colHeadY);
  });
  // header underline (bold rule — real register column line)
  ctx.strokeStyle = C.lineBold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CONTENT_L, rowsTop - 4);
  ctx.lineTo(CONTENT_R, rowsTop - 4);
  ctx.stroke();

  // ── rows ──
  const drawRowLine = (y: number) => {
    ctx.strokeStyle = C.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(CONTENT_L, y);
    ctx.lineTo(CONTENT_R, y);
    ctx.stroke();
  };

  sheet.forEach((entry, i) => {
    const top = rowsTop + i * rowH;
    const midY = top + rowH / 2 + (rtl ? 3 : 0); // Nastaliq thoda neeche baithta hai
    const amt = entryAmountText(entry);
    const nameText = entry.name + (entry.note ? ` (${entry.note})` : '');

    // values in LTR column order: [serial, name, village, relation, amount]
    const values: Array<{ text: string; font: string; color: string }> = [
      { text: String(serialStart + i), font: bodyFont(rtl, 400, 13), color: C.soft },
      { text: nameText, font: bodyFont(rtl, 500, rtl ? 14 : 15), color: C.ink },
      { text: entry.village || '—', font: bodyFont(rtl, 400, rtl ? 13 : 14), color: C.ink },
      { text: entry.relationship || '—', font: bodyFont(rtl, 400, rtl ? 13 : 14), color: C.ink },
      {
        text: amt.text || '—',
        font: amt.cash ? bodyFont(rtl, 700, rtl ? 14 : 15) : handFont(rtl, 400, rtl ? 14 : 15),
        color: amt.cash ? C.ink : C.soft,
      },
    ];
    const vr = rtl ? [...values].reverse() : values;

    vr.forEach((v, i) => {
      const r = rects[i];
      let align: CanvasTextAlign;
      let x: number;
      if (i === (rtl ? 4 : 0)) {
        align = 'center';
        x = r.x + r.w / 2;
      } else if (i === (rtl ? 0 : 4)) {
        // रकम column — trailing edge
        align = rtl ? 'left' : 'right';
        x = rtl ? r.x + 6 : r.x + r.w - 6;
      } else {
        align = rtl ? 'right' : 'left';
        x = rtl ? r.x + r.w - 6 : r.x + 6;
      }
      ctx.font = v.font;
      ctx.fillStyle = v.color;
      ctx.textAlign = align;
      const maxW = r.w - 12;
      ctx.fillText(ellipsize(ctx, v.text, maxW), x, midY, maxW);
    });

    drawRowLine(top + rowH);
  });

  // khali ruled rows — register jaisa poora page
  for (let i = sheet.length; i < ROWS_PER_SHEET; i++) {
    drawRowLine(rowsTop + (i + 1) * rowH);
  }

  // ── footer ──
  const footTop = rowsEnd + 10;
  ctx.strokeStyle = C.lineBold;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(CONTENT_L, footTop);
  ctx.lineTo(CONTENT_R, footTop);
  ctx.stroke();

  let y = footTop + 26;
  if (sheetIndex === sheetCount - 1) {
    const tot =
      `${t('totalPeople')}: ${formatNumber(grandCount)} • ${t('totalDaali')}: ${formatRupees(grandSum)}` +
      (itemCount > 0 ? ` • ${t('itemCount')}: ${formatNumber(itemCount)}` : '');
    ctx.font = handFont(rtl, 700, 16);
    ctx.fillStyle = C.ink;
    ctx.textAlign = rtl ? 'left' : 'right';
    const lines = wrap2Lines(ctx, tot, INNER_W);
    for (const ln of lines) {
      ctx.fillText(ln, rtl ? CONTENT_L : CONTENT_R, y);
      y += 24;
    }
  }
  ctx.fillStyle = C.soft;
  ctx.font = bodyFont(rtl, 400, 13);
  ctx.textAlign = rtl ? 'right' : 'left';
  ctx.fillText(pageNum, rtl ? CONTENT_R : CONTENT_L, Math.max(y + 2, footTop + 26));

  return canvas;
}

// ── save chain (proven) ──────────────────────────────────────────────────────
export type PdfSaveResult = { how: 'shared' | 'saved' | 'opened'; url: string; filename: string; file?: File };

async function savePdfFile(pdf: jsPDF, filename: string): Promise<PdfSaveResult> {
  const blob = pdf.output('blob');
  const url = URL.createObjectURL(blob);
  setTimeout(() => URL.revokeObjectURL(url), 120_000);

  // 1) share sheet (phones) — "फ़ाइलों में सेव करें", WhatsApp, Gmail, प्रिंट…
  let sharedFile: File | undefined;
  try {
    const file = new File([blob], filename, { type: 'application/pdf' });
    sharedFile = file;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
    if (coarsePointer && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return { how: 'shared', url, filename, file };
    }
  } catch (err) {
    if ((err as DOMException | undefined)?.name === 'AbortError') {
      // user closed the share sheet — fall through and download the file anyway
    } else {
      // share unavailable/failed — fall through to the classic download
    }
  }

  // 2) classic anchor download (desktop browsers, Android Chrome…)
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    return { how: 'saved', url, filename, file: sharedFile };
  } catch {
    // 3) last resort — open the PDF; user saves it from the viewer
    window.open(url, '_blank');
    return { how: 'opened', url, filename, file: sharedFile };
  }
}

// ── main ─────────────────────────────────────────────────────────────────────
export async function downloadRegisterPdf(
  event: DaaliEvent,
  entries: DaaliEntry[],
  lang: Language,
  onProgress?: (done: number, total: number) => void
): Promise<PdfSaveResult> {
  const [{ jsPDF }] = await Promise.all([import('jspdf')]);
  await loadPdfFonts(lang === 'ur');

  const grandCount = entries.length;
  const grandSum = entries.reduce((a, e) => a + (e.amount || 0), 0);
  const itemCount = entries.filter((e) => e.amount <= 0 && (e.item || '').trim() !== '').length;
  const sheets = chunk(entries, ROWS_PER_SHEET);

  const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();

  for (let i = 0; i < sheets.length; i++) {
    onProgress?.(i, sheets.length);
    const canvas = drawSheet({
      event,
      sheet: sheets[i],
      sheetIndex: i,
      sheetCount: sheets.length,
      serialStart: i * ROWS_PER_SHEET + 1,
      grandCount,
      grandSum,
      itemCount,
      lang,
    });
    const img = canvas.toDataURL('image/jpeg', 0.92);
    if (i > 0) pdf.addPage();
    // poori sheet poori A4 par — koi offset nahi, koi scaling nahi, koi
    // "content andar khiskna" possible hi nahi (sirf addImage 0,0,W,H)
    pdf.addImage(img, 'JPEG', 0, 0, W, H);
    canvas.width = 0; // free memory immediately (phone RAM friendly)
    canvas.height = 0;
  }

  const safeName = (event.name || 'daali')
    .replace(/[\\/:*?"<>|]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 40);
  return await savePdfFile(pdf, `daali-${safeName}-${backupStamp()}.pdf`);
}
