'use client';

import { useMemo, useState } from 'react';
import { useDaali, type EventTotals } from '@/lib/daali/store';
import { formatRupees } from '@/lib/daali/format';
import type { DaaliEvent } from '@/lib/daali/types';
import { useT } from './use-t';
import { ConfirmDialog } from './ui-bits';
import { Trash2, Pencil, BookOpen } from 'lucide-react';

export function HomeScreen({
  onNewRegister,
  onRename,
}: {
  onNewRegister: () => void;
  onRename: (id: string) => void;
}) {
  const t = useT();
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const openEvent = useDaali((s) => s.openEvent);
  const deleteEvent = useDaali((s) => s.deleteEvent);

  const [query, setQuery] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const totals = useMemo(() => {
    const map = new Map<string, EventTotals>();
    for (const e of allEntries) {
      const cur = map.get(e.eventId) ?? { count: 0, sum: 0 };
      cur.count += 1;
      cur.sum += e.amount;
      map.set(e.eventId, cur);
    }
    return map;
  }, [allEntries]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (ev) =>
        ev.name.toLowerCase().includes(q) ||
        ev.location.toLowerCase().includes(q) ||
        (ev.date || '').includes(q)
    );
  }, [events, query]);

  const delEvent: DaaliEvent | undefined = events.find((e) => e.id === deleteId);

  return (
    <div className="mx-auto w-full max-w-xl px-4 pb-28 pt-4">
      {/* Register cover — first time hero */}
      {events.length === 0 ? (
        <div className="paper mt-6 px-6 py-12 text-center">
          <div className="paper-spine" />
          <div className="paper-margin" />
          <div className="animate-stamp-in">
            <div className="mb-3 text-5xl" aria-hidden="true">
              📖
            </div>
            <h1 className="font-hand text-3xl font-bold text-ink">{t('appName')}</h1>
            <p className="mx-auto mt-3 max-w-xs text-[15px] leading-relaxed text-ink-soft">
              {t('tagline')}
            </p>
            <button className="ink-btn mt-8 h-14 px-6 text-xl" onClick={onNewRegister}>
              ＋ {t('createFirst')}
            </button>
            <p className="mt-6 text-xs text-ink-soft/80">{t('dataLocalHint')}</p>
          </div>
        </div>
      ) : (
        <>
          {/* header strip */}
          <div className="mb-3 flex items-end justify-between px-1">
            <h1 className="font-hand text-2xl font-bold text-ink">📖 {t('myRegisters')}</h1>
            <span className="text-sm text-ink-soft">{events.length}</span>
          </div>

          {events.length > 3 && (
            <input
              className="paper-input mb-3 !rounded-md !border !border-border bg-[var(--paper-2)] px-3 py-2.5"
              placeholder={t('searchPlaceholder')}
              value={query}
              aria-label={t('searchTitle')}
              onChange={(e) => setQuery(e.target.value)}
            />
          )}

          <div className="space-y-3">
            {shown.map((ev, i) => {
              const tot = totals.get(ev.id) ?? { count: 0, sum: 0 };
              return (
                <div
                  key={ev.id}
                  className="paper animate-write-in cursor-pointer px-4 py-4 transition-transform hover:-translate-y-0.5"
                  style={{ animationDelay: `${Math.min(i * 40, 240)}ms` }}
                  onClick={() => openEvent(ev.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEvent(ev.id);
                    }
                  }}
                  aria-label={`${ev.name}, ${tot.count} ${t('people')}, ${formatRupees(tot.sum)}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-ink/15 bg-[var(--paper-2)]">
                      <BookOpen className="h-5 w-5 text-margin-red" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-hand text-xl font-bold text-ink">{ev.name}</div>
                      <div className="text-sm text-ink-soft">
                        {tot.count} {t('people')} • <span className="font-semibold">{formatRupees(tot.sum)}</span>
                        {ev.date ? ` • ${ev.date.split('-').reverse().join('/')}` : ''}
                        {ev.location ? ` • ${ev.location}` : ''}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        className="ghost-ink-btn flex h-9 w-9 items-center justify-center !border-ink/20"
                        aria-label={t('renameEvent')}
                        onClick={(e) => {
                          e.stopPropagation();
                          onRename(ev.id);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        className="ghost-ink-btn flex h-9 w-9 items-center justify-center !border-ink/20 !text-margin-red"
                        aria-label={t('delete')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteId(ev.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="mt-2 text-right font-hand text-[15px] font-bold text-ink">
                    {t('open')} →
                  </div>
                </div>
              );
            })}

            {shown.length === 0 && query && (
              <p className="py-8 text-center text-ink-soft">{t('noResults')}</p>
            )}
          </div>

          <button className="ink-btn mt-6 h-14 w-full text-xl" onClick={onNewRegister}>
            ＋ {t('newRegister')}
          </button>

          <p className="mt-6 text-center text-xs text-ink-soft/80">{t('dataLocalHint')}</p>
        </>
      )}

      <ConfirmDialog
        open={!!deleteId}
        onOpenChange={(v) => !v && setDeleteId(null)}
        title={t('deleteEventTitle')}
        description={
          <>
            {delEvent && <span className="font-hand text-lg font-bold text-ink">{delEvent.name}</span>}
            <br />
            {t('deleteEventWarn')}
          </>
        }
        confirmLabel={t('yesDelete')}
        cancelLabel={t('no')}
        destructive
        onConfirm={() => {
          if (deleteId) {
            deleteEvent(deleteId);
            setDeleteId(null);
          }
        }}
      />
    </div>
  );
}
