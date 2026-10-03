'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDaali, sortEntries } from '@/lib/daali/store';
import { downloadRegisterPdf } from '@/lib/daali/pdf';
import { toast } from 'sonner';
import { useT } from './use-t';
import { HomeScreen } from './home-screen';
import { Notebook } from './notebook';
import { NewEventSheet } from './new-event-sheet';
import { SearchOverlay } from './search-overlay';
import { SettingsSheet } from './settings-sheet';
import { HistorySheet } from './history-sheet';
import { PinLock } from './pin-lock';
import { PrintRegister } from './print-register';
import { BottomNav } from './bottom-nav';
import { ConfirmDialog } from './ui-bits';

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="paper w-full max-w-xs px-6 py-12 text-center">
        <div className="paper-spine" />
        <div className="paper-margin" />
        <div className="animate-stamp-in">
          <div className="text-5xl" aria-hidden="true">
            📖
          </div>
          <h1 className="mt-3 font-hand text-2xl font-bold text-ink">दाली रजिस्टर</h1>
          <p className="mt-2 text-xs text-ink-soft">खोली जा रही है…</p>
        </div>
      </div>
    </div>
  );
}

export function DaaliApp() {
  const t = useT();
  const hydrated = useDaali((s) => s.hydrated);
  const locked = useDaali((s) => s.locked);
  const view = useDaali((s) => s.view);
  const init = useDaali((s) => s.init);
  const deleteEvent = useDaali((s) => s.deleteEvent);
  const currentEventId = useDaali((s) => s.currentEventId);
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const settings = useDaali((s) => s.settings);

  const [newEventOpen, setNewEventOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmDeleteEvent, setConfirmDeleteEvent] = useState(false);
  const printTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    init();
  }, [init]);

  const handlePrint = useCallback(() => {
    if (view !== 'notebook' || printing) return;
    setPrinting(true);
    // let the print view render, then open the print dialog
    printTimer.current = setTimeout(() => {
      window.print();
    }, 250);
  }, [view, printing]);

  // real .pdf file download — seedha download ho jata hai, print dialog nahi aata
  const handlePdf = useCallback(async () => {
    if (view !== 'notebook' || pdfBusy || !currentEventId) return;
    const event = events.find((e) => e.id === currentEventId);
    if (!event) return;
    setPdfBusy(true);
    toast.info(t('pdfMaking'), { duration: 4000 });
    try {
      const entries = sortEntries(
        allEntries.filter((e) => e.eventId === currentEventId),
        settings.sortMode
      );
      await downloadRegisterPdf(event, entries, settings.language);
      toast.success(t('pdfDone'), { duration: 2500 });
    } catch (err) {
      if (typeof window !== 'undefined') {
        (window as unknown as { __pdfError?: string }).__pdfError = String(
          err instanceof Error ? err.stack : err
        );
      }
      toast.error(t('pdfError'), { duration: 3000 });
    } finally {
      setPdfBusy(false);
    }
  }, [view, pdfBusy, currentEventId, events, allEntries, settings, t]);

  useEffect(() => {
    const after = () => {
      setPrinting(false);
      if (printTimer.current) clearTimeout(printTimer.current);
    };
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('afterprint', after);
      if (printTimer.current) clearTimeout(printTimer.current);
    };
  }, []);

  // ＋ button: notebook → write on the next line (no popup); home → new register
  const handleAdd = useCallback(() => {
    if (view === 'notebook') {
      window.dispatchEvent(new CustomEvent('daali:write-focus'));
    } else {
      setRenameId(null);
      setNewEventOpen(true);
    }
  }, [view]);

  const openRename = useCallback(() => {
    setRenameId(currentEventId);
    setNewEventOpen(true);
  }, [currentEventId]);

  if (!hydrated) return <Splash />;
  if (locked) return <PinLock />;

  return (
    <div className="no-print flex min-h-dvh flex-col">
      <div
        className="flex-1"
        style={{ paddingBottom: 'calc(4rem + env(safe-area-inset-bottom, 0px))' }}
      >
        {view === 'home' ? (
          <HomeScreen
            onNewRegister={() => {
              setRenameId(null);
              setNewEventOpen(true);
            }}
            onRename={(id) => {
              setRenameId(id);
              setNewEventOpen(true);
            }}
          />
        ) : (
          <Notebook
            onRenameEvent={openRename}
            onDeleteEvent={() => setConfirmDeleteEvent(true)}
            onPrint={handlePrint}
            onPdf={handlePdf}
            onHistory={() => setHistoryOpen(true)}
          />
        )}
      </div>

      <BottomNav
        onSearch={() => setSearchOpen(true)}
        onAdd={handleAdd}
        onMore={() => setSettingsOpen(true)}
      />

      {/* sheets & overlays */}
      <NewEventSheet
        open={newEventOpen}
        onOpenChange={setNewEventOpen}
        renameOf={renameId}
      />
      <SearchOverlay open={searchOpen} onOpenChange={setSearchOpen} />
      <SettingsSheet
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onPrint={() => {
          setSettingsOpen(false);
          setTimeout(handlePrint, 120);
        }}
        onHistory={() => {
          setSettingsOpen(false);
          setHistoryOpen(true);
        }}
      />
      <HistorySheet open={historyOpen} onOpenChange={setHistoryOpen} />

      {printing && <PrintRegister />}

      <ConfirmDialog
        open={confirmDeleteEvent}
        onOpenChange={setConfirmDeleteEvent}
        title={t('deleteEventTitle')}
        description={t('deleteEventWarn')}
        confirmLabel={t('yesDelete')}
        cancelLabel={t('no')}
        destructive
        onConfirm={() => {
          if (currentEventId) deleteEvent(currentEventId);
          setConfirmDeleteEvent(false);
        }}
      />
    </div>
  );
}
