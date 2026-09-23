import { describe, expect, it } from 'vitest';
import { parseCsv } from '@/lib/domain/csv';

describe('CRM CSV import', () => {
  it('parses quoted commas and semicolon files', () => {
    expect(parseCsv('name,industry\n"ACME, France",Tech\n')).toEqual([
      { name: 'ACME, France', industry: 'Tech' },
    ]);
    expect(parseCsv('name;industry\r\nACME;Tech')).toEqual([
      { name: 'ACME', industry: 'Tech' },
    ]);
  });
  it('rejects malformed files', () => {
    expect(() => parseCsv('industry\nTech')).toThrow('name');
    expect(() => parseCsv('name\n"ACME')).toThrow('Guillemet');
  });
});
