'use client';

import { useEffect, useState } from 'react';
import * as I from 'lucide-react';
import { OAuthConnectionsPanel } from './oauth-connections';

type HealthData = {
  database: 'ok' | 'degraded';
  workerHeartbeats: Array<{
    service: string;
    lastRunAt: string;
    lastStatus: string;
    lastError: string | null;
  }>;
  automationQueue: {
    queued: number;
    running: number;
    oldestQueuedAgeSeconds: number | null;
  };
  oauth: { connectionsWithErrors: number; staleConnections: number };
  aiProposals: { pending: number };
  notifications: { last24h: number };
};

function HealthPanel() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () =>
      fetch('/api/admin/health')
        .then((response) => response.json())
        .then((result) => {
          if (!active) return;
          if (result.error) throw new Error(result.error.message);
          setHealth(result);
        })
        .catch((cause: Error) => {
          if (active) setError(cause.message);
        });
    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);
  if (error) return <div className="auth-alert">{error}</div>;
  if (!health)
    return <div className="live-empty large">Chargement de la santé…</div>;
  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Santé de la production</h1>
          <p>
            Base de données, worker d’automatisation et files d’attente de cette
            organisation.
          </p>
        </div>
      </div>
      <section className="flow-grid">
        <article className="panel flow-card">
          <header>
            <i className={health.database === 'ok' ? 'on' : ''}>
              <I.Database />
            </i>
            <div>
              <h3>Base de données</h3>
              <small>Connexion PostgreSQL</small>
            </div>
            <span className={health.database === 'ok' ? 'live' : ''}>
              ● {health.database === 'ok' ? 'OK' : 'Dégradée'}
            </span>
          </header>
        </article>
        {health.workerHeartbeats.length === 0 && (
          <article className="panel flow-card">
            <header>
              <i>
                <I.HeartPulse />
              </i>
              <div>
                <h3>Worker</h3>
                <small>Aucun signal reçu encore</small>
              </div>
            </header>
          </article>
        )}
        {health.workerHeartbeats.map((heartbeat) => (
          <article className="panel flow-card" key={heartbeat.service}>
            <header>
              <i className={heartbeat.lastStatus === 'OK' ? 'on' : ''}>
                <I.HeartPulse />
              </i>
              <div>
                <h3>{heartbeat.service}</h3>
                <small>
                  Dernier signal :{' '}
                  {new Date(heartbeat.lastRunAt).toLocaleString('fr-FR')}
                </small>
              </div>
              <span className={heartbeat.lastStatus === 'OK' ? 'live' : ''}>
                ● {heartbeat.lastStatus === 'OK' ? 'OK' : 'Erreur'}
              </span>
            </header>
            {heartbeat.lastError && <small>{heartbeat.lastError}</small>}
          </article>
        ))}
      </section>
      <section className="admin-kpis">
        <div>
          <I.Zap />
          <span>
            <small>FILE D’AUTOMATISATIONS</small>
            <b>
              {health.automationQueue.queued} en attente,{' '}
              {health.automationQueue.running} en cours
            </b>
            <em>
              {health.automationQueue.oldestQueuedAgeSeconds
                ? `Plus ancienne : ${Math.round(health.automationQueue.oldestQueuedAgeSeconds / 60)} min`
                : 'File vide'}
            </em>
          </span>
        </div>
        <div>
          <I.PlugZap />
          <span>
            <small>CONNEXIONS OAUTH</small>
            <b>{health.oauth.connectionsWithErrors} en erreur</b>
            <em>{health.oauth.staleConnections} en retard de synchro</em>
          </span>
        </div>
        <div>
          <I.Sparkles />
          <span>
            <small>PROPOSITIONS IA</small>
            <b>{health.aiProposals.pending}</b>
            <em>en attente de confirmation</em>
          </span>
        </div>
        <div>
          <I.Bell />
          <span>
            <small>NOTIFICATIONS</small>
            <b>{health.notifications.last24h}</b>
            <em>sur les dernières 24h</em>
          </span>
        </div>
      </section>
    </div>
  );
}

type AdminData = {
  overview: {
    companies: unknown[];
    contacts: unknown[];
    opportunities: unknown[];
    tasks: unknown[];
  };
  automations: Array<{
    enabled: boolean;
    runCount: number;
    failedRunCount: number;
  }>;
  logs: Array<{
    id: string;
    action: string;
    entityType: string;
    actorName?: string;
    createdAt: string;
  }>;
  integrations: Record<string, boolean>;
};

export function LiveAdminPage({ tab }: { tab: string }) {
  const [data, setData] = useState<AdminData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void Promise.all([
      fetch('/api/crm/overview').then((response) => response.json()),
      fetch('/api/automations').then((response) => response.json()),
      fetch('/api/audit?limit=50').then((response) => response.json()),
      fetch('/api/integrations/status').then((response) => response.json()),
    ])
      .then(([overview, automationResult, auditResult, integrationResult]) => {
        if (!active) return;
        if (
          overview.error ||
          automationResult.error ||
          auditResult.error ||
          integrationResult.error
        )
          throw new Error(
            'Certaines données administrateur sont indisponibles',
          );
        setData({
          overview,
          automations: automationResult.automations,
          logs: auditResult.logs,
          integrations: integrationResult.integrations,
        });
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  if (tab === 'Santé') return <HealthPanel />;
  if (error) return <div className="auth-alert">{error}</div>;
  if (!data)
    return (
      <div className="live-empty large">
        Chargement du contrôle organisation…
      </div>
    );

  if (tab === 'Journal d’audit')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Journal d’audit</h1>
            <p>Les 50 dernières actions de votre organisation.</p>
          </div>
        </div>
        <section className="panel admin-table">
          {data.logs.map((log) => (
            <article key={log.id}>
              <b>{log.action}</b>
              <span>{log.entityType}</span>
              <span>{log.actorName || 'Système'}</span>
              <time>{new Date(log.createdAt).toLocaleString('fr-FR')}</time>
            </article>
          ))}
        </section>
      </div>
    );

  if (tab === 'Intégrations')
    return (
      <div>
        <div className="module-head">
          <div>
            <h1>Intégrations</h1>
            <p>Configuration serveur, sans exposition des secrets.</p>
          </div>
        </div>
        <section className="flow-grid">
          {Object.entries(data.integrations).map(([name, enabled]) => (
            <article className="panel flow-card" key={name}>
              <header>
                <i className={enabled ? 'on' : ''}>
                  <I.PlugZap />
                </i>
                <div>
                  <h3>{name.toUpperCase()}</h3>
                  <small>Adaptateur sécurisé</small>
                </div>
                <span className={enabled ? 'live' : ''}>
                  ● {enabled ? 'Configuré' : 'Désactivé'}
                </span>
              </header>
            </article>
          ))}
        </section>
        <OAuthConnectionsPanel />
      </div>
    );

  const runs = data.automations.reduce(
    (sum, automation) => sum + automation.runCount,
    0,
  );
  const failures = data.automations.reduce(
    (sum, automation) => sum + automation.failedRunCount,
    0,
  );
  return (
    <div>
      <header className="admin-hero">
        <div>
          <small>NEXORA CONTROL CENTER</small>
          <h1>Votre organisation en temps réel</h1>
          <p>
            Données PostgreSQL, automatisations et intégrations réellement
            configurées.
          </p>
        </div>
        <span>
          <i /> Services essentiels disponibles
        </span>
      </header>
      <section className="admin-kpis">
        <div>
          <I.Building2 />
          <span>
            <small>ENTREPRISES</small>
            <b>{data.overview.companies.length}</b>
            <em>Données CRM</em>
          </span>
        </div>
        <div>
          <I.Users />
          <span>
            <small>CONTACTS</small>
            <b>{data.overview.contacts.length}</b>
            <em>Organisation</em>
          </span>
        </div>
        <div>
          <I.BriefcaseBusiness />
          <span>
            <small>OPPORTUNITÉS</small>
            <b>{data.overview.opportunities.length}</b>
            <em>Pipeline</em>
          </span>
        </div>
        <div>
          <I.Zap />
          <span>
            <small>EXÉCUTIONS</small>
            <b>{runs}</b>
            <em>{failures} échec(s)</em>
          </span>
        </div>
      </section>
      <section className="panel admin-activity">
        <h3>Activité récente</h3>
        {data.logs.slice(0, 8).map((log) => (
          <p key={log.id}>
            <i>
              <I.Activity />
            </i>
            <span>
              <b>{log.action}</b>
              <small>
                {log.actorName || 'Système'} · {log.entityType}
              </small>
            </span>
            <time>{new Date(log.createdAt).toLocaleDateString('fr-FR')}</time>
          </p>
        ))}
      </section>
    </div>
  );
}
