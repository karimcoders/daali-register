'use client';

import { useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { useDaali, sortEntries } from '@/lib/daali/store';
import { formatRupees } from '@/lib/daali/format';
import type { DaaliEntry } from '@/lib/daali/types';
import { useT } from './use-t';
import { Search, X } from 'lucide-react';

interface SearchResult {
  entry: DaaliEntry;
  page: number;
  eventName?: string;
}

export function SearchOverlay({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useT();
  const allEntries = useDaali((s) => s.allEntries);
  const events = useDaali((s) => s.events);
  const currentEventId = useDaali((s) => s.currentEventId);
  const settings = useDaali((s) => s.settings);
  const setPage = useDaali((s) => s.setPage);
  const setHighlight = useDaali((s) => s.setHighlight);
  const openEvent = useDaali((s) => s.openEvent);

  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Match the notebook's dynamic rows-per-page so page numbers are accurate
  const rowsPerPage = useMemo(() => {
    if (typeof window === 'undefined') return 8;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const rowH = w >= 640 ? 50 : 46;
    const overhead = w >= 640 ? 385 : 360;
    return Math.min(18, Math.max(6, Math.floor((h - overhead) / rowH)));
  }, [open]);

  const sortedByEvent = useMemo(() => {
    const map = new Map<string, DaaliEntry[]>();
    for (const e of allEntries) {
      if (currentEventId && e.eventId !== currentEventId) continue;
      const arr = map.get(e.eventId) ?? [];
      arr.push(e);
      map.set(e.eventId, arr);
    }
    for (const [k, arr] of map) map.set(k, sortEntries(arr, settings.sortMode));
    return map;
  }, [allEntries, currentEventId, settings.sortMode]);

  const results = useMemo((): SearchResult[] => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const matched: SearchResult[] = [];
    for (const [eventId, entries] of sortedByEvent) {
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const hit =
          e.name.toLowerCase().includes(q) ||
          (e.nameLatin || '').toLowerCase().includes(q) ||
          e.village.toLowerCase().includes(q) ||
          (e.villageLatin || '').toLowerCase().includes(q) ||
          e.relationship.toLowerCase().includes(q) ||
          String(e.amount).includes(q);
        if (hit) {
          matched.push({
            entry: e,
            page: Math.floor(i / rowsPerPage) + 1,
            eventName: currentEventId ? undefined : events.find((x) => x.id === eventId)?.name,
          });
          if (matched.length >= 30) return matched;
        }
      }
    }
    return matched;
  }, [query, sortedByEvent, rowsPerPage, currentEventId, events]);

  const go = (r: SearchResult) => {
    if (!currentEventId) openEvent(r.entry.eventId);
    setPage(r.page);
    setHighlight(r.entry.id);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) setQuery('');
        onOpenChange(v);
      }}
    >
      <DialogContent className="paper top-[8%] max-h-[80vh] translate-y-0 overflow-hidden border-0 p-0 sm:top-[10%] sm:max-w-lg">
        <div className="paper-spine hidden sm:block" />
        <div className="paper-margin hidden sm:block" />
        <DialogHeader className="px-5 pb-2 pt-4 sm:px-8">
          <DialogTitle className="text-start font-hand text-2xl text-ink">🔍 {t('searchTitle')}</DialogTitle>
          <DialogDescription className="sr-only">{t('searchTitle')}</DialogDescription>
        </DialogHeader>

        <div className="px-5 sm:px-8">
          <div className="flex items-center gap-2 rounded-md border border-ink/25 bg-[var(--paper-2)] px-3">
            <Search className="h-4 w-4 shrink-0 text-ink-soft" />
            <input
              ref={inputRef}
              autoFocus
              className="h-11 w-full bg-transparent text-[16px] text-ink outline-none placeholder:text-ink-soft/60"
              placeholder={t('searchPlaceholder')}
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              aria-label={t('searchTitle')}
            />
            {query && (
              <button
                className="shrink-0 text-ink-soft hover:text-ink"
                onClick={() => setQuery('')}
                aria-label={t('cancel')}
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="max-h-[52vh] overflow-y-auto px-3 py-2 sm:px-5" style={{ scrollbarWidth: 'thin' }}>
          {query.trim() === '' ? (
            <p className="px-3 py-6 text-center text-sm text-ink-soft">{t('searchPlaceholder')}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-6 text-center font-hand text-lg text-ink-soft">{t('noResults')}</p>
          ) : (
            <>
              <p className="px-2 pb-1 text-xs text-ink-soft">
                {results.length} {t('found')}
              </p>
              <ul className="space-y-1">
                {results.map((r) => (
                  <li key={r.entry.id}>
                    <button
                      className="w-full rounded-md px-3 py-2.5 text-start transition-colors hover:bg-ink/[0.06]"
                      onClick={() => go(r)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-semibold text-ink">{r.entry.name}</span>
                        <span className="shrink-0 font-bold text-ink tabular-nums">{formatRupees(r.entry.amount)}</span>
                      </div>
                      <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-ink-soft">
                        <span className="truncate">
                          {r.eventName ? `📖 ${r.eventName}` : [r.entry.village, r.entry.relationship].filter(Boolean).join(' • ')}
                        </span>
                        <span className="shrink-0 whitespace-nowrap font-hand text-[13px]">
                          {t('page')} {r.page}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
