'use client';

import { useRef, useState } from 'react';
import { useDaali } from '@/lib/daali/store';
import { useT } from './use-t';
import { ConfirmDialog } from './ui-bits';

/** Simple local PIN gate — data never leaves the device. */
export function PinLock() {
  const t = useT();
  const unlock = useDaali((s) => s.unlock);
  const resetAll = useDaali((s) => s.resetAll);

  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [forgot, setForgot] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const tryUnlock = () => {
    if (unlock(pin)) {
      setPin('');
      setErr('');
      setAttempts(0);
    } else {
      setErr(t('wrongPin'));
      setAttempts((a) => a + 1);
      setPin('');
      inputRef.current?.focus();
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="paper w-full max-w-sm px-6 py-10 text-center">
        <div className="paper-spine" />
        <div className="paper-margin" />
        <div className="animate-stamp-in">
          <div className="mb-2 text-4xl" aria-hidden="true">
            🔒
          </div>
          <h1 className="font-hand text-2xl font-bold text-ink">{t('lockTitle')}</h1>
          <input
            ref={inputRef}
            className="paper-input mt-8 text-center text-3xl tracking-[0.7em]"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            maxLength={4}
            placeholder="••••"
            aria-label={t('enterPin')}
            value={pin}
            onChange={(e) => {
              setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 4));
              setErr('');
            }}
            onKeyDown={(e) => e.key === 'Enter' && tryUnlock()}
          />
          {err && <p className="mt-2 text-sm text-margin-red">{err}</p>}
          <button className="ink-btn mt-6 h-12 w-full text-lg" onClick={tryUnlock}>
            {t('unlock')}
          </button>
          {attempts >= 3 && (
            <button
              className="mx-auto mt-4 block text-xs text-ink-soft underline underline-offset-2"
              onClick={() => setForgot(true)}
            >
              {t('forgotPin')}
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={forgot}
        onOpenChange={setForgot}
        title={t('forgotPin')}
        description={t('forgotWarn')}
        confirmLabel={t('resetAll')}
        cancelLabel={t('no')}
        destructive
        onConfirm={() => resetAll()}
      />
    </div>
  );
}
