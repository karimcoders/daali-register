'use client';

// ─── Stale-code guard (runtime) ──────────────────────────────────────────────
// Naya deploy aa gaya aur browser purane HTML par latka ho to lazy chunks
// (jspdf/html2canvas/page chunks) 404 hote hain → crash. Ye watcher aise
// errors pakad kar EK baar caches+SW saaf karke reload kar deta hai — user
// ko kabhi "Application error" ka saamna nahi karna padta.

import { useEffect } from 'react';

const HEAL_FLAG = 'daali-chunk-heal';

function isStaleCodeError(msg: string): boolean {
  return (
    /ChunkLoadError/i.test(msg) ||
    /Loading (CSS )?chunk/i.test(msg) ||
    /dynamically imported module/i.test(msg) ||
    /error loading statically (generated|exported) page/i.test(msg) ||
    /Failed to fetch dynamically/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

function healAndReload() {
  // reload loop se bacho — 90 second mein ek hi baar
  try {
    const last = Number(window.sessionStorage.getItem(HEAL_FLAG) || 0);
    if (Date.now() - last < 90_000) return;
    window.sessionStorage.setItem(HEAL_FLAG, String(Date.now()));
  } catch {
    /* storage blocked — phir bhi ek baar try */
  }
  (async () => {
    try {
      if (typeof caches !== 'undefined' && 'keys' in caches) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
      if (navigator.serviceWorker) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister().catch(() => undefined)));
      }
    } catch {
      /* ignore */
    }
    window.location.replace(window.location.href);
  })();
}

export function StaleCodeGuard() {
  useEffect(() => {
    const scan = (raw: unknown) => {
      const msg =
        typeof raw === 'string'
          ? raw
          : raw instanceof Error
            ? raw.message
            : raw && typeof raw === 'object' && 'message' in raw
              ? String((raw as { message: unknown }).message)
              : '';
      if (msg && isStaleCodeError(msg)) healAndReload();
    };
    const onError = (e: ErrorEvent) => {
      scan(e.message);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      scan(e.reason);
    };
    const onResource = (e: Event) => {
      // <script src=…/_next/static/…> load fail → purana HTML, naya deploy
      const t = e.target as HTMLScriptElement | null;
      if (t && t.tagName === 'SCRIPT' && t.src && /\/_next\/static\//.test(t.src)) {
        healAndReload();
      }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    window.addEventListener('error', onResource, true); // script load failures (capture phase)
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
      window.removeEventListener('error', onResource, true);
    };
  }, []);
  return null;
}
