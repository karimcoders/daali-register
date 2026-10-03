'use client';

import { useEffect } from 'react';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      const register = () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
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
