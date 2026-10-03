'use client';

import { BookOpen, Search, MoreHorizontal, Plus } from 'lucide-react';
import { useDaali } from '@/lib/daali/store';
import { useT } from './use-t';

export function BottomNav({
  onSearch,
  onAdd,
  onMore,
}: {
  onSearch: () => void;
  onAdd: () => void;
  onMore: () => void;
}) {
  const t = useT();
  const view = useDaali((s) => s.view);
  const goHome = useDaali((s) => s.goHome);

  const item = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    active = false,
    big = false
  ) => (
    <button
      className={`flex min-w-[3.6rem] flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 transition-colors ${
        active ? 'text-margin-red' : 'text-ink-soft hover:text-ink'
      }`}
      onClick={onClick}
      aria-label={label}
    >
      <span className={big ? 'flex h-8 w-8 items-center justify-center' : ''}>{icon}</span>
      <span className={`font-hand leading-none ${big ? 'text-[13px] font-bold' : 'text-[12px]'}`}>{label}</span>
    </button>
  );

  return (
    <nav
      className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-ink/10 bg-[var(--paper)]/95 backdrop-blur-sm"
      style={{ boxShadow: '0 -4px 16px rgba(70, 50, 20, 0.08)' }}
    >
      <div className="mx-auto flex h-16 max-w-md items-stretch justify-around px-2">
        {item(
          t('navRegister'),
          <BookOpen className="h-5 w-5" aria-hidden="true" />,
          () => {
            if (view === 'notebook') goHome();
          },
          true
        )}
        {item(t('navSearch'), <Search className="h-5 w-5" aria-hidden="true" />, onSearch)}
        {item(
          t('navAdd'),
          <span
            className="flex h-11 w-11 -translate-y-2 items-center justify-center rounded-full text-white shadow-md"
            style={{ background: 'var(--ink)', boxShadow: '0 3px 0 rgba(0,0,0,0.2)' }}
            aria-hidden="true"
          >
            <Plus className="h-6 w-6" strokeWidth={2.5} />
          </span>,
          onAdd,
          false,
          true
        )}
        {item(t('navMore'), <MoreHorizontal className="h-5 w-5" aria-hidden="true" />, onMore)}
      </div>
    </nav>
  );
}
