import { describe, expect, it } from 'vitest';
import {
  buildOfferDedupKey,
  buildOfferQueryKey,
  isOfferExpired,
  selectOffersToRemove,
} from '@/lib/domain/offers';

describe('offer deduplication', () => {
  it('derives the same key from a stable external id regardless of casing', () => {
    const a = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      externalId: 'ABC-123',
      company: 'Acme',
      title: 'Data Analyst',
    });
    const b = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      externalId: 'abc-123',
      company: 'Acme Corp',
      title: 'Analyst',
    });
    expect(a).toBe(b);
  });

  it('falls back to normalized company/title/location when no external id is given', () => {
    const a = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      company: 'Écoles Réunies',
      title: 'Data Analyst',
      location: 'Lyon, France',
    });
    const b = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      company: 'ecoles reunies',
      title: '  Data   Analyst ',
      location: 'lyon, france',
    });
    expect(a).toBe(b);
  });

  it('treats different companies as distinct offers', () => {
    const a = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      company: 'Acme',
      title: 'Data Analyst',
    });
    const b = buildOfferDedupKey({
      source: 'JOBS_PROVIDER',
      company: 'Globex',
      title: 'Data Analyst',
    });
    expect(a).not.toBe(b);
  });
});

describe('offer query scoping', () => {
  it('builds a stable key from source, query and location', () => {
    expect(
      buildOfferQueryKey('JOBS_PROVIDER', 'Data Analyst', 'Lyon, France'),
    ).toBe(
      buildOfferQueryKey('JOBS_PROVIDER', ' data   analyst ', 'lyon, france'),
    );
  });
});

describe('offer removal detection', () => {
  it('flags only offers absent from the latest batch for the same query scope', () => {
    const active = [
      { id: '1', dedupKey: 'a' },
      { id: '2', dedupKey: 'b' },
      { id: '3', dedupKey: 'c' },
    ];
    const seen = new Set(['a', 'c']);
    expect(selectOffersToRemove(active, seen)).toEqual(['2']);
  });

  it('flags nothing when every previously active offer reappears', () => {
    const active = [{ id: '1', dedupKey: 'a' }];
    expect(selectOffersToRemove(active, new Set(['a']))).toEqual([]);
  });
});

describe('offer expiration', () => {
  it('is not expired without an expiry date', () => {
    expect(isOfferExpired(null, new Date())).toBe(false);
    expect(isOfferExpired(undefined, new Date())).toBe(false);
  });

  it('expires exactly at the boundary', () => {
    const now = new Date('2026-09-22T00:00:00Z');
    expect(isOfferExpired('2026-09-21T23:59:59Z', now)).toBe(true);
    expect(isOfferExpired('2026-09-22T00:00:01Z', now)).toBe(false);
  });

  it('ignores unparsable dates rather than throwing', () => {
    expect(isOfferExpired('not-a-date', new Date())).toBe(false);
  });
});
