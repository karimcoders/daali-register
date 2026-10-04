'use client';

// ─── Self-healing crash page ─────────────────────────────────────────────────
// "Application error: a client-side exception…" ki jagah ye dikhega. Deploy ke
// dauran purana HTML + naye chunks (ya ulta) match na karein to Next.js aise
// crash karta hai — ye page khud-ba-khud caches/service worker saaf karke app
// dobara khol deta hai (ek hi baar), warna button dikhata hai.

import { useEffect, useState } from 'react';

const HEAL_FLAG = 'daali-heal-attempt';

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

async function hardHeal() {
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
    /* jitna ho sake saaf kar liya */
  }
  // cache-bypassing reload — purane HTML/chunks se mukti
  location.replace(location.href);
}

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // stale-code crash (deploy window) → auto-heal ek hi baar. Initializer mein
  // decide karo (effect-body setState lint-safe), effect sirf timer chalata hai.
  const [healing, setHealing] = useState(() => {
    if (typeof window === 'undefined') return false;
    try {
      const attempted = window.sessionStorage.getItem(HEAL_FLAG) === '1';
      return !attempted && isStaleCodeError(error?.message || '');
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!healing) return;
    try {
      window.sessionStorage.setItem(HEAL_FLAG, '1');
    } catch {
      /* ignore */
    }
    const t = setTimeout(() => void hardHeal(), 900);
    return () => clearTimeout(t);
  }, [healing]);

  const heal = () => {
    try {
      window.sessionStorage.setItem(HEAL_FLAG, '1');
    } catch {
      /* ignore */
    }
    setHealing(true);
    void hardHeal();
  };

  return (
    <html lang="hi">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          background: '#f3ecd8',
          fontFamily: "'Noto Sans Devanagari', system-ui, sans-serif",
          boxSizing: 'border-box',
        }}
      >
        <div
          style={{
            maxWidth: 380,
            width: '100%',
            background: '#fdf9ee',
            borderRadius: 10,
            padding: '28px 22px',
            textAlign: 'center',
            boxShadow: '0 8px 30px rgba(60,40,10,0.18)',
            border: '1px solid #e4d7b8',
          }}
        >
          <div style={{ fontSize: 44, lineHeight: 1 }} aria-hidden="true">
            📖
          </div>
          <h1 style={{ fontSize: 21, margin: '14px 0 6px', color: '#241c12', fontWeight: 700 }}>
            दाली रजिस्टर खुल नहीं पाया
          </h1>
          <p style={{ fontSize: 14.5, lineHeight: 1.65, color: '#6b5d49', margin: '0 0 18px' }}>
            {healing
              ? 'ठीक हो रहा है… पलक झपकते ही दोबारा खुल जाएगा।'
              : 'आपका हिसाब फ़ोन में सुरक्षित है। नीचे का बटन दबाइए — पुरानी फ़ाइलें साफ़ करके रजिस्टर ताज़ा हो जाएगा।'}
          </p>
          {!healing && (
            <button
              type="button"
              onClick={heal}
              style={{
                width: '100%',
                padding: '13px 16px',
                fontSize: 16.5,
                fontWeight: 700,
                color: '#fdf9ee',
                background: '#b3402f',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              फिर से खोलें
            </button>
          )}
          {!healing && (
            <button
              type="button"
              onClick={() => reset()}
              style={{
                width: '100%',
                marginTop: 10,
                padding: '10px 16px',
                fontSize: 14,
                fontWeight: 600,
                color: '#241c12',
                background: 'transparent',
                border: '1.5px dashed #b9a986',
                borderRadius: 8,
                cursor: 'pointer',
              }}
            >
              बिना साफ़ किए दोबारा कोशिश करें
            </button>
          )}
          <p style={{ fontSize: 11.5, color: '#9c8c6e', margin: '16px 0 0' }}>
            {healing
              ? 'अपने आप ठीक करने की कोशिश हो रही है — बस एक पल।'
              : 'आपका डेटा इसी फ़ोन में रहता है — कुछ नहीं मिटता।'}
          </p>
        </div>
      </body>
    </html>
  );
}
