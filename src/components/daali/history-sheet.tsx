'use client';

// हिस्ट्री — register ke saare badlav ka paper-record.
// Har add/edit/delete store.ts mein log hota hai; yahan wo bas dikhta hai.

import { useMemo, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useDaali } from '@/lib/daali/store';
import { formatRupees, isoToDisplayDate } from '@/lib/daali/format';
import type { HistoryChange, HistoryItem } from '@/lib/daali/types';
import { useT } from './use-t';
import { ConfirmDialog } from './ui-bits';
import { History as HistoryIcon, PenLine, Plus, Trash2, BookOpen } from 'lucide-react';

function fieldLabel(key: string, t: (k: never) => string): string {
  const tt = t as unknown as (k: string) => string;
  switch (key) {
    case 'name':
      return tt('fName');
    case 'village':
      return tt('fVillage');
    case 'relationship':
      return tt('fRelation');
    case 'amount':
      return tt('fAmount');
    case 'item':
      return tt('fItem');
    case 'date':
      return tt('fDate');
    case 'note':
      return tt('fNote');
    case 'eventName':
      return tt('fEventName');
    case 'location':
      return tt('fLocation');
    default:
      return key;
  }
}

function changeValue(field: string, v: string, lang: 'hi' | 'ur' | 'en'): string {
  if (v === '') return '—';
  if (field === 'amount') return formatRupees(Number(v) || 0);
  if (field === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(v) ? isoToDisplayDate(v) : v;
  void lang;
  return v;
}

function changeText(c: HistoryChange, t: (k: never) => string, lang: 'hi' | 'ur' | 'en'): string {
  const from = changeValue(c.field, c.from, lang);
  const to = changeValue(c.field, c.to, lang);
  if (c.from === '') return `${fieldLabel(c.field, t)}: ${to}`;
  return `${fieldLabel(c.field, t)}: ${from} → ${to}`;
}

function dayLabel(at: number, t: (k: never) => string): string {
  const tt = t as unknown as (k: string) => string;
  const d = new Date(at);
  const now = new Date();
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  if (key(d) === key(now)) return tt('today');
  const yest = new Date(now.getTime() - 86400000);
  if (key(d) === key(yest)) return tt('yesterday');
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

const ACTION_STYLE: Record<HistoryItem['action'], { cls: string; icon: React.ReactNode }> = {
  add: { cls: 'text-emerald-700 dark:text-emerald-400', icon: <Plus className="h-3.5 w-3.5" /> },
  edit: { cls: 'text-amber-700 dark:text-amber-400', icon: <PenLine className="h-3.5 w-3.5" /> },
  delete: { cls: 'text-red-700 dark:text-red-400', icon: <Trash2 className="h-3.5 w-3.5" /> },
  addEvent: { cls: 'text-emerald-700 dark:text-emerald-400', icon: <BookOpen className="h-3.5 w-3.5" /> },
  renameEvent: { cls: 'text-ink-soft', icon: <BookOpen className="h-3.5 w-3.5" /> },
  editEvent: { cls: 'text-ink-soft', icon: <PenLine className="h-3.5 w-3.5" /> },
  deleteEvent: { cls: 'text-red-700 dark:text-red-400', icon: <Trash2 className="h-3.5 w-3.5" /> },
};

export function HistorySheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useT();
  const tt = t as unknown as (k: string) => string;
  const lang = useDaali((s) => s.settings.language);
  const view = useDaali((s) => s.view);
  const currentEventId = useDaali((s) => s.currentEventId);
  const events = useDaali((s) => s.events);
  const history = useDaali((s) => s.history);
  const clearHistory = useDaali((s) => s.clearHistory);
  const [confirmClear, setConfirmClear] = useState(false);

  // notebook ke andar = usi register ki history; home par = sab ki
  const items = useMemo(() => {
    const filtered = view === 'notebook' && currentEventId ? history.filter((h) => h.eventId === currentEventId) : history;
    return filtered.slice(0, 200);
  }, [history, view, currentEventId]);

  const groups = useMemo(() => {
    const out: { day: string; items: HistoryItem[] }[] = [];
    for (const h of items) {
      const day = dayLabel(h.at, t);
      const last = out[out.length - 1];
      if (last && last.day === day) last.items.push(h);
      else out.push({ day, items: [h] });
    }
    return out;
  }, [items, t]);

  const eventName = (id: string) => events.find((e) => e.id === id)?.name;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="paper-slip border-0 !bg-[var(--paper)]">
        <div className="paper-margin" aria-hidden="true" />
        <DrawerHeader className="relative px-5 pb-2 pt-3 text-left">
          <DrawerTitle className="flex items-center gap-2 font-hand text-xl font-bold text-ink">
            <HistoryIcon className="h-5 w-5 text-ink-soft" />
            {tt('history')}
          </DrawerTitle>
          <DrawerDescription className="text-xs text-ink-soft">{tt('historySub')}</DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[58vh] overflow-y-auto px-5 pb-4" data-dir={undefined}>
          {items.length === 0 ? (
            <p className="rounded-lg border border-dashed border-ink/25 bg-[var(--paper-2)]/50 px-4 py-8 text-center text-sm text-ink-soft">
              {tt('historyEmpty')}
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.day} className="mb-3">
                <h4 className="mb-1.5 font-hand text-sm font-bold text-ink-soft">{g.day}</h4>
                <ul className="space-y-1.5">
                  {g.items.map((h) => {
                    const st = ACTION_STYLE[h.action];
                    const time = new Date(h.at).toLocaleTimeString(
                      lang === 'en' ? 'en-IN' : lang === 'hi' ? 'hi-IN' : 'ur-PK',
                      { hour: '2-digit', minute: '2-digit' }
                    );
                    return (
                      <li
                        key={h.id}
                        className="rounded-md border border-ink/15 bg-[var(--paper-2)]/60 px-3 py-2"
                      >
                        <div className="flex items-baseline gap-2">
                          <span className={`flex shrink-0 items-center gap-1 text-[11px] font-bold ${st.cls}`}>
                            {st.icon}
                            {tt(
                              h.action === 'add'
                                ? 'actAdd'
                                : h.action === 'edit'
                                  ? 'actEdit'
                                  : h.action === 'delete'
                                    ? 'actDelete'
                                    : h.action === 'addEvent'
                                      ? 'actAddEvent'
                                      : h.action === 'editEvent'
                                        ? 'actEditEvent'
                                        : h.action === 'deleteEvent'
                                          ? 'eventDeleted'
                                          : 'actRenameEvent'
                            )}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink" title={h.name}>
                            {h.name}
                          </span>
                          <time className="shrink-0 text-[11px] text-ink-soft" dateTime={new Date(h.at).toISOString()}>
                            {time}
                          </time>
                        </div>
                        {h.changes.length > 0 && (
                          <ul className="mt-1 space-y-0.5 border-t border-ink/10 pt-1">
                            {h.changes.map((c, i) => (
                              <li key={i} className="text-[12.5px] leading-relaxed text-ink-soft">
                                <bdi>{changeText(c, t, lang)}</bdi>
                              </li>
                            ))}
                          </ul>
                        )}
                        {view === 'home' && h.eventId && (
                          <div className="mt-0.5 text-[11px] text-ink-soft">📖 {eventName(h.eventId)}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}

          {items.length > 0 && (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="ink-btn mt-2 w-full !border-red-800/40 !bg-transparent !text-red-800 hover:!bg-red-800/10 dark:!text-red-400"
            >
              <Trash2 className="h-4 w-4" /> {tt('clearHistory')}
            </button>
          )}
        </div>

        <ConfirmDialog
          open={confirmClear}
          onOpenChange={setConfirmClear}
          title={tt('clearHistory')}
          description={tt('clearHistoryConfirm')}
          confirmLabel={tt('clearHistory')}
          cancelLabel={tt('no')}
          destructive
          onConfirm={() => {
            clearHistory();
            setConfirmClear(false);
            onOpenChange(false);
          }}
        />
      </DrawerContent>
    </Drawer>
  );
}
