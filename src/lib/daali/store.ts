// ─── Zustand store — app state, IndexedDB-backed, offline-first ─────────────
'use client';

import { create } from 'zustand';
import type {
  DaaliEntry,
  DaaliEvent,
  EntryInput,
  HistoryChange,
  HistoryItem,
  Settings,
  SortMode,
  Language,
} from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  STORE_ENTRIES,
  STORE_EVENTS,
  STORE_HISTORY,
  idbClear,
  idbDelete,
  idbGetAll,
  idbPut,
  idbPutMany,
} from './db';

const SETTINGS_KEY = 'daali-settings-v1';
const HISTORY_CAP = 600; // newest N items kept in memory/list

function hashPin(pin: string): string {
  // Simple local deterrent (not cryptographic) — data never leaves the device anyway
  let h = 5381;
  for (let i = 0; i < pin.length; i++) h = ((h << 5) + h + pin.charCodeAt(i)) >>> 0;
  return 'p' + h.toString(36);
}

function loadSettings(): Settings {
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(s: Settings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch {
    // storage blocked — app still works in memory
  }
}

export function sortEntries(entries: DaaliEntry[], mode: SortMode): DaaliEntry[] {
  const arr = [...entries];
  switch (mode) {
    case 'name':
      return arr.sort((a, b) => a.name.localeCompare(b.name, 'hi'));
    case 'amount':
      return arr.sort((a, b) => b.amount - a.amount);
    case 'date':
      return arr.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    default:
      return arr.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  }
}

function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export interface EventTotals {
  count: number;
  sum: number;
}

function applyDocLang(lang: Language) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr';
}

interface DaaliState {
  hydrated: boolean;
  locked: boolean;
  view: 'home' | 'notebook';
  events: DaaliEvent[];
  allEntries: DaaliEntry[];
  history: HistoryItem[];
  currentEventId: string | null;
  currentPage: number;
  highlightId: string | null;
  settings: Settings;
  idbOk: boolean;

  init: () => Promise<void>;
  unlock: (pin: string) => boolean;
  resetAll: () => Promise<void>;
  clearHistory: () => Promise<void>;

  setLanguage: (l: Language) => void;
  setInputScript: (sc: Settings['inputScript']) => void;
  setDarkMode: (v: boolean) => void;
  setPageAnimation: (v: boolean) => void;
  setSortMode: (m: SortMode) => void;
  setPin: (pin: string | null) => void;

  createEvent: (name: string, date: string, location: string) => Promise<string>;
  renameEvent: (id: string, name: string) => Promise<void>;
  deleteEvent: (id: string) => Promise<void>;

  openEvent: (id: string) => void;
  goHome: () => void;
  setPage: (n: number) => void;

  addEntry: (data: EntryInput) => Promise<void>;
  updateEntry: (id: string, data: EntryInput) => Promise<void>;
  removeEntry: (id: string) => Promise<void>;
  setHighlight: (id: string | null) => void;

  importBackup: (events: DaaliEvent[], entries: DaaliEntry[]) => Promise<void>;
}

export const useDaali = create<DaaliState>((set, get) => {
  // हिस्ट्री — har add/edit/delete ka record; kabhi main action ko block nahi karta
  const pushHistory = (item: {
    eventId: string;
    refId: string;
    name: string;
    action: HistoryItem['action'];
    changes: HistoryChange[];
  }) => {
    const full: HistoryItem = { id: uid(), at: Date.now(), ...item };
    set((st) => ({ history: [full, ...st.history].slice(0, HISTORY_CAP) }));
    idbPut(STORE_HISTORY, full).catch(() => {
      /* history is best-effort — data writes are the priority */
    });
  };

  const entryChanges = (o: DaaliEntry, n: DaaliEntry): HistoryChange[] => {
    const ch: HistoryChange[] = [];
    const cmp = (field: keyof DaaliEntry) => {
      const a = String(o[field] ?? '');
      const b = String(n[field] ?? '');
      if (a !== b) ch.push({ field, from: a, to: b });
    };
    cmp('name');
    cmp('village');
    cmp('relationship');
    cmp('amount');
    cmp('item');
    cmp('date');
    cmp('note');
    return ch;
  };

  return {
  hydrated: false,
  locked: false,
  view: 'home',
  events: [],
  allEntries: [],
  history: [],
  currentEventId: null,
  currentPage: 1,
  highlightId: null,
  settings: DEFAULT_SETTINGS,
  idbOk: true,

  init: async () => {
    const settings = loadSettings();
    set({ settings });
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', settings.darkMode);
    }
    applyDocLang(settings.language);
    try {
      const [events, allEntries, history] = await Promise.all([
        idbGetAll<DaaliEvent>(STORE_EVENTS),
        idbGetAll<DaaliEntry>(STORE_ENTRIES),
        idbGetAll<HistoryItem>(STORE_HISTORY).catch(() => [] as HistoryItem[]),
      ]);
      events.sort((a, b) => b.updatedAt - a.updatedAt);
      history.sort((a, b) => b.at - a.at);
      set({
        events,
        allEntries,
        history: history.slice(0, HISTORY_CAP),
        hydrated: true,
        idbOk: true,
        locked: !!settings.pinHash,
      });
    } catch {
      set({ events: [], allEntries: [], history: [], hydrated: true, idbOk: false, locked: !!settings.pinHash });
    }
  },

  clearHistory: async () => {
    set({ history: [] });
    try {
      await idbClear(STORE_HISTORY);
    } catch {
      /* ignore */
    }
  },

  unlock: (pin) => {
    const ok = hashPin(pin) === get().settings.pinHash;
    if (ok) set({ locked: false });
    return ok;
  },

  resetAll: async () => {
    try {
      await idbClear(STORE_EVENTS);
      await idbClear(STORE_ENTRIES);
      await idbClear(STORE_HISTORY);
    } catch {
      // ignore
    }
    set({
      locked: false,
      view: 'home',
      events: [],
      allEntries: [],
      history: [],
      currentEventId: null,
      currentPage: 1,
    });
    get().setPin(null);
  },

  setLanguage: (l) => {
    const s = { ...get().settings, language: l };
    set({ settings: s });
    saveSettings(s);
    applyDocLang(l);
  },
  setInputScript: (sc) => {
    const s = { ...get().settings, inputScript: sc };
    set({ settings: s });
    saveSettings(s);
  },
  setDarkMode: (v) => {
    const s = { ...get().settings, darkMode: v };
    set({ settings: s });
    saveSettings(s);
    if (typeof document !== 'undefined') document.documentElement.classList.toggle('dark', v);
  },
  setPageAnimation: (v) => {
    const s = { ...get().settings, pageAnimation: v };
    set({ settings: s });
    saveSettings(s);
  },
  setSortMode: (m) => {
    const s = { ...get().settings, sortMode: m };
    set({ settings: s });
    saveSettings(s);
  },
  setPin: (pin) => {
    const s = { ...get().settings, pinHash: pin ? hashPin(pin) : null };
    set({ settings: s });
    saveSettings(s);
  },

  createEvent: async (name, date, location) => {
    const now = Date.now();
    const ev: DaaliEvent = {
      id: uid(),
      name: name.trim(),
      date,
      location: location.trim(),
      createdAt: now,
      updatedAt: now,
    };
    set({ events: [ev, ...get().events] });
    try {
      await idbPut(STORE_EVENTS, ev);
      set({ idbOk: true });
    } catch {
      set({ idbOk: false });
    }
    return ev.id;
  },

  renameEvent: async (id, name) => {
    const old = get().events.find((e) => e.id === id);
    const events = get().events.map((e) => (e.id === id ? { ...e, name: name.trim(), updatedAt: Date.now() } : e));
    set({ events });
    const ev = events.find((e) => e.id === id);
    if (ev) {
      try {
        await idbPut(STORE_EVENTS, ev);
      } catch {
        /* in-memory only */
      }
      pushHistory({
        eventId: id,
        refId: 'event',
        name: old?.name || ev.name,
        action: 'renameEvent',
        changes: old && old.name !== ev.name ? [{ field: 'eventName', from: old.name, to: ev.name }] : [],
      });
    }
  },

  deleteEvent: async (id) => {
    try {
      await idbDelete(STORE_EVENTS, id);
      const olds = get().allEntries.filter((e) => e.eventId === id);
      for (const o of olds) await idbDelete(STORE_ENTRIES, o.id);
    } catch {
      /* in-memory only */
    }
    const events = get().events.filter((e) => e.id !== id);
    set((st) => ({
      events,
      allEntries: st.allEntries.filter((e) => e.eventId !== id),
      ...(st.currentEventId === id ? { view: 'home' as const, currentEventId: null, currentPage: 1 } : {}),
    }));
    // register gaya to uski poori history bhi saaf — koi orphan record nahi
    const deadHistory = get().history.filter((h) => h.eventId === id);
    set((st) => ({ history: st.history.filter((h) => h.eventId !== id) }));
    for (const h of deadHistory) {
      idbDelete(STORE_HISTORY, h.id).catch(() => {});
    }
  },

  openEvent: (id) => set({ view: 'notebook', currentEventId: id, currentPage: 1, highlightId: null }),

  goHome: () => set({ view: 'home', currentEventId: null, currentPage: 1, highlightId: null }),

  setPage: (n) => set({ currentPage: Math.max(1, n), highlightId: null }),

  addEntry: async (data) => {
    const eventId = get().currentEventId;
    if (!eventId) throw new Error('no-event-open');
    const now = Date.now();
    const entry: DaaliEntry = {
      id: uid(),
      eventId,
      name: data.name.trim(),
      village: (data.village || '').trim(),
      relationship: (data.relationship || '').trim(),
      amount: Math.max(0, Math.round(data.amount)),
      item: (data.item || '').trim() || undefined,
      date: data.date || '',
      note: (data.note || '').trim(),
      nameLatin: (data.nameLatin || '').trim() || undefined,
      villageLatin: (data.villageLatin || '').trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    // optimistic update — instant feel
    set((st) => ({ allEntries: [...st.allEntries, entry] }));
    try {
      await idbPut(STORE_ENTRIES, entry);
      set({ idbOk: true });
    } catch {
      set({ idbOk: false });
    }
    const events = get().events.map((e) => (e.id === eventId ? { ...e, updatedAt: now } : e));
    set({ events });
    const ev = events.find((e) => e.id === eventId);
    if (ev) {
      try {
        await idbPut(STORE_EVENTS, ev);
      } catch {
        /* ignore */
      }
    }
    pushHistory({
      eventId,
      refId: entry.id,
      name: entry.name,
      action: 'add',
      changes: [],
    });
  },

  updateEntry: async (id, data) => {
    const old = get().allEntries.find((e) => e.id === id);
    if (!old) return;
    const updated: DaaliEntry = {
      ...old,
      name: data.name.trim(),
      village: (data.village || '').trim(),
      relationship: (data.relationship || '').trim(),
      amount: Math.max(0, Math.round(data.amount)),
      item: (data.item || '').trim() || undefined,
      date: data.date || '',
      note: (data.note || '').trim(),
      nameLatin: (data.nameLatin || '').trim() || undefined,
      villageLatin: (data.villageLatin || '').trim() || undefined,
      updatedAt: Date.now(),
    };
    set((st) => ({ allEntries: st.allEntries.map((e) => (e.id === id ? updated : e)) }));
    try {
      await idbPut(STORE_ENTRIES, updated);
    } catch {
      set({ idbOk: false });
    }
    const changes = entryChanges(old, updated);
    if (changes.length > 0) {
      pushHistory({
        eventId: updated.eventId,
        refId: updated.id,
        name: updated.name,
        action: 'edit',
        changes,
      });
    }
  },

  removeEntry: async (id) => {
    const old = get().allEntries.find((e) => e.id === id);
    set((st) => ({ allEntries: st.allEntries.filter((e) => e.id !== id) }));
    try {
      await idbDelete(STORE_ENTRIES, id);
    } catch {
      /* ignore */
    }
    if (old) {
      pushHistory({
        eventId: old.eventId,
        refId: old.id,
        name: old.name,
        action: 'delete',
        changes: [],
      });
    }
  },

  setHighlight: (id) => set({ highlightId: id }),

  importBackup: async (events, entries) => {
    try {
      await idbClear(STORE_EVENTS);
      await idbClear(STORE_ENTRIES);
      await idbClear(STORE_HISTORY);
      await idbPutMany(STORE_EVENTS, events);
      await idbPutMany(STORE_ENTRIES, entries);
      set({ idbOk: true });
    } catch {
      set({ idbOk: false });
    }
    const sorted = [...events].sort((a, b) => b.updatedAt - a.updatedAt);
    set({ events: sorted, allEntries: entries, history: [], view: 'home', currentEventId: null, currentPage: 1 });
  },
  };
});

export type { DaaliState };
