'use client';
import { useEffect, useRef, useState } from 'react';
import * as I from 'lucide-react';

type Toast = (message: string) => void;
type MatchCriterion = {
  key: string;
  label: string;
  weight: number;
  score: number;
  detail: string;
};
type MissingSkill = { skill: string; evidence: string };
type Job = {
  id: string | number;
  company: string;
  title: string;
  location: string;
  salary: string;
  match: number;
  skills: string[];
  saved?: boolean;
  applied?: boolean;
  url?: string;
  matchId?: string;
  dataComplete?: boolean;
  matchBreakdown?: MatchCriterion[];
  missingSkills?: MissingSkill[];
  matchedSkills?: string[];
  feedback?: 'RELEVANT' | 'NOT_RELEVANT' | 'APPLIED';
};
const Btn = ({
  children,
  onClick,
  primary = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
}) => (
  <button className={primary ? 'action primary' : 'action'} onClick={onClick}>
    {children}
  </button>
);
function PageHead({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="module-head">
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function JobsPage({ toast }: { toast: Toast }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('Lyon, France');
  const [onlySaved, setOnlySaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const filtered = jobs.filter(
    (j) =>
      (j.title + j.company + j.skills.join(' '))
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (!location || j.location.includes(location.split(',')[0])) &&
      (!onlySaved || j.saved),
  );
  function toggle(id: string | number) {
    setJobs((v) => v.map((j) => (j.id === id ? { ...j, saved: !j.saved } : j)));
    toast('Favoris mis à jour');
  }
  async function search() {
    if (query.trim().length < 2) {
      setError('Saisissez au moins deux caractères.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ query: query.trim() });
      if (location.trim()) params.set('location', location.trim());
      const response = await fetch(`/api/integrations/jobs?${params}`);
      const result = (await response.json()) as {
        jobs?: Job[];
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(
          result.error?.message ?? 'La recherche d’offres a échoué',
        );
      setJobs(result.jobs ?? []);
      toast(`${result.jobs?.length ?? 0} offres trouvées`);
    } catch (cause) {
      setJobs([]);
      setError(
        cause instanceof Error ? cause.message : 'Recherche indisponible',
      );
    } finally {
      setLoading(false);
    }
  }
  async function apply(j: Job) {
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: j.company,
        roleTitle: j.title,
        stage: 'TO_APPLY',
        matchScore: j.match,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      toast(result.error?.message ?? 'La création a échoué');
      return;
    }
    setJobs((v) => v.map((x) => (x.id === j.id ? { ...x, applied: true } : x)));
    toast(`Candidature créée pour ${j.company}`);
  }
  return (
    <div>
      <PageHead
        title="Offres d’emploi"
        subtitle="Trouvez l’opportunité qui correspond à votre prochain défi."
      />
      <section className="job-search panel">
        <label>
          Poste
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ex : Data Analyst"
          />
        </label>
        <label>
          Lieu
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </label>
        <Btn onClick={() => setOnlySaved(!onlySaved)}>
          {onlySaved ? 'Tous les résultats' : 'Mes favoris'}
        </Btn>
        <Btn primary onClick={() => void search()}>
          <I.Search />
          {loading ? 'Recherche…' : 'Rechercher'}
        </Btn>
      </section>
      <div className="jobs-layout">
        <aside className="panel filters">
          <h3>Filtres</h3>
          <b>Mots-clés</b>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SQL, Power BI, Python"
          />
          <b>Localisation</b>
          <small>
            Les filtres disponibles dépendent du fournisseur configuré.
          </small>
          <Btn
            onClick={() => {
              setQuery('');
              setLocation('Lyon, France');
              setOnlySaved(false);
            }}
          >
            Réinitialiser les filtres
          </Btn>
        </aside>
        <section className="panel results">
          <header>
            <b>{filtered.length} offres trouvées</b>
            <span>{location || 'Toutes localisations'}</span>
            <small>Résultats fournis en temps réel</small>
          </header>
          {filtered.map((j, n) => (
            <article className="offer-row" key={j.id}>
              <i>{j.company.slice(0, 2).toUpperCase()}</i>
              <div className="offer-company">
                <b>{j.company}</b>
              </div>
              <div className="offer-role">
                <b>{j.title}</b>
                <small>⌖ {j.location}</small>
                <p>
                  {j.skills.map((s) => (
                    <span key={s}>{s}</span>
                  ))}
                </p>
              </div>
              <div className="offer-salary">
                <b>{j.salary}</b>
                <small>annuel brut</small>
              </div>
              <small>Résultat {n + 1}</small>
              <button
                onClick={() =>
                  j.url
                    ? window.open(j.url, '_blank', 'noopener,noreferrer')
                    : toast('Aucun lien fourni pour cette offre')
                }
              >
                Voir l’offre
              </button>
              <button
                className={j.saved ? 'saved' : ''}
                onClick={() => toggle(j.id)}
              >
                <I.Bookmark />
              </button>
              <button
                className="apply"
                disabled={j.applied}
                onClick={() => void apply(j)}
              >
                {j.applied ? 'Candidature envoyée' : 'Candidater'}
              </button>
            </article>
          ))}
          {error && <div className="empty">{error}</div>}
          {!error && !filtered.length && (
            <div className="empty">
              Lancez une recherche. Configurez JOBS_PROVIDER_URL et
              JOBS_PROVIDER_API_KEY pour connecter une source réelle.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function MatchingPage({ toast }: { toast: Toast }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selected, setSelected] = useState<Job | null>(null);
  const [query, setQuery] = useState('Data Analyst');
  const [location, setLocation] = useState('Lyon, France');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [letter, setLetter] = useState('');

  async function refresh() {
    if (query.trim().length < 2) {
      setError('Saisissez au moins deux caractères.');
      return;
    }
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ query: query.trim() });
    if (location.trim()) params.set('location', location.trim());
    try {
      const response = await fetch(`/api/integrations/jobs?${params}`);
      const result = (await response.json()) as {
        jobs?: Job[];
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Matching indisponible');
      const matches = [...(result.jobs ?? [])].sort(
        (left, right) => right.match - left.match,
      );
      setJobs(matches);
      setSelected(matches[0] ?? null);
      toast(`${matches.length} correspondances actualisées`);
    } catch (cause) {
      setJobs([]);
      setSelected(null);
      setError(
        cause instanceof Error ? cause.message : 'Matching indisponible',
      );
    } finally {
      setLoading(false);
    }
  }
  function generate() {
    if (!selected) return;
    setLetter(
      `Madame, Monsieur,\n\nVotre offre de ${selected.title} chez ${selected.company} retient particulièrement mon attention. Les compétences recherchées${selected.skills.length ? ` — ${selected.skills.slice(0, 3).join(', ')}` : ''} correspondent à mon projet professionnel. Je serais heureux·se d’échanger avec vous sur ma contribution possible.\n\nCordialement,`,
    );
    toast('Brouillon personnalisé préparé');
  }
  async function sendFeedback(feedback: 'RELEVANT' | 'NOT_RELEVANT') {
    if (!selected?.matchId) return;
    const response = await fetch(`/api/candidate/matches/${selected.matchId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ feedback }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      toast(result.error?.message ?? 'Le suivi de qualité a échoué');
      return;
    }
    const apply = (j: Job) => (j.id === selected.id ? { ...j, feedback } : j);
    setJobs((v) => v.map(apply));
    setSelected((s) => (s ? apply(s) : s));
    toast(
      feedback === 'RELEVANT'
        ? 'Merci, ce match est marqué pertinent'
        : 'Merci, ce match est marqué non pertinent',
    );
  }
  async function addApplication() {
    if (!selected) return;
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: selected.company,
        roleTitle: selected.title,
        stage: 'TO_APPLY',
        matchScore: selected.match,
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    toast(
      response.ok
        ? 'Ajoutée à vos candidatures'
        : (result.error?.message ?? 'La création a échoué'),
    );
  }
  return (
    <div>
      <PageHead
        title="Matching des offres ✦"
        subtitle="Score calculé par le moteur de matching Nexora à partir de votre profil, avec justification détaillée."
      >
        <Btn onClick={() => void refresh()}>
          <I.RefreshCw />
          {loading ? 'Analyse…' : 'Actualiser'}
        </Btn>
      </PageHead>
      <section className="job-search panel">
        <label>
          Poste
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          Lieu
          <input
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          />
        </label>
        <Btn primary onClick={() => void refresh()}>
          <I.Search /> Rechercher et classer
        </Btn>
      </section>
      <div className="matching-layout">
        <section className="panel match-list">
          <header>
            <h3>Vos meilleures correspondances</h3>
            <span>{jobs.length} offres</span>
          </header>
          {jobs.map((j) => (
            <button
              className={selected?.id === j.id ? 'selected' : ''}
              key={j.id}
              onClick={() => setSelected(j)}
            >
              <strong>{j.match}%</strong>
              <span>
                <b>{j.title}</b>
                <small>
                  {j.company}
                  <br />
                  {j.location}
                </small>
              </span>
              <I.Bookmark />
            </button>
          ))}
          {error && <div className="empty">{error}</div>}
          {!error && !jobs.length && (
            <div className="empty">
              Lancez une recherche pour calculer les correspondances.
            </div>
          )}
        </section>
        <section className="panel match-detail">
          {!selected ? (
            <div className="empty">
              Sélectionnez une offre issue de votre fournisseur connecté.
            </div>
          ) : (
            <>
              <header>
                <i>{selected.company.slice(0, 2)}</i>
                <span>
                  <h2>{selected.title}</h2>
                  <b>{selected.company}</b>
                  <small>{selected.location}</small>
                </span>
                <strong>
                  {selected.match}%
                  <small>
                    {selected.matchBreakdown
                      ? 'Score Nexora'
                      : 'Score fournisseur'}
                  </small>
                </strong>
              </header>
              <h3>✦ Pourquoi ce match</h3>
              {selected.matchBreakdown?.length ? (
                <div className="match-metrics">
                  {selected.matchBreakdown.map((c) => (
                    <span key={c.key}>
                      {c.label}
                      <b>{c.score}%</b>
                      <small>{c.detail}</small>
                    </span>
                  ))}
                </div>
              ) : (
                <p>
                  Le fournisseur connecté estime cette adéquation à{' '}
                  {selected.match} % pour le poste de {selected.title}.
                  Complétez votre profil candidat pour obtenir une analyse
                  Nexora justifiée. Vérifiez toujours le détail de l’offre avant
                  de candidater.
                </p>
              )}
              <div className="skill-boxes">
                <div>
                  <h3>✓ Compétences alignées</h3>
                  {(selected.matchedSkills ?? selected.skills).map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                  {!(selected.matchedSkills ?? selected.skills).length && (
                    <small>Aucune compétence alignée détectée.</small>
                  )}
                </div>
                <div>
                  <h3>⌕ Compétences manquantes</h3>
                  {selected.dataComplete === false ? (
                    <small>
                      Profil sans compétences déclarées : Nexora n’invente pas
                      de compétences manquantes sans preuve. Complétez votre CV
                      pour une analyse fiable.
                    </small>
                  ) : selected.missingSkills?.length ? (
                    selected.missingSkills.map((m) => (
                      <span key={m.skill} title={m.evidence}>
                        {m.skill}
                      </span>
                    ))
                  ) : (
                    <small>
                      Aucune compétence manquante détectée pour cette offre.
                    </small>
                  )}
                </div>
                <aside>
                  <h3>Passez à l’action</h3>
                  <Btn onClick={generate}>Préparer un brouillon</Btn>
                  <Btn onClick={() => void addApplication()}>
                    Ajouter à mes candidatures
                  </Btn>
                  {selected.matchId && (
                    <>
                      <Btn
                        primary={selected.feedback === 'RELEVANT'}
                        onClick={() => void sendFeedback('RELEVANT')}
                      >
                        Match pertinent
                      </Btn>
                      <Btn
                        primary={selected.feedback === 'NOT_RELEVANT'}
                        onClick={() => void sendFeedback('NOT_RELEVANT')}
                      >
                        Pas pertinent
                      </Btn>
                    </>
                  )}
                </aside>
              </div>
              {letter && (
                <div className="generated">
                  <header>
                    <b>Brouillon à vérifier</b>
                    <button
                      onClick={() => navigator.clipboard?.writeText(letter)}
                    >
                      Copier
                    </button>
                    <button onClick={() => setLetter('')}>Fermer</button>
                  </header>
                  <pre>{letter}</pre>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

type Application = {
  id: string;
  company: string;
  role: string;
  stage: string;
  score: number;
};
type ApiApplication = {
  id: string;
  companyName: string;
  roleTitle: string;
  stage: string;
  matchScore: number | null;
  needsFollowUp?: boolean;
  lastContactAt?: string | null;
  appliedAt?: string | null;
};
const stageToApi: Record<string, string> = {
  'À postuler': 'TO_APPLY',
  Envoyée: 'SENT',
  Relance: 'FOLLOW_UP',
  Entretien: 'INTERVIEW',
  Offre: 'OFFER',
  Refusée: 'REJECTED',
};
const stageFromApi = Object.fromEntries(
  Object.entries(stageToApi).map(([label, value]) => [value, label]),
);

async function fetchApplications() {
  const response = await fetch('/api/applications');
  const result = (await response.json()) as {
    applications?: ApiApplication[];
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Candidatures indisponibles');
  return (result.applications ?? []).map((application) => ({
    id: application.id,
    company: application.companyName,
    role: application.roleTitle,
    stage: stageFromApi[application.stage] ?? application.stage,
    score: application.matchScore ?? 0,
  }));
}

export function ApplicationsPage({ toast }: { toast: Toast }) {
  const [apps, setApps] = useState<Application[]>([]);
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [query, setQuery] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  useEffect(() => {
    let active = true;
    void fetchApplications()
      .then((applications) => {
        if (active) setApps(applications);
      })
      .catch((cause: Error) => toast(cause.message));
    return () => {
      active = false;
    };
  }, [toast]);
  const stages = [
    'À postuler',
    'Envoyée',
    'Relance',
    'Entretien',
    'Offre',
    'Refusée',
  ];
  async function move(id: string, dir: number) {
    const current = apps.find((application) => application.id === id);
    if (!current) return;
    const stage =
      stages[
        Math.max(
          0,
          Math.min(stages.length - 1, stages.indexOf(current.stage) + dir),
        )
      ];
    const response = await fetch(`/api/applications/${id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stage: stageToApi[stage] }),
    });
    if (!response.ok) {
      toast('La mise à jour a échoué');
      return;
    }
    setApps((items) =>
      items.map((application) =>
        application.id === id ? { ...application, stage } : application,
      ),
    );
    toast('Statut de la candidature mis à jour');
  }
  async function add() {
    if (company.trim().length < 2 || role.trim().length < 2) {
      toast('Renseignez l’entreprise et le poste');
      return;
    }
    const response = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyName: company.trim(),
        roleTitle: role.trim(),
        stage: 'TO_APPLY',
        matchScore: 75,
      }),
    });
    if (!response.ok) {
      toast('La création a échoué');
      return;
    }
    setApps(await fetchApplications());
    setCompany('');
    setRole('');
    toast('Nouvelle candidature créée');
  }
  const visibleApps = apps.filter(
    (application) =>
      (!query ||
        `${application.company} ${application.role}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (!stageFilter || application.stage === stageFilter),
  );
  const answered = apps.filter((application) =>
    ['Entretien', 'Offre', 'Refusée'].includes(application.stage),
  ).length;
  return (
    <div>
      <PageHead
        title="Mes candidatures"
        subtitle="Suivez toutes vos candidatures et avancez dans votre recherche d’emploi."
      >
        <Btn primary onClick={() => void add()}>
          <I.Plus />
          Nouvelle candidature
        </Btn>
      </PageHead>
      <section className="stats compact">
        <div>
          <b>Total candidatures</b>
          <strong>{apps.length}</strong>
        </div>
        <div>
          <b>En cours</b>
          <strong>
            {apps.filter((a) => !['Refusée', 'Offre'].includes(a.stage)).length}
          </strong>
        </div>
        <div>
          <b>Entretiens</b>
          <strong>{apps.filter((a) => a.stage === 'Entretien').length}</strong>
        </div>
        <div>
          <b>Offres</b>
          <strong>{apps.filter((a) => a.stage === 'Offre').length}</strong>
        </div>
        <div>
          <b>Taux de réponse</b>
          <strong>
            {apps.length ? Math.round((answered / apps.length) * 100) : 0}%
          </strong>
        </div>
      </section>
      <div className="application-toolbar">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher une candidature..."
        />
        <select
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value)}
        >
          <option value="">Statut : Tous</option>
          {stages.map((stage) => (
            <option key={stage} value={stage}>
              {stage}
            </option>
          ))}
        </select>
        <input
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          placeholder="Entreprise"
        />
        <input
          value={role}
          onChange={(event) => setRole(event.target.value)}
          placeholder="Poste"
        />
      </div>
      <section className="application-board">
        {stages.map((s, n) => (
          <div className={'app-column stage' + n} key={s}>
            <header>
              <b>{s}</b>
              <span>{visibleApps.filter((a) => a.stage === s).length}</span>
            </header>
            {visibleApps
              .filter((a) => a.stage === s)
              .map((a) => (
                <article key={a.id}>
                  <b>{a.company}</b>
                  <span>{a.role}</span>
                  <small>Score {a.score}%</small>
                  <footer>
                    <button disabled={!n} onClick={() => void move(a.id, -1)}>
                      ←
                    </button>
                    <button
                      disabled={n === stages.length - 1}
                      onClick={() => void move(a.id, 1)}
                    >
                      →
                    </button>
                  </footer>
                </article>
              ))}
            <button onClick={() => void add()}>＋ Ajouter</button>
          </div>
        ))}
      </section>
    </div>
  );
}

type FollowupTask = {
  id: string;
  title: string;
  status: 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  dueAt: string | null;
  applicationId: string | null;
};

export function FollowupsPage({ toast }: { toast: Toast }) {
  const [applications, setApplications] = useState<ApiApplication[]>([]);
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [message, setMessage] = useState('');
  const [messageTarget, setMessageTarget] = useState<ApiApplication | null>(
    null,
  );
  const activeTasks = tasks.filter((task) =>
    ['TODO', 'IN_PROGRESS'].includes(task.status),
  );
  const rows = applications.filter((application) =>
    ['SENT', 'FOLLOW_UP', 'INTERVIEW'].includes(application.stage),
  );

  async function refresh() {
    const [applicationsResponse, tasksResponse] = await Promise.all([
      fetch('/api/applications'),
      fetch('/api/tasks'),
    ]);
    const applicationsResult = (await applicationsResponse.json()) as {
      applications?: ApiApplication[];
      error?: { message?: string };
    };
    const tasksResult = (await tasksResponse.json()) as {
      tasks?: FollowupTask[];
      error?: { message?: string };
    };
    if (!applicationsResponse.ok)
      throw new Error(
        applicationsResult.error?.message ?? 'Candidatures indisponibles',
      );
    if (!tasksResponse.ok)
      throw new Error(tasksResult.error?.message ?? 'Tâches indisponibles');
    setApplications(applicationsResult.applications ?? []);
    setTasks(tasksResult.tasks ?? []);
  }

  useEffect(() => {
    queueMicrotask(() => {
      void refresh().catch((cause: Error) => toast(cause.message));
    });
  }, [toast]);

  async function schedule() {
    const application = applications.find((item) => item.id === selectedId);
    if (!application || !dueAt) {
      toast('Choisissez une candidature et une échéance');
      return;
    }
    const response = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        applicationId: application.id,
        title: `Relancer ${application.companyName}`,
        description: `Relance pour ${application.roleTitle}`,
        dueAt: new Date(dueAt).toISOString(),
      }),
    });
    const result = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    if (!response.ok) {
      toast(result.error?.message ?? 'La programmation a échoué');
      return;
    }
    await refresh();
    setDueAt('');
    toast('Relance programmée');
  }
  function generate(application?: ApiApplication) {
    const target =
      application ?? applications.find((item) => item.id === selectedId);
    if (!target) {
      toast('Sélectionnez une candidature');
      return;
    }
    setMessageTarget(target);
    setMessage(
      `Bonjour,\n\nJe me permets de revenir vers vous concernant ma candidature au poste de ${target.roleTitle} chez ${target.companyName}. Je reste vivement intéressé·e par cette opportunité et disponible pour échanger à votre convenance.\n\nBien cordialement,`,
    );
    toast('Brouillon de relance préparé');
  }
  async function markSent() {
    if (!messageTarget) return;
    const response = await fetch(
      `/api/applications/${messageTarget.id}/follow-up`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message }),
      },
    );
    if (!response.ok) {
      toast('L’enregistrement de la relance a échoué');
      return;
    }
    await refresh();
    setMessage('');
    setMessageTarget(null);
    toast('Relance enregistrée dans l’historique');
  }
  return (
    <div>
      <PageHead
        title="Relances ✉"
        subtitle="Gérez et automatisez vos relances pour ne jamais passer inaperçue."
      />
      <section className="stats compact four">
        <div>
          <b>Relances à faire aujourd’hui</b>
          <strong>
            {applications.filter((item) => item.needsFollowUp).length}
          </strong>
        </div>
        <div>
          <b>Réponses en attente</b>
          <strong>{rows.filter((item) => item.stage === 'SENT').length}</strong>
        </div>
        <div>
          <b>Entretiens à venir</b>
          <strong>
            {applications.filter((item) => item.stage === 'INTERVIEW').length}
          </strong>
        </div>
        <div>
          <b>Relances planifiées</b>
          <strong>{activeTasks.length}</strong>
        </div>
      </section>
      <div className="follow-layout">
        <section className="panel follow-table">
          <header>
            <h3>Mes relances</h3>
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">Choisir une candidature</option>
              {rows.map((application) => (
                <option key={application.id} value={application.id}>
                  {application.companyName} — {application.roleTitle}
                </option>
              ))}
            </select>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
            <Btn primary onClick={() => void schedule()}>
              <I.CalendarPlus />
              Programmer une relance
            </Btn>
          </header>
          {rows.map((application) => {
            const task = activeTasks.find(
              (item) => item.applicationId === application.id,
            );
            return (
              <article key={application.id}>
                <i>{application.companyName.slice(0, 2)}</i>
                <b>{application.companyName}</b>
                <span>{application.roleTitle}</span>
                <span>
                  {task?.dueAt
                    ? new Date(task.dueAt).toLocaleString('fr-FR')
                    : 'Aucun rappel'}
                  <small>
                    {application.needsFollowUp ? 'Échue' : 'Suivie'}
                  </small>
                </span>
                <span>Email</span>
                <em className={application.needsFollowUp ? 'due' : ''}>
                  {task ? 'Planifiée' : stageFromApi[application.stage]}
                </em>
                <button onClick={() => generate(application)}>Préparer</button>
              </article>
            );
          })}
          {!rows.length && (
            <div className="empty">Aucune candidature à relancer.</div>
          )}
        </section>
        <aside>
          <section className="panel templates">
            <h3>Templates de relance</h3>
            {[
              'Relance après candidature',
              'Relance après entretien',
              'Relance LinkedIn',
              'Relance sans réponse',
            ].map((x) => (
              <button key={x} onClick={() => generate()}>
                {x}
                <span>›</span>
              </button>
            ))}
            <Btn onClick={() => generate()}>
              <I.Sparkles />
              Générer un message IA
            </Btn>
          </section>
          <section className="panel calendar">
            <h3>Calendrier & rappels</h3>
            {activeTasks.slice(0, 4).map((task) => {
              const application = applications.find(
                (item) => item.id === task.applicationId,
              );
              return (
                <p key={task.id}>
                  <i>◉</i>
                  <span>
                    <b>{application?.companyName ?? task.title}</b>
                    <small>{application?.roleTitle ?? 'Relance'} · Email</small>
                  </span>
                  <strong>
                    {task.dueAt
                      ? new Date(task.dueAt).toLocaleDateString('fr-FR')
                      : 'Sans date'}
                  </strong>
                </p>
              );
            })}
          </section>
        </aside>
      </div>
      {message && (
        <div className="modal">
          <div>
            <header>
              <h3>Message de relance</h3>
              <button
                onClick={() => {
                  setMessage('');
                  setMessageTarget(null);
                }}
              >
                ×
              </button>
            </header>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <footer>
              <Btn onClick={() => navigator.clipboard?.writeText(message)}>
                Copier
              </Btn>
              <Btn primary onClick={() => void markSent()}>
                Marquer comme envoyé
              </Btn>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

type Doc = {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  sizeBytes: number;
  version: number;
  createdAt: string;
};
export function DocumentsPage({ toast }: { toast: Toast }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [documentError, setDocumentError] = useState('');
  const [category, setCategory] = useState<'ALL' | 'CV' | 'OTHER'>('ALL');
  const [mimeFilter, setMimeFilter] = useState('');
  const input = useRef<HTMLInputElement>(null);
  async function refreshDocuments() {
    const response = await fetch('/api/documents');
    const result = (await response.json()) as {
      documents?: Doc[];
      error?: { message?: string };
    };
    if (!response.ok)
      throw new Error(result.error?.message ?? 'Documents indisponibles');
    setDocs(result.documents ?? []);
  }
  useEffect(() => {
    let active = true;
    void fetch('/api/documents')
      .then(async (response) => {
        const result = (await response.json()) as {
          documents?: Doc[];
          error?: { message?: string };
        };
        if (!response.ok)
          throw new Error(result.error?.message ?? 'Documents indisponibles');
        if (active) setDocs(result.documents ?? []);
      })
      .catch((error: Error) => {
        if (active) setDocumentError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function upload(files: FileList | null) {
    if (!files) return;
    let uploaded = 0;
    for (const file of Array.from(files)) {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/api/documents', { method: 'POST', body });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok) {
        setDocumentError(result.error?.message ?? `Échec pour ${file.name}`);
        continue;
      }
      uploaded += 1;
    }
    await refreshDocuments();
    if (input.current) input.current.value = '';
    if (uploaded) toast(`${uploaded} document(s) ajouté(s)`);
  }
  function download(d: Doc) {
    const a = document.createElement('a');
    a.href = `/api/documents/${d.id}`;
    a.download = d.name;
    a.click();
    toast('Téléchargement lancé');
  }
  async function removeDocument(d: Doc) {
    const response = await fetch(`/api/documents/${d.id}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      setDocumentError(result.error?.message ?? 'Suppression impossible');
      return;
    }
    await refreshDocuments();
    toast('Document supprimé');
  }
  const filteredDocs = docs.filter(
    (document) =>
      (category === 'ALL' || document.kind === category) &&
      (!mimeFilter || document.mimeType === mimeFilter),
  );
  return (
    <div>
      <PageHead
        title="Mes documents 📁"
        subtitle="Organisez, gérez et partagez tous vos documents au même endroit."
      >
        <input
          hidden
          multiple
          ref={input}
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => void upload(e.target.files)}
        />
        <Btn onClick={() => input.current?.click()}>
          <I.Upload />
          Téléverser
        </Btn>
      </PageHead>
      {documentError && <div className="auth-alert">{documentError}</div>}
      <section className="panel categories">
        <h3>Catégories</h3>
        {[
          ['ALL', 'Tous', docs.length, 'purple'],
          ['CV', 'CV', docs.filter((x) => x.kind === 'CV').length, 'blue'],
          [
            'OTHER',
            'Autres',
            docs.filter((x) => x.kind !== 'CV').length,
            'gray',
          ],
        ].map(([key, label, count, tone]) => (
          <button
            key={key as string}
            className={category === key ? 'selected' : ''}
            onClick={() => setCategory(key as 'ALL' | 'CV' | 'OTHER')}
          >
            <I.Folder className={tone as string} />
            <b>{label}</b>
            <small>{count} fichiers</small>
          </button>
        ))}
      </section>
      <div className="docs-layout">
        <section className="panel docs-table">
          <header>
            <h3>Tous les documents</h3>
            <select
              value={mimeFilter}
              onChange={(event) => setMimeFilter(event.target.value)}
            >
              <option value="">Tous les types</option>
              <option value="application/pdf">PDF</option>
              <option value="application/vnd.openxmlformats-officedocument.wordprocessingml.document">
                DOCX
              </option>
              <option value="text/plain">TXT</option>
            </select>
          </header>
          <div className="doc-head">
            <span>Nom</span>
            <span>Type</span>
            <span>Version</span>
            <span>Modifié le</span>
            <span>Statut</span>
          </div>
          {filteredDocs.map((d) => (
            <article key={d.id}>
              <i>{d.name.split('.').pop()?.toUpperCase() || 'FICHIER'}</i>
              <b>{d.name}</b>
              <span>{d.name.split('.').pop()?.toUpperCase() || d.kind}</span>
              <span>v{d.version}.0</span>
              <span>{new Date(d.createdAt).toLocaleDateString('fr-FR')}</span>
              <em>{Math.max(1, Math.round(d.sizeBytes / 1024))} Ko</em>
              <button onClick={() => download(d)}>
                <I.Download />
              </button>
              <button onClick={() => void removeDocument(d)} title="Supprimer">
                <I.Trash2 />
              </button>
            </article>
          ))}
          {!filteredDocs.length && (
            <div className="empty">Aucun document pour ces filtres.</div>
          )}
        </section>
        <aside>
          <section className="panel recent-docs">
            <h3>Documents récents</h3>
            {docs.slice(0, 4).map((d) => (
              <button key={d.id} onClick={() => download(d)}>
                <i>{d.name.split('.').pop()?.toUpperCase() || d.kind}</i>
                <span>
                  <b>{d.name}</b>
                  <small>
                    Ajouté {new Date(d.createdAt).toLocaleDateString('fr-FR')}
                  </small>
                </span>
                ⋮
              </button>
            ))}
          </section>
          <section className="panel doc-versions">
            <h3>Versions du CV</h3>
            {docs
              .filter((document) => document.kind === 'CV')
              .map((document) => (
                <p key={document.id}>
                  <I.Clock3 />
                  <span>
                    <b>{document.name}</b>
                    <small>v{document.version}.0</small>
                  </span>
                </p>
              ))}
            {!docs.some((document) => document.kind === 'CV') && (
              <p className="live-empty">Aucun CV enregistré.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

export function Toast({ message }: { message: string }) {
  return message ? (
    <div className="toast">
      <I.CircleCheck />
      {message}
    </div>
  ) : null;
}
