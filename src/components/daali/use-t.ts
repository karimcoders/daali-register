'use client';

import { useDaali } from '@/lib/daali/store';
import { makeT } from '@/lib/daali/strings';
import { useMemo } from 'react';

export function useT() {
  const lang = useDaali((s) => s.settings.language);
  return useMemo(() => makeT(lang), [lang]);
}
