import { normalizeToken } from './offers';

export type CandidateMatchProfile = {
  skills: string[];
  experienceSkills?: string[];
  desiredLocations?: string[];
  remotePreference?: 'ONSITE' | 'HYBRID' | 'REMOTE' | 'FLEXIBLE';
  salaryMin?: number | null;
  salaryMax?: number | null;
};

export type OfferMatchInput = {
  title: string;
  skills: string[];
  location?: string | null;
  salary?: string | null;
};

export type MatchCriterion = {
  key: 'skills' | 'location' | 'salary';
  label: string;
  weight: number;
  score: number;
  detail: string;
};

export type MissingSkill = {
  skill: string;
  evidence: string;
};

export type MatchResult = {
  score: number;
  dataComplete: boolean;
  breakdown: MatchCriterion[];
  matchedSkills: string[];
  missingSkills: MissingSkill[];
};

const REMOTE_HINTS = [
  'remote',
  'télétravail',
  'teletravail',
  'hybride',
  'hybrid',
];

/**
 * Parses free-text salary ranges such as "45–55 k€" or "50000-60000 EUR"
 * into a numeric [min, max] in currency units. Returns null when the text
 * cannot be parsed with confidence — callers must then stay neutral rather
 * than penalize the candidate for a provider formatting quirk.
 */
export function parseSalaryRange(
  text: string | null | undefined,
): [number, number] | null {
  if (!text) return null;
  const numbers = text.match(/\d[\d\s.]*/g);
  if (!numbers || numbers.length === 0) return null;
  const isThousands = /\bk\b|k€|k\$/i.test(text);
  const values = numbers
    .map((raw) => Number(raw.replace(/[\s.]/g, '')))
    .filter((value) => Number.isFinite(value) && value > 0)
    .map((value) => (isThousands ? value * 1000 : value));
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [min, max];
}

function scoreSkills(
  candidateSkills: ReadonlySet<string>,
  offerSkills: string[],
): {
  criterion: MatchCriterion;
  matchedSkills: string[];
  missingSkills: MissingSkill[];
  dataComplete: boolean;
} {
  const uniqueOfferSkills = Array.from(
    new Set(offerSkills.map((s) => s.trim()).filter(Boolean)),
  );
  if (uniqueOfferSkills.length === 0) {
    return {
      criterion: {
        key: 'skills',
        label: 'Compétences',
        weight: 60,
        score: 70,
        detail: "L'offre ne liste aucune compétence à comparer.",
      },
      matchedSkills: [],
      missingSkills: [],
      dataComplete: true,
    };
  }
  if (candidateSkills.size === 0) {
    return {
      criterion: {
        key: 'skills',
        label: 'Compétences',
        weight: 60,
        score: 50,
        detail:
          'Profil sans compétences déclarées : complétez votre CV pour une analyse fiable.',
      },
      matchedSkills: [],
      missingSkills: [],
      dataComplete: false,
    };
  }
  const matchedSkills = uniqueOfferSkills.filter((skill) =>
    candidateSkills.has(normalizeToken(skill)),
  );
  const missingSkills = uniqueOfferSkills
    .filter((skill) => !candidateSkills.has(normalizeToken(skill)))
    .map((skill) => ({
      skill,
      evidence:
        'Absente des compétences déclarées et des expériences du profil candidat.',
    }));
  const coverage = Math.round(
    (matchedSkills.length / uniqueOfferSkills.length) * 100,
  );
  return {
    criterion: {
      key: 'skills',
      label: 'Compétences',
      weight: 60,
      score: coverage,
      detail: `${matchedSkills.length}/${uniqueOfferSkills.length} compétences requises retrouvées dans le profil.`,
    },
    matchedSkills,
    missingSkills,
    dataComplete: true,
  };
}

function scoreLocation(
  candidate: CandidateMatchProfile,
  offer: OfferMatchInput,
): MatchCriterion {
  const offerLocation = (offer.location ?? '').trim();
  const desired = (candidate.desiredLocations ?? [])
    .map((l) => l.trim())
    .filter(Boolean);
  const offerLooksRemote = REMOTE_HINTS.some((hint) =>
    normalizeToken(offerLocation).includes(hint),
  );
  if (candidate.remotePreference === 'REMOTE' && offerLooksRemote) {
    return {
      key: 'location',
      label: 'Localisation',
      weight: 20,
      score: 100,
      detail: 'Offre en télétravail, conforme à votre préférence.',
    };
  }
  if (desired.length === 0) {
    return {
      key: 'location',
      label: 'Localisation',
      weight: 20,
      score: 70,
      detail: 'Aucune localisation souhaitée renseignée dans le profil.',
    };
  }
  if (!offerLocation) {
    return {
      key: 'location',
      label: 'Localisation',
      weight: 20,
      score: 60,
      detail: "L'offre ne précise pas de localisation.",
    };
  }
  const normalizedOffer = normalizeToken(offerLocation);
  const matches = desired.some((loc) =>
    normalizedOffer.includes(normalizeToken(loc.split(',')[0])),
  );
  return matches
    ? {
        key: 'location',
        label: 'Localisation',
        weight: 20,
        score: 100,
        detail: `${offerLocation} correspond à une localisation souhaitée.`,
      }
    : {
        key: 'location',
        label: 'Localisation',
        weight: 20,
        score: 30,
        detail: `${offerLocation} ne figure pas dans vos localisations souhaitées.`,
      };
}

function scoreSalary(
  candidate: CandidateMatchProfile,
  offer: OfferMatchInput,
): MatchCriterion {
  const parsed = parseSalaryRange(offer.salary);
  if (!parsed || (candidate.salaryMin == null && candidate.salaryMax == null)) {
    return {
      key: 'salary',
      label: 'Rémunération',
      weight: 20,
      score: 70,
      detail:
        'Rémunération non comparable (donnée manquante ou non structurée).',
    };
  }
  const [offerMin, offerMax] = parsed;
  const candidateMin = candidate.salaryMin ?? 0;
  const candidateMax = candidate.salaryMax ?? Number.POSITIVE_INFINITY;
  const overlaps = offerMax >= candidateMin && offerMin <= candidateMax;
  return overlaps
    ? {
        key: 'salary',
        label: 'Rémunération',
        weight: 20,
        score: 100,
        detail: 'La fourchette de l’offre couvre vos attentes salariales.',
      }
    : {
        key: 'salary',
        label: 'Rémunération',
        weight: 20,
        score: 20,
        detail:
          'La fourchette de l’offre est en dehors de vos attentes salariales.',
      };
}

export function scoreCandidateOffer(
  candidate: CandidateMatchProfile,
  offer: OfferMatchInput,
): MatchResult {
  const candidateSkillSet = new Set(
    [...candidate.skills, ...(candidate.experienceSkills ?? [])]
      .map((skill) => normalizeToken(skill))
      .filter(Boolean),
  );
  const skills = scoreSkills(candidateSkillSet, offer.skills);
  const location = scoreLocation(candidate, offer);
  const salary = scoreSalary(candidate, offer);
  const breakdown = [skills.criterion, location, salary];
  const totalWeight = breakdown.reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round(
    breakdown.reduce((sum, c) => sum + c.score * c.weight, 0) / totalWeight,
  );
  return {
    score: Math.min(100, Math.max(0, score)),
    dataComplete: skills.dataComplete,
    breakdown,
    matchedSkills: skills.matchedSkills,
    missingSkills: skills.missingSkills,
  };
}
