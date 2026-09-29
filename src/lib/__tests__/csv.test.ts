import { describe, expect, it } from 'vitest';
import { encodeCsvCell, serializeCsvDocument } from '../csv';

describe('CSV serialization', () => {
  it('RFC-4180 encodes delimiters, quotes, and record breaks', () => {
    expect(encodeCsvCell('plain')).toBe('plain');
    expect(encodeCsvCell('with,comma')).toBe('"with,comma"');
    expect(encodeCsvCell('with "quote"')).toBe('"with ""quote"""');
    expect(encodeCsvCell('line\r\nbreak')).toBe('"line\r\nbreak"');
    expect(serializeCsvDocument([['first', 1], ['second', 2]])).toBe(
      'first,1\r\nsecond,2\r\n',
    );
  });

  it('neutralizes formula prefixes after leading whitespace or control characters', () => {
    expect(encodeCsvCell('=1+1')).toBe("'=1+1");
    expect(encodeCsvCell('+COMMAND')).toBe("'+COMMAND");
    expect(encodeCsvCell('-42')).toBe("'-42");
    expect(encodeCsvCell('@SUM(A1:A2)')).toBe("'@SUM(A1:A2)");
    expect(encodeCsvCell(' \t=HYPERLINK("https://example.invalid")')).toBe(
      '"\' \t=HYPERLINK(""https://example.invalid"")"',
    );
    expect(encodeCsvCell('prefix=1')).toBe('prefix=1');
    expect(encodeCsvCell(-42)).toBe('-42');
  });
});
