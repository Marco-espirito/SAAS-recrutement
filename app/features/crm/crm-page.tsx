'use client';

import { useEffect, useMemo, useState, type SyntheticEvent } from 'react';
import * as I from 'lucide-react';

type Company = {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  sizeLabel?: string;
  status: string;
  tags?: string[];
  ownerId?: string | null;
};
type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  occurredAt: string;
};
type SearchItem = {
  id: string;
  kind: string;
  label: string;
  detail: string;
  companyId?: string | null;
};
type Contact = {
  id: string;
  companyId: string;
  firstName: string;
  lastName: string;
  title?: string;
  email?: string;
};
type Opportunity = {
  id: string;
  companyId: string;
  title: string;
  status: string;
  location?: string;
};
type Activity = {
  id: string;
  companyId?: string;
  type: string;
  title: string;
  body?: string;
  occurredAt: string;
};
type Overview = {
  companies: Company[];
  contacts: Contact[];
  opportunities: Opportunity[];
  tasks: unknown[];
  activities: Activity[];
};

async function fetchOverview() {
  const response = await fetch('/api/crm/overview');
  const result = (await response.json()) as Overview & {
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(result.error?.message ?? 'CRM indisponible');
  return result;
}

export function LiveCRMPage({ toast }: { toast: (message: string) => void }) {
  const [data, setData] = useState<Overview>({
    companies: [],
    contacts: [],
    opportunities: [],
    tasks: [],
    activities: [],
  });
  const [selectedId, setSelectedId] = useState('');
  const [creating, setCreating] = useState(false);
  const [creatingContact, setCreatingContact] = useState(false);
  const [creatingOpportunity, setCreatingOpportunity] = useState(false);
  const [creatingNote, setCreatingNote] = useState(false);
  const [error, setError] = useState('');
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchItem[]>([]);
  const [mergeId, setMergeId] = useState('');
  const [owners, setOwners] = useState<Array<{ id: string; name: string }>>([]);

  async function refresh() {
    const result = await fetchOverview();
    setData(result);
    setSelectedId((current) => current || result.companies[0]?.id || '');
  }

  useEffect(() => {
    let active = true;
    void fetch('/api/crm/owners')
      .then((response) => response.json())
      .then((result: { owners?: Array<{ id: string; name: string }> }) => {
        if (active) setOwners(result.owners ?? []);
      })
      .catch(() => {});
    void fetchOverview()
      .then((result) => {
        if (!active) return;
        setData(result);
        setSelectedId(result.companies[0]?.id || '');
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);
  const company = data.companies.find((item) => item.id === selectedId);
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void fetch(`/api/crm/companies/${selectedId}/timeline`)
      .then((response) => response.json())
      .then((result: { items?: TimelineItem[] }) => {
        if (active) setTimeline(result.items ?? []);
      })
      .catch(() => {
        if (active) setTimeline([]);
      });
    return () => {
      active = false;
    };
  }, [selectedId, data.activities]);
  useEffect(() => {
    if (query.trim().length < 2) {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetch(`/api/crm/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((response) => response.json())
        .then((result: { results?: SearchItem[] }) =>
          setResults(result.results ?? []),
        )
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  const contacts = useMemo(
    () => data.contacts.filter((item) => item.companyId === selectedId),
    [data.contacts, selectedId],
  );
  const opportunities = useMemo(
    () => data.opportunities.filter((item) => item.companyId === selectedId),
    [data.opportunities, selectedId],
  );

  async function createCompany(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/crm/companies', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(form.entries())),
    });
    const result = (await response.json()) as {
      company: Company;
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(result.error?.message ?? 'Création impossible');
      return;
    }
    setCreating(false);
    await refresh();
    setSelectedId(result.company.id);
    toast('Entreprise créée dans le CRM');
  }

  async function createRelated(
    event: SyntheticEvent<HTMLFormElement>,
    endpoint: 'contacts' | 'opportunities',
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch(`/api/crm/${endpoint}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...Object.fromEntries(form.entries()),
        companyId: selectedId,
      }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Création impossible');
      return;
    }
    setError('');
    setCreatingContact(false);
    setCreatingOpportunity(false);
    await refresh();
    toast(endpoint === 'contacts' ? 'Contact ajouté' : 'Opportunité ajoutée');
  }

  async function createNote(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/activities', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        companyId: selectedId,
        type: 'NOTE',
        title: form.get('title'),
        body: form.get('body'),
      }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Note impossible');
      return;
    }
    setCreatingNote(false);
    await refresh();
    toast('Note ajoutée à l’historique');
  }

  async function importCompanies(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch('/api/crm/companies/import', {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as {
      inserted?: number;
      skipped?: number;
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(result.error?.message ?? 'Import impossible');
      return;
    }
    await refresh();
    setError('');
    toast(
      `${result.inserted ?? 0} entreprises importées, ${result.skipped ?? 0} ignorées`,
    );
  }

  async function saveTags(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tagsValue = form.get('tags');
    const tags = (typeof tagsValue === 'string' ? tagsValue : '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    const response = await fetch(`/api/crm/companies/${selectedId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tags }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Enregistrement impossible');
      return;
    }
    await refresh();
    toast('Tags enregistrés');
  }

  async function saveOwner(ownerId: string) {
    const response = await fetch(`/api/crm/companies/${selectedId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ownerId: ownerId || null }),
    });
    if (!response.ok) {
      setError('Attribution impossible');
      return;
    }
    await refresh();
    toast('Responsable mis à jour');
  }

  async function mergeCompany() {
    if (
      !mergeId ||
      !selectedId ||
      !window.confirm(
        'Fusionner cette entreprise dans la fiche sélectionnée ? La fiche doublon sera supprimée.',
      )
    )
      return;
    const response = await fetch('/api/crm/companies/merge', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ primaryId: selectedId, duplicateId: mergeId }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Fusion impossible');
      return;
    }
    setMergeId('');
    await refresh();
    toast('Doublon fusionné');
  }

  async function uploadAttachment(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    form.set('companyId', selectedId);
    const response = await fetch('/api/documents', {
      method: 'POST',
      body: form,
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Téléversement impossible');
      return;
    }
    formElement.reset();
    const timelineResponse = await fetch(
      `/api/crm/companies/${selectedId}/timeline`,
    );
    const timelineResult = (await timelineResponse.json()) as {
      items?: TimelineItem[];
    };
    setTimeline(timelineResult.items ?? []);
    toast('Pièce jointe ajoutée');
  }

  return (
    <div className="crm-page">
      <div className="module-head">
        <div>
          <h1>CRM recrutement</h1>
          <p>
            Clients, contacts, opportunités et historique persistés dans
            PostgreSQL.
          </p>
        </div>
        <div>
          <button
            className="action primary"
            onClick={() => setCreating((value) => !value)}
          >
            <I.Plus />
            Nouvelle entreprise
          </button>
        </div>
      </div>
      {creating && (
        <form className="panel live-create-form" onSubmit={createCompany}>
          <label>
            Entreprise
            <input name="name" required minLength={2} />
          </label>
          <label>
            Secteur
            <input name="industry" />
          </label>
          <label>
            Site web
            <input name="website" type="url" />
          </label>
          <label>
            Statut
            <select name="status">
              <option value="PROSPECT">Prospect</option>
              <option value="ACTIVE">Client actif</option>
            </select>
          </label>
          <button className="action primary">Enregistrer</button>
        </form>
      )}
      {error && <div className="auth-alert">{error}</div>}
      <section
        className="panel live-create-form"
        aria-label="Recherche et import CRM"
      >
        <label>
          Recherche globale
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Entreprise, contact, poste, candidat"
          />
        </label>
        {query.trim().length >= 2 && (
          <div aria-live="polite">
            {results.map((item) => (
              <p key={`${item.kind}-${item.id}`}>
                {item.companyId ? (
                  <button
                    className="action"
                    onClick={() => {
                      setSelectedId(item.companyId ?? '');
                      setQuery('');
                    }}
                  >
                    {item.kind} · {item.label}
                  </button>
                ) : (
                  <span>
                    {item.kind} · {item.label}
                  </span>
                )}{' '}
                <small>{item.detail}</small>
              </p>
            ))}
            {!results.length && <small>Aucun résultat</small>}
          </div>
        )}
        <form onSubmit={importCompanies}>
          <label>
            Importer des entreprises (.csv)
            <input type="file" name="file" accept=".csv,text/csv" required />
          </label>
          <button className="action">Importer</button>
        </form>
      </section>
      <section className="stats compact four">
        <div>
          <b>Entreprises</b>
          <strong>{data.companies.length}</strong>
          <small>Données réelles</small>
        </div>
        <div>
          <b>Contacts</b>
          <strong>{data.contacts.length}</strong>
          <small>Dans votre organisation</small>
        </div>
        <div>
          <b>Postes ouverts</b>
          <strong>
            {data.opportunities.filter((item) => item.status === 'OPEN').length}
          </strong>
          <small>Opportunités actives</small>
        </div>
        <div>
          <b>Tâches</b>
          <strong>{data.tasks.length}</strong>
          <small>À traiter</small>
        </div>
      </section>
      <div className="crm-layout">
        <section className="panel company-list">
          <header>
            <b>Entreprises</b>
          </header>
          {data.companies.map((item) => (
            <button
              key={item.id}
              className={selectedId === item.id ? 'selected' : ''}
              onClick={() => setSelectedId(item.id)}
            >
              <i>{item.name.slice(0, 2).toUpperCase()}</i>
              <span>
                <b>{item.name}</b>
                <small>{item.industry || 'Secteur non renseigné'}</small>
              </span>
              <em>
                {
                  data.opportunities.filter(
                    (opportunity) => opportunity.companyId === item.id,
                  ).length
                }{' '}
                postes
              </em>
            </button>
          ))}
          {!data.companies.length && (
            <p className="live-empty">
              Créez votre première entreprise pour démarrer le CRM.
            </p>
          )}
        </section>
        <section className="panel company-detail">
          {company ? (
            <>
              <header>
                <i>{company.name.slice(0, 2).toUpperCase()}</i>
                <div>
                  <small>ENTREPRISE</small>
                  <h2>{company.name}</h2>
                  <p>
                    {company.industry || 'Secteur à compléter'} ·{' '}
                    {company.sizeLabel || 'Taille à compléter'}
                  </p>
                </div>
                <span>{company.status}</span>
              </header>
              <nav>
                <b className="active">Vue d’ensemble</b>
                <b>Contacts</b>
                <b>Opportunités</b>
                <b>Historique</b>
              </nav>
              <div className="live-create-form">
                <form onSubmit={saveTags}>
                  <label>
                    Tags, séparés par une virgule
                    <input
                      name="tags"
                      key={company.id + (company.tags ?? []).join(',')}
                      defaultValue={(company.tags ?? []).join(', ')}
                    />
                  </label>
                  <button className="action">Enregistrer les tags</button>
                </form>
                <label>
                  Responsable de la fiche
                  <select
                    value={company.ownerId ?? ''}
                    onChange={(event) => void saveOwner(event.target.value)}
                  >
                    <option value="">Non attribué</option>
                    {owners.map((owner) => (
                      <option key={owner.id} value={owner.id}>
                        {owner.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Fusionner un doublon dans {company.name}
                  <select
                    value={mergeId}
                    onChange={(event) => setMergeId(event.target.value)}
                  >
                    <option value="">Choisir une entreprise</option>
                    {data.companies
                      .filter((item) => item.id !== selectedId)
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <button
                  className="action"
                  disabled={!mergeId}
                  onClick={() => void mergeCompany()}
                >
                  Fusionner
                </button>
                <form onSubmit={uploadAttachment}>
                  <label>
                    Pièce jointe (PDF, DOCX ou texte, 5 Mo max)
                    <input
                      type="file"
                      name="file"
                      accept=".pdf,.docx,.txt"
                      required
                    />
                  </label>
                  <button className="action">Ajouter le document</button>
                </form>
              </div>
              <div className="crm-detail-grid">
                <div>
                  <article>
                    <h3>
                      Contacts{' '}
                      <button
                        onClick={() => setCreatingContact((value) => !value)}
                      >
                        <I.Plus /> Ajouter
                      </button>
                    </h3>
                    {creatingContact && (
                      <form
                        className="live-create-form"
                        onSubmit={(event) =>
                          void createRelated(event, 'contacts')
                        }
                      >
                        <input name="firstName" placeholder="Prénom" required />
                        <input name="lastName" placeholder="Nom" required />
                        <input name="title" placeholder="Fonction" />
                        <input name="email" type="email" placeholder="E-mail" />
                        <button className="action primary">Enregistrer</button>
                      </form>
                    )}
                    {contacts.map((contact) => (
                      <p className="contact" key={contact.id}>
                        <i>
                          {contact.firstName[0]}
                          {contact.lastName[0]}
                        </i>
                        <span>
                          <b>
                            {contact.firstName} {contact.lastName}
                          </b>
                          <small>
                            {contact.title || contact.email || 'Contact'}
                          </small>
                        </span>
                      </p>
                    ))}
                    {!contacts.length && (
                      <p className="live-empty">Aucun contact.</p>
                    )}
                  </article>
                  <article>
                    <h3>
                      Opportunités{' '}
                      <button
                        onClick={() =>
                          setCreatingOpportunity((value) => !value)
                        }
                      >
                        <I.Plus /> Ajouter
                      </button>
                    </h3>
                    {creatingOpportunity && (
                      <form
                        className="live-create-form"
                        onSubmit={(event) =>
                          void createRelated(event, 'opportunities')
                        }
                      >
                        <input
                          name="title"
                          placeholder="Intitulé du poste"
                          required
                        />
                        <input name="location" placeholder="Lieu" />
                        <select name="status" defaultValue="OPEN">
                          <option value="OPEN">Ouvert</option>
                          <option value="DRAFT">Brouillon</option>
                          <option value="ON_HOLD">En pause</option>
                        </select>
                        <button className="action primary">Enregistrer</button>
                      </form>
                    )}
                    {opportunities.map((opportunity) => (
                      <p className="opportunity" key={opportunity.id}>
                        <I.BriefcaseBusiness />
                        <span>
                          <b>{opportunity.title}</b>
                          <small>
                            {opportunity.location || 'Lieu à définir'}
                          </small>
                        </span>
                        <em>{opportunity.status}</em>
                      </p>
                    ))}
                    {!opportunities.length && (
                      <p className="live-empty">Aucune opportunité.</p>
                    )}
                  </article>
                </div>
                <article className="timeline">
                  <h3>
                    Historique{' '}
                    <button onClick={() => setCreatingNote((value) => !value)}>
                      <I.Plus /> Note
                    </button>
                  </h3>
                  {creatingNote && (
                    <form className="live-create-form" onSubmit={createNote}>
                      <input name="title" placeholder="Titre" required />
                      <input name="body" placeholder="Contenu de la note" />
                      <button className="action primary">Ajouter</button>
                    </form>
                  )}
                  {timeline.map((activity) => (
                    <p key={`${activity.kind}-${activity.id}`}>
                      <i />
                      <span>
                        <small>
                          {new Date(activity.occurredAt).toLocaleDateString(
                            'fr-FR',
                          )}
                        </small>
                        <b>
                          {activity.kind} ·{' '}
                          {activity.kind === 'document' ? (
                            <a
                              href={`/api/documents/${activity.id}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {activity.title}
                            </a>
                          ) : (
                            activity.title
                          )}
                        </b>
                        <em>{activity.detail}</em>
                      </span>
                    </p>
                  ))}
                  {!timeline.length && (
                    <p className="live-empty">Aucune activité enregistrée.</p>
                  )}
                </article>
              </div>
            </>
          ) : (
            <div className="live-empty large">Sélectionnez une entreprise.</div>
          )}
        </section>
      </div>
    </div>
  );
}
