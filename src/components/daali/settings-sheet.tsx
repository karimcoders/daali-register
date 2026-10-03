'use client';

import { useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { Switch } from '@/components/ui/switch';
import { useDaali } from '@/lib/daali/store';
import { backupStamp, downloadFile, isoToDisplayDate } from '@/lib/daali/format';
import type { BackupFile, SortMode } from '@/lib/daali/types';
import { useT } from './use-t';
import { ConfirmDialog } from './ui-bits';
import { toast } from 'sonner';
import {
  AlertTriangle,
  Database,
  FileDown,
  FileUp,
  History,
  Info,
  Languages,
  Lock,
  Moon,
  PenLine,
  Printer,
  Sparkles,
} from 'lucide-react';
import { downloadRegisterPdf } from '@/lib/daali/pdf';
import { sortEntries } from '@/lib/daali/store';

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink/15 bg-[var(--paper-2)]/60 p-3">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-ink">
        <span className="text-ink-soft">{icon}</span>
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SettingsSheet({
  open,
  onOpenChange,
  onPrint,
  onHistory,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPrint: () => void;
  onHistory: () => void;
}) {
  const t = useT();
  const settings = useDaali((s) => s.settings);
  const setLanguage = useDaali((s) => s.setLanguage);
  const setInputScript = useDaali((s) => s.setInputScript);
  const setDarkMode = useDaali((s) => s.setDarkMode);
  const setPageAnimation = useDaali((s) => s.setPageAnimation);
  const setSortMode = useDaali((s) => s.setSortMode);
  const setPin = useDaali((s) => s.setPin);
  const view = useDaali((s) => s.view);
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const currentEventId = useDaali((s) => s.currentEventId);
  const importBackup = useDaali((s) => s.importBackup);
  const idbOk = useDaali((s) => s.idbOk);
  const [pdfBusy, setPdfBusy] = useState(false);

  const [pinMode, setPinMode] = useState<'idle' | 'set'>('idle');
  const [pinValue, setPinValue] = useState('');
  const [pinErr, setPinErr] = useState('');
  const [restoreData, setRestoreData] = useState<BackupFile | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasPin = !!settings.pinHash;

  const exportJSON = () => {
    const backup: BackupFile = {
      app: 'daali-register',
      version: 1,
      exportedAt: Date.now(),
      events,
      entries: allEntries,
    };
    downloadFile(
      JSON.stringify(backup, null, 2),
      `daali-backup-${backupStamp()}.json`,
      'application/json'
    );
    toast.success(t('backupSaved'), { duration: 1800 });
  };

  const exportCSV = () => {
    const header = ['क्र.', 'शादी/कार्यक्रम', 'नाम', 'गाँव/स्थान', 'रिश्ता', 'रकम', 'सामान/नेवता', 'तारीख', 'नोट'];
    const inNotebook = view === 'notebook' && currentEventId;
    const rows = allEntries
      .filter((e) => (inNotebook ? e.eventId === currentEventId : true))
      .map((e, i) => {
        const ev = events.find((x) => x.id === e.eventId);
        return [
          String(i + 1),
          ev?.name ?? '',
          e.name,
          e.village,
          e.relationship,
          e.amount > 0 ? String(e.amount) : '',
          e.item || '',
          e.date ? isoToDisplayDate(e.date) : '',
          e.note,
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',');
      });
    const csv = '\uFEFF' + header.join(',') + '\n' + rows.join('\n');
    const suffix = inNotebook ? (events.find((e) => e.id === currentEventId)?.name ?? 'register') : 'sabhi';
    downloadFile(csv, `daali-${suffix}-${backupStamp()}.csv`, 'text/csv;charset=utf-8;');
    toast.success(t('backupSaved'), { duration: 1800 });
  };

  const pickRestore = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result)) as BackupFile;
        if (data && data.app === 'daali-register' && Array.isArray(data.events) && Array.isArray(data.entries)) {
          setRestoreData(data);
        } else {
          toast.error(t('restoreFail'));
        }
      } catch {
        toast.error(t('restoreFail'));
      }
    };
    reader.readAsText(file);
  };

  const savePin = () => {
    if (!/^\d{4}$/.test(pinValue)) {
      setPinErr(t('enterPin'));
      return;
    }
    setPin(pinValue);
    setPinValue('');
    setPinErr('');
    setPinMode('idle');
    toast.success('✓ ' + t('pinLock'), { duration: 1500 });
  };

  const sortOptions: Array<{ v: SortMode; label: string }> = [
    { v: 'register', label: t('sortRegister') },
    { v: 'name', label: t('sortName') },
    { v: 'amount', label: t('sortAmount') },
    { v: 'date', label: t('sortDate') },
  ];

  const handlePdfDownload = async () => {
    if (pdfBusy || view !== 'notebook' || !currentEventId) return;
    const event = events.find((e) => e.id === currentEventId);
    if (!event) return;
    setPdfBusy(true);
    try {
      const entries = sortEntries(
        allEntries.filter((e) => e.eventId === currentEventId),
        settings.sortMode
      );
      toast.info(t('pdfMaking'), { duration: 4000 });
      await downloadRegisterPdf(event, entries, settings.language);
      toast.success(t('pdfDone'), { duration: 2500 });
      onOpenChange(false);
    } catch {
      toast.error(t('pdfError'), { duration: 3000 });
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <>
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="paper-slip border-0 !bg-[var(--paper)]">
          <div className="mx-auto w-full max-w-md px-5 pb-8 pt-1">
            <DrawerHeader className="px-0 pb-3 pt-0 text-center">
              <DrawerTitle className="font-hand text-2xl text-ink">⚙️ {t('settings')}</DrawerTitle>
              <DrawerDescription className="sr-only">{t('settings')}</DrawerDescription>
            </DrawerHeader>

            <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-0.5" style={{ scrollbarWidth: 'thin' }}>
              {!idbOk && (
                <div className="flex items-start gap-2 rounded-lg border-2 border-dashed border-margin-red/50 bg-margin-red/5 p-3 text-sm text-ink">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-margin-red" />
                  <span>⚠️ इस ब्राउज़र में डेटा सेव होने में दिक्कत है। कृपया बैकअप ज़रूर सेव करें।</span>
                </div>
              )}

              {/* Language */}
              <Section icon={<Languages className="h-4 w-4" />} title={t('language')}>
                <div className="flex gap-2">
                  {(['hi', 'ur', 'en'] as const).map((l) => (
                    <button
                      key={l}
                      className={`chip h-10 flex-1 text-[15px] ${settings.language === l ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
                      onClick={() => setLanguage(l)}
                      aria-pressed={settings.language === l}
                    >
                      {l === 'hi' ? t('hindi') : l === 'ur' ? t('urdu') : t('english')}
                    </button>
                  ))}
                </div>
              </Section>

              {/* Writing script — हिंदी / اردو / English typing */}
              <Section icon={<PenLine className="h-4 w-4" />} title={t('scriptLabel')}>
                <div className="flex gap-2">
                  {([
                    { v: 'hi' as const, label: t('scriptHi') },
                    { v: 'ur' as const, label: t('scriptUr') },
                    { v: 'off' as const, label: t('scriptEn') },
                  ]).map((o) => (
                    <button
                      key={o.v}
                      className={`chip h-10 flex-1 text-[15px] ${settings.inputScript === o.v ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
                      onClick={() => setInputScript(o.v)}
                      aria-pressed={settings.inputScript === o.v}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{t('scriptHint')}</p>
              </Section>

              {/* Display */}
              <Section icon={<Moon className="h-4 w-4" />} title={`${t('darkMode')} / ${t('pageAnimation')}`}>
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[15px] text-ink">
                      {t('darkMode')}
                      <span className="block text-xs text-ink-soft">{t('darkModeHint')}</span>
                    </span>
                    <Switch checked={settings.darkMode} onCheckedChange={setDarkMode} aria-label={t('darkMode')} />
                  </label>
                  <label className="flex items-center justify-between gap-3">
                    <span className="text-[15px] text-ink">{t('pageAnimation')}</span>
                    <Switch
                      checked={settings.pageAnimation}
                      onCheckedChange={setPageAnimation}
                      aria-label={t('pageAnimation')}
                    />
                  </label>
                </div>
              </Section>

              {/* Sorting */}
              <Section icon={<Sparkles className="h-4 w-4" />} title={t('sort')}>
                <div className="grid grid-cols-2 gap-2">
                  {sortOptions.map((o) => (
                    <button
                      key={o.v}
                      className={`chip h-10 ${settings.sortMode === o.v ? '!border-margin-red !bg-margin-red/10 font-bold' : ''}`}
                      onClick={() => setSortMode(o.v)}
                      aria-pressed={settings.sortMode === o.v}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </Section>

              {/* PIN lock */}
              <Section icon={<Lock className="h-4 w-4" />} title={t('pinLock')}>
                {hasPin ? (
                  <button
                    className="ghost-ink-btn h-10 w-full !border-margin-red/50 !text-margin-red"
                    onClick={() => {
                      setPin(null);
                      toast.success('✓ ' + t('pinLock') + ' — ' + t('removePin').toLowerCase(), { duration: 1500 });
                    }}
                  >
                    {t('removePin')}
                  </button>
                ) : pinMode === 'set' ? (
                  <div>
                    <input
                      className="paper-input text-center text-2xl tracking-[0.6em]"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={4}
                      placeholder="••••"
                      value={pinValue}
                      aria-label={t('enterPin')}
                      onChange={(e) => {
                        setPinValue(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
                        setPinErr('');
                      }}
                      onKeyDown={(e) => e.key === 'Enter' && savePin()}
                    />
                    {pinErr && <p className="mt-0.5 text-sm text-margin-red">{pinErr}</p>}
                    <div className="mt-2 flex gap-2">
                      <button
                        className="ghost-ink-btn h-10 flex-1"
                        onClick={() => {
                          setPinMode('idle');
                          setPinValue('');
                          setPinErr('');
                        }}
                      >
                        {t('cancel')}
                      </button>
                      <button className="ink-btn h-10 flex-1" onClick={savePin}>
                        ✓ {t('save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button className="ghost-ink-btn h-10 w-full" onClick={() => setPinMode('set')}>
                      {t('setPin')}
                    </button>
                    <p className="mt-1 text-xs text-ink-soft">{t('pinLockHint')}</p>
                  </>
                )}
              </Section>

              {/* Backup */}
              <Section icon={<Database className="h-4 w-4" />} title={t('backupTitle')}>
                <div className="grid gap-2">
                  <button className="ghost-ink-btn h-11 w-full" onClick={exportJSON}>
                    <span className="inline-flex items-center gap-2">
                      <FileDown className="h-4 w-4" /> {t('saveBackup')}
                    </span>
                  </button>
                  <button className="ghost-ink-btn h-11 w-full" onClick={() => fileRef.current?.click()}>
                    <span className="inline-flex items-center gap-2">
                      <FileUp className="h-4 w-4" /> {t('restoreBackup')}
                    </span>
                  </button>
                  <button className="ghost-ink-btn h-11 w-full" onClick={exportCSV}>
                    <span className="inline-flex items-center gap-2">
                      <FileDown className="h-4 w-4" /> {t('exportCsv')}
                    </span>
                  </button>
                  {view === 'notebook' && (
                    <>
                      <button
                        className="ink-btn h-11 w-full"
                        onClick={handlePdfDownload}
                        disabled={pdfBusy}
                      >
                        <span className="inline-flex items-center gap-2">
                          <FileDown className="h-4 w-4" /> {pdfBusy ? t('pdfMaking') : t('pdfDownload')}
                        </span>
                      </button>
                      <button className="ghost-ink-btn h-11 w-full" onClick={onPrint}>
                        <span className="inline-flex items-center gap-2">
                          <Printer className="h-4 w-4" /> {t('printPdf')}
                        </span>
                      </button>
                      <button className="ghost-ink-btn h-11 w-full" onClick={onHistory}>
                        <span className="inline-flex items-center gap-2">
                          <History className="h-4 w-4" /> {t('viewHistory')}
                        </span>
                      </button>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    aria-hidden="true"
                    tabIndex={-1}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) pickRestore(f);
                      e.target.value = '';
                    }}
                  />
                </div>
              </Section>

              {/* About */}
              <Section icon={<Info className="h-4 w-4" />} title={t('about')}>
                <p className="text-sm leading-relaxed text-ink-soft">{t('aboutText')}</p>
              </Section>
            </div>
          </div>
        </DrawerContent>
      </Drawer>

      <ConfirmDialog
        open={!!restoreData}
        onOpenChange={(v) => !v && setRestoreData(null)}
        title={t('restoreBackup')}
        description={t('confirmRestore')}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('cancel')}
        destructive
        onConfirm={() => {
          if (restoreData) {
            importBackup(restoreData.events, restoreData.entries);
            toast.success(t('restoreOk'), { duration: 2000 });
            setRestoreData(null);
            onOpenChange(false);
          }
        }}
      />
    </>
  );
}
