'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';

type Provider = 'google' | 'microsoft' | 'slack';
type Connection = {
  id: string;
  provider: Provider;
  displayName: string;
  lastSyncedAt?: string | null;
  lastError?: string | null;
};
type Item = {
  id: string;
  kind: string;
  provider: Provider;
  title: string;
  summary?: string;
  occurredAt?: string;
  metadata?: Record<string, unknown>;
};
type Status = {
  providers: Record<Provider, boolean>;
  connections: Connection[];
};

const labels: Record<Provider, string> = {
  google: 'Google · Gmail + Calendar',
  microsoft: 'Microsoft · Outlook + Calendar + Teams',
  slack: 'Slack · notifications',
};
const formText = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

export function OAuthConnectionsPanel() {
  const [status, setStatus] = useState<Status | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState('');

  async function refresh() {
    const [connections, synced] = await Promise.all([
      fetch('/api/integrations/oauth'),
      fetch('/api/integrations/oauth/items'),
    ]);
    const connected = (await connections.json()) as Status & {
      error?: { message?: string };
    };
    if (!connections.ok)
      throw new Error(connected.error?.message ?? 'Connexions indisponibles');
    setStatus(connected);
    if (synced.ok) setItems(((await synced.json()) as { items: Item[] }).items);
  }

  useEffect(() => {
    let active = true;
    void fetch('/api/integrations/oauth')
      .then((response) => response.json())
      .then((result: Status) => {
        if (active) setStatus(result);
      })
      .catch(() => {});
    void fetch('/api/integrations/oauth/items')
      .then((response) => response.json())
      .then((result: { items?: Item[] }) => {
        if (active) setItems(result.items ?? []);
      })
      .catch(() => {});
    const oauth = new URLSearchParams(window.location.search).get('oauth');
    if (oauth === 'connected')
      setTimeout(() => {
        if (active) setMessage('Compte connecté à Nexora.');
      }, 0);
    if (oauth === 'error')
      setTimeout(() => {
        if (active) setError('La connexion OAuth a échoué ou a été refusée.');
      }, 0);
    return () => {
      active = false;
    };
  }, []);

  async function connect(provider: Provider) {
    setBusy(provider);
    setError('');
    try {
      const response = await fetch(
        `/api/integrations/oauth/${provider}/start`,
        { method: 'POST' },
      );
      const result = (await response.json()) as {
        authorizationUrl?: string;
        error?: { message?: string };
      };
      if (!response.ok || !result.authorizationUrl)
        throw new Error(result.error?.message ?? 'Connexion impossible');
      window.location.assign(result.authorizationUrl);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Connexion impossible');
      setBusy('');
    }
  }

  async function sync(provider: Provider) {
    setBusy(provider);
    setError('');
    try {
      const response = await fetch(`/api/integrations/oauth/${provider}/sync`, {
        method: 'POST',
      });
      const result = (await response.json()) as {
        imported?: number;
        deleted?: number;
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Synchronisation impossible');
      await refresh();
      setMessage(
        `${result.imported ?? 0} éléments reçus, ${result.deleted ?? 0} suppressions synchronisées.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Synchronisation impossible',
      );
    } finally {
      setBusy('');
    }
  }

  async function disconnect(provider: Provider) {
    if (!window.confirm(`Déconnecter ${provider} de Nexora ?`)) return;
    setBusy(provider);
    setError('');
    try {
      const response = await fetch(`/api/integrations/oauth/${provider}`, {
        method: 'DELETE',
      });
      if (!response.ok) throw new Error('Déconnexion impossible');
      await refresh();
      setMessage('Compte déconnecté.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Déconnexion impossible',
      );
    } finally {
      setBusy('');
    }
  }

  async function submit(
    event: SyntheticEvent<HTMLFormElement>,
    kind: 'email' | 'event' | 'notification',
  ) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const provider = form.get('provider');
    const payload: Record<string, unknown> = {
      kind,
      provider: typeof provider === 'string' ? provider : '',
      confirmed: true,
    };
    if (kind === 'email')
      Object.assign(payload, {
        to: form.get('to'),
        subject: form.get('subject'),
        text: form.get('text'),
      });
    if (kind === 'event') {
      const startsAt = new Date(formText(form, 'startsAt'));
      const endsAt = new Date(formText(form, 'endsAt'));
      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
        setError('Dates invalides');
        return;
      }
      Object.assign(payload, {
        title: form.get('title'),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        description: form.get('description'),
      });
    }
    if (kind === 'notification')
      Object.assign(payload, {
        channelId: form.get('channelId'),
        teamId: form.get('teamId') || undefined,
        text: form.get('text'),
      });
    setBusy(kind);
    setError('');
    try {
      const response = await fetch('/api/integrations/oauth/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = (await response.json()) as {
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Envoi impossible');
      await refresh();
      setMessage('Action envoyée au fournisseur.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Envoi impossible');
    } finally {
      setBusy('');
    }
  }

  const connected = (provider: Provider) =>
    status?.connections.some((item) => item.provider === provider) ?? false;
  return (
    <div>
      <section
        className="panel live-create-form"
        aria-label="Comptes OAuth Nexora"
      >
        <h2>Comptes connectés à Nexora</h2>
        <p>
          Chaque connexion appartient à votre utilisateur dans cette
          organisation. Les jetons ne sont jamais affichés dans le navigateur.
        </p>
        {(['google', 'microsoft', 'slack'] as const).map((provider) => {
          const account = status?.connections.find(
            (item) => item.provider === provider,
          );
          return (
            <div key={provider}>
              <b>{labels[provider]}</b> ·{' '}
              {account
                ? account.displayName
                : status?.providers?.[provider]
                  ? 'Prêt à connecter'
                  : 'Application OAuth non configurée'}
              {account?.lastSyncedAt && (
                <small>
                  {' '}
                  · Dernière synchro :{' '}
                  {new Date(account.lastSyncedAt).toLocaleString('fr-FR')}
                </small>
              )}
              {account?.lastError && (
                <small> · Erreur : {account.lastError}</small>
              )}
              {!account && (
                <button
                  className="action"
                  disabled={!status?.providers?.[provider] || Boolean(busy)}
                  onClick={() => void connect(provider)}
                >
                  Connecter
                </button>
              )}
              {account && provider !== 'slack' && (
                <button
                  className="action"
                  disabled={Boolean(busy)}
                  onClick={() => void sync(provider)}
                >
                  Synchroniser
                </button>
              )}
              {account && (
                <button
                  className="action"
                  disabled={Boolean(busy)}
                  onClick={() => void disconnect(provider)}
                >
                  Déconnecter
                </button>
              )}
            </div>
          );
        })}
        {error && (
          <div className="auth-alert" role="alert">
            {error}
          </div>
        )}
        {message && <output>{message}</output>}
      </section>
      <section className="panel live-create-form">
        <h2>E-mail</h2>
        <p>Envoi uniquement après votre clic.</p>
        <form onSubmit={(event) => void submit(event, 'email')}>
          <label>
            Compte
            <select name="provider" required>
              <option value="">Choisir</option>
              {(['google', 'microsoft'] as const)
                .filter(connected)
                .map((provider) => (
                  <option key={provider} value={provider}>
                    {labels[provider]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Destinataire
            <input name="to" type="email" required />
          </label>
          <label>
            Objet
            <input name="subject" required />
          </label>
          <label>
            Message
            <textarea name="text" required />
          </label>
          <button className="action primary" disabled={Boolean(busy)}>
            Envoyer l’e-mail
          </button>
        </form>
      </section>
      <section className="panel live-create-form">
        <h2>Calendrier</h2>
        <form onSubmit={(event) => void submit(event, 'event')}>
          <label>
            Compte
            <select name="provider" required>
              <option value="">Choisir</option>
              {(['google', 'microsoft'] as const)
                .filter(connected)
                .map((provider) => (
                  <option key={provider} value={provider}>
                    {labels[provider]}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Titre
            <input name="title" required />
          </label>
          <label>
            Début
            <input name="startsAt" type="datetime-local" required />
          </label>
          <label>
            Fin
            <input name="endsAt" type="datetime-local" required />
          </label>
          <label>
            Description
            <textarea name="description" />
          </label>
          <button className="action primary" disabled={Boolean(busy)}>
            Créer l’événement
          </button>
        </form>
      </section>
      <section className="panel live-create-form">
        <h2>Notifications Slack / Teams</h2>
        <form onSubmit={(event) => void submit(event, 'notification')}>
          <label>
            Service
            <select name="provider" required>
              <option value="">Choisir</option>
              {(['slack', 'microsoft'] as const)
                .filter(connected)
                .map((provider) => (
                  <option key={provider} value={provider}>
                    {provider === 'slack' ? 'Slack' : 'Teams'}
                  </option>
                ))}
            </select>
          </label>
          <label>
            ID du canal
            <input name="channelId" required />
          </label>
          <label>
            ID de l’équipe (Teams)
            <input name="teamId" />
          </label>
          <label>
            Message
            <textarea name="text" required />
          </label>
          <button className="action primary" disabled={Boolean(busy)}>
            Envoyer la notification
          </button>
        </form>
      </section>
      <section className="panel admin-table">
        <h2>Éléments synchronisés</h2>
        {items.map((item) => (
          <article key={item.id}>
            <b>{item.title}</b>
            <span>
              {item.provider} · {item.kind}
            </span>
            <span>{item.summary}</span>
            <time>
              {item.occurredAt
                ? new Date(item.occurredAt).toLocaleString('fr-FR')
                : ''}
            </time>
          </article>
        ))}
        {!items.length && <p>Aucun élément synchronisé.</p>}
      </section>
    </div>
  );
}
