'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useDaali } from '@/lib/daali/store';
import { formatRupees, sanitizeAmountInput, todayISO } from '@/lib/daali/format';
import { normalizeName } from '@/lib/daali/format';
import { RELATIONSHIP_SUGGESTIONS_HI } from '@/lib/daali/types';
import { useT } from './use-t';
import { ConfirmDialog } from './ui-bits';
import { toast } from 'sonner';
import { Trash2, Zap } from 'lucide-react';

const QUICK_AMOUNTS = [101, 251, 501, 1001, 2001, 5001];

export function EntrySheet({
  open,
  onOpenChange,
  editId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editId?: string | null;
}) {
  const t = useT();
  const allEntries = useDaali((s) => s.allEntries);
  const addEntry = useDaali((s) => s.addEntry);
  const updateEntry = useDaali((s) => s.updateEntry);
  const removeEntry = useDaali((s) => s.removeEntry);

  const isEdit = !!editId;
  const editEntry = allEntries.find((e) => e.id === editId);

  const [name, setName] = useState('');
  const [village, setVillage] = useState('');
  const [relationship, setRelationship] = useState('');
  const [amountRaw, setAmountRaw] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [quickMode, setQuickMode] = useState(false);
  const [nameErr, setNameErr] = useState('');
  const [amountErr, setAmountErr] = useState('');
  const [dupWarning, setDupWarning] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    if (open) {
      setDupWarning(false);
      setNameErr('');
      setAmountErr('');
      if (editEntry) {
        setName(editEntry.name);
        setVillage(editEntry.village);
        setRelationship(editEntry.relationship);
        setAmountRaw(editEntry.amount ? String(editEntry.amount) : '');
        setDate(editEntry.date || '');
        setNote(editEntry.note);
        setQuickMode(false);
      } else {
        setName('');
        setVillage('');
        setRelationship('');
        setAmountRaw('');
        setDate(todayISO());
        setNote('');
      }
      setTimeout(() => nameRef.current?.focus(), 380);
    }
  }, [open, editId]);

  const amountNum = parseInt(amountRaw || '0', 10) || 0;

  const findDuplicate = () =>
    allEntries.find(
      (e) => e.id !== editId && normalizeName(e.name) === normalizeName(name) && e.name.trim() !== ''
    );

  const doSave = async () => {
    if (busyRef.current) return;
    let ok = true;
    if (!name.trim()) {
      setNameErr(t('nameRequired'));
      ok = false;
    } else setNameErr('');
    if (amountNum <= 0) {
      setAmountErr(t('amountRequired'));
      ok = false;
    } else setAmountErr('');
    if (!ok) return;

    // duplicate warning — never block, just confirm
    if (!dupWarning && findDuplicate()) {
      setDupWarning(true);
      return;
    }
    setDupWarning(false);
    busyRef.current = true;
    const payload = {
      name,
      village,
      relationship,
      amount: amountNum,
      date,
      note,
    };
    try {
      if (isEdit && editId) {
        await updateEntry(editId, payload);
        toast.success(t('updatedToast'), { duration: 1800 });
        onOpenChange(false);
      } else {
        await addEntry(payload);
        if (quickMode) {
          // fast entry: clear and continue writing
          setName('');
          setAmountRaw('');
          setNameErr('');
          setAmountErr('');
          toast.success(`✓ ${name.trim()} — ${formatRupees(amountNum)}`, { duration: 1400 });
          nameRef.current?.focus();
        } else {
          toast.success(t('savedToast'), { duration: 1800 });
          onOpenChange(false);
        }
      }
    } catch {
      toast.error(t('saveError'));
    } finally {
      busyRef.current = false;
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="paper-slip border-0 !bg-[var(--paper)]">
          <div className="mx-auto w-full max-w-md px-5 pb-7 pt-1">
            <DrawerHeader className="px-0 pb-1 pt-0 text-center">
              <DrawerTitle className="font-hand text-2xl text-ink">
                {isEdit ? t('editEntry') : t('addEntry')}
              </DrawerTitle>
              <DrawerDescription className="sr-only">
                {isEdit ? t('editEntry') : t('addEntry')}
              </DrawerDescription>
            </DrawerHeader>

            <div className="space-y-3.5">
              {/* नाम */}
              <div>
                <label className="mb-0.5 block text-sm font-medium text-ink" htmlFor="en-name">
                  {t('name')} <span className="text-margin-red">*</span>
                </label>
                <input
                  id="en-name"
                  ref={nameRef}
                  className="paper-input text-lg"
                  placeholder={t('namePh')}
                  value={name}
                  maxLength={60}
                  autoComplete="off"
                  enterKeyHint="next"
                  onChange={(e) => {
                    setName(e.target.value);
                    setNameErr('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      amountRef.current?.focus();
                    }
                  }}
                />
                {nameErr && <p className="mt-0.5 text-sm text-margin-red">{nameErr}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="mb-0.5 block text-sm font-medium text-ink" htmlFor="en-village">
                    {t('village')}
                  </label>
                  <input
                    id="en-village"
                    className="paper-input"
                    placeholder={t('villagePh')}
                    value={village}
                    maxLength={40}
                    autoComplete="off"
                    onChange={(e) => setVillage(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-sm font-medium text-ink" htmlFor="en-rel">
                    {t('relation')}
                  </label>
                  <input
                    id="en-rel"
                    className="paper-input"
                    placeholder={t('relationPh')}
                    value={relationship}
                    maxLength={40}
                    autoComplete="off"
                    list="rel-suggestions"
                    onChange={(e) => setRelationship(e.target.value)}
                  />
                  <datalist id="rel-suggestions">
                    {RELATIONSHIP_SUGGESTIONS_HI.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              {/* रकम */}
              <div>
                <div className="mb-0.5 flex items-baseline justify-between">
                  <label className="text-sm font-medium text-ink" htmlFor="en-amount">
                    {t('amount')} <span className="text-margin-red">*</span>
                  </label>
                  {amountNum > 0 && (
                    <span className="font-hand text-base font-bold text-ink">{formatRupees(amountNum)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-hand text-2xl font-bold text-ink">₹</span>
                  <input
                    id="en-amount"
                    ref={amountRef}
                    className="paper-input text-2xl font-bold"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="off"
                    placeholder="0"
                    value={amountRaw}
                    enterKeyHint={isEdit ? 'done' : 'next'}
                    onChange={(e) => {
                      setAmountRaw(sanitizeAmountInput(e.target.value));
                      setAmountErr('');
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        doSave();
                      }
                    }}
                  />
                </div>
                {amountErr && <p className="mt-0.5 text-sm text-margin-red">{amountErr}</p>}

                {/* quick amount chips */}
                <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Quick amounts">
                  {QUICK_AMOUNTS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      className={`chip h-9 min-w-[3.4rem] ${String(q) === amountRaw ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
                      onClick={() => {
                        setAmountRaw(String(q));
                        setAmountErr('');
                        nameRef.current?.focus();
                      }}
                    >
                      {formatRupees(q)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-[1fr_1.2fr] gap-3.5">
                <div>
                  <label className="mb-0.5 block text-sm font-medium text-ink" htmlFor="en-date">
                    {t('date')}
                  </label>
                  <input
                    id="en-date"
                    type="date"
                    className="paper-input"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-sm font-medium text-ink" htmlFor="en-note">
                    {t('note')}
                  </label>
                  <input
                    id="en-note"
                    className="paper-input"
                    placeholder={t('notePh')}
                    value={note}
                    maxLength={80}
                    autoComplete="off"
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && doSave()}
                  />
                </div>
              </div>

              {/* duplicate warning — paper note style */}
              {dupWarning && (
                <div className="animate-stamp-in rounded-md border-2 border-dashed border-margin-red/60 bg-margin-red/5 p-3">
                  <p className="text-[15px] text-ink">{t('duplicateWarning')}</p>
                  {findDuplicate() && (
                    <p className="mt-0.5 font-hand text-ink-soft">
                      ✎ {findDuplicate()!.name} — {formatRupees(findDuplicate()!.amount)}
                    </p>
                  )}
                  <div className="mt-2 flex gap-2">
                    <button
                      className="ghost-ink-btn h-10 flex-1"
                      onClick={() => {
                        setDupWarning(false);
                        nameRef.current?.focus();
                      }}
                    >
                      {t('no')}
                    </button>
                    <button className="ink-btn h-10 flex-1" onClick={doSave}>
                      {t('writeAnyway')}
                    </button>
                  </div>
                </div>
              )}

              {/* quick entry mode toggle — only when adding */}
              {!isEdit && !dupWarning && (
                <button
                  type="button"
                  role="switch"
                  aria-checked={quickMode}
                  onClick={() => setQuickMode((v) => !v)}
                  className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left transition-colors ${
                    quickMode ? 'border-margin-red/60 bg-margin-red/5' : 'border-ink/20'
                  }`}
                >
                  <span>
                    <span className="flex items-center gap-1.5 text-[15px] font-medium text-ink">
                      <Zap className={`h-4 w-4 ${quickMode ? 'text-margin-red' : 'text-ink-soft'}`} />
                      {t('quickMode')}
                    </span>
                    <span className="block text-xs text-ink-soft">{t('quickModeHint')}</span>
                  </span>
                  <span
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                      quickMode ? 'bg-margin-red' : 'bg-ink/25'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                        quickMode ? 'left-[1.4rem]' : 'left-0.5'
                      }`}
                    />
                  </span>
                </button>
              )}

              {/* actions */}
              <div className="flex gap-3 pt-1">
                {isEdit && (
                  <button
                    className="ghost-ink-btn flex h-12 w-12 shrink-0 items-center justify-center !border-margin-red/50 !text-margin-red"
                    onClick={() => setConfirmDelete(true)}
                    aria-label={t('delete')}
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
                <button className="ghost-ink-btn h-12 flex-1 text-lg" onClick={() => onOpenChange(false)}>
                  {t('cancel')}
                </button>
                <button className="ink-btn h-12 flex-[2] text-xl" onClick={doSave}>
                  {isEdit ? t('save') : t('writeIt')}
                </button>
              </div>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      {/* delete confirm */}
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t('deleteConfirmTitle')}
        description={
          editEntry ? (
            <>
              <span className="font-hand text-lg font-bold text-ink">{editEntry.name}</span>
              <br />
              <span className="font-semibold">{formatRupees(editEntry.amount)}</span>
            </>
          ) : undefined
        }
        confirmLabel={t('yesDelete')}
        cancelLabel={t('no')}
        destructive
        onConfirm={async () => {
          if (editId) {
            await removeEntry(editId);
            toast(t('deletedToast'), { duration: 1800 });
          }
          setConfirmDelete(false);
          onOpenChange(false);
        }}
      />
    </>
  );
}
