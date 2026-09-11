import { createContext, useContext } from 'react';
import { sv } from './sv';
import { en } from './en';

export type Language = 'sv' | 'en';

/**
 * The Swedish dictionary is declared `as const`, which makes every value a
 * string *literal* type. Widening it back to `string` gives a shape that other
 * languages can implement - while still failing to compile if a key is missing.
 */
type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { -readonly [K in keyof T]: Widen<T[K]> };

export type Dictionary = Widen<typeof sv>;

export const DICTIONARIES: Record<Language, Dictionary> = { sv, en };

export const LanguageContext = createContext<Dictionary>(sv);

/** Access the active dictionary. Keys are checked at compile time. */
export function useCopy(): Dictionary {
  return useContext(LanguageContext);
}

/** Locale-aware number formatting (Swedish uses a decimal comma). */
export function formatNumber(value: number, digits: number, language: Language): string {
  const text = value.toFixed(digits);
  return language === 'sv' ? text.replace('.', ',') : text;
}
