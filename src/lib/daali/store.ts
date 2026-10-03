// ─── Zustand store — app state, IndexedDB-backed, offline-first ─────────────
'use client';

import { create } from 'zustand';
import type { DaaliEntry, DaaliEvent, EntryInput, Settings, SortMode, Language } from './types';
import { DEFAULT_SETTINGS } from './types';
import {
  STORE_ENTRIES,
  STORE_EVENTS,
  idbClear,
  idbDelete,
  idbGetAll,
  idbPut,
  idbPutMany,
} from './db';

const SETTINGS_KEY = 'daali-settings-v1';

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
  currentEventId: string | null;
  currentPage: number;
  highlightId: string | null;
  settings: Settings;
  idbOk: boolean;

  init: () => Promise<void>;
  unlock: (pin: string) => boolean;
  resetAll: () => Promise<void>;

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

export const useDaali = create<DaaliState>((set, get) => ({
  hydrated: false,
  locked: false,
  view: 'home',
  events: [],
  allEntries: [],
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
      const [events, allEntries] = await Promise.all([
        idbGetAll<DaaliEvent>(STORE_EVENTS),
        idbGetAll<DaaliEntry>(STORE_ENTRIES),
      ]);
      events.sort((a, b) => b.updatedAt - a.updatedAt);
      set({ events, allEntries, hydrated: true, idbOk: true, locked: !!settings.pinHash });
    } catch {
      set({ events: [], allEntries: [], hydrated: true, idbOk: false, locked: !!settings.pinHash });
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
    } catch {
      // ignore
    }
    set({
      locked: false,
      view: 'home',
      events: [],
      allEntries: [],
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
    const events = get().events.map((e) => (e.id === id ? { ...e, name: name.trim(), updatedAt: Date.now() } : e));
    set({ events });
    const ev = events.find((e) => e.id === id);
    if (ev) {
      try {
        await idbPut(STORE_EVENTS, ev);
      } catch {
        /* in-memory only */
      }
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
  },

  removeEntry: async (id) => {
    set((st) => ({ allEntries: st.allEntries.filter((e) => e.id !== id) }));
    try {
      await idbDelete(STORE_ENTRIES, id);
    } catch {
      /* ignore */
    }
  },

  setHighlight: (id) => set({ highlightId: id }),

  importBackup: async (events, entries) => {
    try {
      await idbClear(STORE_EVENTS);
      await idbClear(STORE_ENTRIES);
      await idbPutMany(STORE_EVENTS, events);
      await idbPutMany(STORE_ENTRIES, entries);
      set({ idbOk: true });
    } catch {
      set({ idbOk: false });
    }
    const sorted = [...events].sort((a, b) => b.updatedAt - a.updatedAt);
    set({ events: sorted, allEntries: entries, view: 'home', currentEventId: null, currentPage: 1 });
  },
}));

export type { DaaliState };
