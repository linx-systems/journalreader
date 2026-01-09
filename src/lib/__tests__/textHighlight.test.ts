import { describe, expect, it } from 'vitest';
import { escapeRegExp, createSafeRegex, splitByPattern } from '../textHighlight';

describe('escapeRegExp', () => {
  it('escapes all special regex characters', () => {
    const specialChars = '.*+?^${}()|[]\\';
    const escaped = escapeRegExp(specialChars);
    expect(escaped).toBe('\\.\\*\\+\\?\\^\\$\\{\\}\\(\\)\\|\\[\\]\\\\');
  });

  it('leaves normal text unchanged', () => {
    expect(escapeRegExp('hello world')).toBe('hello world');
    expect(escapeRegExp('abc123')).toBe('abc123');
  });

  it('escapes mixed content', () => {
    expect(escapeRegExp('file.txt')).toBe('file\\.txt');
    expect(escapeRegExp('price: $100')).toBe('price: \\$100');
    expect(escapeRegExp('[error]')).toBe('\\[error\\]');
  });

  it('handles empty string', () => {
    expect(escapeRegExp('')).toBe('');
  });

  it('prevents ReDoS patterns', () => {
    // These patterns would cause exponential backtracking if not escaped
    const redosPatterns = [
      '(a+)+$',
      '([a-zA-Z]+)*',
      '(a|aa)+',
      '(.*a){x}',
    ];

    for (const pattern of redosPatterns) {
      const escaped = escapeRegExp(pattern);
      // After escaping, these should be safe literal strings
      expect(escaped).not.toBe(pattern);
      // The escaped version should not contain unescaped special chars
      expect(escaped).toContain('\\');
    }
  });
});

describe('createSafeRegex', () => {
  it('creates a regex with escaped special characters', () => {
    const regex = createSafeRegex('file.txt');
    expect(regex).not.toBeNull();
    expect(regex!.test('file.txt')).toBe(true);
    expect(regex!.test('fileXtxt')).toBe(false);
  });

  it('returns null for empty pattern', () => {
    expect(createSafeRegex('')).toBeNull();
  });

  it('respects case sensitivity flags', () => {
    // Case insensitive - create fresh regex for each test due to stateful lastIndex
    expect(createSafeRegex('ERROR', 'gi')!.test('error')).toBe(true);
    expect(createSafeRegex('ERROR', 'gi')!.test('Error')).toBe(true);
    expect(createSafeRegex('ERROR', 'gi')!.test('ERROR')).toBe(true);

    // Case sensitive
    expect(createSafeRegex('ERROR', 'g')!.test('ERROR')).toBe(true);
    expect(createSafeRegex('ERROR', 'g')!.test('error')).toBe(false);
    expect(createSafeRegex('ERROR', 'g')!.test('Error')).toBe(false);
  });

  it('creates regex that matches literal special chars', () => {
    const regex = createSafeRegex('[error]');
    expect(regex!.test('[error]')).toBe(true);
    expect(regex!.test('error')).toBe(false);

    const dollarRegex = createSafeRegex('$100');
    expect(dollarRegex!.test('$100')).toBe(true);
  });
});

describe('splitByPattern', () => {
  it('splits text by pattern', () => {
    const { parts, regex } = splitByPattern('hello world hello', 'hello');
    expect(regex).not.toBeNull();
    expect(parts).toEqual(['', 'hello', ' world ', 'hello', '']);
  });

  it('returns original text when pattern is empty', () => {
    const { parts, regex } = splitByPattern('hello world', '');
    expect(regex).toBeNull();
    expect(parts).toEqual(['hello world']);
  });

  it('returns original text when pattern is undefined', () => {
    const { parts, regex } = splitByPattern('hello world', undefined);
    expect(regex).toBeNull();
    expect(parts).toEqual(['hello world']);
  });

  it('handles case sensitivity', () => {
    const insensitive = splitByPattern('Hello HELLO hello', 'hello', false);
    expect(insensitive.parts.filter(p => p.toLowerCase() === 'hello')).toHaveLength(3);

    const sensitive = splitByPattern('Hello HELLO hello', 'hello', true);
    expect(sensitive.parts.filter(p => p === 'hello')).toHaveLength(1);
  });

  it('matches literal special regex characters', () => {
    const { parts } = splitByPattern('file.txt and file.log', 'file.');
    expect(parts).toContain('file.');
    // Should NOT match 'fileX' or similar
  });

  it('handles ReDoS-like patterns safely', () => {
    // This would hang if not escaped properly
    const longString = 'a'.repeat(100);
    const start = performance.now();
    const { parts, regex } = splitByPattern(longString, '(a+)+$');
    const elapsed = performance.now() - start;

    // Should complete quickly (< 100ms) because pattern is escaped
    expect(elapsed).toBeLessThan(100);
    // The pattern is treated as literal, so it won't match
    expect(parts).toEqual([longString]);
    expect(regex).not.toBeNull();
  });

  it('handles complex ReDoS patterns without hanging', () => {
    const testCases = [
      { text: 'a'.repeat(50), pattern: '([a-zA-Z]+)*' },
      { text: 'aaaaaaaaaaaaaaaaaaaaaaaa!', pattern: '(a+)+$' },
      { text: 'x'.repeat(100), pattern: '(.*a){10}' },
    ];

    for (const { text, pattern } of testCases) {
      const start = performance.now();
      splitByPattern(text, pattern);
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(50);
    }
  });
});
