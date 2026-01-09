/**
 * Escapes special regex characters in a string to prevent ReDoS attacks
 * and ensure literal matching of user input.
 */
export function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Module-level cache for compiled regexes to avoid recompilation on every render
const regexCache = new Map<string, RegExp>();
const MAX_CACHE_SIZE = 100;

/**
 * Gets a cached regex or creates and caches a new one.
 * Uses LRU-style eviction when cache exceeds MAX_CACHE_SIZE.
 * Resets lastIndex to avoid stateful issues with global regexes.
 */
function getCachedRegex(pattern: string, flags: string): RegExp | null {
  const key = `${pattern}:${flags}`;

  const cached = regexCache.get(key);
  if (cached) {
    // Reset lastIndex to avoid stateful issues with global flag
    cached.lastIndex = 0;
    // Move to end for LRU behavior (Map maintains insertion order)
    regexCache.delete(key);
    regexCache.set(key, cached);
    return cached;
  }

  try {
    const escapedPattern = escapeRegExp(pattern);
    const regex = new RegExp(`(${escapedPattern})`, flags);

    // Evict oldest entry if cache is full
    if (regexCache.size >= MAX_CACHE_SIZE) {
      const firstKey = regexCache.keys().next().value;
      if (firstKey) regexCache.delete(firstKey);
    }

    regexCache.set(key, regex);
    return regex;
  } catch {
    return null;
  }
}

/**
 * Creates a safe regex from user input by escaping special characters.
 * Returns null if the pattern is empty or invalid.
 * Uses internal caching to avoid recompilation.
 */
export function createSafeRegex(pattern: string, flags: string = 'gi'): RegExp | null {
  if (!pattern) return null;
  return getCachedRegex(pattern, flags);
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
