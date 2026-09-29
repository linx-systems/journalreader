export type CsvCell = string | number;

const SPREADSHEET_FORMULA_PREFIX = /^[\u0000-\u0020]*[=+\-@]/;

/**
 * Encode one CSV cell and make formula-looking string values inert in spreadsheets.
 * Numeric values remain numeric, including legitimate negative numbers.
 */
export function encodeCsvCell(value: CsvCell): string {
  let text = String(value);
  if (typeof value === 'string' && SPREADSHEET_FORMULA_PREFIX.test(text)) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function serializeCsvRow(cells: readonly CsvCell[]): string {
  return cells.map(encodeCsvCell).join(',');
}

/** Serialize records with RFC 4180 CRLF delimiters, including the final record. */
export function serializeCsvDocument(rows: readonly (readonly CsvCell[])[]): string {
  return `${rows.map(serializeCsvRow).join('\r\n')}\r\n`;
}
