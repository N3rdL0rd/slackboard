/**
 * Locale-aware string comparison, same order as `a.localeCompare(b)` but with one shared collator.
 * On Hermes `localeCompare` builds a new ICU collator on every call, which turns sorting thousands of strings into seconds.
 */
export const compareText: (a: string, b: string) => number = new Intl.Collator().compare;
