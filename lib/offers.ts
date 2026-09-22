// Moteur de persistance des offres d'emploi.
//
// Reproduit ce que ferait un vrai connecteur (scraping / API job board) :
// les offres récupérées sont enregistrées durablement, les doublons entre
// sources ou entre deux passages sont détectés et fusionnés, l'expiration
// est suivie automatiquement, et une offre retirée par la source n'est
// jamais supprimée — elle est marquée « retirée » et sa dernière version
// connue reste consultable.
//
// Toutes les fonctions ici sont pures (aucun accès à localStorage) : l'état
// est géré par le composant appelant (voir `useStored` dans candidate-pages)
// afin de rester compatible SSR et cohérent avec le reste de l'application.

export type OfferStatus = 'active' | 'expiring_soon' | 'expired' | 'retired_by_source';

export type RawOffer = {
  externalId: string;
  source: string;
  title: string;
  company: string;
  location: string;
  remote: 'Sur site' | 'Hybride' | 'Télétravail complet';
  contract: 'CDI' | 'CDD' | 'Alternance' | 'Stage' | 'Intérim';
  salary: string;
  skills: string[];
  description: string;
  requiredExperience: number;
  postedAt: string;
  expiresAt: string;
};

export type StoredOffer = RawOffer & {
  id: string;
  firstSeenAt: string;
  lastSeenAt: string;
  retiredAt?: string;
  status: OfferStatus;
  saved?: boolean;
  applied?: boolean;
  seenCount: number;
};

export type SyncResult = {
  offers: StoredOffer[];
  added: number;
  updated: number;
  reactivated: number;
  retired: number;
  duplicatesSkipped: number;
  expiredNow: number;
  at: string;
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Clé de déduplication indépendante de la source : deux offres identiques
// republiées par deux job boards différents (ou deux fois par le même)
// doivent fusionner en une seule fiche.
export function dedupeKey(o: { title: string; company: string; location: string }): string {
  return `${norm(o.company)}::${norm(o.title)}::${norm(o.location)}`;
}

export function computeStatus(
  o: { expiresAt: string; retiredAt?: string },
  now: Date,
): OfferStatus {
  if (o.retiredAt) return 'retired_by_source';
  const diffDays = (new Date(o.expiresAt).getTime() - now.getTime()) / 86400000;
  if (diffDays < 0) return 'expired';
  if (diffDays <= 3) return 'expiring_soon';
  return 'active';
}

/**
 * Fusionne un lot d'offres récupérées avec le fonds déjà enregistré.
 * - Une offre déjà connue (même source+id externe, ou même triplet
 *   société/intitulé/lieu) est mise à jour, sa date de première vue
 *   est conservée.
 * - Une offre absente du nouveau lot n'est jamais supprimée : elle passe
 *   au statut « retirée par la source » et sa dernière version connue
 *   est conservée telle quelle (copie de sauvegarde).
 * - Si une offre retirée réapparaît dans un lot suivant, elle est
 *   réactivée automatiquement.
 * - Les doublons *au sein du même lot* (deux entrées qui pointent vers
 *   la même offre réelle) sont détectés et comptabilisés.
 */
export function syncOffers(existing: StoredOffer[], fetched: RawOffer[], now = new Date()): SyncResult {
  const nowIso = now.toISOString();
  const byId = new Map(existing.map((o) => [o.id, o]));
  const findExisting = (raw: RawOffer) =>
    existing.find((e) => e.source === raw.source && e.externalId === raw.externalId) ||
    existing.find((e) => dedupeKey(e) === dedupeKey(raw));

  const seenBatchKeys = new Set<string>();
  const touchedIds = new Set<string>();
  let added = 0;
  let updated = 0;
  let reactivated = 0;
  let duplicatesSkipped = 0;

  for (const raw of fetched) {
    const batchKey = dedupeKey(raw);
    if (seenBatchKeys.has(batchKey)) {
      duplicatesSkipped++;
      continue;
    }
    seenBatchKeys.add(batchKey);

    const match = findExisting(raw);
    if (match) {
      const wasRetired = match.status === 'retired_by_source' || !!match.retiredAt;
      const merged: StoredOffer = {
        ...raw,
        id: match.id,
        firstSeenAt: match.firstSeenAt,
        lastSeenAt: nowIso,
        retiredAt: undefined,
        seenCount: match.seenCount + 1,
        saved: match.saved,
        applied: match.applied,
        status: computeStatus({ expiresAt: raw.expiresAt }, now),
      };
      byId.set(match.id, merged);
      touchedIds.add(match.id);
      if (wasRetired) reactivated++;
      else updated++;
    } else {
      const id = `${batchKey}::${raw.source}`;
      const created: StoredOffer = {
        ...raw,
        id,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        seenCount: 1,
        status: computeStatus({ expiresAt: raw.expiresAt }, now),
      };
      byId.set(id, created);
      touchedIds.add(id);
      added++;
    }
  }

  let retired = 0;
  let expiredNow = 0;
  const offers = [...byId.values()].map((o) => {
    if (!touchedIds.has(o.id) && o.status !== 'retired_by_source') {
      retired++;
      return { ...o, retiredAt: nowIso, status: 'retired_by_source' as OfferStatus };
    }
    if (o.retiredAt) return { ...o, status: 'retired_by_source' as OfferStatus };
    const status = computeStatus({ expiresAt: o.expiresAt }, now);
    if (status === 'expired') expiredNow++;
    return { ...o, status };
  });

  offers.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime());

  return { offers, added, updated, reactivated, retired, duplicatesSkipped, expiredNow, at: nowIso };
}

// ---------------------------------------------------------------------
// Simulation d'un connecteur (scraping / API job boards). En l'absence
// de fournisseur réel branché, ce générateur reproduit fidèlement le
// comportement attendu d'un vrai flux : offres stables, offre qui
// disparaît puis revient, offre qui expire, doublon inter-source, offre
// qui ne revient jamais (démonstration de la conservation de copie).
// ---------------------------------------------------------------------
const iso = (daysFromNow: number) => {
  const d = new Date('2026-09-22T09:00:00.000Z');
  d.setUTCDate(d.getUTCDate() + daysFromNow);
  return d.toISOString();
};

const POOL: Record<string, RawOffer> = {
  acme: {
    externalId: 'ACME-DA-014',
    source: 'JobBoard Lyon',
    title: 'Data Analyst',
    company: 'ACME Corp',
    location: 'Lyon, France',
    remote: 'Hybride',
    contract: 'CDI',
    salary: '45 000 € – 55 000 €',
    skills: ['SQL', 'Power BI', 'Excel', 'KPIs'],
    description:
      "Nous recherchons un·e Data Analyst maîtrisant SQL pour interroger nos entrepôts de données et Power BI pour concevoir des tableaux de bord business. La maîtrise d'Excel avancé est indispensable pour fiabiliser nos rapports hebdomadaires.",
    requiredExperience: 2,
    postedAt: iso(-1),
    expiresAt: iso(28),
  },
  greentech: {
    externalId: 'GT-DE-221',
    source: 'API Indeed',
    title: 'Data Engineer',
    company: 'GreenTech',
    location: 'Lyon, France',
    remote: 'Hybride',
    contract: 'CDI',
    salary: '50 000 € – 65 000 €',
    skills: ['Python', 'SQL', 'Databricks', 'AWS'],
    description:
      'Poste de Data Engineer : conception de pipelines en Python, modélisation SQL et déploiement de jobs Databricks sur AWS pour notre plateforme de suivi énergétique.',
    requiredExperience: 3,
    postedAt: iso(-3),
    expiresAt: iso(20),
  },
  innovadata: {
    externalId: 'ID-DS-089',
    source: 'JobBoard Lyon',
    title: 'Data Scientist',
    company: 'InnovaData',
    location: 'Lyon, France',
    remote: 'Télétravail complet',
    contract: 'CDI',
    salary: '48 000 € – 60 000 €',
    skills: ['Python', 'Machine Learning', 'Pandas'],
    description:
      'Rejoignez notre équipe R&D pour développer des modèles de Machine Learning en Python, à partir de jeux de données manipulés avec Pandas.',
    requiredExperience: 2,
    postedAt: iso(-2),
    expiresAt: iso(6),
  },
  dataanalytics: {
    externalId: 'DA-BI-057',
    source: 'API Indeed',
    title: 'BI Analyst',
    company: 'Data Analytics',
    location: 'Villeurbanne, France',
    remote: 'Sur site',
    contract: 'CDD',
    salary: '38 000 € – 45 000 €',
    skills: ['Power BI', 'DAX', 'SQL', 'Reporting'],
    description:
      'BI Analyst pour piloter nos reportings : requêtes SQL, mesures DAX et diffusion de rapports Power BI auprès des directions métier.',
    requiredExperience: 1,
    postedAt: iso(-5),
    expiresAt: iso(2),
  },
  people: {
    externalId: 'PD-DA-033',
    source: 'JobBoard Lyon',
    title: 'Data Analyst RH',
    company: 'People & Data',
    location: 'Lyon, France',
    remote: 'Hybride',
    contract: 'Alternance',
    salary: '40 000 € – 48 000 €',
    skills: ['SQL', 'Power BI', 'HR Analytics'],
    description:
      "Alternance Data Analyst RH : exploitation SQL des données SIRH et restitution via Power BI pour les équipes RH, avec une sensibilité HR Analytics.",
    requiredExperience: 0,
    postedAt: iso(-4),
    expiresAt: iso(15),
  },
  orange: {
    externalId: 'OR-DA-410',
    source: 'API Indeed',
    title: 'Data Analyst Marketing',
    company: 'Orange',
    location: 'Lyon, France',
    remote: 'Hybride',
    contract: 'CDI',
    salary: '42 000 € – 50 000 €',
    skills: ['SQL', 'Python', 'Tableau', 'A/B Testing'],
    description:
      "Data Analyst Marketing : analyse SQL et Python des parcours clients, restitution sous Tableau et pilotage des campagnes par A/B Testing.",
    requiredExperience: 2,
    postedAt: iso(0),
    expiresAt: iso(25),
  },
  capgemini: {
    externalId: 'CG-CONS-771',
    source: 'JobBoard Lyon',
    title: 'Consultant Data',
    company: 'Capgemini',
    location: 'Lyon, France',
    remote: 'Sur site',
    contract: 'CDI',
    salary: '38 000 € – 46 000 €',
    skills: ['SQL', 'Power BI', 'Change Management'],
    description:
      'Consultant Data pour accompagner nos clients grands comptes : audit SQL des données, restitution Power BI et conduite du changement.',
    requiredExperience: 3,
    postedAt: iso(-10),
    expiresAt: iso(-2),
  },
  datavision: {
    externalId: 'DV-AN-902',
    source: 'API Indeed',
    title: 'Analyste Data Junior',
    company: 'DataVision',
    location: 'Caluire-et-Cuire, France',
    remote: 'Hybride',
    contract: 'Stage',
    salary: '1 200 € / mois',
    skills: ['SQL', 'Excel'],
    description:
      "Stage Analyste Data Junior : premières requêtes SQL et construction de rapports Excel pour l'équipe pilotage.",
    requiredExperience: 0,
    postedAt: iso(-6),
    expiresAt: iso(10),
  },
};

/**
 * Retourne le lot d'offres qu'un connecteur renverrait au n-ième
 * rafraîchissement. callIndex commence à 0.
 */
export function simulateProviderFetch(callIndex: number): RawOffer[] {
  const batch: RawOffer[] = [POOL.acme, POOL.greentech, POOL.innovadata, POOL.dataanalytics];

  // People & Data alterne présent / absent : démontre le retrait puis la
  // réapparition (réactivation) d'une offre.
  if (callIndex % 2 === 0) batch.push(POOL.people);

  // Orange n'apparaît qu'à partir du 2e rafraîchissement : nouvelle offre.
  if (callIndex >= 1) batch.push(POOL.orange);

  // Capgemini a une date d'expiration déjà dépassée : démontre le suivi
  // d'expiration indépendamment du retrait par la source.
  if (callIndex >= 1) batch.push(POOL.capgemini);

  // DataVision n'apparaît qu'au tout premier appel puis disparaît
  // définitivement : démontre la conservation de copie (jamais supprimée).
  if (callIndex === 0) batch.push(POOL.datavision);

  // Doublon inter-source, un appel sur deux (dont le tout premier, absorbé
  // silencieusement dans le fonds initial) : une republication de l'offre
  // ACME avec un identifiant externe différent mais les mêmes
  // société/intitulé/lieu. Se reproduit régulièrement afin qu'une
  // synchronisation déclenchée par l'utilisateur puisse toujours l'observer.
  if (callIndex % 2 === 0) {
    batch.push({
      ...POOL.acme,
      externalId: `ACME-DA-014-REPOST-${callIndex}`,
      source: 'API Indeed',
    });
  }

  return batch;
}

export const STATUS_LABEL: Record<OfferStatus, string> = {
  active: 'Active',
  expiring_soon: 'Expire bientôt',
  expired: 'Expirée',
  retired_by_source: 'Retirée par la source',
};

// Base de référence utilisée comme valeur initiale du store (avant toute
// synchronisation déclenchée par l'utilisateur) : le résultat d'un premier
// passage du connecteur, figé à une date fixe pour rester déterministe
// entre le rendu serveur et le premier rendu client (pas d'hydratation
// incohérente).
export const SEED_SYNC_AT = new Date('2026-09-22T09:00:00.000Z');
export const initialOffers: StoredOffer[] = syncOffers([], simulateProviderFetch(0), SEED_SYNC_AT).offers;
// Prochain appel de synchronisation à utiliser par l'UI (le lot 0 a déjà
// servi à construire `initialOffers`).
export const initialSyncCallIndex = 1;
