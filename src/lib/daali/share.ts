// ─── WhatsApp sharing — har mehmaan ki apni daali unke number par ───────────
// Receipt text + wa.me deep link. Number ke bina bhi WhatsApp khulta hai
// (contact chooser) — kisi ka bhi, kabhi bhi.

import type { DaaliEntry, DaaliEvent, Language } from './types';
import { formatRupees, isoToDisplayDate, isoToHindiDate } from './format';
import { makeT } from './strings';

/**
 * "94310 12345" / "+91 9431012345" / "09431012345" → wa.me digits.
 * 10 digits = Indian mobile → 91 prefix. 11 digits starting 0 → drop the 0.
 * Pehle se country code wale (12+ digits) ko waise hi rakho.
 */
export function normalizeWaDigits(raw: string): string {
  let d = (raw || '').replace(/\D+/g, '');
  if (!d) return '';
  if (d.length === 10) return '91' + d;
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1);
  return d;
}

/** WhatsApp deep link — number na ho to WhatsApp khud contact maangega */
export function waLink(digits: string, text: string): string {
  const q = encodeURIComponent(text);
  return digits ? `https://wa.me/${digits}?text=${q}` : `https://wa.me/?text=${q}`;
}

/** Ek mehmaan ki daali-rasida — WhatsApp message ke liye ready text */
export function buildDaaliReceipt(event: DaaliEvent, entry: DaaliEntry, lang: Language): string {
  const t = makeT(lang) as (k: string) => string;
  const evDate = event.date
    ? lang === 'hi'
      ? isoToHindiDate(event.date) || isoToDisplayDate(event.date)
      : isoToDisplayDate(event.date)
    : '';

  const head =
    lang === 'en'
      ? `🙏 *Shubh Labh* 🙏\n${event.name}${evDate ? ` — ${evDate}` : ''}`
      : lang === 'ur'
        ? `🙏 *شوبھ لابھ* 🙏\n${event.name}${evDate ? ` — ${evDate}` : ''}`
        : `🙏 *शुभ लाभ* 🙏\n${event.name}${evDate ? ` — ${evDate}` : ''}`;

  const amountLine = entry.amount > 0
    ? lang === 'en'
      ? `Amount: *${formatRupees(entry.amount)}*`
      : lang === 'ur'
        ? `رقم: *${formatRupees(entry.amount)}*`
        : `रकम: *${formatRupees(entry.amount)}*`
    : `${t('itemMode')}: *${entry.item || '—'}*`;

  const who = [entry.village, entry.relationship].filter(Boolean).join(' • ');

  const lines: string[] = [head, ''];
  if (lang === 'en') {
    lines.push(`Dear ${entry.name} ji,`);
    lines.push(`your daali has been recorded in our register:`);
  } else if (lang === 'ur') {
    lines.push(`${entry.name} جی،`);
    lines.push('آپ کی دالی رجسٹر میں درج ہو گئی ہے:');
  } else {
    lines.push(`${entry.name} जी,`);
    lines.push('आपकी दाली रजिस्टर में दर्ज हो गई है:');
  }
  lines.push(amountLine);
  if (who) lines.push(who);
  lines.push('');
  lines.push(
    lang === 'en'
      ? 'Thank you for your blessings! 🌺'
      : lang === 'ur'
        ? 'آپ کی دعاؤں کا بہت بہت شکریہ! 🌺'
        : 'आपके शुभ आशीर्वाद का धन्यवाद! 🌺'
  );
  return lines.join('\n');
}
