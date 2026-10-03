'use client';

// ─── Writing directly on the register lines — no popup, jaise asli copy ─────
// WritingRow : the next empty ruled line. Tap it → inputs appear ON the line.
//              Enter → दाली लिख जाती है and the next line is ready (फटाफट).
// EntryEditRow : tap a written line → same inline editing in place.

import { useEffect, useRef, useState } from 'react';
import { useDaali } from '@/lib/daali/store';
import { formatRupees, isoToDisplayDate, normalizeName, sanitizeAmountInput, todayISO } from '@/lib/daali/format';
import type { DaaliEntry, InputScriptSetting } from '@/lib/daali/types';
import type { Suggestion } from '@/lib/daali/dict';
import { useT } from './use-t';
import { TranslitInput, isIMEComposing, type PickPayload } from './translit-input';
import { ConfirmDialog } from './ui-bits';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';

const GRID = 'grid grid-cols-[2rem_1fr_5.2rem] sm:grid-cols-[2.4rem_minmax(0,2fr)_minmax(0,1.35fr)_minmax(0,0.9fr)_6rem_6.2rem]';

export const QUICK_AMOUNTS = [101, 251, 501, 1001, 2001, 5001];

/** which cell of a written line was tapped — pen-style direct editing */
export type EditCell = 'name' | 'village' | 'relation' | 'amount' | 'date';

type SugField = 'name' | 'village' | 'relation' | 'item';

function useSuggest() {
  const [sug, setSug] = useState<Suggestion[]>([]);
  const [sugField, setSugField] = useState<SugField>('name');
  const [pick, setPick] = useState<PickPayload | null>(null);
  const seq = useRef(0);
  const wire = (field: SugField) => ({
    onSuggest: (s: Suggestion[]) => {
      setSug(s);
      if (s.length) setSugField(field);
    },
    pick: sugField === field ? pick : null,
  });
  const choose = (sgn: Suggestion) => {
    seq.current += 1;
    setPick({ roman: sgn.roman, text: sgn.text, seq: seq.current });
    setSug([]);
  };
  return { sug, wire, choose, clear: () => setSug([]) };
}

// dictionary suggestion chips — tap to write the word perfectly
function SuggestionChips({
  sug,
  onChoose,
}: {
  sug: Suggestion[];
  onChoose: (s: Suggestion) => void;
}) {
  if (!sug.length) return null;
  return (
    <div className="col-span-full flex flex-wrap items-center gap-1 pb-1 pt-0.5">
      <span className="mr-0.5 text-[11px] text-ink-soft/60">✎</span>
      {sug.map((sgn) => (
        <button
          key={sgn.roman}
          type="button"
          className="chip h-8 px-2.5 text-[14px]"
          onMouseDown={(e) => e.preventDefault()}
          onTouchStart={(e) => e.preventDefault()}
          onClick={() => onChoose(sgn)}
        >
          {sgn.text}
        </button>
      ))}
    </div>
  );
}

// quick ₹ chips — shown only while the line is active
function QuickAmounts({
  amountRaw,
  itemText,
  itemMode,
  onMode,
  onPick,
}: {
  amountRaw: string;
  itemText: string;
  itemMode: boolean;
  onMode: (v: boolean) => void;
  onPick: (n: number) => void;
}) {
  const t = useT();
  const amountNum = parseInt(amountRaw || '0', 10) || 0;
  return (
    <div className="col-span-full flex flex-wrap items-center gap-1 pb-1 pt-0.5">
      <ModeChips
        itemMode={itemMode}
        onMode={onMode}
        label={t('amount')}
      />
      {!itemMode &&
        QUICK_AMOUNTS.map((q) => (
          <button
            key={q}
            type="button"
            className={`chip h-8 min-w-[3.1rem] px-2 text-[13px] ${String(q) === amountRaw ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
            onClick={() => onPick(q)}
            aria-label={formatRupees(q)}
          >
            {formatRupees(q)}
          </button>
        ))}
      {itemMode ? (
        itemText.trim() ? (
          <span className="ml-auto font-hand text-lg font-bold text-ink">🎁 {itemText.trim()}</span>
        ) : null
      ) : (
        amountNum > 0 && (
          <span className="ml-auto font-hand text-lg font-bold text-ink">{formatRupees(amountNum)}</span>
        )
      )}
    </div>
  );
}

// ₹ नकद / नेवता-सामान toggle — jaise copy mein kabhi paise, kabhi saaman likhte hain
function ModeChips({
  itemMode,
  onMode,
  label,
}: {
  itemMode: boolean;
  onMode: (v: boolean) => void;
  label: string;
}) {
  const t = useT();
  return (
    <div className="flex shrink-0 items-center gap-1" role="group" aria-label={label}>
      <button
        type="button"
        className={`chip h-8 px-2.5 text-[13px] ${!itemMode ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
        onClick={() => onMode(false)}
        aria-pressed={!itemMode}
      >
        {t('cashMode')}
      </button>
      <button
        type="button"
        className={`chip h-8 px-2.5 text-[13px] ${itemMode ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
        onClick={() => onMode(true)}
        aria-pressed={itemMode}
      >
        🎁 {t('itemMode')}
      </button>
    </div>
  );
}

function FieldError({ msg }: { msg: string }) {
  if (!msg) return null;
  return <span className="text-xs text-margin-red">{msg}</span>;
}

// ─── the next empty line — writing happens here ─────────────────────────────
export function WritingRow({
  serial,
  script,
  focusSignal,
  onCommitted,
}: {
  serial: number;
  script: InputScriptSetting;
  focusSignal: number;
  onCommitted: () => void;
}) {
  const t = useT();
  const allEntries = useDaali((s) => s.allEntries);
  const currentEventId = useDaali((s) => s.currentEventId);
  const addEntry = useDaali((s) => s.addEntry);
  const { sug, wire, choose, clear } = useSuggest();

  const [active, setActive] = useState(false);
  const [name, setName] = useState('');
  const [nameRaw, setNameRaw] = useState('');
  const [village, setVillage] = useState('');
  const [villageRaw, setVillageRaw] = useState('');
  const [relationship, setRelationship] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  // नेवता/सामान mode — non-cash gift written in place of the amount
  const [itemMode, setItemMode] = useState(false);
  const [itemText, setItemText] = useState('');
  const [date, setDate] = useState(todayISO());
  const [nameErr, setNameErr] = useState('');
  const [amountErr, setAmountErr] = useState('');
  const [dup, setDup] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const villageMobileRef = useRef<HTMLInputElement>(null);
  const villageDesktopRef = useRef<HTMLInputElement>(null);
  const relationMobileRef = useRef<HTMLInputElement>(null);
  const relationDesktopRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);

  // focus the input that is actually visible (mobile vs desktop grids)
  const focusFirstVisible = (...els: Array<HTMLInputElement | null>) => {
    const el = els.find((x) => x && x.offsetParent !== null);
    el?.focus();
  };
  const focusVillage = () => focusFirstVisible(villageMobileRef.current, villageDesktopRef.current);
  const focusRelation = () => focusFirstVisible(relationMobileRef.current, relationDesktopRef.current);

  // ＋ button / page-advance asks this line to start writing.
  // Only reacts to signal CHANGES (not the value at mount) so that flipping
  // pages never pops the keyboard by itself.
  const initialSignal = useRef(focusSignal);
  useEffect(() => {
    if (focusSignal === initialSignal.current) return;
    initialSignal.current = focusSignal;
    setActive(true);
    const tm = setTimeout(() => nameRef.current?.focus(), 60);
    return () => clearTimeout(tm);
  }, [focusSignal]);

  const amountNum = parseInt(amountRaw || '0', 10) || 0;

  const findDuplicate = () =>
    allEntries.find(
      (e) =>
        e.eventId === currentEventId &&
        e.name.trim() !== '' &&
        (normalizeName(e.name) === normalizeName(name) ||
          (!!nameRaw && !!e.nameLatin && normalizeName(e.nameLatin) === normalizeName(nameRaw)))
    );

  const reset = () => {
    setName('');
    setNameRaw('');
    setVillage('');
    setVillageRaw('');
    setRelationship('');
    setAmountRaw('');
    setItemMode(false);
    setItemText('');
    setDate(todayISO());
    setNameErr('');
    setAmountErr('');
    setDup(null);
    clear();
  };

  const doCommit = async (force = false) => {
    if (busy) return;
    const nm = name.trim();
    const it = itemMode ? itemText.trim() : '';
    let ok = true;
    if (!nm) {
      setNameErr(t('nameRequired'));
      ok = false;
    } else setNameErr('');
    if (amountNum <= 0 && !it) {
      setAmountErr(t('amountRequired'));
      ok = false;
    } else setAmountErr('');
    if (!ok) {
      (nm ? (itemMode ? itemRef : amountRef) : nameRef).current?.focus();
      return;
    }
    // duplicate — never blocks, just asks once (paper-note style)
    if (!force && findDuplicate()) {
      setDup(nm);
      return;
    }
    setDup(null);
    setBusy(true);
    try {
      await addEntry({
        name: nm,
        village,
        relationship,
        amount: it ? 0 : amountNum,
        item: it,
        date,
        note: '',
        nameLatin: nameRaw !== nm ? nameRaw : '',
        villageLatin: villageRaw !== village ? villageRaw : '',
      });
      // फटाफट — the next line is ready immediately
      reset();
      onCommitted();
      setTimeout(() => nameRef.current?.focus(), 60);
    } catch {
      toast.error(t('saveError'));
    } finally {
      setBusy(false);
    }
  };

  const cancelLine = () => {
    reset();
    setActive(false);
  };

  // ── inactive: a quiet empty ruled line with a faint ✎ ──
  if (!active) {
    return (
      <div
        className={`ruled-row ${GRID} cursor-text items-center hover:bg-ink/[0.035]`}
        onClick={() => {
          setActive(true);
          setTimeout(() => nameRef.current?.focus(), 40);
        }}
        role="button"
        tabIndex={0}
        aria-label={t('writeHere')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setActive(true);
            setTimeout(() => nameRef.current?.focus(), 40);
          }
        }}
      >
        <div className="text-center text-[13px] text-ink-soft/70">{String(serial).padStart(2, '0')}</div>
        <div className="min-w-0 select-none px-0.5 text-[15px] text-ink-soft/40">✎ {t('writeHere')}</div>
        <div className="hidden sm:block" />
        <div className="hidden sm:block" />
        <div />
        <div className="hidden sm:block" />
      </div>
    );
  }

  // ── active: write ON the line ──
  return (
    <div className={`ruled-row ${GRID} items-center bg-ink/[0.03]`}>
      <div className="text-center text-[13px] text-ink-soft">{String(serial).padStart(2, '0')}</div>

      {/* नाम (+ mobile mini-line for गाँव / रिश्ता) */}
      <div className="min-w-0 px-0.5 py-1">
        <div className="flex items-center gap-1">
          <TranslitInput
            ref={nameRef}
            {...wire('name')}
            className="cell-input text-[15px] font-semibold"
            placeholder={t('namePh')}
            value={name}
            maxLength={60}
            autoComplete="off"
            enterKeyHint="next"
            aria-label={t('name')}
            script={script}
            onValueChange={(v) => {
              setName(v);
              setNameErr('');
            }}
            onRawChange={setNameRaw}
            onKeyDown={(e, fv) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (fv !== undefined) setName(fv);
                focusVillage();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                cancelLine();
              }
            }}
          />
          <FieldError msg={nameErr} />
        </div>
        {/* mobile: गाँव + रिश्ता on the second small line */}
        <div className="mt-0.5 flex gap-2 sm:hidden">
          <TranslitInput
            ref={villageMobileRef}
            {...wire('village')}
            className="cell-input min-w-0 flex-1 text-[13px] text-ink-soft"
            placeholder={t('villagePh')}
            value={village}
            maxLength={40}
            autoComplete="off"
            aria-label={t('village')}
            script={script}
            onValueChange={(v) => {
              setVillage(v);
              setVillageRaw(v);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                focusRelation();
              }
              if (e.key === 'Escape') cancelLine();
            }}
          />
          <TranslitInput
            ref={relationMobileRef}
            {...wire('relation')}
            className="cell-input min-w-0 flex-1 text-[13px] text-ink-soft"
            placeholder={t('relationPh')}
            value={relationship}
            maxLength={40}
            autoComplete="off"
            aria-label={t('relation')}
            script={script}
            onValueChange={setRelationship}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                amountRef.current?.focus();
              }
              if (e.key === 'Escape') cancelLine();
            }}
          />
        </div>
      </div>

      {/* desktop: गाँव */}
      <div className="hidden min-w-0 px-0.5 sm:block">
        <TranslitInput
          ref={villageDesktopRef}
          {...wire('village')}
          className="cell-input text-sm"
          placeholder={t('villagePh')}
          value={village}
          maxLength={40}
          autoComplete="off"
          aria-label={t('village')}
          script={script}
          onValueChange={(v) => {
            setVillage(v);
            setVillageRaw(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              focusRelation();
            }
            if (e.key === 'Escape') cancelLine();
          }}
        />
      </div>

      {/* desktop: रिश्ता */}
      <div className="hidden min-w-0 px-0.5 sm:block">
        <TranslitInput
          ref={relationDesktopRef}
          {...wire('relation')}
          className="cell-input text-sm"
          placeholder={t('relationPh')}
          value={relationship}
          maxLength={40}
          autoComplete="off"
          aria-label={t('relation')}
          script={script}
          onValueChange={setRelationship}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              amountRef.current?.focus();
            }
            if (e.key === 'Escape') cancelLine();
          }}
        />
      </div>

      {/* रकम — ya फिर नेवता/सामान (item mode) */}
      <div className="px-0.5">
        <div className="flex items-center justify-end gap-0.5">
          {itemMode ? (
            <span className="text-base" aria-hidden="true">🎁</span>
          ) : (
            <span className="font-hand text-base font-bold text-ink-soft">₹</span>
          )}
          {itemMode ? (
            <TranslitInput
              ref={itemRef}
              {...wire('item')}
              className="cell-input w-full text-right text-[14px]"
              placeholder={t('itemPh')}
              value={itemText}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="done"
              aria-label={t('itemMode')}
              script={script}
              onValueChange={(v) => {
                setItemText(v);
                setAmountErr('');
              }}
              onKeyDown={(e, fv) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (fv !== undefined) setItemText(fv);
                  doCommit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelLine();
                }
              }}
            />
          ) : (
            <input
              ref={amountRef}
              className="cell-input w-full text-right text-[15px] font-bold tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              value={amountRaw}
              enterKeyHint="done"
              aria-label={t('amount')}
              onChange={(e) => {
                setAmountRaw(sanitizeAmountInput(e.target.value));
                setAmountErr('');
              }}
              onKeyDown={(e) => {
                if (isIMEComposing(e)) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doCommit();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelLine();
                }
              }}
            />
          )}
          <FieldError msg={amountErr} />
        </div>
      </div>

      {/* desktop: तारीख */}
      <div className="hidden px-0.5 sm:block">
        <input
          type="date"
          className="cell-input text-right text-xs text-ink-soft"
          value={date}
          aria-label={t('date')}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => {
            if (isIMEComposing(e)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              doCommit();
            }
            if (e.key === 'Escape') cancelLine();
          }}
        />
      </div>

      {/* quick ₹ chips + नेवता toggle + duplicate note — only while writing */}
      {dup ? (
        <div className="col-span-full animate-stamp-in rounded-md border-2 border-dashed border-margin-red/60 bg-margin-red/5 px-3 py-2">
          <p className="text-sm text-ink">
            {t('duplicateWarning')} <span className="font-hand font-bold">{dup}</span>
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              className="ghost-ink-btn h-9 flex-1 text-base"
              onClick={() => {
                setDup(null);
                nameRef.current?.focus();
              }}
            >
              {t('no')}
            </button>
            <button className="ink-btn h-9 flex-1 text-base" onClick={() => doCommit(true)}>
              {t('writeAnyway')}
            </button>
          </div>
        </div>
      ) : sug.length > 0 ? (
        <SuggestionChips sug={sug} onChoose={choose} />
      ) : (
        <QuickAmounts
          amountRaw={amountRaw}
          itemText={itemText}
          itemMode={itemMode}
          onMode={(v) => {
            setItemMode(v);
            setAmountErr('');
            setTimeout(() => (v ? itemRef : amountRef).current?.focus(), 30);
          }}
          onPick={(q) => {
            setAmountRaw(String(q));
            setAmountErr('');
            nameRef.current?.focus();
          }}
        />
      )}
    </div>
  );
}

// ─── tap a written line → edit it right there ────────────────────────────────
export function EntryEditRow({
  entry,
  serial,
  script,
  focusCell,
  onDone,
}: {
  entry: DaaliEntry;
  serial: number;
  script: InputScriptSetting;
  /** the cell that was tapped — cursor starts there, pen-style */
  focusCell?: EditCell;
  onDone: () => void;
}) {
  const t = useT();
  const allEntries = useDaali((s) => s.allEntries);
  const updateEntry = useDaali((s) => s.updateEntry);
  const removeEntry = useDaali((s) => s.removeEntry);
  const { sug, wire, choose } = useSuggest();

  const [name, setName] = useState(entry.name);
  const [nameRaw, setNameRaw] = useState(entry.nameLatin || '');
  const [village, setVillage] = useState(entry.village);
  const [villageRaw, setVillageRaw] = useState(entry.villageLatin || '');
  const [relationship, setRelationship] = useState(entry.relationship);
  const [amountRaw, setAmountRaw] = useState(entry.amount ? String(entry.amount) : '');
  const [itemMode, setItemMode] = useState(!(entry.amount > 0));
  const [itemText, setItemText] = useState(entry.item || '');
  const [date, setDate] = useState(entry.date || todayISO());
  const [note, setNote] = useState(entry.note);
  const [nameErr, setNameErr] = useState('');
  const [amountErr, setAmountErr] = useState('');
  const [dup, setDup] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);
  const villageMobileRef = useRef<HTMLInputElement>(null);
  const villageDesktopRef = useRef<HTMLInputElement>(null);
  const relationMobileRef = useRef<HTMLInputElement>(null);
  const relationDesktopRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);

  const focusFirstVisible = (...els: Array<HTMLInputElement | null>) => {
    const el = els.find((x) => x && x.offsetParent !== null);
    el?.focus();
  };
  const focusAmount = () => focusFirstVisible(amountRef.current);

  // cursor starts on the tapped cell — jaise pen wahi rakha ho
  useEffect(() => {
    const tm = setTimeout(() => {
      switch (focusCell) {
        case 'amount':
          amountRef.current?.focus();
          break;
        case 'date':
          dateRef.current?.focus();
          break;
        case 'village':
          focusFirstVisible(villageMobileRef.current, villageDesktopRef.current);
          break;
        case 'relation':
          focusFirstVisible(relationMobileRef.current, relationDesktopRef.current);
          break;
        default:
          nameRef.current?.focus();
      }
    }, 40);
    return () => clearTimeout(tm);
  }, []);

  const amountNum = parseInt(amountRaw || '0', 10) || 0;

  const findDuplicate = () =>
    allEntries.find(
      (e) =>
        e.id !== entry.id &&
        e.eventId === entry.eventId &&
        e.name.trim() !== '' &&
        (normalizeName(e.name) === normalizeName(name) ||
          (!!nameRaw && !!e.nameLatin && normalizeName(e.nameLatin) === normalizeName(nameRaw)))
    );

  const doSave = async (force = false) => {
    if (busy) return;
    const nm = name.trim();
    const it = itemMode ? itemText.trim() : '';
    let ok = true;
    if (!nm) {
      setNameErr(t('nameRequired'));
      ok = false;
    } else setNameErr('');
    if (amountNum <= 0 && !it) {
      setAmountErr(t('amountRequired'));
      ok = false;
    } else setAmountErr('');
    if (!ok) {
      (nm ? (itemMode ? itemRef : amountRef) : nameRef).current?.focus();
      return;
    }
    if (!force && findDuplicate()) {
      setDup(nm);
      return;
    }
    setDup(null);
    setBusy(true);
    try {
      await updateEntry(entry.id, {
        name: nm,
        village,
        relationship,
        amount: it ? 0 : amountNum,
        item: it,
        date,
        note,
        nameLatin: nameRaw !== nm ? nameRaw : '',
        villageLatin: villageRaw !== village ? villageRaw : '',
      });
      toast.success(t('updatedToast'), { duration: 1500 });
      onDone();
    } catch {
      toast.error(t('saveError'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`ruled-row ${GRID} items-center bg-ink/[0.04]`}>
      <div className="text-center text-[13px] text-ink-soft">{String(serial).padStart(2, '0')}</div>

      <div className="min-w-0 px-0.5 py-1">
        <div className="flex items-center gap-1">
          <TranslitInput
            ref={nameRef}
            {...wire('name')}
            className="cell-input text-[15px] font-semibold"
            placeholder={t('namePh')}
            value={name}
            maxLength={60}
            autoComplete="off"
            aria-label={t('name')}
            script={script}
            onValueChange={(v) => {
              setName(v);
              setNameErr('');
            }}
            onRawChange={setNameRaw}
            onKeyDown={(e, fv) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (fv !== undefined) setName(fv);
                focusAmount();
              }
              if (e.key === 'Escape') {
                e.preventDefault();
                onDone();
              }
            }}
          />
          <FieldError msg={nameErr} />
        </div>
        {/* mobile: गाँव • रिश्ता second line */}
        <div className="mt-0.5 flex gap-2 sm:hidden">
          <TranslitInput
            ref={villageMobileRef}
            {...wire('village')}
            className="cell-input min-w-0 flex-1 text-[13px] text-ink-soft"
            placeholder={t('villagePh')}
            value={village}
            maxLength={40}
            autoComplete="off"
            aria-label={t('village')}
            script={script}
            onValueChange={(v) => {
              setVillage(v);
              setVillageRaw(v);
            }}
          />
          <TranslitInput
            className="cell-input min-w-0 flex-1 text-[13px] text-ink-soft"
            placeholder={t('relationPh')}
            value={relationship}
            maxLength={40}
            autoComplete="off"
            aria-label={t('relation')}
            script={script}
            onValueChange={setRelationship}
          />
        </div>
      </div>

      <div className="hidden min-w-0 px-0.5 sm:block">
        <TranslitInput
          className="cell-input text-sm"
          placeholder={t('villagePh')}
          value={village}
          maxLength={40}
          autoComplete="off"
          aria-label={t('village')}
          script={script}
          onValueChange={(v) => {
            setVillage(v);
            setVillageRaw(v);
          }}
        />
      </div>

      <div className="hidden min-w-0 px-0.5 sm:block">
        <TranslitInput
          className="cell-input text-sm"
          placeholder={t('relationPh')}
          value={relationship}
          maxLength={40}
          autoComplete="off"
          aria-label={t('relation')}
          script={script}
          onValueChange={setRelationship}
        />
      </div>

      <div className="px-0.5">
        <div className="flex items-center justify-end gap-0.5">
          {itemMode ? (
            <span className="text-base" aria-hidden="true">🎁</span>
          ) : (
            <span className="font-hand text-base font-bold text-ink-soft">₹</span>
          )}
          {itemMode ? (
            <TranslitInput
              ref={itemRef}
              {...wire('item')}
              className="cell-input w-full text-right text-[14px]"
              placeholder={t('itemPh')}
              value={itemText}
              maxLength={60}
              autoComplete="off"
              enterKeyHint="done"
              aria-label={t('itemMode')}
              script={script}
              onValueChange={(v) => {
                setItemText(v);
                setAmountErr('');
              }}
              onKeyDown={(e, fv) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (fv !== undefined) setItemText(fv);
                  doSave();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onDone();
                }
              }}
            />
          ) : (
            <input
              ref={amountRef}
              className="cell-input w-full text-right text-[15px] font-bold tabular-nums"
              style={{ fontVariantNumeric: 'tabular-nums' }}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              placeholder="0"
              value={amountRaw}
              enterKeyHint="done"
              aria-label={t('amount')}
              onChange={(e) => {
                setAmountRaw(sanitizeAmountInput(e.target.value));
                setAmountErr('');
              }}
              onKeyDown={(e) => {
                if (isIMEComposing(e)) return;
                if (e.key === 'Enter') {
                  e.preventDefault();
                  doSave();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onDone();
                }
              }}
            />
          )}
          <FieldError msg={amountErr} />
        </div>
      </div>

      <div className="hidden px-0.5 sm:block">
        <input
          ref={dateRef}
          type="date"
          className="cell-input text-right text-xs text-ink-soft"
          value={date}
          aria-label={t('date')}
          onChange={(e) => setDate(e.target.value)}
          onKeyDown={(e) => {
            if (isIMEComposing(e)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              doSave();
            }
            if (e.key === 'Escape') onDone();
          }}
        />
      </div>

      {/* dictionary suggestions while editing */}
      {sug.length > 0 && <SuggestionChips sug={sug} onChoose={choose} />}

      {/* नोट + actions — साथ mein नकद/नेवता toggle */}
      <div className="col-span-full flex flex-wrap items-center gap-1.5 pb-1.5 pt-0.5">
        <ModeChips
          itemMode={itemMode}
          onMode={(v) => {
            setItemMode(v);
            setAmountErr('');
          }}
          label={t('amount')}
        />
        <input
          className="cell-input min-w-0 flex-1 text-[13px] text-ink-soft"
          placeholder={t('notePh')}
          value={note}
          maxLength={80}
          autoComplete="off"
          aria-label={t('note')}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (isIMEComposing(e)) return;
            if (e.key === 'Enter') {
              e.preventDefault();
              doSave();
            }
            if (e.key === 'Escape') onDone();
          }}
        />
        <button
          className="ghost-ink-btn flex h-9 w-9 shrink-0 items-center justify-center !border-margin-red/50 !text-margin-red"
          onClick={() => setConfirmDelete(true)}
          aria-label={t('delete')}
        >
          <Trash2 className="h-4 w-4" />
        </button>
        <button className="ghost-ink-btn h-9 px-3 text-base" onClick={onDone}>
          {t('cancel')}
        </button>
        <button className="ink-btn h-9 px-4 text-base" onClick={() => doSave()}>
          {t('save')}
        </button>
      </div>

      {dup && (
        <div className="col-span-full animate-stamp-in rounded-md border-2 border-dashed border-margin-red/60 bg-margin-red/5 px-3 py-2">
          <p className="text-sm text-ink">
            {t('duplicateWarning')} <span className="font-hand font-bold">{dup}</span>
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              className="ghost-ink-btn h-9 flex-1 text-base"
              onClick={() => {
                setDup(null);
                nameRef.current?.focus();
              }}
            >
              {t('no')}
            </button>
            <button className="ink-btn h-9 flex-1 text-base" onClick={() => doSave(true)}>
              {t('writeAnyway')}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteConfirmTitle')}
        description={
          <>
            <span className="font-hand text-lg font-bold text-ink">{entry.name}</span>
            <br />
            <span className="font-semibold">
              {entry.amount > 0 ? formatRupees(entry.amount) : (entry.item || t('itemMode'))}
              {entry.date ? ` • ${isoToDisplayDate(entry.date)}` : ''}
            </span>
          </>
        }
        confirmLabel={t('yesDelete')}
        cancelLabel={t('no')}
        destructive
        onConfirm={async () => {
          await removeEntry(entry.id);
          toast(t('deletedToast'), { duration: 1500 });
          setConfirmDelete(false);
          onDone();
        }}
      />
    </div>
  );
}
