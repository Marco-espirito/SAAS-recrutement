// Moteur de matching Nexora.
//
// Comparaison structurée profil candidat / offre : chaque critère est
// noté et pondéré individuellement, le score final est la somme pondérée
// (jamais un nombre inventé), et chaque compétence manquante est reliée
// à la phrase de l'offre qui la mentionne (preuve, pas affirmation gratuite).
// Le suivi qualité conserve les retours des candidats sur la pertinence
// des recommandations afin de pouvoir mesurer la précision perçue dans
// le temps.

export type CandidateProfile = {
  skills: string[];
  preferredLocation: string;
  preferredRemote: string[];
  preferredContracts: string[];
  experienceYears: number;
};

export const defaultCandidateProfile: CandidateProfile = {
  skills: [
    'SQL',
    'Python',
    'Power BI',
    'Excel',
    'Tableau',
    'KPIs',
    'A/B Testing',
    'Agile',
    'Data Modeling',
  ],
  preferredLocation: 'Lyon',
  preferredRemote: ['Hybride', 'Télétravail complet'],
  preferredContracts: ['CDI', 'Alternance'],
  experienceYears: 3,
};

export type MatchableOffer = {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: string;
  contract: string;
  skills: string[];
  description: string;
  requiredExperience: number;
  status: string; // 'active' | 'expiring_soon' | 'expired' | 'retired_by_source'
};

export type MatchCriterion = {
  key: string;
  label: string;
  weight: number;
  score: number; // 0..1
  detail: string;
};

export type SkillEvidence = { skill: string; evidence: string };

export type MatchResult = {
  offerId: string;
  score: number; // 0..100
  criteria: MatchCriterion[];
  matchedSkills: string[];
  missingSkills: SkillEvidence[];
  confidence: 'Excellent match' | 'Bon match' | 'Match partiel' | 'Match faible';
};

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

function findEvidence(description: string, skill: string): string {
  const sentences = description.split(/(?<=[.!?])\s+/).filter(Boolean);
  const found = sentences.find((s) => norm(s).includes(norm(skill)));
  return found
    ? found.trim()
    : `« ${skill} » figure dans les compétences requises listées par l'offre.`;
}

/**
 * Calcule un score de matching structuré et justifiable : chaque critère
 * porte un poids explicite et une explication, la somme pondérée donne
 * le score final. Rien n'est tiré au hasard.
 */
export function computeMatch(candidate: CandidateProfile, offer: MatchableOffer): MatchResult {
  const candSet = new Set(candidate.skills.map(norm));
  const matchedSkills = offer.skills.filter((s) => candSet.has(norm(s)));
  const missing = offer.skills.filter((s) => !candSet.has(norm(s)));
  const skillScore = offer.skills.length ? matchedSkills.length / offer.skills.length : 1;

  const missingSkills: SkillEvidence[] = missing.map((skill) => ({
    skill,
    evidence: findEvidence(offer.description, skill),
  }));

  const locNorm = norm(offer.location);
  const locScore = locNorm.includes(norm(candidate.preferredLocation))
    ? 1
    : offer.remote === 'Télétravail complet'
      ? 0.8
      : 0.35;

  const remoteScore = candidate.preferredRemote.includes(offer.remote) ? 1 : 0.5;
  const contractScore = candidate.preferredContracts.includes(offer.contract) ? 1 : 0.3;

  const expGap = offer.requiredExperience - candidate.experienceYears;
  const expScore = expGap <= 0 ? 1 : Math.max(0, 1 - expGap * 0.25);

  const availabilityScore =
    offer.status === 'active' ? 1 : offer.status === 'expiring_soon' ? 0.7 : 0;

  const criteria: MatchCriterion[] = [
    {
      key: 'skills',
      label: 'Compétences techniques',
      weight: 0.45,
      score: skillScore,
      detail: `${matchedSkills.length}/${offer.skills.length} compétences requises maîtrisées`,
    },
    {
      key: 'location',
      label: 'Localisation',
      weight: 0.15,
      score: locScore,
      detail:
        locScore === 1
          ? `Ville cible (${candidate.preferredLocation}) atteinte`
          : offer.remote === 'Télétravail complet'
            ? 'Hors zone cible, mais poste 100 % télétravail'
            : `Hors zone cible (${candidate.preferredLocation})`,
    },
    {
      key: 'remote',
      label: 'Mode de travail',
      weight: 0.1,
      score: remoteScore,
      detail: `Offre en ${offer.remote}`,
    },
    {
      key: 'contract',
      label: 'Type de contrat',
      weight: 0.1,
      score: contractScore,
      detail: `Contrat proposé : ${offer.contract}`,
    },
    {
      key: 'experience',
      label: 'Séniorité',
      weight: 0.1,
      score: expScore,
      detail: `${offer.requiredExperience} an(s) requis · ${candidate.experienceYears} an(s) déclarés`,
    },
    {
      key: 'availability',
      label: 'Disponibilité de l’offre',
      weight: 0.1,
      score: availabilityScore,
      detail:
        offer.status === 'active'
          ? 'Offre active, candidature possible'
          : offer.status === 'expiring_soon'
            ? 'Offre bientôt expirée'
            : offer.status === 'expired'
              ? 'Offre expirée : candidature non recommandée'
              : 'Offre retirée par la source : candidature impossible',
    },
  ];

  const score = Math.round(criteria.reduce((s, c) => s + c.weight * c.score, 0) * 100);
  const confidence: MatchResult['confidence'] =
    score >= 85 ? 'Excellent match' : score >= 65 ? 'Bon match' : score >= 40 ? 'Match partiel' : 'Match faible';

  return { offerId: offer.id, score, criteria, matchedSkills, missingSkills, confidence };
}

// ---------------------------------------------------------------------
// Suivi de la qualité des recommandations : les candidats évaluent
// chaque proposition (pertinente / non pertinente), ce qui permet de
// mesurer si le score calculé est réellement corrélé à l'utilité perçue.
// ---------------------------------------------------------------------
export type MatchFeedback = {
  offerId: string;
  offerLabel: string;
  score: number;
  helpful: boolean;
  at: string;
};

export type QualityStats = {
  total: number;
  helpfulCount: number;
  helpfulRate: number; // 0..100
  avgScoreHelpful: number;
  avgScoreNotHelpful: number;
  calibrationGap: number; // écart entre score moyen jugé pertinent vs non pertinent
};

export function qualityStats(feedback: MatchFeedback[]): QualityStats | null {
  if (!feedback.length) return null;
  const helpful = feedback.filter((f) => f.helpful);
  const notHelpful = feedback.filter((f) => !f.helpful);
  const avg = (arr: MatchFeedback[]) =>
    arr.length ? Math.round(arr.reduce((s, f) => s + f.score, 0) / arr.length) : 0;
  const avgScoreHelpful = avg(helpful);
  const avgScoreNotHelpful = avg(notHelpful);
  return {
    total: feedback.length,
    helpfulCount: helpful.length,
    helpfulRate: Math.round((helpful.length / feedback.length) * 100),
    avgScoreHelpful,
    avgScoreNotHelpful,
    calibrationGap: avgScoreHelpful - avgScoreNotHelpful,
  };
}
