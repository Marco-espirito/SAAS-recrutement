'use client';

import { useEffect, useState } from 'react';
import * as I from 'lucide-react';

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
