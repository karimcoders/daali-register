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
  amount: number; // whole rupees (0 when the gift is an item/nevta)
  /** नेवता / सामान — non-cash gift (मिठाई, कपड़ा, गिफ्ट…) written instead of an amount */
  item?: string;
  date: string; // ISO yyyy-mm-dd (may be empty)
  note: string;
  /** original roman typing (when written via transliteration) — used for search */
  nameLatin?: string;
  villageLatin?: string;
  createdAt: number;
  updatedAt: number;
}

export type Language = 'hi' | 'ur' | 'en';

/** Script used when writing entries: हिंदी / اردو / English */
export type InputScriptSetting = 'hi' | 'ur' | 'off';

export type SortMode = 'register' | 'name' | 'amount' | 'date';

export interface Settings {
  language: Language;
  inputScript: InputScriptSetting;
  darkMode: boolean;
  pageAnimation: boolean;
  pinHash: string | null; // simple local deterrent lock
  sortMode: SortMode;
}

export const DEFAULT_SETTINGS: Settings = {
  language: 'hi',
  inputScript: 'hi',
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
  item?: string;
  date: string;
  note: string;
  nameLatin?: string;
  villageLatin?: string;
}

// Common relationships for suggestions (rural Bihar context)
export const RELATIONSHIP_SUGGESTIONS_HI = [
  'मामा', 'चाचा', 'मौसी', 'बुआ', 'नाना', 'नानी', 'दादा', 'दादी',
  'भाई', 'बहन', 'भाभी', 'जीजा', 'दोस्त', 'पड़ोसी', 'ससुर', 'साला',
  'देवर', 'जेठ', 'भतीजा', 'भतीजी', 'साढ़ू', 'गाँव के लोग', 'मित्र', 'ऑफिस',
];
