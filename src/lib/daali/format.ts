// ─── Formatting helpers — Indian style ──────────────────────────────────────

const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** 1001 → "1,001" (Indian lakh/crore grouping) */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return inrFormatter.format(Math.round(n));
}

/** 1001 → "₹1,001" */
export function formatRupees(n: number): string {
  return '₹' + formatNumber(n);
}

/** Amount text typed by user → digits only (max 9 digits) */
export function sanitizeAmountInput(raw: string): string {
  const digits = raw.replace(/[^0-9]/g, '');
  return digits.slice(0, 9);
}

/** ISO yyyy-mm-dd → dd/mm/yyyy */
export function isoToDisplayDate(iso: string): string {
  if (!iso) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/** Today as ISO yyyy-mm-dd (local time) */
export function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

const HI_MONTHS = [
  'जनवरी', 'फरवरी', 'मार्च', 'अप्रैल', 'मई', 'जून',
  'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर',
];

/** ISO → "3 अक्टूबर 2026" (Hindi natural date) */
export function isoToHindiDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  if (!m) return '';
  const day = parseInt(m[3], 10);
  const month = parseInt(m[2], 10) - 1;
  if (month < 0 || month > 11) return iso;
  return `${day} ${HI_MONTHS[month]} ${m[1]}`;
}

/** Normalize name for duplicate detection */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Safe file name for exports */
export function backupStamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** Trigger a client-side file download */
export function downloadFile(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
