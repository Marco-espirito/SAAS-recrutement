export function parseCsv(
  source: string,
  limit = 500,
): Record<string, string>[] {
  const text = source.replace(/^\uFEFF/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = firstLine.includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else if (quoted || !cell) quoted = !quoted;
      else throw new Error('Guillemets CSV invalides');
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(cell.trim());
      cell = '';
      if (row.some(Boolean)) rows.push(row);
      if (rows.length > limit + 1) throw new Error('CSV trop volumineux');
      row = [];
    } else cell += char;
  }
  if (quoted) throw new Error('Guillemet CSV non fermé');
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  if (!rows.length) return [];
  const headers = rows.shift()!.map((value) => value.toLowerCase());
  if (!headers.includes('name')) throw new Error('Colonne name obligatoire');
  if (new Set(headers).size !== headers.length)
    throw new Error('Colonnes CSV dupliquées');
  return rows.map((values) =>
    Object.fromEntries(
      headers.map((header, index) => [header, values[index] ?? '']),
    ),
  );
}
