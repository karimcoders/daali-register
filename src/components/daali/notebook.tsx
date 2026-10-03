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
import { formatNumber, formatRupees, isoToDisplayDate } from '@/lib/daali/format';
import type { DaaliEntry } from '@/lib/daali/types';
import { useT } from './use-t';
import {
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Pencil,
  Printer,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// Dynamic rows-per-page: pages feel like a real register on every screen size
function useRowsPerPage(): number {
  const [rows, setRows] = useState(8);
  useEffect(() => {
    const compute = () => {
      const h = window.innerHeight;
      const w = window.innerWidth;
      const rowH = w >= 640 ? 50 : 46;
      const overhead = w >= 640 ? 385 : 360;
      const n = Math.floor((h - overhead) / rowH);
      setRows(Math.min(18, Math.max(6, n)));
    };
    compute();
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, []);
  return rows;
}

interface NotebookProps {
  onAddEntry: () => void;
  onEditEntry: (id: string) => void;
  onRenameEvent: () => void;
  onDeleteEvent: () => void;
  onPrint: () => void;
}

export function Notebook({ onAddEntry, onEditEntry, onRenameEvent, onDeleteEvent, onPrint }: NotebookProps) {
  const t = useT();
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const currentEventId = useDaali((s) => s.currentEventId);
  const currentPage = useDaali((s) => s.currentPage);
  const setPage = useDaali((s) => s.setPage);
  const goHome = useDaali((s) => s.goHome);
  const highlightId = useDaali((s) => s.highlightId);
  const settings = useDaali((s) => s.settings);

  const rowsPerPage = useRowsPerPage();
  const [flip, setFlip] = useState<'next' | 'prev' | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIds = useRef<Set<string>>(new Set());
  const firstRender = useRef(true);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const event = events.find((e) => e.id === currentEventId);

  const sorted = useMemo(
    () => sortEntries(allEntries.filter((e) => e.eventId === currentEventId), settings.sortMode),
    [allEntries, currentEventId, settings.sortMode]
  );

  const pageCount = Math.max(1, Math.ceil(sorted.length / rowsPerPage));
  const page = Math.min(currentPage, pageCount);
  const startIdx = (page - 1) * rowsPerPage;
  const pageEntries = sorted.slice(startIdx, startIdx + rowsPerPage);
  const fillerCount = Math.max(0, rowsPerPage - pageEntries.length);

  const pageSum = useMemo(() => pageEntries.reduce((a, e) => a + e.amount, 0), [pageEntries]);
  const totalCount = sorted.length;
  const totalSum = useMemo(() => sorted.reduce((a, e) => a + e.amount, 0), [sorted]);
  const avg = totalCount > 0 ? Math.round(totalSum / totalCount) : 0;

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
      setPage(target);
      if (settings.pageAnimation) {
        setFlip(dir);
        setTimeout(() => setFlip(null), 320);
      }
    },
    [page, pageCount, setPage, settings.pageAnimation]
  );

  const jumpTo = useCallback(
    (n: number) => {
      const target = Math.min(Math.max(1, n), pageCount);
      if (target !== page && settings.pageAnimation) {
        setFlip(target > page ? 'next' : 'prev');
        setTimeout(() => setFlip(null), 320);
      }
      setPage(target);
    },
    [page, pageCount, setPage, settings.pageAnimation]
  );

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

  const flipClass =
    flip === 'next' ? 'page-turn-next' : flip === 'prev' ? 'page-turn-prev' : '';

  if (!event) return null;

  return (
    <div className="flex h-full flex-col">
      {/* ── top bar ── */}
      <div className="no-print flex items-center gap-2 px-2 pt-2 sm:px-6">
        <button
          className="ghost-ink-btn flex h-10 w-10 items-center justify-center !border-ink/25"
          onClick={goHome}
          aria-label={t('goBack')}
        >
          <Undo2 className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1 text-center">
          <div className="truncate font-hand text-xl font-bold text-ink">{event.name}</div>
        </div>
        <button
          className="ghost-ink-btn flex h-10 w-10 items-center justify-center !border-ink/25"
          onClick={onPrint}
          aria-label={t('printPdf')}
        >
          <Printer className="h-5 w-5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="ghost-ink-btn flex h-10 w-10 items-center justify-center !border-ink/25"
              aria-label={t('navMore')}
            >
              <MoreVertical className="h-5 w-5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="border-border">
            <DropdownMenuItem onClick={onRenameEvent}>
              <Pencil className="h-4 w-4" /> {t('renameEvent')}
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

      {/* ── scrollable register area ── */}
      <div
        className="no-print flex flex-1 items-start justify-center overflow-y-auto px-2 py-2 sm:px-6 sm:py-3"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        style={{ scrollbarWidth: 'thin' }}
      >
        <div
          key={page}
          className={`paper flex min-h-full w-full max-w-3xl flex-col pb-2 ${flipClass}`}
          role="region"
          aria-label={`${t('daaliRegister')} — ${event.name}`}
        >
          <div className="paper-spine" />
          <div className="paper-margin" />

          {/* page number */}
          <div className="absolute right-3 top-2 font-hand text-xs text-ink-soft">
            {t('page')} {page}
          </div>

          {/* header — like a real register heading */}
          <header className="px-4 pt-3 text-center sm:px-8">
            <h1 className="font-hand text-2xl font-bold text-ink sm:text-3xl">{t('daaliRegister')}</h1>
            <div className="mx-auto mt-0.5 mb-1 h-px w-40 bg-ink/20" />
            <div className="mt-2 text-[15px] leading-7 sm:mt-3">
              <div className="text-ink">
                <span className="text-ink-soft">{t('eventLabel')}: </span>
                <span className="paper-blank font-hand font-bold">{event.name || '\u00A0'}</span>
              </div>
              <div className="mt-0.5 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                <div className="text-left sm:text-right">
                  <span className="text-ink-soft">{t('dateLabel')}: </span>
                  <span className="paper-blank font-hand font-bold">
                    {event.date ? isoToDisplayDate(event.date) : '\u00A0'}
                  </span>
                </div>
                <div className="text-left">
                  <span className="text-ink-soft">{t('villageLabel')}: </span>
                  <span className="paper-blank font-hand font-bold">{event.location || '\u00A0'}</span>
                </div>
              </div>
            </div>
          </header>

          {/* register rows */}
          <div className="mt-3 flex-1 pl-[3.9rem] pr-3 sm:pl-[4.6rem] sm:pr-5">
            {/* column header */}
            <div className="grid grid-cols-[2rem_1fr_5.6rem] border-b-2 border-ink/50 pb-1 text-[13px] font-bold text-ink sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6rem_6.2rem]">
              <div className="text-center">{t('colCr')}</div>
              <div>{t('colName')}</div>
              <div className="hidden sm:block">{t('colVillage')}</div>
              <div className="hidden sm:block">{t('colRelation')}</div>
              <div className="text-right">{t('colAmount')}</div>
              <div className="hidden text-right sm:block">{t('colDate')}</div>
            </div>

            {pageEntries.map((entry, i) => (
              <RegisterRow
                key={entry.id}
                entry={entry}
                serial={startIdx + i + 1}
                isNew={newIds.has(entry.id)}
                isHighlight={highlightId === entry.id}
                onEdit={() => onEditEntry(entry.id)}
              />
            ))}

            {pageEntries.length === 0 && page === 1 && (
              <div className="py-8 text-center">
                <p className="font-hand text-lg text-ink-soft">{t('emptyNotebook')}</p>
                <button className="ink-btn mt-4 h-12 px-5 text-lg" onClick={onAddEntry}>
                  ＋ {t('addEntry')}
                </button>
              </div>
            )}

            {/* blank ruled lines — jaise register ki khali line */}
            {Array.from({ length: fillerCount }).map((_, i) => (
              <div
                key={`filler-${i}`}
                aria-hidden="true"
                className="ruled-row grid grid-cols-[2rem_1fr_5.6rem] sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6rem_6.2rem]"
              >
                <div />
                <div />
                <div className="hidden sm:block" />
                <div className="hidden sm:block" />
                <div />
                <div className="hidden sm:block" />
              </div>
            ))}
          </div>

          {/* totals — printed inside the register */}
          <footer className="mt-2 px-4 pb-1 sm:px-8">
            <div className="border-t-2 border-ink/60 pt-2 text-center">
              <div className="font-hand text-xl font-bold text-ink sm:text-2xl">
                {t('totalPeople')}: {formatNumber(totalCount)}
                <span className="mx-2 text-margin-red">•</span>
                {t('totalDaali')}: {formatRupees(totalSum)}
              </div>
              <div className="mt-0.5 flex items-center justify-center gap-4 text-xs text-ink-soft">
                <span>
                  {t('pageTotal')}: {pageEntries.length} • {formatRupees(pageSum)}
                </span>
                {totalCount > 0 && (
                  <span>
                    {t('average')}: {formatRupees(avg)}
                  </span>
                )}
              </div>
            </div>
          </footer>
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
            aria-label={`${t('page')} — ${t('page')} ${pageCount} तक`}
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
        <button className="ink-btn ml-2 hidden h-11 items-center px-4 text-lg sm:flex" onClick={onAddEntry}>
          ＋ {t('addEntry')}
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
  onEdit,
}: {
  entry: DaaliEntry;
  serial: number;
  isNew: boolean;
  isHighlight: boolean;
  onEdit: () => void;
}) {
  const t = useT();
  return (
    <div
      className={`ruled-row grid cursor-pointer grid-cols-[2rem_1fr_5.6rem] items-center text-[15px] text-ink sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6rem_6.2rem] ${
        isNew ? 'animate-write-in' : ''
      } ${isHighlight ? 'highlight-flash' : ''} hover:bg-ink/[0.045] active:bg-ink/[0.08]`}
      onClick={onEdit}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}
      aria-label={`${entry.name}, ${formatRupees(entry.amount)}`}
    >
      <div className="text-center text-[13px] text-ink-soft">{String(serial).padStart(2, '0')}</div>
      <div className="min-w-0 px-0.5 py-1">
        <div className="truncate font-semibold leading-tight">
          {entry.name}
          {entry.note && (
            <span className="ml-1 text-xs text-ink-soft" title={entry.note}>
              ✎
            </span>
          )}
        </div>
        <div className="truncate text-xs leading-tight text-ink-soft sm:hidden">
          {[entry.village, entry.relationship].filter(Boolean).join(' • ') || '\u00A0'}
        </div>
      </div>
      <div className="hidden min-w-0 truncate px-0.5 text-sm sm:block">{entry.village || '—'}</div>
      <div className="hidden min-w-0 truncate px-0.5 text-sm sm:block">{entry.relationship || '—'}</div>
      <div className="px-0.5 text-right font-bold tabular-nums" style={{ fontVariantNumeric: 'tabular-nums' }}>
        {formatRupees(entry.amount)}
      </div>
      <div className="hidden px-0.5 text-right text-xs text-ink-soft sm:block">
        {entry.date ? isoToDisplayDate(entry.date) : ''}
      </div>
      {/* sr-only date for mobile screen readers */}
      <span className="sr-only">{!entry.date ? '' : `${t('dateLabel')}: ${isoToDisplayDate(entry.date)}`}</span>
    </div>
  );
}
