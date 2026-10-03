'use client';

// ─── TranslitInput — type "kumar" → कुमार / کمر, word by word ────────────────
// The raw latin word stays in the field while typing; it converts to the
// target script on Space / Enter / blur (word boundary), exactly like Google
// Input Tools. Backspace at the boundary un-converts the last word back to
// its roman spelling so editing feels natural.

import { forwardRef, useEffect, useRef } from 'react';
import { translitWord, trailingLatin, type InputScript } from '@/lib/daali/translit';

interface TranslitInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onKeyDown'> {
  value: string;
  onValueChange: (v: string) => void;
  script: InputScript;
  /** Latin mirror of the text (what was actually typed) — used for search */
  onRawChange?: (raw: string) => void;
  /**
   * Extra key handler. For Enter, the converted final value is passed as 2nd
   * arg so parents can commit without waiting for a re-render.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, finalValue?: string) => void;
}

export const TranslitInput = forwardRef<HTMLInputElement, TranslitInputProps>(
  function TranslitInput(
    { value, onValueChange, script, onRawChange, onKeyDown, onBlur, ...rest },
    ref
  ) {
    const rawMirror = useRef(''); // latin version of value
    const prevValue = useRef(value);
    const lastConv = useRef<{ dev: string; raw: string } | null>(null);

    // external value change (parent clears / prefills the field) → re-sync mirror
    useEffect(() => {
      if (prevValue.current !== value) {
        prevValue.current = value;
        rawMirror.current = value;
        onRawChange?.(rawMirror.current);
      }
    }, [value]);

    const setCaretEnd = (el: HTMLInputElement) => {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      const prev = prevValue.current;
      if (v.startsWith(prev)) {
        rawMirror.current += v.slice(prev.length);
      } else if (prev.startsWith(v) && v.length > 0 && !trailingLatin(v)) {
        // deletion inside converted text — mirror can't follow reliably
        rawMirror.current = v;
      } else if (prev.startsWith(v)) {
        rawMirror.current = rawMirror.current.slice(0, rawMirror.current.length - (prev.length - v.length));
      } else {
        rawMirror.current = v;
      }
      prevValue.current = v;
      onRawChange?.(rawMirror.current);
      onValueChange(v);
    };

    /** Convert the trailing latin word; returns the new value.
     *  Uses the `value` prop (handlers are recreated each render, so it is
     *  always fresh) instead of touching a ref during render. */
    const convertTail = (addSpace: boolean): string => {
      const v = value;
      const tail = trailingLatin(v);
      if (!tail || script === 'off') return v;
      const converted = translitWord(tail, script);
      if (converted === tail) return v;
      const finalV = v.slice(0, v.length - tail.length) + converted + (addSpace ? ' ' : '');
      lastConv.current = { dev: converted, raw: tail };
      prevValue.current = finalV;
      onRawChange?.(rawMirror.current);
      onValueChange(finalV);
      return finalV;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const el = e.currentTarget;
      const atEnd =
        el.selectionStart === el.value.length && el.selectionStart === el.selectionEnd;

      if (script !== 'off' && atEnd) {
        if (e.key === ' ' && trailingLatin(value)) {
          e.preventDefault();
          const next = convertTail(true);
          setCaretEnd(el);
          requestAnimationFrame(() => setCaretEnd(el));
          onKeyDown?.(e, next);
          return;
        }
        if (e.key === 'Enter' && trailingLatin(value)) {
          e.preventDefault();
          const next = convertTail(false);
          onKeyDown?.(e, next);
          return;
        }
        if (e.key === 'Backspace' && lastConv.current && !trailingLatin(value)) {
          const { dev, raw } = lastConv.current;
          if (dev && value.endsWith(dev)) {
            e.preventDefault();
            const next = value.slice(0, value.length - dev.length) + raw;
            rawMirror.current = rawMirror.current.slice(0, rawMirror.current.length - dev.length) + raw;
            prevValue.current = next;
            lastConv.current = null;
            onRawChange?.(rawMirror.current);
            onValueChange(next);
            requestAnimationFrame(() => setCaretEnd(el));
            onKeyDown?.(e, next);
            return;
          }
        }
      }
      onKeyDown?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (script !== 'off') convertTail(false);
      onBlur?.(e);
    };

    return (
      <input
        ref={ref}
        {...rest}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
    );
  }
);
