'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import * as I from 'lucide-react';

type Profile = {
  phone?: string;
  location?: string;
  headline?: string;
  summary?: string;
  linkedinUrl?: string;
  websiteUrl?: string;
  desiredRoles?: string[];
  desiredLocations?: string[];
  remotePreference?: string;
  employmentTypes?: string[];
  salaryMin?: number;
  salaryMax?: number;
  availabilityDate?: string;
  skills?: string[];
  primaryDocumentId?: string;
};
type Experience = {
  id: string;
  type: string;
  title: string;
  organizationName?: string;
  startedAt?: string;
  endedAt?: string;
  current: boolean;
};
type Analysis = {
  id: string;
  documentName?: string;
  score: number;
  detectedKeywords: string[];
  createdAt: string;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Opération impossible');
  return result;
}
const list = (value: FormDataEntryValue | null) =>
  (typeof value === 'string' ? value : '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

export function CandidateProfilePage({
  toast,
}: {
  toast: (message: string) => void;
}) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [analyses, setAnalyses] = useState<Analysis[]>([]);
  const [documents, setDocuments] = useState<
    Array<{ id: string; name: string; kind: string }>
  >([]);
  const [error, setError] = useState('');
  const load = () =>
    void Promise.all([
      request('/api/candidate/profile'),
      request('/api/documents'),
    ])
      .then(([result, documentResult]) => {
        setProfile(result.profile ?? {});
        setExperiences(result.experiences);
        setAnalyses(result.analyses);
        setDocuments(documentResult.documents);
      })
      .catch((cause: Error) => setError(cause.message));
  useEffect(load, []);
  async function saveProfile(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const number = (name: string) =>
      form.get(name) ? Number(form.get(name)) : null;
    const body = {
      phone: form.get('phone'),
      location: form.get('location'),
      headline: form.get('headline'),
      summary: form.get('summary'),
      linkedinUrl: form.get('linkedinUrl'),
      websiteUrl: form.get('websiteUrl'),
      desiredRoles: list(form.get('desiredRoles')),
      desiredLocations: list(form.get('desiredLocations')),
      remotePreference: form.get('remotePreference'),
      employmentTypes: list(form.get('employmentTypes')),
      salaryMin: number('salaryMin'),
      salaryMax: number('salaryMax'),
      availabilityDate: form.get('availabilityDate') || null,
      skills: list(form.get('skills')),
      primaryDocumentId: form.get('primaryDocumentId') || null,
    };
    try {
      await request('/api/candidate/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast('Profil candidat enregistré');
      load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Enregistrement impossible',
      );
    }
  }
  async function addExperience(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = {
      type: form.get('type'),
      title: form.get('title'),
      organizationName: form.get('organizationName'),
      startedAt: form.get('startedAt') || null,
      endedAt: form.get('endedAt') || null,
      current: form.get('current') === 'on',
      skills: list(form.get('skills')),
      position: experiences.length,
    };
    try {
      await request('/api/candidate/profile/experiences', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast('Expérience ajoutée');
      event.currentTarget.reset();
      load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ajout impossible');
    }
  }
  async function removeExperience(id: string) {
    try {
      await request(`/api/candidate/profile/experiences/${id}`, {
        method: 'DELETE',
      });
      toast('Expérience supprimée');
      load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Suppression impossible',
      );
    }
  }
  if (!profile)
    return <div className="live-empty large">Chargement du profil…</div>;
  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Mon profil candidat</h1>
          <p>
            Coordonnées, préférences, compétences, expériences et historique ATS
            persistent en base.
          </p>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      <form className="panel profile-form" onSubmit={saveProfile}>
        <label>
          Titre professionnel
          <input name="headline" defaultValue={profile.headline} />
        </label>
        <label>
          Téléphone
          <input name="phone" defaultValue={profile.phone} />
        </label>
        <label>
          Localisation
          <input name="location" defaultValue={profile.location} />
        </label>
        <label>
          LinkedIn
          <input
            name="linkedinUrl"
            type="url"
            defaultValue={profile.linkedinUrl}
          />
        </label>
        <label>
          Site web
          <input
            name="websiteUrl"
            type="url"
            defaultValue={profile.websiteUrl}
          />
        </label>
        <label className="wide">
          Résumé
          <textarea name="summary" defaultValue={profile.summary} rows={5} />
        </label>
        <label>
          Postes recherchés (séparés par des virgules)
          <input
            name="desiredRoles"
            defaultValue={profile.desiredRoles?.join(', ')}
          />
        </label>
        <label>
          Zones recherchées
          <input
            name="desiredLocations"
            defaultValue={profile.desiredLocations?.join(', ')}
          />
        </label>
        <label>
          Télétravail
          <select
            name="remotePreference"
            defaultValue={profile.remotePreference ?? 'FLEXIBLE'}
          >
            <option value="FLEXIBLE">Flexible</option>
            <option value="REMOTE">À distance</option>
            <option value="HYBRID">Hybride</option>
            <option value="ONSITE">Sur site</option>
          </select>
        </label>
        <label>
          Types de contrat
          <input
            name="employmentTypes"
            defaultValue={profile.employmentTypes?.join(', ')}
          />
        </label>
        <label>
          Salaire minimum
          <input
            name="salaryMin"
            type="number"
            min="0"
            defaultValue={profile.salaryMin}
          />
        </label>
        <label>
          Salaire maximum
          <input
            name="salaryMax"
            type="number"
            min="0"
            defaultValue={profile.salaryMax}
          />
        </label>
        <label>
          Disponibilité
          <input
            name="availabilityDate"
            type="date"
            defaultValue={profile.availabilityDate?.slice(0, 10)}
          />
        </label>
        <label className="wide">
          Compétences
          <input name="skills" defaultValue={profile.skills?.join(', ')} />
        </label>
        <label className="wide">
          CV principal
          <select
            name="primaryDocumentId"
            defaultValue={profile.primaryDocumentId ?? ''}
          >
            <option value="">Aucun</option>
            {documents
              .filter((document) => document.kind === 'CV')
              .map((document) => (
                <option value={document.id} key={document.id}>
                  {document.name}
                </option>
              ))}
          </select>
        </label>
        <button className="action primary">
          <I.Save /> Enregistrer le profil
        </button>
      </form>
      <div className="module-head compact">
        <div>
          <h2>Expériences</h2>
        </div>
      </div>
      <form className="live-create-form panel" onSubmit={addExperience}>
        <label>
          Type
          <select name="type">
            <option value="WORK">Emploi</option>
            <option value="EDUCATION">Formation</option>
            <option value="PROJECT">Projet</option>
          </select>
        </label>
        <label>
          Intitulé
          <input name="title" required />
        </label>
        <label>
          Organisation
          <input name="organizationName" />
        </label>
        <label>
          Début
          <input name="startedAt" type="date" />
        </label>
        <label>
          Fin
          <input name="endedAt" type="date" />
        </label>
        <label>
          Compétences
          <input name="skills" />
        </label>
        <label>
          <span>En cours</span>
          <input name="current" type="checkbox" />
        </label>
        <button className="action primary">
          <I.Plus /> Ajouter
        </button>
      </form>
      <section className="panel admin-table">
        {experiences.map((experience) => (
          <article key={experience.id}>
            <b>{experience.title}</b>
            <span>{experience.organizationName || experience.type}</span>
            <span>
              {experience.startedAt
                ? new Date(experience.startedAt).getFullYear()
                : '—'}{' '}
              —{' '}
              {experience.current
                ? 'Aujourd’hui'
                : experience.endedAt
                  ? new Date(experience.endedAt).getFullYear()
                  : '—'}
            </span>
            <button
              className="action danger"
              onClick={() => void removeExperience(experience.id)}
            >
              <I.Trash2 /> Supprimer
            </button>
          </article>
        ))}
      </section>
      <div className="module-head compact">
        <div>
          <h2>Historique des analyses ATS</h2>
        </div>
      </div>
      <section className="panel admin-table">
        {analyses.length ? (
          analyses.map((analysis) => (
            <article key={analysis.id}>
              <b>{analysis.documentName || 'Analyse sans document'}</b>
              <strong>{analysis.score}%</strong>
              <span>
                {analysis.detectedKeywords.slice(0, 4).join(', ') ||
                  'Aucun mot-clé'}
              </span>
              <time>
                {new Date(analysis.createdAt).toLocaleString('fr-FR')}
              </time>
            </article>
          ))
        ) : (
          <div className="live-empty">Aucune analyse enregistrée.</div>
        )}
      </section>
    </div>
  );
}
