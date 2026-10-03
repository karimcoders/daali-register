'use client';

// ─── TranslitInput — type "kumar" → कुमार / کمر, word by word ────────────────
// The raw latin word stays in the field while typing; it converts to the
// target script on Space / Enter / blur (word boundary), exactly like Google
// Input Tools. Backspace at the boundary un-converts the last word back to
// its roman spelling so editing feels natural.
//
// While typing, dictionary suggestions (dict.ts) are offered via onSuggest;
// the parent renders chips and sends the pick back through the `pick` prop.
//
// IME-safe: while a system IME composition is in progress (Google Indic
// Keyboard, Windows Hindi keyboard…), NO key is intercepted and Enter is
// never treated as "next line" — otherwise Hindi typing breaks mid-word.

import { forwardRef, useEffect, useRef } from 'react';
import { translitWord, trailingLatin, type InputScript } from '@/lib/daali/translit';
import { suggestFor, type Suggestion } from '@/lib/daali/dict';

export interface PickPayload {
  roman: string;
  text: string;
  seq: number;
}

interface TranslitInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onKeyDown'> {
  value: string;
  onValueChange: (v: string) => void;
  script: InputScript;
  /** Latin mirror of the text (what was actually typed) — used for search */
  onRawChange?: (raw: string) => void;
  /** live dictionary suggestions for the word being typed */
  onSuggest?: (s: Suggestion[]) => void;
  /** parent → input: "apply this dictionary suggestion now" */
  pick?: PickPayload | null;
  /**
   * Extra key handler. For Enter, the converted final value is passed as 2nd
   * arg so parents can commit without waiting for a re-render.
   */
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>, finalValue?: string) => void;
}

/** true while an IME composition is in progress (Hindi/Urdu system keyboards) */
export function isIMEComposing(e: React.KeyboardEvent): boolean {
  const n = e.nativeEvent as KeyboardEvent;
  return n.isComposing === true || n.keyCode === 229;
}

export const TranslitInput = forwardRef<HTMLInputElement, TranslitInputProps>(
  function TranslitInput(
    { value, onValueChange, script, onRawChange, onSuggest, pick, onKeyDown, onBlur, ...rest },
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

    // parent picked a dictionary suggestion → swap the trailing latin word
    useEffect(() => {
      if (!pick) return;
      const v = prevValue.current;
      const tail = trailingLatin(v);
      const next = tail ? v.slice(0, v.length - tail.length) + pick.text : v + pick.text;
      const mtail = trailingLatin(rawMirror.current);
      rawMirror.current = mtail
        ? rawMirror.current.slice(0, rawMirror.current.length - mtail.length) + pick.roman
        : rawMirror.current + pick.roman;
      prevValue.current = next;
      lastConv.current = null;
      onRawChange?.(rawMirror.current);
      onValueChange(next);
      onSuggest?.([]);
    }, [pick?.seq]);

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
      // live suggestions for the word being typed
      onSuggest?.(script !== 'off' ? suggestFor(trailingLatin(v), script) : []);
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
      onSuggest?.([]);
      return finalV;
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      // IME composition in progress → hands off completely. Intercepting
      // Space/Enter here is what breaks Hindi/Urdu typing on real keyboards.
      if (isIMEComposing(e)) return;
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
      onSuggest?.([]);
      onBlur?.(e);
    };

    return (
      <input
        ref={ref}
        {...rest}
        data-script={script}
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
