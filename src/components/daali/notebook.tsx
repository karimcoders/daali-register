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
import type { DaaliEntry, DaaliEvent, InputScriptSetting, Language } from '@/lib/daali/types';
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
      // overhead = ऊपर की पट्टी + hint + page controls + header/total block —
      // थोड़ा बड़ा रखा है ताकि पूरा pann (header+rows+total) बिना scroll के दिखे
      const overhead = w >= 640 ? 440 : 410;
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

// Book spread mode — चौड़ी screen पर register असली खुली कॉपी जैसा दिखता है:
// दो पन्ने एक साथ (बायाँ + दायाँ), बीच में spine, पलटना real notebook जैसा.
// छोटी screen पर एक पन्ना (फ़ोन में दो पन्ने अटपटे/छोटे हो जाएँगे).
function useSpreadMode(): boolean {
  const [spread, setSpread] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const update = () => setSpread(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return spread;
}

// register grid — 6 columns (आख़िरी पतली column: WhatsApp share — हर मेहमान की
// दाली उनके नंबर पर भेजी जा सकती है; तारीख़ column बहुत पहले हटी थी)
const GRID = 'grid grid-cols-[2rem_1fr_5.2rem_1.9rem] sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6.5rem_2.1rem]';

// असली पलटने की अवधि (leaf-turn animation 0.78/0.82s) — safety timeout इससे आगे
const FLIP_MS = 780;
const BOOK_FLIP_MS = 820;

// flip की स्थिति — single (फ़ोन) mode: पुराने page का leaf घूमता है;
// book (desktop) mode: leaf का अगला/पिछला चेहरा = असली पन्ने का content.
type FlipState =
  | { mode: 'single'; dir: 'next' | 'prev'; from: number; to: number }
  | {
      mode: 'book';
      dir: 'next' | 'prev';
      leafFront: number;
      leafBack: number;
      underFirst: number;
      underSecond: number;
    };

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
  const spreadMode = useSpreadMode();
  // असली notebook पलटना — palatte waqt ek pann (leaf) ghoomta hai:
  // front = purani page ka snapshot, back = khaali ruled paper, neeche nayi page
  const [flipState, setFlipState] = useState<FlipState | null>(null);
  const flipTimer = useRef<number | null>(null);
  const armFlipTimer = useCallback(
    (ms: number) => {
      if (flipTimer.current) window.clearTimeout(flipTimer.current);
      flipTimer.current = window.setTimeout(() => setFlipState(null), ms + 220);
    },
    []
  );
  const beginFlipSingle = useCallback(
    (dir: 'next' | 'prev', from: number, to: number) => {
      if (!settings.pageAnimation) return;
      setFlipState({ mode: 'single', dir, from, to });
      armFlipTimer(FLIP_MS);
    },
    [settings.pageAnimation, armFlipTimer]
  );
  // book spread flip — from/to = spread number (1-based).
  // अगला spread: front = पुराना दायाँ pann, back = नया बायाँ pann — असली किताब जैसा.
  const beginFlipBook = useCallback(
    (from: number, to: number) => {
      if (!settings.pageAnimation) return;
      if (to > from) {
        setFlipState({
          mode: 'book',
          dir: 'next',
          leafFront: 2 * from,
          leafBack: 2 * from + 1,
          underFirst: 2 * from - 1,
          underSecond: 2 * to,
        });
      } else {
        setFlipState({
          mode: 'book',
          dir: 'prev',
          leafFront: 2 * to,
          leafBack: 2 * from - 1,
          underFirst: 2 * to - 1,
          underSecond: 2 * from,
        });
      }
      armFlipTimer(BOOK_FLIP_MS);
    },
    [settings.pageAnimation, armFlipTimer]
  );
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [editing, setEditing] = useState<{ id: string; cell: EditCell } | null>(null);
  const [writeSignal, setWriteSignal] = useState(0);
  // khali filler line par click → likhai ki line WAHIN chali jati hai (line 5, 6… kahin bhi)
  const [writeAt, setWriteAt] = useState<{ page: number; slot: number } | null>(null);
  // WhatsApp share strip — jis line ke neeche khula hai (number ke bina strip, number ke saath seedha bhejna)
  const [shareFor, setShareFor] = useState<string | null>(null);
  // edit/share callbacks — PageBody ko stable references मिलें
  const openEdit = useCallback((id: string, cell: EditCell) => {
    setShareFor(null);
    setEditing({ id, cell });
  }, []);
  const closeEdit = useCallback(() => {
    setEditing((cur) => (cur ? null : cur));
  }, []);
  const toggleShare = useCallback((id: string) => {
    // share khula → editing band (ek waqt mein ek hi pen)
    setEditing(null);
    setShareFor((cur) => (cur === id ? null : id));
  }, []);
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
  // book spread math — spread k = pann (2k-1 | 2k). चौड़ी screen पर दोनों साथ दिखते हैं.
  const spreadCount = Math.max(1, Math.ceil(pageCount / 2));
  const curSpread = Math.min(Math.max(1, Math.ceil(page / 2)), spreadCount);
  const leftPage = 2 * curSpread - 1;
  const rightPage = 2 * curSpread;
  const writingPage = Math.floor(total / rowsPerPage) + 1; // page holding the writing slot

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
      if (spreadMode) {
        const target = curSpread + (dir === 'next' ? 1 : -1);
        if (target < 1 || target > spreadCount) return;
        setEditing(null);
        setShareFor(null);
        setWriteAt(null);
        setPage(2 * target - 1);
        beginFlipBook(curSpread, target);
      } else {
        const target = dir === 'next' ? page + 1 : page - 1;
        if (target < 1 || target > pageCount) return;
        setEditing(null);
        setShareFor(null);
        setWriteAt(null);
        setPage(target);
        beginFlipSingle(dir, page, target);
      }
    },
    [spreadMode, curSpread, spreadCount, page, pageCount, setPage, beginFlipBook, beginFlipSingle]
  );

  const jumpTo = useCallback(
    (n: number) => {
      const target = Math.min(Math.max(1, n), pageCount);
      if (spreadMode) {
        const sp = Math.ceil(target / 2);
        if (sp !== curSpread) {
          setEditing(null);
          setShareFor(null);
          setWriteAt(null);
          setPage(2 * sp - 1);
          beginFlipBook(curSpread, sp);
        }
      } else if (target !== page) {
        setEditing(null);
        setShareFor(null);
        setWriteAt(null);
        setPage(target);
        beginFlipSingle(target > page ? 'next' : 'prev', page, target);
      }
    },
    [page, pageCount, spreadMode, curSpread, setPage, beginFlipBook, beginFlipSingle]
  );

  // kahin bhi khali line par click → wahin pen rakh do (writing line par le jao)
  const focusWriting = useCallback(() => {
    setEditing(null);
    setWriteAt(null);
    const armPen = () => setWriteSignal((v) => v + 1);
    if (spreadMode) {
      const ws = Math.ceil(writingPage / 2);
      if (ws !== curSpread) {
        setPage(2 * ws - 1);
        beginFlipBook(curSpread, ws);
        // pann aadha palatne tak pen ready — speed feel deti hai
        setTimeout(armPen, settings.pageAnimation ? 560 : 40);
      } else {
        armPen();
      }
    } else if (writingPage !== page) {
      setPage(writingPage);
      beginFlipSingle(writingPage > page ? 'next' : 'prev', page, writingPage);
      setTimeout(armPen, settings.pageAnimation ? 560 : 40);
    } else {
      armPen();
    }
  }, [spreadMode, writingPage, page, curSpread, setPage, beginFlipBook, beginFlipSingle, settings.pageAnimation]);

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
    setWriteAt(null); // likh gayi → pen wapas pehli khali line par
    const st = useDaali.getState();
    const newTotal = st.allEntries.filter((e) => e.eventId === st.currentEventId).length;
    const wp = Math.floor(newTotal / rowsPerPage) + 1; // page holding the writing slot now
    const maxPage = Math.ceil((newTotal + 1) / rowsPerPage);
    const armPen = () => setWriteSignal((v) => v + 1);
    if (spreadMode) {
      const ws = Math.ceil(wp / 2);
      if (ws !== curSpread && wp <= maxPage) {
        // page bhar gaya → ASLI KITAB KI TARAH pann palat jaata hai
        setPage(2 * ws - 1);
        beginFlipBook(curSpread, ws);
        setTimeout(armPen, settings.pageAnimation ? 560 : 40);
      } else {
        // same spread mein pen aage badha (baayāँ आधा bharā thā) — turant ready
        setTimeout(armPen, 40);
      }
    } else if (wp !== page && wp <= maxPage) {
      // page bhar gaya → ASLI COPY KI TARAH PALAT JAATA HAI
      setPage(wp);
      beginFlipSingle('next', page, wp);
      setTimeout(armPen, settings.pageAnimation ? 560 : 40);
    } else {
      // page adha bhara tha — pen agli khali line par turant ready
      // (filler line se likha ho to bhi row remount hoke yahin sulakti hai)
      setTimeout(armPen, 40);
    }
  }, [rowsPerPage, page, curSpread, spreadMode, setPage, beginFlipBook, beginFlipSingle, settings.pageAnimation]);

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

  const scriptOptions: Array<{ v: 'hi' | 'ur' | 'off'; label: string }> = [
    { v: 'hi', label: t('scriptHi') },
    { v: 'ur', label: t('scriptUr') },
    { v: 'off', label: t('scriptEn') },
  ];

  if (!event) return null;

  // एक pann ka content — PageBody hi book/single/static sab jagah use hota hai
  const renderPage = (pageNumber: number, live: boolean) => (
    <PageBody
      event={event}
      lang={settings.language}
      inputScript={settings.inputScript}
      pageNumber={pageNumber}
      pageCount={pageCount}
      rowsPerPage={rowsPerPage}
      sorted={sorted}
      total={total}
      totalSum={totalSum}
      itemCount={itemCount}
      writingPage={writingPage}
      live={live}
      compact={spreadMode && pageNumber > 1}
      editing={editing}
      openEdit={openEdit}
      closeEdit={closeEdit}
      shareFor={shareFor}
      toggleShare={toggleShare}
      newIds={newIds}
      highlightId={highlightId}
      writeSignal={writeSignal}
      writeAt={writeAt}
      setWriteAt={setWriteAt}
      onCommitted={onCommitted}
      focusWriting={focusWriting}
      updateEvent={updateEvent}
      toastUpdated={t('updatedToast')}
    />
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        className="no-print flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-2 py-2 sm:px-6 sm:py-3"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ scrollbarWidth: 'thin' }}
      >
        {spreadMode ? (
          /* ── BOOK — असली खुली रजिस्टर: दो पन्ने एक साथ, बीच में spine ── */
          <div className="flip-stage relative min-h-full w-full max-w-[82rem]">
            <div className="book min-h-full">
              <div className="book-half book-half-first">
                <div
                  className="paper flex h-full w-full flex-col pb-2"
                  role="region"
                  aria-label={`${t('daaliRegister')} — ${event.name}`}
                >
                  {renderPage(flipState?.mode === 'book' ? flipState.underFirst : leftPage, true)}
                </div>
              </div>
              <div className="book-half book-half-second">
                <div className="paper flex h-full w-full flex-col pb-2">
                  {renderPage(flipState?.mode === 'book' ? flipState.underSecond : rightPage, true)}
                </div>
              </div>
              <div className="book-gutter" aria-hidden="true" />

              {/* पलटता pann — front = पुराना दायाँ pann, back = नया बायाँ pann */}
              {flipState?.mode === 'book' && (
                <div
                  key={`bleaf-${flipState.dir}-${flipState.leafFront}-${flipState.leafBack}`}
                  className={`book-leaf ${flipState.dir} ${rtl ? 'leaf-rtl' : ''}`}
                  aria-hidden="true"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) setFlipState(null);
                  }}
                >
                  <div className="leaf-face">
                    <div className="paper flex h-full w-full flex-col overflow-hidden pb-2">
                      {renderPage(flipState.leafFront, false)}
                    </div>
                  </div>
                  <div className="leaf-face leaf-face-back">
                    <div className="paper flex h-full w-full flex-col overflow-hidden pb-2">
                      {renderPage(flipState.leafBack, false)}
                    </div>
                  </div>
                  <div className={`leaf-shade ${rtl ? 'leaf-shade-rtl' : ''}`} />
                </div>
              )}
            </div>
          </div>
        ) : (
          /* ── SINGLE (फ़ोन) — एक पन्ना, पलटता leaf ── */
          <div className="flip-stage relative flex min-h-full w-full max-w-3xl flex-col">
            <div
              key={page}
              className="paper flex min-h-full w-full flex-col pb-2"
              role="region"
              aria-label={`${t('daaliRegister')} — ${event.name}`}
            >
              {renderPage(page, true)}
            </div>

            {/* ── असली पलटना: pann (leaf) ghoom kar nayi page kholti hai ── */}
            {flipState?.mode === 'single' && (
              <>
                <div className={`leaf-drop ${rtl ? 'leaf-drop-rtl' : ''}`} aria-hidden="true" />
                <div
                  key={`sleaf-${flipState.dir}-${flipState.from}-${flipState.to}`}
                  className={`flip-leaf ${flipState.dir} ${rtl ? 'leaf-rtl' : ''}`}
                  aria-hidden="true"
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget) setFlipState(null);
                  }}
                >
                  <div className="leaf-face">
                    <div className="paper flex h-full w-full flex-col overflow-hidden pb-2">
                      {renderPage(flipState.dir === 'next' ? flipState.from : flipState.to, false)}
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
        )}
      </div>

      {/* ── page controls ── */}
      <div className="no-print flex items-center justify-center gap-2 px-3 pb-2 sm:gap-3">
        <button
          className="ghost-ink-btn flex h-11 w-11 items-center justify-center !border-ink/30"
          onClick={() => turn('prev')}
          disabled={spreadMode ? curSpread <= 1 : page <= 1}
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
            value={spreadMode ? leftPage : page}
            min={1}
            max={pageCount}
            aria-label={`${t('page')} — 1..${pageCount}`}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (Number.isFinite(n)) jumpTo(n);
            }}
          />
          {spreadMode && rightPage <= pageCount && <span>– {rightPage}</span>}
          <span>/ {pageCount}</span>
        </div>
        <button
          className="ghost-ink-btn flex h-11 w-11 items-center justify-center !border-ink/30"
          onClick={() => turn('next')}
          disabled={spreadMode ? curSpread >= spreadCount : page >= pageCount}
          aria-label="Next page"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

// ─── एक पन्ने का पूरा content — book spread, single page, leaf face सब यहीं ──
// live=true → खड़ा पन्ना: लिखना/edit/share सब चालू;
// live=false → पलटते leaf का static चेहरा (कोई input नहीं — पेपर snapshot).
// compact=true → आगे के पन्नों का छोटा चलता-फिरता शीर्षक — असली रजिस्टर में
// पूरा शुभ लाभ header सिर्फ पहले पन्ने पर होता है.
function PageBody({
  event,
  lang,
  inputScript,
  pageNumber,
  pageCount,
  rowsPerPage,
  sorted,
  total,
  totalSum,
  itemCount,
  writingPage,
  live,
  compact,
  editing,
  openEdit,
  closeEdit,
  shareFor,
  toggleShare,
  newIds,
  highlightId,
  writeSignal,
  writeAt,
  setWriteAt,
  onCommitted,
  focusWriting,
  updateEvent,
  toastUpdated,
}: {
  event: DaaliEvent;
  lang: Language;
  inputScript: InputScriptSetting;
  pageNumber: number;
  pageCount: number;
  rowsPerPage: number;
  sorted: DaaliEntry[];
  total: number;
  totalSum: number;
  itemCount: number;
  writingPage: number;
  live: boolean;
  compact: boolean;
  editing: { id: string; cell: EditCell } | null;
  openEdit: (id: string, cell: EditCell) => void;
  closeEdit: () => void;
  shareFor: string | null;
  toggleShare: (id: string) => void;
  newIds: Set<string>;
  highlightId: string | null;
  writeSignal: number;
  writeAt: { page: number; slot: number } | null;
  setWriteAt: (v: { page: number; slot: number } | null) => void;
  onCommitted: () => void;
  focusWriting: () => void;
  updateEvent: (id: string, patch: { name?: string; date?: string; location?: string }) => void;
  toastUpdated: string;
}) {
  const t = useT();

  // आख़िरी pann का ख़ाली पेछला रुख — बिल्कुल सादा ruled कागज़ (असली register के
  // आख़िरी लिखे pann के पीछे जैसा) — इस पर कोई header/number/total नहीं
  if (pageNumber > pageCount) {
    return (
      <>
        <div className="paper-spine" />
        <div className="paper-margin" />
        <div className="register-rows mt-3 flex-1">
          {Array.from({ length: rowsPerPage }).map((_, i) => (
            <div
              key={`ph-${pageNumber}-${i}`}
              role="button"
              tabIndex={-1}
              aria-label={t('writeHere')}
              className={`ruled-row ${GRID} cursor-text items-center hover:bg-ink/[0.035]`}
              onClick={focusWriting}
            >
              <div />
              <div />
              <div className="hidden sm:block" />
              <div className="hidden sm:block" />
              <div />
              <div />
            </div>
          ))}
        </div>
      </>
    );
  }

  const startIdx = (pageNumber - 1) * rowsPerPage;
  const pageEntries = sorted.slice(startIdx, startIdx + rowsPerPage);
  const fillerCount = Math.max(0, rowsPerPage - pageEntries.length);
  const pageSum = pageEntries.reduce((a, e) => a + (e.amount || 0), 0);
  const cashCount = sorted.filter((e) => e.amount > 0).length;
  const avg = cashCount > 0 ? Math.round(totalSum / cashCount) : 0;
  const isWritingPage = live && pageNumber === writingPage;
  const slotK = writeAt && writeAt.page === pageNumber ? writeAt.slot : 0;

  const headerBlock = compact ? (
    <header className="px-4 pt-3 text-end sm:px-6">
      <div className={`truncate text-xs text-ink-soft ${isArabicText(event.name) ? 'urdu-text' : ''}`}>
        {event.name}
      </div>
    </header>
  ) : (
    <header className="px-4 pt-3 text-center sm:px-8">
      <h1 className="font-hand text-2xl font-bold text-ink sm:text-3xl">{t('daaliRegister')}</h1>
      <div className="mx-auto mt-0.5 mb-1 h-px w-40 bg-ink/20" />
      <div className="mt-2 text-[15px] leading-7 sm:mt-3">
        <div className="text-ink">
          <span className="text-ink-soft">{t('eventLabel')}: </span>
          {live ? (
            <HeaderField
              value={event.name}
              ariaLabel={t('eventLabel')}
              onSave={(v) => {
                updateEvent(event.id, { name: v });
                toast.success(toastUpdated, { duration: 1200 });
              }}
            />
          ) : (
            <span className="font-hand font-bold">{event.name}</span>
          )}
        </div>
        <div className="mt-0.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          <div className="text-start sm:text-end">
            <span className="text-ink-soft">{t('dateLabel')}: </span>
            {live ? (
              <HeaderField
                type="date"
                value={event.date}
                display={event.date ? isoToDisplayDate(event.date) : ''}
                ariaLabel={t('dateLabel')}
                onSave={(v) => {
                  updateEvent(event.id, { date: v });
                  toast.success(toastUpdated, { duration: 1200 });
                }}
              />
            ) : (
              <span className="font-hand font-bold">{event.date ? isoToDisplayDate(event.date) : ''}</span>
            )}
          </div>
          <div className="text-start">
            <span className="text-ink-soft">{t('villageLabel')}: </span>
            {live ? (
              <HeaderField
                value={event.location}
                ariaLabel={t('villageLabel')}
                onSave={(v) => {
                  updateEvent(event.id, { location: v });
                  toast.success(toastUpdated, { duration: 1200 });
                }}
              />
            ) : (
              <span className="font-hand font-bold">{event.location}</span>
            )}
          </div>
        </div>
      </div>
    </header>
  );

  return (
    <>
      <div className="paper-spine" />
      <div className="paper-margin" />

      {/* page number */}
      <div className="absolute end-3 top-2 font-hand text-xs text-ink-soft">
        {t('page')} {pageNumber}
      </div>

      {headerBlock}

      {/* register rows — likha hua + agli khali line, sab seedha line par */}
      <div className="register-rows mt-3 flex-1">
        {/* column header */}
        <div className={`${GRID} reg-head border-b-2 border-ink/50 pb-1 text-[13px] font-bold text-ink`}>
          <div className="text-center">{t('colCr')}</div>
          <div>{t('colName')}</div>
          <div className="hidden sm:block">{t('colVillage')}</div>
          <div className="hidden sm:block">{t('colRelation')}</div>
          <div className="text-end">{t('colAmount')}</div>
        </div>

        {total === 0 && pageNumber === 1 && (
          <p className="px-1 pb-1 pt-2 text-center font-hand text-[15px] leading-snug text-ink-soft/75">
            {t('firstLineHint')}
          </p>
        )}

        {pageEntries.map((entry, i) =>
          live && editing?.id === entry.id ? (
            <EntryEditRow
              key={entry.id}
              entry={entry}
              serial={startIdx + i + 1}
              script={inputScript}
              focusCell={editing.cell}
              onDone={closeEdit}
            />
          ) : (
            <RegisterRow
              key={entry.id}
              entry={entry}
              serial={startIdx + i + 1}
              isNew={newIds.has(entry.id)}
              isHighlight={highlightId === entry.id}
              event={event}
              lang={lang}
              live={live}
              shareOpen={live && shareFor === entry.id}
              onToggleShare={live ? () => toggleShare(entry.id) : undefined}
              onEditCell={live ? (cell) => openEdit(entry.id, cell) : undefined}
            />
          )
        )}

        {/* khali ruled lines — likhai ki line pehli khali line par hoti hai;
            koi bhi khali line par click karo → pen WAHIN chala jata hai */}
        {Array.from({ length: fillerCount }).map((_, i) => {
          if (!isWritingPage) {
            return <FillerRow key={`filler-${pageNumber}-${i}`} onClick={focusWriting} label={t('writeHere')} />;
          }
          if (i === slotK) {
            return (
              <WritingRow
                key={`write-${pageNumber}-${slotK}`}
                serial={total + 1}
                script={inputScript}
                focusSignal={writeSignal}
                onCommitted={onCommitted}
                onCancel={() => setWriteAt(null)}
                autoStart={slotK > 0}
              />
            );
          }
          return (
            <FillerRow
              key={`filler-${pageNumber}-${i}`}
              onClick={() => setWriteAt({ page: pageNumber, slot: i })}
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
    </>
  );
}

function RegisterRow({
  entry,
  serial,
  isNew,
  isHighlight,
  event,
  lang,
  live,
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
  /** false = पलटते leaf का static face — पढ़ने के लिए ही (कोई tap नहीं) */
  live: boolean;
  shareOpen: boolean;
  onToggleShare?: () => void;
  onEditCell?: (cell: EditCell) => void;
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
    else onToggleShare?.();
  };

  return (
    <div
      className={`ruled-row ${GRID} items-center text-[15px] text-ink ${
        live ? 'cursor-text' : ''
      } ${isNew ? 'animate-write-in' : ''} ${
        isHighlight ? 'highlight-flash' : ''
      } ${
        live
          ? `hover:bg-ink/[0.045] active:bg-ink/[0.08] ${shareOpen ? 'bg-ink/[0.03]' : ''}`
          : ''
      }`}
      onClick={live && onEditCell ? () => onEditCell('name') : undefined}
      role={live && onEditCell ? 'button' : undefined}
      tabIndex={live && onEditCell ? 0 : undefined}
      onKeyDown={
        live && onEditCell
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onEditCell('name');
              }
            }
          : undefined
      }
      aria-label={`${entry.name}, ${amt.text}`}
    >
      <div className="text-center text-[13px] text-ink-soft">{String(serial).padStart(2, '0')}</div>
      <div
        className="min-w-0 px-0.5 py-1"
        onClick={
          live
            ? (e) => {
                e.stopPropagation();
                onEditCell?.('name');
              }
            : undefined
        }
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
              role={live ? 'button' : undefined}
              className="active:text-ink"
              onClick={
                live
                  ? (e) => {
                      e.stopPropagation();
                      onEditCell?.('village');
                    }
                  : undefined
              }
            >
              {entry.village}
            </span>
          ) : null}
          {entry.village && entry.relationship ? ' • ' : ''}
          {entry.relationship ? (
            <span
              role={live ? 'button' : undefined}
              className="active:text-ink"
              onClick={
                live
                  ? (e) => {
                      e.stopPropagation();
                      onEditCell?.('relation');
                    }
                  : undefined
              }
            >
              {entry.relationship}
            </span>
          ) : null}
          {!entry.village && !entry.relationship ? '\u00A0' : ''}
        </div>
      </div>
      <div
        className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.village) ? 'urdu-text' : ''}`}
        onClick={
          live
            ? (e) => {
                e.stopPropagation();
                onEditCell?.('village');
              }
            : undefined
        }
      >
        {entry.village || '—'}
      </div>
      <div
        className={`hidden min-w-0 truncate px-0.5 text-sm sm:block ${isArabicText(entry.relationship) ? 'urdu-text' : ''}`}
        onClick={
          live
            ? (e) => {
                e.stopPropagation();
                onEditCell?.('relation');
              }
            : undefined
        }
      >
        {entry.relationship || '—'}
      </div>
      <div
        className="px-0.5 text-end"
        title={amt.cash ? undefined : t('itemMode')}
        onClick={
          live
            ? (e) => {
                e.stopPropagation();
                onEditCell?.('amount');
              }
            : undefined
        }
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
      <div className="flex items-center justify-center" onClick={(e) => live && e.stopPropagation()}>
        {live && onToggleShare ? (
          <button
            type="button"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[#25D366]/60 transition-colors hover:bg-[#25D366]/10 hover:text-[#1da851] active:text-[#1da851]"
            onClick={onShareTap}
            aria-label={`${t('shareWhatsapp')}: ${entry.name}`}
            title={entry.phone ? `${t('shareWhatsapp')} — ${entry.phone}` : t('phoneLabel')}
          >
            <MessageCircle className="h-[1.15rem] w-[1.15rem]" />
          </button>
        ) : null}
      </div>

      {/* number nahi tha → wahin neeche chhota phone strip khula (koi popup nahi) */}
      {shareOpen && (
        <ShareStrip
          entry={entry}
          event={event}
          lang={lang}
          onClose={() => onToggleShare?.()}
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
    <div
      className="col-span-full flex flex-wrap items-center gap-1.5 pb-1.5 pt-0.5"
      onClick={(e) => e.stopPropagation()}
    >
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
