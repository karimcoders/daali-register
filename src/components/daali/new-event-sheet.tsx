'use client';

import { useEffect, useRef, useState } from 'react';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription } from '@/components/ui/drawer';
import { useDaali } from '@/lib/daali/store';
import { useT } from './use-t';
import { toast } from 'sonner';

export function NewEventSheet({
  open,
  onOpenChange,
  renameOf,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  renameOf?: string | null;
}) {
  const t = useT();
  const createEvent = useDaali((s) => s.createEvent);
  const renameEvent = useDaali((s) => s.renameEvent);
  const openEvent = useDaali((s) => s.openEvent);
  const events = useDaali((s) => s.events);

  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [location, setLocation] = useState('');
  const [err, setErr] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) {
      setErr('');
      if (renameOf) {
        const ev = events.find((e) => e.id === renameOf);
        setName(ev?.name ?? '');
        setDate(ev?.date ?? '');
        setLocation(ev?.location ?? '');
      } else {
        setName('');
        setDate('');
        setLocation('');
      }
      setTimeout(() => nameRef.current?.focus(), 350);
    }
  }, [open, renameOf, events]);

  const submit = async () => {
    if (savingRef.current) return;
    if (!name.trim()) {
      setErr(t('nameNeeded'));
      nameRef.current?.focus();
      return;
    }
    savingRef.current = true;
    try {
      if (renameOf) {
        await renameEvent(renameOf, name);
        toast(t('updatedToast'));
      } else {
        const id = await createEvent(name, date, location);
        onOpenChange(false);
        openEvent(id);
        return;
      }
      onOpenChange(false);
    } catch {
      toast.error(t('saveError'));
    } finally {
      savingRef.current = false;
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="paper-slip border-0 !bg-[var(--paper)]">
        <div className="mx-auto w-full max-w-md px-5 pb-8 pt-1">
          <DrawerHeader className="px-0 pb-2 pt-0 text-center">
            <DrawerTitle className="font-hand text-2xl text-ink">
              {renameOf ? t('renameEvent') : t('newRegisterTitle')}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              {renameOf ? t('renameEvent') : t('newRegisterTitle')}
            </DrawerDescription>
          </DrawerHeader>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-ink" htmlFor="ev-name">
                {t('eventName')} <span className="text-margin-red">*</span>
              </label>
              <input
                id="ev-name"
                ref={nameRef}
                className="paper-input text-lg"
                placeholder={t('eventNamePh')}
                value={name}
                maxLength={60}
                onChange={(e) => {
                  setName(e.target.value);
                  setErr('');
                }}
                onKeyDown={(e) => e.key === 'Enter' && submit()}
              />
              {err && <p className="mt-1 text-sm text-margin-red">{err}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="ev-date">
                  {t('dateLabel')}
                </label>
                <input
                  id="ev-date"
                  type="date"
                  className="paper-input"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-ink" htmlFor="ev-loc">
                  {t('location')}
                </label>
                <input
                  id="ev-loc"
                  className="paper-input"
                  placeholder={t('locationPh')}
                  value={location}
                  maxLength={60}
                  onChange={(e) => setLocation(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submit()}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button className="ghost-ink-btn h-12 flex-1 text-lg" onClick={() => onOpenChange(false)}>
                {t('cancel')}
              </button>
              <button className="ink-btn h-12 flex-[2] text-lg" onClick={submit}>
                {renameOf ? t('save') : t('createRegister')}
              </button>
            </div>
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
