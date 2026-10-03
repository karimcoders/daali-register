'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDaali } from '@/lib/daali/store';
import { useT } from './use-t';
import { HomeScreen } from './home-screen';
import { Notebook } from './notebook';
import { EntrySheet } from './entry-sheet';
import { NewEventSheet } from './new-event-sheet';
import { SearchOverlay } from './search-overlay';
import { SettingsSheet } from './settings-sheet';
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

  const [entryOpen, setEntryOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [newEventOpen, setNewEventOpen] = useState(false);
  const [renameId, setRenameId] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
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

  const openAddEntry = useCallback(() => {
    if (view === 'notebook') {
      setEditId(null);
      setEntryOpen(true);
    } else {
      // home → create a new register
      setRenameId(null);
      setNewEventOpen(true);
    }
  }, [view]);

  const openEditEntry = useCallback((id: string) => {
    setEditId(id);
    setEntryOpen(true);
  }, []);

  const openRename = useCallback(() => {
    setRenameId(currentEventId);
    setNewEventOpen(true);
  }, [currentEventId]);

  if (!hydrated) return <Splash />;
  if (locked) return <PinLock />;

  return (
    <div className="flex min-h-dvh flex-col">
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
            onAddEntry={openAddEntry}
            onEditEntry={openEditEntry}
            onRenameEvent={openRename}
            onDeleteEvent={() => setConfirmDeleteEvent(true)}
            onPrint={handlePrint}
          />
        )}
      </div>

      <BottomNav
        onSearch={() => setSearchOpen(true)}
        onAdd={openAddEntry}
        onMore={() => setSettingsOpen(true)}
      />

      {/* sheets & overlays */}
      <EntrySheet open={entryOpen} onOpenChange={setEntryOpen} editId={editId} />
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
      />

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
