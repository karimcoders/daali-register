'use client';

import { useMemo } from 'react';
import { useDaali, sortEntries } from '@/lib/daali/store';
import { formatNumber, formatRupees, isoToDisplayDate, isoToHindiDate } from '@/lib/daali/format';
import { useT } from './use-t';

const ROWS_PER_SHEET = 22;

/**
 * Hidden on screen, shown only in print — looks like a printed traditional register.
 * window.print() → user can save as PDF.
 */
export function PrintRegister() {
  const t = useT();
  const events = useDaali((s) => s.events);
  const allEntries = useDaali((s) => s.allEntries);
  const currentEventId = useDaali((s) => s.currentEventId);
  const settings = useDaali((s) => s.settings);

  const event = events.find((e) => e.id === currentEventId);

  const sorted = useMemo(
    () =>
      sortEntries(
        allEntries.filter((e) => e.eventId === currentEventId),
        settings.sortMode
      ),
    [allEntries, currentEventId, settings.sortMode]
  );

  if (!event) return null;

  const rtl = settings.language === 'ur';
  const totalSum = sorted.reduce((a, e) => a + e.amount, 0);
  const sheets: typeof sorted[] = [];
  for (let i = 0; i < sorted.length; i += ROWS_PER_SHEET) {
    sheets.push(sorted.slice(i, i + ROWS_PER_SHEET));
  }
  if (sheets.length === 0) sheets.push([]);

  return (
    <div className="print-only" aria-hidden="true" dir={rtl ? 'rtl' : 'ltr'}>
      {sheets.map((sheet, si) => (
        <div
          key={si}
          className={`print-sheet px-2 ${si < sheets.length - 1 ? 'print-page-break' : ''}`}
        >
          {/* header — only on the first printed page */}
          {si === 0 && (
            <div style={{ textAlign: 'center', marginBottom: '8px' }}>
              <div
                style={{
                  fontFamily: rtl ? "'Noto Nastaliq Urdu', serif" : "'Kalam', cursive",
                  fontSize: '20pt',
                  fontWeight: 700,
                }}
              >
                {t('daaliRegister')}
              </div>
              <div style={{ fontSize: '12pt', marginTop: '2px' }}>
                {t('eventLabel')}: <b>{event.name}</b>
              </div>
              <div style={{ fontSize: '11pt' }}>
                {event.date
                  ? `${t('dateLabel')}: ${
                      settings.language === 'hi'
                        ? isoToHindiDate(event.date) || isoToDisplayDate(event.date)
                        : isoToDisplayDate(event.date)
                    }`
                  : ''}
                {event.date && event.location ? ' • ' : ''}
                {event.location ? `${t('villageLabel')}: ${event.location}` : ''}
              </div>
            </div>
          )}

          <table className="print-register-table">
            <thead>
              <tr>
                <th style={{ width: '8%' }}>{t('colCr')}</th>
                <th style={{ width: '26%' }}>{t('colName')}</th>
                <th style={{ width: '20%' }}>{t('colVillage')}</th>
                <th style={{ width: '16%' }}>{t('colRelation')}</th>
                <th className="amt" style={{ width: '15%' }}>
                  {t('colAmount')}
                </th>
                <th style={{ width: '15%' }}>{t('colDate')}</th>
              </tr>
            </thead>
            <tbody>
              {sheet.map((entry, i) => (
                <tr key={entry.id}>
                  <td>{si * ROWS_PER_SHEET + i + 1}</td>
                  <td>
                    {entry.name}
                    {entry.note ? <span style={{ color: '#666' }}> ({entry.note})</span> : ''}
                  </td>
                  <td>{entry.village}</td>
                  <td>{entry.relationship}</td>
                  <td className="amt">{formatNumber(entry.amount)}</td>
                  <td>{entry.date ? isoToDisplayDate(entry.date) : ''}</td>
                </tr>
              ))}
              {/* keep empty rows so the printed page looks like a register */}
              {Array.from({ length: Math.max(0, ROWS_PER_SHEET - sheet.length) }).map((_, i) => (
                <tr key={`e-${i}`}>
                  <td>&nbsp;</td>
                  <td />
                  <td />
                  <td />
                  <td />
                  <td />
                </tr>
              ))}
            </tbody>
          </table>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '10px',
              paddingTop: '6px',
              borderTop: '1.5px solid #1c2630',
              fontSize: '12pt',
              fontWeight: 700,
            }}
          >
            <span>
              {t('page')}: {si + 1}/{sheets.length}
            </span>
            {si === sheets.length - 1 && (
              <span>
                {t('totalPeople')}: {formatNumber(sorted.length)} • {t('totalDaali')}: {formatRupees(totalSum)}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
