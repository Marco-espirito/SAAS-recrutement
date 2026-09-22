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

  async function refresh() {
    const result = await fetchOverview();
    setData(result);
    setSelectedId((current) => current || result.companies[0]?.id || '');
  }

  useEffect(() => {
    let active = true;
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
  const contacts = useMemo(
    () => data.contacts.filter((item) => item.companyId === selectedId),
    [data.contacts, selectedId],
  );
  const opportunities = useMemo(
    () => data.opportunities.filter((item) => item.companyId === selectedId),
    [data.opportunities, selectedId],
  );
  const activities = useMemo(
    () => data.activities.filter((item) => item.companyId === selectedId),
    [data.activities, selectedId],
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
                  {activities.map((activity) => (
                    <p key={activity.id}>
                      <i />
                      <span>
                        <small>
                          {new Date(activity.occurredAt).toLocaleDateString(
                            'fr-FR',
                          )}
                        </small>
                        <b>{activity.title}</b>
                        <em>{activity.body}</em>
                      </span>
                    </p>
                  ))}
                  {!activities.length && (
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
