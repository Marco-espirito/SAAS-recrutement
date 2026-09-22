export type IncomingOfferKey = {
  source: string;
  externalId?: string | null;
  company: string;
  title: string;
  location?: string | null;
};

export function normalizeToken(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, '-');
}

/**
 * Duplicate offers happen either because the provider re-issues the same
 * external id, or because two queries surface the same company/title/location
 * without a stable id. externalId wins when present; otherwise the key is
 * derived from the normalized company/title/location triple.
 */
export function buildOfferDedupKey(offer: IncomingOfferKey): string {
  if (offer.externalId)
    return `${offer.source}:${normalizeToken(String(offer.externalId))}`;
  return [
    offer.source,
    normalizeToken(offer.company),
    normalizeToken(offer.title),
    normalizeToken(offer.location ?? ''),
  ]
    .filter(Boolean)
    .join('|');
}

export function buildOfferQueryKey(
  source: string,
  query: string,
  location?: string | null,
): string {
  return [source, normalizeToken(query), normalizeToken(location ?? '')]
    .filter(Boolean)
    .join('|');
}

/**
 * An offer is considered removed by the provider only when it was previously
 * seen for the same query scope and is absent from the latest batch — a
 * different query not returning it says nothing about its availability.
 */
export function selectOffersToRemove<
  T extends { id: string; dedupKey: string },
>(activeOffers: readonly T[], seenDedupKeys: ReadonlySet<string>): string[] {
  return activeOffers
    .filter((offer) => !seenDedupKeys.has(offer.dedupKey))
    .map((offer) => offer.id);
}

export function isOfferExpired(
  expiresAt: Date | string | null | undefined,
  now: Date,
): boolean {
  if (!expiresAt) return false;
  const expiry = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  if (Number.isNaN(expiry.getTime())) return false;
  return expiry.getTime() <= now.getTime();
}
