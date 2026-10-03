'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const bp = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
      const register = () => {
        navigator.serviceWorker.register(`${bp}/sw.js`).catch(() => {
          // SW is a progressive enhancement — app works without it
        });
      };
      if (document.readyState === 'complete') register();
      else {
        window.addEventListener('load', register, { once: true });
        return () => window.removeEventListener('load', register);
      }
    }
  }, []);
  return null;
}
