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
type Shortlist = {
  id: string;
  name: string;
  candidateCount: number;
  opportunityTitle?: string;
};
type TalentPool = {
  id: string;
  name: string;
  filters: { skill?: string; location?: string; tag?: string };
};
type PortalLink = {
  id: string;
  companyName: string;
  shortlistName: string;
  expiresAt: string;
  revokedAt?: string | null;
};
type CandidateComment = {
  id: string;
  body: string;
  authorName?: string;
  createdAt: string;
};
type Scorecard = {
  id: string;
  recommendation: string;
  reviewerName: string;
  criteria: { label: string; score: number }[];
  notes?: string;
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
  const [shortlists, setShortlists] = useState<Shortlist[]>([]);
  const [pools, setPools] = useState<TalentPool[]>([]);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [comments, setComments] = useState<CandidateComment[]>([]);
  const [selectedInterviewId, setSelectedInterviewId] = useState('');
  const [scorecards, setScorecards] = useState<Scorecard[]>([]);
  const [poolCandidates, setPoolCandidates] = useState<Candidate[]>([]);
  const [companies, setCompanies] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [portalLinks, setPortalLinks] = useState<PortalLink[]>([]);
  const [portalUrl, setPortalUrl] = useState('');

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
    setCompanies(overviewResult.companies);
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
          setCompanies(overviewResult.companies);
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

  useEffect(() => {
    if (tab !== 'Candidats') return;
    void Promise.all([
      fetch('/api/shortlists'),
      fetch('/api/talent-pools'),
      fetch('/api/client-portal/links'),
    ])
      .then(async ([a, b, c]) => {
        if (a.ok)
          setShortlists(
            ((await a.json()) as { shortlists: Shortlist[] }).shortlists,
          );
        if (b.ok) setPools(((await b.json()) as { pools: TalentPool[] }).pools);
        if (c.ok)
          setPortalLinks(((await c.json()) as { links: PortalLink[] }).links);
      })
      .catch(() => {});
  }, [tab]);
  useEffect(() => {
    if (!selectedCandidateId) {
      return;
    }
    void fetch(`/api/candidates/${selectedCandidateId}/comments`)
      .then((response) => response.json())
      .then((result: { comments?: CandidateComment[] }) =>
        setComments(result.comments ?? []),
      )
      .catch(() => {});
  }, [selectedCandidateId]);
  useEffect(() => {
    if (!selectedInterviewId) {
      return;
    }
    void fetch(`/api/interviews/${selectedInterviewId}/scorecards`)
      .then((response) => response.json())
      .then((result: { scorecards?: Scorecard[] }) =>
        setScorecards(result.scorecards ?? []),
      )
      .catch(() => {});
  }, [selectedInterviewId]);

  async function createShortlist(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/shortlists', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: form.get('name'),
        opportunityId: form.get('opportunityId') || null,
      }),
    });
    if (!response.ok) {
      setError('Création de shortlist impossible');
      return;
    }
    const result = (await fetch('/api/shortlists').then((res) =>
      res.json(),
    )) as { shortlists: Shortlist[] };
    setShortlists(result.shortlists);
    toast('Shortlist créée');
  }

  async function addToShortlist(shortlistId: string, candidateId: string) {
    const response = await fetch(`/api/shortlists/${shortlistId}/candidates`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ candidateId }),
    });
    if (!response.ok) {
      setError('Ajout impossible ou candidat déjà présent');
      return;
    }
    const result = (await fetch('/api/shortlists').then((res) =>
      res.json(),
    )) as { shortlists: Shortlist[] };
    setShortlists(result.shortlists);
    toast('Candidat ajouté à la shortlist');
  }

  async function createPool(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const filters = Object.fromEntries(
      ['skill', 'location', 'tag']
        .map((key) => [key, formValue(form, key).trim()])
        .filter(([, value]) => value),
    );
    const response = await fetch('/api/talent-pools', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: form.get('name'), filters }),
    });
    if (!response.ok) {
      setError('Création du vivier impossible');
      return;
    }
    const result = (await fetch('/api/talent-pools').then((res) =>
      res.json(),
    )) as { pools: TalentPool[] };
    setPools(result.pools);
    toast('Vivier dynamique créé');
  }

  async function addComment(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/candidates/${selectedCandidateId}/comments`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: form.get('body') }),
      },
    );
    if (!response.ok) {
      setError('Commentaire impossible');
      return;
    }
    const result = (await fetch(
      `/api/candidates/${selectedCandidateId}/comments`,
    ).then((res) => res.json())) as { comments: CandidateComment[] };
    setComments(result.comments);
    toast('Commentaire ajouté');
  }

  async function saveScorecard(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(
      `/api/interviews/${selectedInterviewId}/scorecards`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          criteria: [
            { label: form.get('criterion'), score: Number(form.get('score')) },
          ],
          recommendation: form.get('recommendation'),
          notes: form.get('notes'),
        }),
      },
    );
    if (!response.ok) {
      setError('Évaluation impossible');
      return;
    }
    const result = (await fetch(
      `/api/interviews/${selectedInterviewId}/scorecards`,
    ).then((res) => res.json())) as { scorecards: Scorecard[] };
    setScorecards(result.scorecards);
    toast('Scorecard enregistrée');
  }

  async function createPortalLink(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/client-portal/links', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId: form.get('companyId'),
        shortlistId: form.get('shortlistId'),
        expiresInDays: Number(form.get('expiresInDays')),
      }),
    });
    const result = (await response.json()) as {
      url?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(result.error?.message ?? 'Lien impossible');
      return;
    }
    setPortalUrl(result.url ?? '');
    const links = (await fetch('/api/client-portal/links').then((res) =>
      res.json(),
    )) as { links: PortalLink[] };
    setPortalLinks(links.links);
    toast('Lien client créé');
  }

  async function revokePortalLink(id: string) {
    const response = await fetch(`/api/client-portal/links/${id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      setError('Révocation impossible');
      return;
    }
    setPortalLinks((links) =>
      links.map((link) =>
        link.id === id
          ? { ...link, revokedAt: new Date().toISOString() }
          : link,
      ),
    );
    setPortalUrl('');
    toast('Lien révoqué');
  }

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
              <button
                className="action"
                onClick={() => setSelectedCandidateId(candidate.id)}
              >
                Commentaires
              </button>
              {shortlists.length > 0 && (
                <select
                  aria-label={`Ajouter ${candidate.firstName} à une shortlist`}
                  defaultValue=""
                  onChange={(event) => {
                    if (event.target.value)
                      void addToShortlist(event.target.value, candidate.id);
                    event.target.value = '';
                  }}
                >
                  <option value="">Ajouter à une shortlist</option>
                  {shortlists.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              )}
            </article>
          ))}
          {!candidates.length && <p className="live-empty">Aucun candidat.</p>}
        </section>
        {selectedCandidateId && (
          <section className="panel live-create-form">
            <h2>Commentaires collaboratifs</h2>
            {comments.map((item) => (
              <p key={item.id}>
                <b>{item.authorName ?? 'Membre'}</b> · {item.body}
              </p>
            ))}
            <form onSubmit={addComment}>
              <label>
                Commentaire
                <input name="body" minLength={2} required />
              </label>
              <button className="action primary">Publier</button>
            </form>
          </section>
        )}
        <section className="panel live-create-form">
          <h2>Shortlists</h2>
          <form onSubmit={createShortlist}>
            <label>
              Nom
              <input name="name" required minLength={2} />
            </label>
            <label>
              Poste
              <select name="opportunityId">
                <option value="">Tous les postes</option>
                {opportunities.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <button className="action primary">Créer la shortlist</button>
          </form>
          {shortlists.map((item) => (
            <p key={item.id}>
              {item.name} · {item.candidateCount} candidat(s) ·{' '}
              {item.opportunityTitle ?? 'Sans poste'}
            </p>
          ))}
        </section>
        <section className="panel live-create-form">
          <h2>Viviers dynamiques</h2>
          <form onSubmit={createPool}>
            <label>
              Nom
              <input name="name" required minLength={2} />
            </label>
            <label>
              Compétence
              <input name="skill" />
            </label>
            <label>
              Lieu
              <input name="location" />
            </label>
            <label>
              Tag
              <input name="tag" />
            </label>
            <button className="action primary">Créer le vivier</button>
          </form>
          {pools.map((item) => (
            <button
              className="action"
              key={item.id}
              onClick={() => {
                void fetch(`/api/talent-pools/${item.id}/candidates`)
                  .then((response) => response.json())
                  .then((result: { candidates?: Candidate[] }) =>
                    setPoolCandidates(result.candidates ?? []),
                  );
              }}
            >
              {item.name}
            </button>
          ))}
          {poolCandidates.map((item) => (
            <p key={item.id}>
              {item.firstName} {item.lastName} · {item.headline}
            </p>
          ))}
        </section>
        <section className="panel live-create-form">
          <h2>Portail client</h2>
          <p>
            Partagez une shortlist en lecture seule avec un lien temporaire et
            révocable.
          </p>
          <form onSubmit={createPortalLink}>
            <label>
              Client
              <select name="companyId" required>
                <option value="">Choisir un client</option>
                {companies.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Shortlist
              <select name="shortlistId" required>
                <option value="">Choisir une shortlist</option>
                {shortlists.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Durée (jours)
              <input
                name="expiresInDays"
                type="number"
                min="1"
                max="90"
                defaultValue="7"
                required
              />
            </label>
            <button className="action primary">Créer un lien</button>
          </form>
          {portalUrl && (
            <p>
              Lien à copier maintenant (il ne sera plus affiché) :{' '}
              <input
                readOnly
                value={portalUrl}
                aria-label="Lien du portail client"
              />
            </p>
          )}
          {portalLinks.map((link) => (
            <p key={link.id}>
              {link.companyName} · {link.shortlistName} · expire le{' '}
              {new Date(link.expiresAt).toLocaleDateString('fr-FR')}{' '}
              {link.revokedAt ? (
                '· Révoqué'
              ) : (
                <button
                  className="action"
                  onClick={() => void revokePortalLink(link.id)}
                >
                  Révoquer
                </button>
              )}
            </p>
          ))}
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
              <button
                className="action"
                onClick={() => setSelectedInterviewId(interview.id)}
              >
                Évaluer
              </button>
            </article>
          ))}
          {!interviews.length && (
            <p className="live-empty">Aucun entretien planifié.</p>
          )}
        </section>
        {selectedInterviewId && (
          <section className="panel live-create-form">
            <h2>Évaluation d’entretien</h2>
            <form onSubmit={saveScorecard}>
              <label>
                Critère
                <input
                  name="criterion"
                  defaultValue="Compétences métier"
                  required
                  minLength={2}
                />
              </label>
              <label>
                Note sur 5
                <input name="score" type="number" min="1" max="5" required />
              </label>
              <label>
                Recommandation
                <select name="recommendation">
                  <option value="STRONG_YES">Très favorable</option>
                  <option value="YES">Favorable</option>
                  <option value="MIXED">Mitigée</option>
                  <option value="NO">Défavorable</option>
                  <option value="STRONG_NO">Très défavorable</option>
                </select>
              </label>
              <label>
                Notes
                <textarea name="notes" maxLength={5000} />
              </label>
              <button className="action primary">
                Enregistrer mon évaluation
              </button>
            </form>
            {scorecards.map((item) => (
              <p key={item.id}>
                <b>{item.reviewerName}</b> · {item.recommendation} ·{' '}
                {item.criteria
                  .map(
                    (criterion) => `${criterion.label}: ${criterion.score}/5`,
                  )
                  .join(', ')}
                <br />
                {item.notes}
              </p>
            ))}
          </section>
        )}
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
