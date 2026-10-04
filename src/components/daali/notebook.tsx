'use client';

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useDaali, sortEntries } from '@/lib/daali/store';
import {
  countItemEntries,
  entryAmountText,
  formatNumber,
  formatRupees,
  isoToDisplayDate,
  isArabicText,
} from '@/lib/daali/format';
import type { DaaliEntry, DaaliEvent, Language } from '@/lib/daali/types';
import { buildDaaliReceipt, normalizeWaDigits, waLink } from '@/lib/daali/share';
import { useT } from './use-t';
import { WritingRow, EntryEditRow, type EditCell } from './inline-entry';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  History,
  MessageCircle,
  MoreVertical,
  Pencil,
  Printer,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Dynamic rows-per-page: pages feel like a real register on every screen size.
// ⚠️ keyboard-shrink guard: phone par keyboard khulte hi innerHeight girta hai
// aur resize fire hota hai — pehle ye rows-per-page ko chhota kar deta tha,
// jisse page ka hisaab bigad jata tha aur auto page-turn toot jata tha.
// Isliye: sirf WIDTH change ya height BADHNE par recompute — shrink ignore.
function useRowsPerPage(): number {
  const [rows, setRows] = useState(8);
  useEffect(() => {
    let lastW = 0;
    let lastH = 0;
    const compute = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      const widthChanged = lastW !== 0 && Math.abs(w - lastW) > 2;
      const grew = h > lastH;
      if (lastH !== 0 && !widthChanged && !grew) return; // keyboard shrink — ignore
      lastW = w;
      lastH = h;
      const rowH = w >= 640 ? 50 : 46;
      const overhead = w >= 640 ? 385 : 360;
      const n = Math.floor((h - overhead) / rowH);
      setRows(Math.min(18, Math.max(6, n)));
    };
    compute();
    window.addEventListener('resize', compute);
    window.addEventListener('orientationchange', compute);
    return () => {
      window.removeEventListener('resize', compute);
      window.removeEventListener('orientationchange', compute);
    };
  }, []);
  return rows;
}

// register grid — 6 columns (आख़िरी पतली column: WhatsApp share — हर मेहमान की
// दाली उनके नंबर पर भेजी जा सकती है; तारीख़ column बहुत पहले हटी थी)
const GRID = 'grid grid-cols-[2rem_1fr_5.2rem_1.9rem] sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6.5rem_2.1rem]';

// असली पलटने की अवधि (leaf-turn animation 0.78s) — safety timeout इससे थोड़ा आगे
const FLIP_MS = 780;

interface NotebookProps {
  onRenameEvent: () => void;
  onDeleteEvent: () => void;
  onPrint: () => void;
  onPdf: () => void;
  onHistory: () => void;
}

// ─── शीर्षक की जानकारी — tap करो, वहीं pen चल जाती है (कोई popup नहीं) ─────────
function HeaderField({
  value,
  display,
  onSave,
  type = 'text',
  ariaLabel,
}: {
  value: string;
  /** what the paper shows (e.g. formatted date) — defaults to value */
  display?: string;
  onSave: (v: string) => void;
  type?: 'text' | 'date';
  ariaLabel: string;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (v !== value) onSave(v);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type={type}
        value={draft}
        aria-label={ariaLabel}
        className="cell-input !w-auto max-w-full rounded font-hand text-base font-bold"
        style={{ minWidth: type === 'date' ? '9.5rem' : '4ch' }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            setEditing(false);
          }
        }}
      />
    );
  }
  return (
    <span
      className="paper-blank cursor-text font-hand font-bold decoration-ink/25 underline-offset-4 hover:underline"
      role="button"
      tabIndex={0}
      title={t('headerEditHint')}
      aria-label={`${ariaLabel}: ${display ?? value}`}
      onClick={start}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          start();
        }
      }}
    >
      {display ?? (value || '\u00A0')}
    </span>
  );
}

export function Notebook({ onRenameEvent, onDeleteEvent, onPrint, onPdf, onHistory }: NotebookProps) {
  const t = useT();
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const currentEventId = useDaali((s) => s.currentEventId);
  const currentPage = useDaali((s) => s.currentPage);
  const setPage = useDaali((s) => s.setPage);
  const goHome = useDaali((s) => s.goHome);
  const highlightId = useDaali((s) => s.highlightId);
  const settings = useDaali((s) => s.settings);
  const setInputScript = useDaali((s) => s.setInputScript);
  const updateEvent = useDaali((s) => s.updateEvent);

  const rowsPerPage = useRowsPerPage();
  // असली notebook पलटना — palatte waqt ek pann (leaf) ghoomta hai:
  // front = purani page ka snapshot, back = khaali ruled paper, neeche nayi page
  const [flipState, setFlipState] = useState<{ dir: 'next' | 'prev'; from: number; to: number } | null>(null);
  const flipTimer = useRef<number | null>(null);
  const beginFlip = useCallback(
    (dir: 'next' | 'prev', from: number, to: number) => {
      if (!settings.pageAnimation) return;
      setFlipState({ dir, from, to });
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
      flipTimer.current = window.setTimeout(() => setFlipState(null), FLIP_MS + 220);
    },
    [settings.pageAnimation]
  );
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; cell: EditCell } | null>(null);
  const [writeSignal, setWriteSignal] = useState(0);
  // khali filler line par click → likhai ki line WAHIN chali jati hai (line 5, 6… kahin bhi)
  const [writeAtFiller, setWriteAtFiller] = useState<number | null>(null);
  // WhatsApp share strip — jis line ke neeche khula hai (number ke bina strip, number ke saath seedha bhejna)
  const [shareFor, setShareFor] = useState<string | null>(null);
  // pehli baar ek chhota hint — "kahin bhi tap karke likh/sudhar sakte ho"
  const [showHint, setShowHint] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      return !window.localStorage.getItem('daali-edit-hint-v1');
    } catch {
      return false;
    }
  });
  const dismissHint = () => {
    setShowHint(false);
    try {
      window.localStorage.setItem('daali-edit-hint-v1', '1');
    } catch {
      /* ignore */
    }
  };

  const event = events.find((e) => e.id === currentEventId);

  const sorted = useMemo(
    () => sortEntries(allEntries.filter((e) => e.eventId === currentEventId), settings.sortMode),
    [allEntries, currentEventId, settings.sortMode]
  );

  const total = sorted.length;
  // +1: the next empty line (writing slot) counts as a page content line —
  // jaise asli register mein agli khali line hamesha hoti hai
  const pageCount = Math.max(1, Math.ceil((total + 1) / rowsPerPage));
  const page = Math.min(currentPage, pageCount);
  const startIdx = (page - 1) * rowsPerPage;
  const pageEntries = sorted.slice(startIdx, startIdx + rowsPerPage);
  const writingPage = Math.floor(total / rowsPerPage) + 1; // page holding the writing slot
  const writingHere = writingPage === page;
  // likhai ki line IS map ke andar slot par render hoti hai — pehle use dobara
  // minus kar diya jata tha jisse page-ke-aakhri line se pehle hi writing line
  // gayab ho jati thi (page bharte hi nayi line aaana band → auto-turn toot gaya)
  const fillerCount = rowsPerPage - pageEntries.length;

  const pageSum = useMemo(() => pageEntries.reduce((a, e) => a + (e.amount || 0), 0), [pageEntries]);
  const totalSum = useMemo(() => sorted.reduce((a, e) => a + (e.amount || 0), 0), [sorted]);
  const itemCount = useMemo(() => countItemEntries(sorted), [sorted]);
  const cashCount = useMemo(() => sorted.filter((e) => e.amount > 0).length, [sorted]);
  const avg = cashCount > 0 ? Math.round(totalSum / cashCount) : 0;

  // Detect newly added entries → write-in animation
  useLayoutEffect(() => {
    if (firstRender.current) {
      knownIds.current = new Set(allEntries.map((e) => e.id));
      firstRender.current = false;
      return;
    }
    const fresh = allEntries.filter((e) => !knownIds.current.has(e.id));
    if (fresh.length) {
      for (const f of fresh) knownIds.current.add(f.id);
      setNewIds(new Set(fresh.map((f) => f.id)));
      const timer = setTimeout(() => setNewIds(new Set()), 500);
      return () => clearTimeout(timer);
    }
  }, [allEntries]);

  const turn = useCallback(
    (dir: 'next' | 'prev') => {
      const target = dir === 'next' ? page + 1 : page - 1;
      if (target < 1 || target > pageCount) return;
      setEditing(null);
      setShareFor(null);
      setPage(target);
      beginFlip(dir, page, target);
    },
    [page, pageCount, setPage, beginFlip]
  );

  const jumpTo = useCallback(
    (n: number) => {
      const target = Math.min(Math.max(1, n), pageCount);
      if (target !== page) {
        setEditing(null);
        setShareFor(null);
        setPage(target);
        beginFlip(target > page ? 'next' : 'prev', page, target);
      }
    },
    [page, pageCount, setPage, beginFlip]
  );

  // kahin bhi khali line par click → wahin pen rakh do (writing line par le jao)
  const focusWriting = useCallback(() => {
    setEditing(null);
    setWriteAtFiller(null);
    if (writingPage !== page) {
      setPage(writingPage);
      beginFlip(writingPage > page ? 'next' : 'prev', page, writingPage);
      // pann aadha palatne tak pen ready — speed feel deti hai
      setTimeout(() => setWriteSignal((v) => v + 1), settings.pageAnimation ? 560 : 40);
    } else {
      setWriteSignal((v) => v + 1);
    }
  }, [writingPage, page, setPage, beginFlip, settings.pageAnimation]);

  // ＋ button (bottom nav / top bar) → jump to the writing line and start writing.
  // Arrives as a window event so state updates happen in a callback, not in an effect body.
  useEffect(() => {
    const onWriteFocus = () => focusWriting();
    window.addEventListener('daali:write-focus', onWriteFocus);
    return () => window.removeEventListener('daali:write-focus', onWriteFocus);
  }, [focusWriting]);

  // after a line is written: if the writing slot left this page, palat to the
  // next page automatically. Fresh totals come from the store (closure-stale
  // pageEntries pe bharosa nahi) aur pen HAMESHA agli likhai line par ready.
  const onCommitted = useCallback(() => {
    setWriteAtFiller(null); // likh gayi → pen wapas pehli khali line par
    const st = useDaali.getState();
    const newTotal = st.allEntries.filter((e) => e.eventId === st.currentEventId).length;
    const wp = Math.floor(newTotal / rowsPerPage) + 1; // page holding the writing slot now
    if (wp !== page && wp <= Math.ceil((newTotal + 1) / rowsPerPage)) {
      // page bhar gaya → ASLI COPY KI TARAH PALAT JAATA HAI
      setPage(wp);
      beginFlip('next', page, wp);
      setTimeout(() => setWriteSignal((v) => v + 1), settings.pageAnimation ? 560 : 40);
    } else {
      // page adha bhara tha — pen agli khali line par turant ready
      // (filler line se likha ho to bhi row remount hoke yahin sulakti hai)
      setTimeout(() => setWriteSignal((v) => v + 1), 40);
    }
  }, [rowsPerPage, page, setPage, beginFlip, settings.pageAnimation]);

  // Keyboard page turning
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowRight') turn('next');
      if (e.key === 'ArrowLeft') turn('prev');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [turn]);

  // Swipe (mobile) — like palat-ing a page
  const onTouchStart = (e: React.TouchEvent) => {
    const tch = e.touches[0];
    touch.current = { x: tch.clientX, y: tch.clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (!touch.current) return;
    const tch = e.changedTouches[0];
    const dx = tch.clientX - touch.current.x;
    const dy = tch.clientY - touch.current.y;
    touch.current = null;
    if (Math.abs(dx) > 65 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      turn(dx < 0 ? 'next' : 'prev');
    }
  };

  const rtl = settings.language === 'ur';

  // pann (leaf) ka content — palatne waqt upar ghoomta hua page
  const leafPage = flipState ? (flipState.dir === 'next' ? flipState.from : flipState.to) : null;

  const scriptOptions: Array<{ v: 'hi' | 'ur' | 'off'; label: string }> = [
    { v: 'hi', label: t('scriptHi') },
    { v: 'ur', label: t('scriptUr') },
    { v: 'off', label: t('scriptEn') },
  ];

  if (!event) return null;

  return (
    <div className="flex h-full flex-col">
      {/* ── top bar ── */}
      <div className="no-print flex items-center gap-1.5 px-2 pt-2 sm:gap-2 sm:px-6">
        <button
          className="ghost-ink-btn flex h-10 w-10 shrink-0 items-center justify-center !border-ink/25"
          onClick={goHome}
          aria-label={t('goBack')}
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-hand text-xl font-bold text-ink">{event.name}</div>
        </div>
        {/* writing script: हिं / اردو / Aa */}
        <div
          className="flex h-10 shrink-0 items-center overflow-hidden rounded-md border border-ink/25"
          role="group"
          aria-label={t('scriptLabel')}
          title={t('scriptHint')}
        >
          {scriptOptions.map((o) => (
            <button
              key={o.v}
              className={`h-full px-2 text-[15px] font-bold transition-colors ${
                settings.inputScript === o.v
                  ? 'bg-ink text-[#f7f2e2]'
                  : 'text-ink hover:bg-ink/[0.07]'
              }`}
              onClick={() => setInputScript(o.v)}
              aria-pressed={settings.inputScript === o.v}
              aria-label={`${t('scriptLabel')}: ${o.label}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <button
          className="ghost-ink-btn flex h-10 w-10 shrink-0 items-center justify-center !border-ink/25"
          onClick={onPdf}
          aria-label={t('pdfDownload')}
          title={t('pdfDownload')}
        >
          <FileDown className="h-5 w-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ghost-ink-btn flex h-10 w-10 shrink-0 items-center justify-center !border-ink/25"
              aria-label={t('navMore')}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border">
            <DropdownMenuItem onClick={onRenameEvent}>
              <Pencil className="h-4 w-4" /> {t('renameEvent')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPdf}>
              <FileDown className="h-4 w-4" /> {t('pdfDownload')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onHistory}>
              <History className="h-4 w-4" /> {t('viewHistory')}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onPrint}>
              <Printer className="h-4 w-4" /> {t('printPdf')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onDeleteEvent} className="text-destructive focus:text-destructive">
              <Trash2 className="h-4 w-4" /> {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* ── tap-to-edit hint (first visit only) ── */}
      {showHint && (
        <div className="no-print mx-2 mt-1 flex items-center gap-2 rounded-md border border-dashed border-ink/30 bg-[var(--paper-2)] px-3 py-1.5 sm:mx-6">
          <Pencil className="h-4 w-4 shrink-0 text-margin-red" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-soft">{t('editHint')}</p>
          <button type="button" className="chip h-7 shrink-0 px-2 text-[12px]" onClick={dismissHint}>
            {t('editHintOk')}
          </button>
        </div>
      )}

      {/* ── scrollable register area ── */}
      <div
        className="no-print flex flex-1 items-start justify-center overflow-y-auto px-2 py-2 sm:px-6 sm:py-3"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div className="flip-stage relative flex min-h-full w-full max-w-3xl flex-col">
        <div
          key={page}
          className="paper flex min-h-full w-full flex-col pb-2"
          role="region"
          aria-label={`${t('daaliRegister')} — ${event.name}`}
        >
          <div className="paper-spine" />
          <div className="paper-margin" />

          {/* page number */}
          <div className="absolute end-3 top-2 font-hand text-xs text-ink-soft">
            {t('page')} {page}
          </div>

          {/* header — like a real register heading */}
          <header className="px-4 pt-3 text-center sm:px-8">
            <h1 className="font-hand text-2xl font-bold text-ink sm:text-3xl">{t('daaliRegister')}</h1>
            <div className="mx-auto mt-0.5 mb-1 h-px w-40 bg-ink/20" />
            <div className="mt-2 text-[15px] leading-7 sm:mt-3">
              <div className="text-ink">
                <span className="text-ink-soft">{t('eventLabel')}: </span>
                <HeaderField
                  value={event.name}
                  ariaLabel={t('eventLabel')}
                  onSave={(v) => {
                    updateEvent(event.id, { name: v });
                    toast.success(t('updatedToast'), { duration: 1200 });
                  }}
                />
              </div>
              <div className="mt-0.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <div className="text-start sm:text-end">
                  <span className="text-ink-soft">{t('dateLabel')}: </span>
                  <HeaderField
                    type="date"
                    value={event.date}
                    display={event.date ? isoToDisplayDate(event.date) : ''}
                    ariaLabel={t('dateLabel')}
                    onSave={(v) => {
                      updateEvent(event.id, { date: v });
                      toast.success(t('updatedToast'), { duration: 1200 });
                    }}
                  />
                </div>
                <div className="text-start">
                  <span className="text-ink-soft">{t('villageLabel')}: </span>
                  <HeaderField
                    value={event.location}
                    ariaLabel={t('villageLabel')}
                    onSave={(v) => {
                      updateEvent(event.id, { location: v });
                      toast.success(t('updatedToast'), { duration: 1200 });
                    }}
                  />
                </div>
              </div>
            </div>
          </header>

          {/* register rows — likha hua + agli khali line, sab seedha line par */}
          <div className="register-rows mt-3 flex-1">
            {/* column header */}
            <div className={`${GRID} border-b-2 border-ink/50 pb-1 text-[13px] font-bold text-ink`}>
              <div className="text-center">{t('colCr')}</div>
              <div>{t('colName')}</div>
              <div className="hidden sm:block">{t('colVillage')}</div>
              <div className="hidden sm:block">{t('colRelation')}</div>
              <div className="text-end">{t('colAmount')}</div>
            </div>

            {total === 0 && page === 1 && (
              <p className="px-1 pb-1 pt-2 text-center font-hand text-[15px] leading-snug text-ink-soft/75">
                {t('firstLineHint')}
              </p>
            )}

            {pageEntries.map((entry, i) =>
              editing?.id === entry.id ? (
                <EntryEditRow
                  key={entry.id}
                  entry={entry}
                  serial={startIdx + i + 1}
                  script={settings.inputScript}
                  focusCell={editing.cell}
                  onDone={() => setEditing((cur) => (cur && cur.id === entry.id ? null : cur))}
                />
              ) : (
                <RegisterRow
                  key={entry.id}
                  entry={entry}
                  serial={startIdx + i + 1}
                  isNew={newIds.has(entry.id)}
                  isHighlight={highlightId === entry.id}
                  event={event}
                  lang={settings.language}
                  shareOpen={shareFor === entry.id}
                  onToggleShare={() =>
                    setShareFor((cur) => {
                      const next = cur === entry.id ? null : entry.id;
                      // share khula → editing band (ek waqt mein ek hi pen)
                      if (next) setEditing(null);
                      return next;
                    })
                  }
                  onEditCell={(cell) => {
                    setShareFor(null);
                    setEditing({ id: entry.id, cell });
                  }}
                />
              )
            )}

            {/* khali ruled lines — likhai ki line pehli khali line par hoti hai;
                koi bhi khali line par click karo → pen WAHIN chala jata hai */}
            {Array.from({ length: Math.max(0, fillerCount) }).map((_, i) => {
              if (!writingHere) {
                return <FillerRow key={`filler-${page}-${i}`} onClick={focusWriting} label={t('writeHere')} />;
              }
              const slotK = writeAtFiller ?? 0;
              if (i === slotK) {
                return (
                  <WritingRow
                    key={`write-${page}-${slotK}`}
                    serial={total + 1}
                    script={settings.inputScript}
                    focusSignal={writeSignal}
                    onCommitted={onCommitted}
                    onCancel={() => setWriteAtFiller(null)}
                    autoStart={slotK > 0}
                  />
                );
              }
              return (
                <FillerRow
                  key={`filler-${page}-${i}`}
                  onClick={() => setWriteAtFiller(i)}
                  label={t('writeHere')}
                />
              );
            })}
          </div>

          {/* totals — printed inside the register */}
          <footer className="mt-2 px-4 pb-1 sm:px-8">
            <div className="border-t-2 border-ink/60 pt-2 text-center">
              <div className="font-hand text-xl font-bold text-ink sm:text-2xl">
                {t('totalPeople')}: {formatNumber(total)}
                <span className="mx-2 text-margin-red">•</span>
                {t('totalDaali')}: {formatRupees(totalSum)}
                {itemCount > 0 && (
                  <>
                    <span className="mx-2 text-margin-red">•</span>
                    {t('itemCount')}: {formatNumber(itemCount)}
                  </>
                )}
              </div>
              <div className="mt-0.5 flex items-center justify-center gap-4 text-xs text-ink-soft">
                <span>
                  {t('pageTotal')}: {pageEntries.length} • {formatRupees(pageSum)}
                </span>
                {total > 0 && (
                  <span>
                    {t('average')}: {formatRupees(avg)}
                  </span>
                )}
              </div>
            </div>
          </footer>
        </div>

        {/* ── असली पलटना: pann (leaf) ghoom kar nayi page kholti hai ── */}
        {flipState && leafPage !== null && (
          <>
            <div className={`leaf-drop ${rtl ? 'leaf-drop-rtl' : ''}`} aria-hidden="true" />
            <div
              className={`flip-leaf ${flipState.dir} ${rtl ? 'leaf-rtl' : ''}`}
              aria-hidden="true"
              onAnimationEnd={(e) => {
                if (e.target === e.currentTarget) setFlipState(null);
              }}
            >
              <div className="leaf-face">
                <div className="paper flex h-full w-full flex-col overflow-hidden pb-2">
                  <LeafPageContent
                    event={event}
                    lang={settings.language}
                    page={leafPage}
                    rowsPerPage={rowsPerPage}
                    sorted={sorted}
                    total={total}
                    totalSum={totalSum}
                    itemCount={itemCount}
                  />
                </div>
              </div>
              <div className="leaf-face leaf-face-back">
                <div className="leaf-back-paper" />
              </div>
              <div className={`leaf-shade ${rtl ? 'leaf-shade-rtl' : ''}`} />
            </div>
          </>
        )}
        </div>
      </div>

      {/* ── page controls ── */}
      <div className="no-print flex items-center justify-center gap-2 px-3 pb-2 sm:gap-3">
        <button
          className="ghost-ink-btn flex h-11 w-11 items-center justify-center !border-ink/30"
          onClick={() => turn('prev')}
          disabled={page <= 1}
          aria-label={t('goBack')}
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-1.5 font-hand text-base text-ink">
          <span>{t('page')}</span>
          <input
            type="number"
            inputMode="numeric"
            className="h-9 w-14 rounded border border-ink/30 bg-transparent text-center font-hand text-base text-ink outline-none focus:border-margin-red"
            value={page}
            min={1}
            max={pageCount}
            aria-label={`${t('page')} — 1..${pageCount}`}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) jumpTo(n);
            }}
          />
          <span>/ {pageCount}</span>
        </div>
        <button
          className="ghost-ink-btn flex h-11 w-11 items-center justify-center !border-ink/30"
          onClick={() => turn('next')}
          disabled={page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

function RegisterRow({
  entry,
  serial,
  isNew,
  isHighlight,
  event,
  lang,
  shareOpen,
  onToggleShare,
  onEditCell,
}: {
  entry: DaaliEntry;
  serial: number;
  isNew: boolean;
  isHighlight: boolean;
  event: DaaliEvent;
  lang: Language;
  shareOpen: boolean;
  onToggleShare: () => void;
  onEditCell: (cell: EditCell) => void;
}) {
  const t = useT();
  const amt = entryAmountText(entry);

  // number pehle se saved hai → seedha WhatsApp khol do (ek hi tap)
  const shareNow = () => {
    const digits = normalizeWaDigits(entry.phone || '');
    const url = waLink(digits, buildDaaliReceipt(event, entry, lang));
    window.open(url, '_blank', 'noopener');
    toast.success(t('whatsappOpening'), { duration: 1600 });
  };
  const onShareTap = () => {
    if (entry.phone) shareNow();
    else onToggleShare();
  };

  return (
    <div
      className={`ruled-row ${GRID} cursor-text items-center text-[15px] text-ink ${
        isNew ? 'animate-write-in' : ''
      } ${isHighlight ? 'highlight-flash' : ''} hover:bg-ink/[0.045] active:bg-ink/[0.08] ${
        shareOpen ? 'bg-ink/[0.03]' : ''
      }`}
      onClick={() => onEditCell('name')}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEditCell('name');
        }
      }}
      aria-label={`${entry.name}, ${amt.text}`}
    >
      <div className="text-center text-[13px] text-ink-soft">{String(serial).padStart(2, '0')}</div>
      <div
        className="min-w-0 px-0.5 py-1"
        onClick={(e) => {
          e.stopPropagation();
          onEditCell('name');
        }}
      >
        <div className={`truncate font-semibold leading-tight ${isArabicText(entry.name) ? 'urdu-text' : ''}`}>
          {entry.name}
          {entry.note && (
            <span className="ml-1 text-xs text-ink-soft" title={entry.note}>
              ✎
            </span>
          )}
        </div>
        <div className={`truncate text-xs leading-tight text-ink-soft sm:hidden ${isArabicText(entry.village) || isArabicText(entry.relationship) ? 'urdu-text' : ''}`}>
          {/* गाँव/रिश्ता अलग-अलग tap — jaise copy mein kisi bhi word par pen rakhte hain */}
          {entry.village ? (
            <span
              role="button"
              className="active:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onEditCell('village');
              }}
            >
              {entry.village}
            </span>
          ) : null}
          {entry.village && entry.relationship ? ' • ' : ''}
          {entry.relationship ? (
            <span
              role="button"
              className="active:text-ink"
              onClick={(e) => {
                e.stopPropagation();
                onEditCell('relation');
              }}
            >
              {entry.relationship}
            </span>
          ) : null}
          {!entry.village && !entry.relationship ? '\u00A0' : ''}
        </div>
      </div>
      <div
        className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.village) ? 'urdu-text' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onEditCell('village');
        }}
      >
        {entry.village || '—'}
      </div>
      <div
        className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.relationship) ? 'urdu-text' : ''}`}
        onClick={(e) => {
          e.stopPropagation();
          onEditCell('relation');
        }}
      >
        {entry.relationship || '—'}
      </div>
      <div
        className="px-0.5 text-end"
        title={amt.cash ? undefined : t('itemMode')}
        onClick={(e) => {
          e.stopPropagation();
          onEditCell('amount');
        }}
      >
        {amt.cash ? (
          <span className="font-bold tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {amt.text}
          </span>
        ) : (
          <span className={`inline-block max-w-full truncate font-hand text-[15px] text-ink-soft ${isArabicText(amt.text) ? 'urdu-text' : ''}`}>
            🎁 {amt.text}
          </span>
        )}
      </div>
      {/* WhatsApp — har mehmaan ki daali unke mobile par */}
      <div className="flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="flex h-8 w-8 items-center justify-center rounded-full text-[#25D366]/60 transition-colors hover:bg-[#25D366]/10 hover:text-[#1da851] active:text-[#1da851]"
          onClick={onShareTap}
          aria-label={`${t('shareWhatsapp')}: ${entry.name}`}
          title={entry.phone ? `${t('shareWhatsapp')} — ${entry.phone}` : t('phoneLabel')}
        >
          <MessageCircle className="h-[1.15rem] w-[1.15rem]" />
        </button>
      </div>

      {/* number nahi tha → wahin neeche chhota phone strip khula (koi popup nahi) */}
      {shareOpen && (
        <ShareStrip
          entry={entry}
          event={event}
          lang={lang}
          onClose={onToggleShare}
        />
      )}
      {/* तारीख़ column hati — date sirf history/backup mein rehti hai */}
    </div>
  );
}

// WhatsApp share strip — line ke neeche hi khulta hai: number likho → भेजें
function ShareStrip({
  entry,
  event,
  lang,
  onClose,
}: {
  entry: DaaliEntry;
  event: DaaliEvent;
  lang: Language;
  onClose: () => void;
}) {
  const t = useT();
  const setEntryPhone = useDaali((s) => s.setEntryPhone);
  const [phone, setPhone] = useState(entry.phone || '');

  const send = () => {
    const digits = normalizeWaDigits(phone);
    const url = waLink(digits, buildDaaliReceipt(event, entry, lang));
    // pehle WhatsApp kholo (user-gesture chain tootna nahi chahiye), phir save
    window.open(url, '_blank', 'noopener');
    void setEntryPhone(entry.id, phone).then(() => {
      toast.success(t('numberSavedToast'), { duration: 1400 });
    });
    toast.success(t('whatsappOpening'), { duration: 1600 });
    onClose();
  };

  return (
    <div className="col-span-full flex flex-wrap items-center gap-1.5 pb-1.5 pt-0.5">
      <span className="text-base" aria-hidden="true">
        💬
      </span>
      <input
        className="cell-input min-w-0 flex-1 text-[14px]"
        placeholder={t('phonePh')}
        value={phone}
        inputMode="tel"
        autoComplete="off"
        autoFocus
        aria-label={t('phoneLabel')}
        onChange={(e) => setPhone(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            send();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
          }
        }}
      />
      <button
        type="button"
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-[#25D366]/60 bg-[#25D366]/15 px-3 text-[15px] font-bold text-[#15703a] hover:bg-[#25D366]/25"
        onClick={send}
      >
        <MessageCircle className="h-4 w-4" />
        {t('sendWhatsapp')}
      </button>
      <button
        type="button"
        className="ghost-ink-btn flex h-9 w-9 shrink-0 items-center justify-center !border-ink/25"
        onClick={onClose}
        aria-label={t('cancel')}
        title={t('cancel')}
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// khali ruled line — click karne par pen isi line par aa jata hai
function FillerRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <div
      role="button"
      tabIndex={-1}
      aria-label={label}
      className={`ruled-row ${GRID} cursor-text items-center hover:bg-ink/[0.035]`}
      onClick={onClick}
    >
      <div />
      <div />
      <div className="hidden sm:block" />
      <div className="hidden sm:block" />
      <div />
      <div />
    </div>
  );
}

// ─── पन्ने का STATIC snapshot — पलटते हुए pann (leaf) ke upar dikhta hai ────
// Read-only: koi input, koi share strip nahi — bilkul wahi paper look, sirf
// namma ke liye. Palatne ki 0.78s mein yahi content ghoomta dikhta hai.
function LeafPageContent({
  event,
  lang,
  page,
  rowsPerPage,
  sorted,
  total,
  totalSum,
  itemCount,
}: {
  event: DaaliEvent;
  lang: Language;
  page: number;
  rowsPerPage: number;
  sorted: DaaliEntry[];
  total: number;
  totalSum: number;
  itemCount: number;
}) {
  const t = useT();
  const startIdx = (page - 1) * rowsPerPage;
  const pageEntries = sorted.slice(startIdx, startIdx + rowsPerPage);
  const fillerCount = Math.max(0, rowsPerPage - pageEntries.length);
  const pageSum = pageEntries.reduce((a, e) => a + (e.amount || 0), 0);
  const cashTotal = sorted.filter((e) => e.amount > 0).length;
  const avg = cashTotal > 0 ? Math.round(totalSum / cashTotal) : 0;

  return (
    <>
      <div className="paper-spine" />
      <div className="paper-margin" />

      <div className="absolute end-3 top-2 font-hand text-xs text-ink-soft">
        {t('page')} {page}
      </div>

      <header className="px-4 pt-3 text-center sm:px-8">
        {page === 1 ? (
          <>
            <h1 className="font-hand text-2xl font-bold text-ink sm:text-3xl">{t('daaliRegister')}</h1>
            <div className="mx-auto mt-0.5 mb-1 h-px w-40 bg-ink/20" />
            <div className="mt-2 text-[15px] leading-7 sm:mt-3">
              <div className="text-ink">
                <span className="text-ink-soft">{t('eventLabel')}: </span>
                <span className="font-hand font-bold">{event.name}</span>
              </div>
              <div className="mt-0.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <div className="text-start sm:text-end">
                  <span className="text-ink-soft">{t('dateLabel')}: </span>
                  <span className="font-hand font-bold">{event.date ? isoToDisplayDate(event.date) : ''}</span>
                </div>
                <div className="text-start">
                  <span className="text-ink-soft">{t('villageLabel')}: </span>
                  <span className="font-hand font-bold">{event.location}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="pt-1 text-end text-xs text-ink-soft">{event.name}</div>
        )}
      </header>

      <div className="register-rows mt-3 flex-1">
        <div className={`${GRID} border-b-2 border-ink/50 pb-1 text-[13px] font-bold text-ink`}>
          <div className="text-center">{t('colCr')}</div>
          <div>{t('colName')}</div>
          <div className="hidden sm:block">{t('colVillage')}</div>
          <div className="hidden sm:block">{t('colRelation')}</div>
          <div className="text-end">{t('colAmount')}</div>
        </div>

        {pageEntries.map((entry, i) => {
          const amt = entryAmountText(entry);
          const sub = [entry.village, entry.relationship].filter(Boolean).join(' • ');
          return (
            <div key={entry.id} className={`ruled-row ${GRID} items-center text-[15px] text-ink`}>
              <div className="text-center text-[13px] text-ink-soft">{String(startIdx + i + 1).padStart(2, '0')}</div>
              <div className="min-w-0 px-0.5 py-1">
                <div className={`truncate font-semibold leading-tight ${isArabicText(entry.name) ? 'urdu-text' : ''}`}>
                  {entry.name}
                  {entry.note && <span className="ml-1 text-xs text-ink-soft">✎</span>}
                </div>
                <div
                  className={`truncate text-xs leading-tight text-ink-soft sm:hidden ${
                    isArabicText(entry.village) || isArabicText(entry.relationship) ? 'urdu-text' : ''
                  }`}
                >
                  {sub || '\u00A0'}
                </div>
              </div>
              <div className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.village) ? 'urdu-text' : ''}`}>
                {entry.village || '—'}
              </div>
              <div className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.relationship) ? 'urdu-text' : ''}`}>
                {entry.relationship || '—'}
              </div>
              <div className="px-0.5 text-end">
                {amt.cash ? (
                  <span className="font-bold tabular-nums">{amt.text}</span>
                ) : (
                  <span className={`inline-block max-w-full truncate font-hand text-[15px] text-ink-soft ${isArabicText(amt.text) ? 'urdu-text' : ''}`}>
                    🎁 {amt.text}
                  </span>
                )}
              </div>
              <div />
            </div>
          );
        })}

        {Array.from({ length: fillerCount }).map((_, i) => (
          <div key={`leaf-fill-${page}-${i}`} className={`ruled-row ${GRID} items-center`}>
            <div />
            <div />
            <div className="hidden sm:block" />
            <div className="hidden sm:block" />
            <div />
            <div />
          </div>
        ))}
      </div>

      <footer className="mt-2 px-4 pb-1 sm:px-8">
        <div className="border-t-2 border-ink/60 pt-2 text-center">
          <div className="font-hand text-xl font-bold text-ink sm:text-2xl">
            {t('totalPeople')}: {formatNumber(total)}
            <span className="mx-2 text-margin-red">•</span>
            {t('totalDaali')}: {formatRupees(totalSum)}
            {itemCount > 0 && (
              <>
                <span className="mx-2 text-margin-red">•</span>
                {t('itemCount')}: {formatNumber(itemCount)}
              </>
            )}
          </div>
          <div className="mt-0.5 flex items-center justify-center gap-4 text-xs text-ink-soft">
            <span>
              {t('pageTotal')}: {pageEntries.length} • {formatRupees(pageSum)}
            </span>
            {total > 0 && (
              <span>
                {t('average')}: {formatRupees(avg)}
              </span>
            )}
          </div>
        </div>
      </footer>
    </>
  );
}
