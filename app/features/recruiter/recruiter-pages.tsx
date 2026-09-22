'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import * as I from 'lucide-react';

type Candidate = {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  headline?: string;
  location?: string;
  skills: string[];
  applicationCount: number;
};
type Application = {
  id: string;
  candidateId?: string;
  candidateName?: string;
  opportunityId?: string;
  companyName: string;
  roleTitle: string;
  stage: string;
  matchScore?: number;
};
type Opportunity = {
  id: string;
  companyId: string;
  title: string;
  status: string;
  location?: string;
};
type Interview = {
  id: string;
  applicationId: string;
  candidateName?: string;
  companyName?: string;
  roleTitle: string;
  startsAt: string;
  endsAt: string;
  status: string;
  location?: string;
};

function formValue(form: FormData, name: string) {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

export function LiveRecruiterPage({
  tab,
  toast,
}: {
  tab: string;
  toast: (message: string) => void;
}) {
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  async function refresh() {
    const [
      candidateResponse,
      applicationResponse,
      overviewResponse,
      interviewResponse,
    ] = await Promise.all([
      fetch('/api/candidates'),
      fetch('/api/applications'),
      fetch('/api/crm/overview'),
      fetch('/api/interviews'),
    ]);
    const [
      candidateResult,
      applicationResult,
      overviewResult,
      interviewResult,
    ] = await Promise.all([
      candidateResponse.json(),
      applicationResponse.json(),
      overviewResponse.json(),
      interviewResponse.json(),
    ]);
    if (
      ![
        candidateResponse,
        applicationResponse,
        overviewResponse,
        interviewResponse,
      ].every((response) => response.ok)
    )
      throw new Error('Données recrutement indisponibles');
    setCandidates(candidateResult.candidates);
    setApplications(applicationResult.applications);
    setOpportunities(overviewResult.opportunities);
    setInterviews(interviewResult.interviews);
  }

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/api/candidates').then((response) => response.json()),
      fetch('/api/applications').then((response) => response.json()),
      fetch('/api/crm/overview').then((response) => response.json()),
      fetch('/api/interviews').then((response) => response.json()),
    ])
      .then(
        ([
          candidateResult,
          applicationResult,
          overviewResult,
          interviewResult,
        ]) => {
          if (!active) return;
          if (
            candidateResult.error ||
            applicationResult.error ||
            overviewResult.error ||
            interviewResult.error
          )
            throw new Error('Données recrutement indisponibles');
          setCandidates(candidateResult.candidates);
          setApplications(applicationResult.applications);
          setOpportunities(overviewResult.opportunities);
          setInterviews(interviewResult.interviews);
        },
      )
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function postForm(
    event: SyntheticEvent<HTMLFormElement>,
    endpoint: string,
    transform: (form: FormData) => object,
  ) {
    event.preventDefault();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(transform(new FormData(event.currentTarget))),
    });
    const result = await response.json();
    if (!response.ok) {
      setError(result.error?.message ?? 'Création impossible');
      return;
    }
    setCreating(false);
    setError('');
    await refresh();
    toast('Enregistrement effectué');
  }

  async function move(application: Application, stage: string) {
    const response = await fetch(`/api/applications/${application.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage }),
    });
    if (!response.ok) {
      setError('Déplacement impossible');
      return;
    }
    await refresh();
    toast('Pipeline mis à jour');
  }

  const stages = ['TO_APPLY', 'SENT', 'INTERVIEW', 'OFFER', 'PLACED'];
  const conversion = applications.length
    ? Math.round(
        (applications.filter((application) =>
          ['INTERVIEW', 'OFFER', 'PLACED'].includes(application.stage),
        ).length /
          applications.length) *
          100,
      )
    : 0;
  const averageMatch = useMemo(() => {
    const values = applications.flatMap((application) =>
      typeof application.matchScore === 'number'
        ? [application.matchScore]
        : [],
    );
    return values.length
      ? Math.round(
          values.reduce((sum, value) => sum + value, 0) / values.length,
        )
      : 0;
  }, [applications]);

  if (tab === 'Candidats')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Talent pool</h1>
            <p>Candidats persistés et isolés dans votre organisation.</p>
          </div>
          <button
            className="action primary"
            onClick={() => setCreating((value) => !value)}
          >
            <I.UserPlus />
            Ajouter
          </button>
        </div>
        {error && <div className="auth-alert">{error}</div>}
        {creating && (
          <form
            className="panel live-create-form"
            onSubmit={(event) =>
              void postForm(event, '/api/candidates', (form) => ({
                firstName: form.get('firstName'),
                lastName: form.get('lastName'),
                email: form.get('email'),
                headline: form.get('headline'),
                location: form.get('location'),
                skills: formValue(form, 'skills')
                  .split(',')
                  .map((skill) => skill.trim())
                  .filter(Boolean),
                source: 'Nexora',
              }))
            }
          >
            <input name="firstName" placeholder="Prénom" required />
            <input name="lastName" placeholder="Nom" required />
            <input name="email" type="email" placeholder="E-mail" />
            <input name="headline" placeholder="Titre" />
            <input name="location" placeholder="Ville" />
            <input
              name="skills"
              placeholder="Compétences, séparées par des virgules"
            />
            <button className="action primary">Enregistrer</button>
          </form>
        )}
        <section className="panel admin-table">
          {candidates.map((candidate) => (
            <article key={candidate.id}>
              <b>
                {candidate.firstName} {candidate.lastName}
              </b>
              <span>{candidate.headline || 'Profil à compléter'}</span>
              <span>{candidate.location || '—'}</span>
              <span>{candidate.skills.join(', ') || '—'}</span>
              <em>{candidate.applicationCount} candidature(s)</em>
            </article>
          ))}
          {!candidates.length && <p className="live-empty">Aucun candidat.</p>}
        </section>
      </div>
    );

  if (tab === 'Postes ouverts')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Postes ouverts</h1>
            <p>Opportunités créées depuis le CRM.</p>
          </div>
        </div>
        <section className="panel admin-table">
          {opportunities.map((opportunity) => (
            <article key={opportunity.id}>
              <b>{opportunity.title}</b>
              <span>{opportunity.location || 'Lieu à définir'}</span>
              <span>{opportunity.status}</span>
              <em>
                {
                  applications.filter(
                    (application) =>
                      application.opportunityId === opportunity.id &&
                      application.stage !== 'REJECTED',
                  ).length
                }{' '}
                candidature(s) actives
              </em>
            </article>
          ))}
          {!opportunities.length && (
            <p className="live-empty">Créez les postes dans le CRM.</p>
          )}
        </section>
      </div>
    );

  if (tab === 'Pipeline')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Pipeline candidats</h1>
            <p>Déplacez chaque candidature vers l’étape suivante.</p>
          </div>
          <button
            className="action primary"
            onClick={() => setCreating((value) => !value)}
          >
            <I.Plus />
            Ajouter au pipeline
          </button>
        </div>
        {creating && (
          <form
            className="panel live-create-form"
            onSubmit={(event) =>
              void postForm(event, '/api/applications', (form) => ({
                candidateId: form.get('candidateId'),
                opportunityId: form.get('opportunityId'),
                roleTitle: form.get('roleTitle'),
                stage: 'TO_APPLY',
                matchScore: Number(form.get('matchScore')) || undefined,
              }))
            }
          >
            <select name="candidateId" required>
              <option value="">Candidat</option>
              {candidates.map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.firstName} {candidate.lastName}
                </option>
              ))}
            </select>
            <select name="opportunityId" required>
              <option value="">Poste</option>
              {opportunities
                .filter((opportunity) => opportunity.status === 'OPEN')
                .map((opportunity) => (
                  <option value={opportunity.id} key={opportunity.id}>
                    {opportunity.title}
                  </option>
                ))}
            </select>
            <input name="roleTitle" placeholder="Intitulé" required />
            <input
              name="matchScore"
              type="number"
              min="0"
              max="100"
              placeholder="Matching"
            />
            <button className="action primary">Ajouter</button>
          </form>
        )}
        <div className="kanban">
          {stages.map((stage, index) => (
            <section key={stage}>
              <header>
                <b>{stage}</b>
                <span>
                  {
                    applications.filter(
                      (application) => application.stage === stage,
                    ).length
                  }
                </span>
              </header>
              {applications
                .filter((application) => application.stage === stage)
                .map((application) => (
                  <article key={application.id}>
                    <b>{application.candidateName || application.roleTitle}</b>
                    <small>
                      {application.companyName} · {application.roleTitle}
                    </small>
                    {index < stages.length - 1 && (
                      <button
                        onClick={() =>
                          void move(application, stages[index + 1])
                        }
                      >
                        Étape suivante →
                      </button>
                    )}
                  </article>
                ))}
            </section>
          ))}
        </div>
      </div>
    );

  if (tab === 'Entretiens')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Entretiens</h1>
            <p>Planning connecté au pipeline.</p>
          </div>
          <button
            className="action primary"
            onClick={() => setCreating((value) => !value)}
          >
            <I.CalendarPlus />
            Planifier
          </button>
        </div>
        {creating && (
          <form
            className="panel live-create-form"
            onSubmit={(event) =>
              void postForm(event, '/api/interviews', (form) => ({
                applicationId: form.get('applicationId'),
                startsAt: new Date(formValue(form, 'startsAt')).toISOString(),
                endsAt: new Date(formValue(form, 'endsAt')).toISOString(),
                location: form.get('location'),
              }))
            }
          >
            <select name="applicationId" required>
              <option value="">Candidature</option>
              {applications.map((application) => (
                <option value={application.id} key={application.id}>
                  {application.candidateName || application.roleTitle} —{' '}
                  {application.companyName}
                </option>
              ))}
            </select>
            <input name="startsAt" type="datetime-local" required />
            <input name="endsAt" type="datetime-local" required />
            <input name="location" placeholder="Lieu ou visio" />
            <button className="action primary">Planifier</button>
          </form>
        )}
        <section className="panel admin-table">
          {interviews.map((interview) => (
            <article key={interview.id}>
              <b>{interview.candidateName || interview.roleTitle}</b>
              <span>{interview.companyName}</span>
              <span>
                {new Date(interview.startsAt).toLocaleString('fr-FR')}
              </span>
              <span>{interview.location || 'À distance'}</span>
              <em>{interview.status}</em>
            </article>
          ))}
          {!interviews.length && (
            <p className="live-empty">Aucun entretien planifié.</p>
          )}
        </section>
      </div>
    );

  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Analytics recrutement</h1>
          <p>Indicateurs calculés depuis votre pipeline réel.</p>
        </div>
      </div>
      <section className="stats compact four">
        <div>
          <b>Candidatures</b>
          <strong>{applications.length}</strong>
          <small>Total</small>
        </div>
        <div>
          <b>Conversion entretien</b>
          <strong>{conversion}%</strong>
          <small>Pipeline</small>
        </div>
        <div>
          <b>Matching moyen</b>
          <strong>{averageMatch}%</strong>
          <small>Scores renseignés</small>
        </div>
        <div>
          <b>Placements</b>
          <strong>
            {
              applications.filter(
                (application) => application.stage === 'PLACED',
              ).length
            }
          </strong>
          <small>Réussites</small>
        </div>
      </section>
    </div>
  );
}
