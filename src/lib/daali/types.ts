// ─── Daali Register — Data Types ────────────────────────────────────────────

export interface DaaliEvent {
  id: string;
  name: string;
  date: string; // ISO yyyy-mm-dd (may be empty)
  location: string;
  createdAt: number;
  updatedAt: number;
}

export interface DaaliEntry {
  id: string;
  eventId: string;
  name: string;
  village: string;
  relationship: string;
  amount: number; // whole rupees
  date: string; // ISO yyyy-mm-dd (may be empty)
  note: string;
  createdAt: number;
  updatedAt: number;
}

export type Language = 'hi' | 'en';

export type SortMode = 'register' | 'name' | 'amount' | 'date';

export interface Settings {
  language: Language;
  darkMode: boolean;
  pageAnimation: boolean;
  pinHash: string | null; // simple local deterrent lock
  sortMode: SortMode;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'hi',
  darkMode: false,
  pageAnimation: true,
  pinHash: null,
  sortMode: 'register',
};

export interface BackupFile {
  app: 'daali-register';
  version: 1;
  exportedAt: number;
  events: DaaliEvent[];
  entries: DaaliEntry[];
}

/** Payload used when adding or editing an entry */
export interface EntryInput {
  name: string;
  village: string;
  relationship: string;
  amount: number;
  date: string;
  note: string;
}

// Common relationships for datalist suggestions (rural Bihar context)
export const RELATIONSHIP_SUGGESTIONS_HI = [
  'मामा', 'चाचा', 'मौसी', 'बुआ', 'नाना', 'नानी', 'दादा', 'दादी',
  'भाई', 'बहन', 'भाभी', 'जीजा', 'दोस्त', 'पड़ोसी', 'ससुर', 'साला',
  'देवर', 'जेठ', 'भतीजा', 'भतीजी', 'साढ़ू', 'गाँव के लोग', 'मित्र', 'ऑफिस',
];
