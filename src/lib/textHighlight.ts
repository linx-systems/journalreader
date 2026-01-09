/**
 * Escapes special regex characters in a string to prevent ReDoS attacks
 * and ensure literal matching of user input.
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Creates a safe regex from user input by escaping special characters.
 * Returns null if the pattern is empty or invalid.
 */
export function createSafeRegex(pattern: string, flags: string = 'gi'): RegExp | null {
  if (!pattern) return null;

  try {
    const escapedPattern = escapeRegExp(pattern);
    return new RegExp(`(${escapedPattern})`, flags);
  } catch {
    return null;
  }
}

/**
 * Splits text by a pattern, returning the parts.
 * Returns the original text as a single-element array if pattern is invalid.
 */
export function splitByPattern(text: string, pattern: string | undefined, caseSensitive: boolean = false): { parts: string[]; regex: RegExp | null } {
  if (!pattern) {
    return { parts: [text], regex: null };
  }

  const flags = caseSensitive ? 'g' : 'gi';
  const regex = createSafeRegex(pattern, flags);

  if (!regex) {
    return { parts: [text], regex: null };
  }

  return { parts: text.split(regex), regex };
}
