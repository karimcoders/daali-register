// ─── Real PDF download — a proper .pdf file, not just the print dialog ──────
// Renders the register as A4 sheets in an off-screen container (inline hex
// styles only — html2canvas cannot parse Tailwind v4's oklch colors), then
// snapshots each sheet with html2canvas and assembles a jsPDF document.
'use client';

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

const PAGE_W = 794; // A4 @96dpi
const PAGE_H = 1123;
const ROWS_PER_SHEET = 20;

// paper palette (hex — html2canvas-safe)
const C = {
  paper: '#fdf9ee',
  ink: '#241c12',
  soft: '#6b5d49',
  red: '#b3402f',
  line: '#d9cba3',
  lineBold: '#4a4030',
};

type TString = ReturnType<typeof makeT> extends (k: infer K) => string ? K : never;

/**
 * html2canvas cannot parse modern CSS color functions (lab()/oklch()/oklab())
 * that Tailwind v4 theme values compute to in Chrome. Instead of mutating the
 * DOM, we temporarily wrap window.getComputedStyle so every value html2canvas
 * reads is already a plain rgb/keyword — 100% parseable, zero visual changes.
 */
const MODERN_COLOR = /lab\(|oklch\(|lch\(|oklab\(|color\(/i;

const SAFE_INK = 'rgb(36, 28, 18)';
const SAFE_TRANSPARENT = 'rgba(0, 0, 0, 0)';

const COLOR_VALUE_PROPS = new Set([
  'color',
  'backgroundColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'outlineColor',
  'textDecorationColor',
  'columnRuleColor',
  'caretColor',
  'WebkitTextStrokeColor',
  'boxShadow',
  'textShadow',
  'backgroundImage',
]);

function safeColorValue(prop: string, raw: string): string {
  if (!raw || !MODERN_COLOR.test(raw)) return raw;
  if (prop === 'boxShadow' || prop === 'textShadow' || prop === 'backgroundImage') return 'none';
  if (prop === 'color' || prop === 'WebkitTextStrokeColor' || prop === 'textDecorationColor') return SAFE_INK;
  return SAFE_TRANSPARENT;
}

type ComputedStyleFn = (el: Element, pseudo?: string | null) => CSSStyleDeclaration;

function installColorSafeComputedStyle(): () => void {
  const w = window as unknown as { getComputedStyle: ComputedStyleFn } & Record<string, unknown>;
  const orig = w.getComputedStyle.bind(w) as ComputedStyleFn;
  const patched: ComputedStyleFn = (el, pseudo) => {
    const cs = orig(el, pseudo ?? undefined);
    return new Proxy(cs, {
      get(target, prop) {
        if (prop === 'getPropertyValue') {
          return (name: string): string => {
            const raw = target.getPropertyValue(name);
            return safeColorValue(String(name), raw);
          };
        }
        if (typeof prop === 'string' && COLOR_VALUE_PROPS.has(prop)) {
          const raw: unknown = (target as unknown as Record<string, unknown>)[prop];
          return typeof raw === 'string' ? safeColorValue(prop, raw) : raw;
        }
        const v = (target as unknown as Record<PropertyKey, unknown>)[prop];
        return typeof v === 'function' ? (v as (...args: unknown[]) => unknown).bind(target) : v;
      },
    }) as CSSStyleDeclaration;
  };
  w.getComputedStyle = patched;
  return () => {
    w.getComputedStyle = orig;
  };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  if (out.length === 0) out.push([]);
  return out;
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text;
  return e;
}

function bodyFont(rtl: boolean): string {
  return rtl ? "'Noto Nastaliq Urdu', serif" : "'Noto Sans Devanagari', sans-serif";
}

function handFont(rtl: boolean): string {
  return rtl ? "'Noto Nastaliq Urdu', serif" : "'Kalam', cursive";
}

function cellPad(el_: HTMLElement, side: 'left' | 'right'): HTMLElement {
  el_.style.paddingLeft = side === 'left' ? '8px' : '2px';
  el_.style.paddingRight = side === 'right' ? '8px' : '2px';
  return el_;
}

function buildSheet(opts: {
  event: DaaliEvent;
  sheet: DaaliEntry[];
  sheetIndex: number;
  sheetCount: number;
  serialStart: number;
  grandCount: number;
  grandSum: number;
  itemCount: number;
  lang: Language;
}): HTMLElement {
  const { event, sheet, sheetIndex, sheetCount, serialStart, grandCount, grandSum, itemCount, lang } = opts;
  const t = makeT(lang) as (k: TString) => string;
  const rtl = lang === 'ur';
  const pageNum = `${t('page')} ${sheetIndex + 1}/${sheetCount}`;

  const page = el('div', {
    width: `${PAGE_W}px`,
    height: `${PAGE_H}px`,
    background: C.paper,
    color: C.ink,
    fontFamily: bodyFont(rtl),
    fontSize: '15px',
    lineHeight: '1.5',
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
    padding: '34px 30px 26px',
    textAlign: rtl ? 'right' : 'left',
  });

  // red margin line (physical side depends on direction) + faint ruled column
  page.appendChild(
    el('div', {
      position: 'absolute',
      top: '0',
      bottom: '0',
      [rtl ? 'right' : 'left']: '64px',
      width: '0px',
      borderRight: `2px solid ${C.red}`,
      opacity: '0.55',
    } as Partial<CSSStyleDeclaration>)
  );
  page.appendChild(
    el('div', {
      position: 'absolute',
      top: '0',
      bottom: '0',
      [rtl ? 'left' : 'right']: '26px',
      width: '0px',
      borderRight: `1.5px solid ${C.red}`,
      opacity: '0.35',
    } as Partial<CSSStyleDeclaration>)
  );

  const inner = el('div', { position: 'relative', [rtl ? 'paddingRight' : 'paddingLeft']: '56px' } as Partial<CSSStyleDeclaration>);
  page.appendChild(inner);

  // header (first sheet only) — like the notebook cover heading
  if (sheetIndex === 0) {
    const head = el('div', { textAlign: 'center', marginBottom: '10px' });
    head.appendChild(
      el(
        'div',
        { fontFamily: handFont(rtl), fontSize: '30px', fontWeight: '700', lineHeight: rtl ? '1.9' : '1.3' },
        t('daaliRegister')
      )
    );
    head.appendChild(el('div', { fontSize: '14px', color: C.soft, marginTop: '4px' }, '―'));
    const meta = el('div', { fontSize: '16px', marginTop: '6px' });
    const dateStr = event.date
      ? `${t('dateLabel')}: ${lang === 'hi' ? isoToHindiDate(event.date) || isoToDisplayDate(event.date) : isoToDisplayDate(event.date)}`
      : '';
    const locStr = event.location ? `${t('villageLabel')}: ${event.location}` : '';
    meta.textContent = [`${t('eventLabel')}: ${event.name}`, dateStr, locStr].filter(Boolean).join('  •  ');
    head.appendChild(meta);
    inner.appendChild(head);
  } else {
    const meta = el('div', { fontSize: '13px', color: C.soft, marginBottom: '8px', textAlign: rtl ? 'left' : 'right' }, `${event.name} — ${pageNum}`);
    inner.appendChild(meta);
  }

  // column header
  const widths = ['7%', '26%', '18%', '14%', '17%', '18%'];
  const cols = [t('colCr'), t('colName'), t('colVillage'), t('colRelation'), t('colAmount'), t('colDate')];
  const headerRow = el('div', {
    display: 'flex',
    borderBottom: `2px solid ${C.lineBold}`,
    paddingBottom: '4px',
    fontWeight: '700',
    fontSize: '14px',
  });
  cols.forEach((c, i) => {
    const d = el('div', { width: widths[i], boxSizing: 'border-box' }, c);
    if (i === 0) d.style.textAlign = 'center';
    else if (i >= 4) d.style.textAlign = rtl ? 'left' : 'right';
    headerRow.appendChild(d);
  });
  inner.appendChild(headerRow);

  // rows — ruled lines, empty rows included so it looks like a register
  const rowH = 40;
  const rowStyle: Partial<CSSStyleDeclaration> = {
    display: 'flex',
    alignItems: 'center',
    borderBottom: `1px solid ${C.line}`,
    height: `${rowH}px`,
    fontSize: '15px',
  };
  const makeRow = (content: ((d: HTMLElement, i: number) => void) | null) => {
    const row = el('div', rowStyle);
    for (let i = 0; i < 6; i++) {
      const d = el('div', { width: widths[i], boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
      if (i === 0) d.style.textAlign = 'center';
      else if (i >= 4) d.style.textAlign = rtl ? 'left' : 'right';
      cellPad(d, rtl ? 'right' : 'left');
      if (content) content(d, i);
      row.appendChild(d);
    }
    return row;
  };

  sheet.forEach((entry, i) => {
    const amt = entryAmountText(entry);
    const dateTxt = entry.date ? isoToDisplayDate(entry.date) : '';
    inner.appendChild(
      makeRow((d, col) => {
        if (col === 0) d.textContent = String(serialStart + i);
        else if (col === 1) {
          d.textContent = entry.name + (entry.note ? ` (${entry.note})` : '');
          d.style.fontWeight = '600';
        } else if (col === 2) d.textContent = entry.village || '—';
        else if (col === 3) d.textContent = entry.relationship || '—';
        else if (col === 4) {
          d.textContent = amt.text;
          d.style.fontWeight = '700';
          if (!amt.cash) {
            d.style.fontFamily = handFont(rtl);
            d.style.color = C.soft;
          }
        } else d.textContent = dateTxt;
      })
    );
  });

  // empty ruled rows so the sheet looks like a real register page
  const emptyRows = Math.max(0, ROWS_PER_SHEET - sheet.length);
  for (let i = 0; i < emptyRows; i++) inner.appendChild(makeRow(null));

  // footer — per-page number, grand total on the last sheet
  const foot = el('div', {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTop: `2px solid ${C.lineBold}`,
    marginTop: '10px',
    paddingTop: '8px',
    fontFamily: handFont(rtl),
    fontWeight: '700',
    fontSize: '17px',
    lineHeight: rtl ? '2' : '1.5',
  });
  foot.appendChild(el('span', { fontSize: '14px', color: C.soft }, pageNum));
  if (sheetIndex === sheetCount - 1) {
    const right = el(
      'span',
      {},
      `${t('totalPeople')}: ${formatNumber(grandCount)}  •  ${t('totalDaali')}: ${formatRupees(grandSum)}` +
        (itemCount > 0 ? `  •  ${t('itemCount')}: ${formatNumber(itemCount)}` : '')
    );
    right.style.textAlign = rtl ? 'left' : 'right';
    foot.appendChild(right);
  } else {
    foot.appendChild(el('span', {}));
  }
  inner.appendChild(foot);

  return page;
}

export async function downloadRegisterPdf(
  event: DaaliEvent,
  entries: DaaliEntry[],
  lang: Language,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const [{ jsPDF }, html2canvasMod] = await Promise.all([import('jspdf'), import('html2canvas')]);
  const html2canvas = html2canvasMod.default;
  const t = makeT(lang);

  const grandCount = entries.length;
  const grandSum = entries.reduce((a, e) => a + (e.amount || 0), 0);
  const itemCount = entries.filter((e) => e.amount <= 0 && (e.item || '').trim() !== '').length;

  const sheets = chunk(entries, ROWS_PER_SHEET);
  const container = document.createElement('div');
  container.setAttribute('aria-hidden', 'true');
  Object.assign(container.style, {
    position: 'fixed',
    top: '0',
    left: '-10000px',
    width: `${PAGE_W}px`,
    zIndex: '-1',
    background: C.paper,
  } as Partial<CSSStyleDeclaration>);

  sheets.forEach((sheet, si) => {
    container.appendChild(
      buildSheet({
        event,
        sheet,
        sheetIndex: si,
        sheetCount: sheets.length,
        serialStart: si * ROWS_PER_SHEET + 1,
        grandCount,
        grandSum,
        itemCount,
        lang,
      })
    );
  });
  document.body.appendChild(container);

  // Every value html2canvas reads through getComputedStyle is now parseable —
  // no DOM mutation needed.
  const restoreComputedStyle = installColorSafeComputedStyle();

  try {
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4', compress: true });
    const W = pdf.internal.pageSize.getWidth();
    const H = pdf.internal.pageSize.getHeight();
    for (let i = 0; i < sheets.length; i++) {
      onProgress?.(i, sheets.length);
      const source = container.children[i] as HTMLElement;
      const canvas = await html2canvas(source, {
        scale: 2,
        backgroundColor: C.paper,
        useCORS: true,
        logging: false,
        windowWidth: PAGE_W,
      });
      const img = canvas.toDataURL('image/jpeg', 0.93);
      if (i > 0) pdf.addPage();
      pdf.addImage(img, 'JPEG', 0, 0, W, H);
    }
    const safeName = (event.name || 'daali')
      .replace(/[\\/:*?"<>|]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .slice(0, 40);
    pdf.save(`daali-${safeName}-${backupStamp()}.pdf`);
  } finally {
    container.remove();
    restoreComputedStyle();
  }
  void t;
}
