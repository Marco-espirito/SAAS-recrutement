import { describe, expect, it } from 'vitest';
import { parseSalaryRange, scoreCandidateOffer } from '@/lib/domain/matching';

describe('salary parsing', () => {
  it('parses a k€ range', () => {
    expect(parseSalaryRange('45–55 k€')).toEqual([45_000, 55_000]);
  });

  it('parses a plain numeric range', () => {
    expect(parseSalaryRange('50000-60000 EUR')).toEqual([50_000, 60_000]);
  });

  it('returns null when there is nothing to parse', () => {
    expect(parseSalaryRange(null)).toBeNull();
    expect(parseSalaryRange('Non précisé')).toBeNull();
  });
});

describe('candidate/offer matching', () => {
  it('gives full skill credit and no missing skills when every required skill is covered', () => {
    const result = scoreCandidateOffer(
      {
        skills: ['SQL', 'Power BI', 'Python'],
        desiredLocations: [],
        salaryMin: null,
        salaryMax: null,
      },
      {
        title: 'Data Analyst',
        skills: ['SQL', 'Power BI'],
        location: null,
        salary: null,
      },
    );
    expect(result.matchedSkills).toEqual(['SQL', 'Power BI']);
    expect(result.missingSkills).toEqual([]);
    expect(result.dataComplete).toBe(true);
    expect(result.breakdown.find((c) => c.key === 'skills')?.score).toBe(100);
  });

  it('lists missing skills with evidence when the profile lacks them', () => {
    const result = scoreCandidateOffer(
      { skills: ['SQL'], desiredLocations: [] },
      {
        title: 'Data Analyst',
        skills: ['SQL', 'Power BI', 'Python'],
        location: null,
        salary: null,
      },
    );
    expect(result.missingSkills).toEqual([
      { skill: 'Power BI', evidence: expect.stringContaining('Absente') },
      { skill: 'Python', evidence: expect.stringContaining('Absente') },
    ]);
    expect(result.matchedSkills).toEqual(['SQL']);
  });

  it('refuses to invent missing skills when the candidate has no declared skills at all', () => {
    const result = scoreCandidateOffer(
      { skills: [], experienceSkills: [], desiredLocations: [] },
      {
        title: 'Data Analyst',
        skills: ['SQL', 'Power BI'],
        location: null,
        salary: null,
      },
    );
    expect(result.missingSkills).toEqual([]);
    expect(result.dataComplete).toBe(false);
  });

  it('also credits skills found only in experience entries', () => {
    const result = scoreCandidateOffer(
      {
        skills: [],
        experienceSkills: ['SQL', 'Power BI'],
        desiredLocations: [],
      },
      {
        title: 'Data Analyst',
        skills: ['SQL', 'Power BI'],
        location: null,
        salary: null,
      },
    );
    expect(result.matchedSkills).toEqual(['SQL', 'Power BI']);
    expect(result.dataComplete).toBe(true);
  });

  it('rewards a location matching the candidate desired locations', () => {
    const result = scoreCandidateOffer(
      { skills: [], desiredLocations: ['Lyon, France'] },
      {
        title: 'Data Analyst',
        skills: [],
        location: 'Lyon, France',
        salary: null,
      },
    );
    expect(result.breakdown.find((c) => c.key === 'location')?.score).toBe(100);
  });

  it('penalizes a location outside the candidate desired locations', () => {
    const result = scoreCandidateOffer(
      { skills: [], desiredLocations: ['Lyon, France'] },
      {
        title: 'Data Analyst',
        skills: [],
        location: 'Berlin, Allemagne',
        salary: null,
      },
    );
    expect(result.breakdown.find((c) => c.key === 'location')?.score).toBe(30);
  });

  it('rewards remote offers for candidates preferring remote work', () => {
    const result = scoreCandidateOffer(
      { skills: [], desiredLocations: [], remotePreference: 'REMOTE' },
      {
        title: 'Data Analyst',
        skills: [],
        location: 'Télétravail total',
        salary: null,
      },
    );
    expect(result.breakdown.find((c) => c.key === 'location')?.score).toBe(100);
  });

  it('scores overlapping salary ranges highly and disjoint ones poorly', () => {
    const overlapping = scoreCandidateOffer(
      {
        skills: [],
        desiredLocations: [],
        salaryMin: 40_000,
        salaryMax: 50_000,
      },
      { title: 'Data Analyst', skills: [], location: null, salary: '45-55 k€' },
    );
    const disjoint = scoreCandidateOffer(
      {
        skills: [],
        desiredLocations: [],
        salaryMin: 80_000,
        salaryMax: 90_000,
      },
      { title: 'Data Analyst', skills: [], location: null, salary: '45-55 k€' },
    );
    expect(overlapping.breakdown.find((c) => c.key === 'salary')?.score).toBe(
      100,
    );
    expect(disjoint.breakdown.find((c) => c.key === 'salary')?.score).toBe(20);
  });

  it('keeps the overall score within 0..100', () => {
    const result = scoreCandidateOffer(
      {
        skills: [],
        desiredLocations: ['Paris'],
        salaryMin: 100_000,
        salaryMax: 120_000,
      },
      {
        title: 'Data Analyst',
        skills: ['SQL', 'Power BI', 'Python'],
        location: 'Berlin',
        salary: '30-35 k€',
      },
    );
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});
