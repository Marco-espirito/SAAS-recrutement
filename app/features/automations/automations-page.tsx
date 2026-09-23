'use client';

import { useEffect, useState } from 'react';
import * as I from 'lucide-react';
import { AutomationBuilder } from './automation-builder';

type Automation = {
  id: string;
  name: string;
  enabled: boolean;
  triggerType: string;
  triggerConfig: { delayDays?: number };
  actions: Array<{ type: string; title?: string }>;
  runCount: number;
  lastRunAt?: string;
  lastRunStatus?: string;
  failedRunCount: number;
};

async function fetchAutomations() {
  const response = await fetch('/api/automations');
  const result = (await response.json()) as {
    automations: Automation[];
    error?: { message?: string };
  };
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Automatisations indisponibles');
  return result.automations;
}

export function LiveAutomationsPage({
  toast,
}: {
  toast: (message: string) => void;
}) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [error, setError] = useState('');

  async function refresh() {
    setAutomations(await fetchAutomations());
  }
  useEffect(() => {
    let active = true;
    void fetchAutomations()
      .then((result) => {
        if (active) setAutomations(result);
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, []);

  async function toggleFlow(flow: Automation) {
    const response = await fetch(`/api/automations/${flow.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: !flow.enabled }),
    });
    const result = (await response.json()) as { error?: { message?: string } };
    if (!response.ok) {
      setError(result.error?.message ?? 'Mise à jour impossible');
      return;
    }
    setError('');
    await refresh();
    toast(flow.enabled ? 'Workflow mis en pause' : 'Workflow activé');
  }

  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Centre d’automatisation</h1>
          <p>
            Déclencheurs, délais, actions et journal d’exécution persistants.
          </p>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      <AutomationBuilder onCreated={() => void refresh()} toast={toast} />
      <section className="automation-hero">
        <I.Zap />
        <div>
          <small>MOTEUR DE WORKFLOWS</small>
          <h2>
            {automations.reduce((sum, item) => sum + item.runCount, 0)}{' '}
            exécutions enregistrées
          </h2>
          <p>
            Les e-mails sont créés en brouillon afin de conserver une validation
            humaine.
          </p>
        </div>
        <span>
          <b>{automations.filter((item) => item.enabled).length}</b>
          <small>actives</small>
        </span>
      </section>
      <div className="flow-grid">
        {automations.map((flow) => (
          <article className="panel flow-card" key={flow.id}>
            <header>
              <i className={flow.enabled ? 'on' : ''}>
                <I.Zap />
              </i>
              <div>
                <h3>{flow.name}</h3>
                <small>{flow.runCount} exécution(s)</small>
              </div>
              <span className={flow.enabled ? 'live' : ''}>
                ● {flow.enabled ? 'Active' : 'En pause'}
              </span>
            </header>
            <div className="flow">
              <span>
                <small>QUAND</small>
                <b>{flow.triggerType}</b>
              </span>
              <I.ArrowRight />
              <span>
                <small>ATTENDRE</small>
                <b>{flow.triggerConfig.delayDays || 0} jour(s)</b>
              </span>
              <I.ArrowRight />
              <span>
                <small>ALORS</small>
                <b>
                  {flow.actions
                    .map((item) => item.title || item.type)
                    .join(' + ')}
                </b>
              </span>
            </div>
            <footer>
              <span>
                {flow.lastRunAt
                  ? `Dernière exécution ${new Date(flow.lastRunAt).toLocaleDateString('fr-FR')}`
                  : 'Jamais exécutée'}
              </span>
              {flow.lastRunStatus && (
                <span>
                  Statut : {flow.lastRunStatus}
                  {flow.failedRunCount > 0
                    ? ` · ${flow.failedRunCount} échec(s)`
                    : ''}
                </span>
              )}
              <button onClick={() => void toggleFlow(flow)}>
                {flow.enabled ? 'Mettre en pause' : 'Activer'}
              </button>
            </footer>
          </article>
        ))}
        {!automations.length && (
          <section className="panel live-empty large">
            Aucun workflow. Créez une relance automatique pour commencer.
          </section>
        )}
      </div>
    </div>
  );
}
