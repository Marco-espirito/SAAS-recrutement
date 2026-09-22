'use client';

import { useEffect, useMemo, useState } from 'react';
import * as I from 'lucide-react';
import type { CurrentUser } from '../auth/auth-gate';

type Application = {
  id: string;
  companyName: string;
  roleTitle: string;
  stage: string;
  matchScore?: number;
  appliedAt?: string;
  lastContactAt?: string;
  needsFollowUp: boolean;
};
type Task = { id: string; title: string; status: string; dueAt?: string };

export function LiveDashboard({
  mode,
  user,
  openApplications,
}: {
  mode: 'candidate' | 'recruiter';
  user: CurrentUser | null;
  openApplications: () => void;
}) {
  const [applications, setApplications] = useState<Application[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [crm, setCrm] = useState({
    companies: 0,
    contacts: 0,
    opportunities: 0,
  });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const requests: Array<Promise<unknown>> = [
      fetch('/api/applications').then((response) => response.json()),
      fetch('/api/tasks').then((response) => response.json()),
    ];
    if (mode === 'recruiter')
      requests.push(
        fetch('/api/crm/overview').then((response) => response.json()),
      );
    void Promise.all(requests)
      .then(([applicationResult, taskResult, crmResult]) => {
        if (!active) return;
        const appData = applicationResult as {
          applications?: Application[];
          error?: unknown;
        };
        const taskData = taskResult as { tasks?: Task[]; error?: unknown };
        if (appData.error || taskData.error)
          throw new Error('Dashboard indisponible');
        setApplications(appData.applications ?? []);
        setTasks(taskData.tasks ?? []);
        if (crmResult) {
          const overview = crmResult as {
            companies: unknown[];
            contacts: unknown[];
            opportunities: unknown[];
          };
          setCrm({
            companies: overview.companies.length,
            contacts: overview.contacts.length,
            opportunities: overview.opportunities.length,
          });
        }
      })
      .catch((cause: Error) => {
        if (active) setError(cause.message);
      });
    return () => {
      active = false;
    };
  }, [mode]);

  const averageMatch = useMemo(() => {
    const scores = applications.flatMap((application) =>
      typeof application.matchScore === 'number'
        ? [application.matchScore]
        : [],
    );
    return scores.length
      ? Math.round(
          scores.reduce((sum, score) => sum + score, 0) / scores.length,
        )
      : 0;
  }, [applications]);
  const interviews = applications.filter(
    (application) => application.stage === 'INTERVIEW',
  ).length;
  const pendingTasks = tasks.filter(
    (task) => !['DONE', 'CANCELLED'].includes(task.status),
  );
  const followups = applications.filter(
    (application) => application.needsFollowUp,
  );

  return (
    <div>
      <div className="head">
        <div>
          <small>AUJOURD’HUI</small>
          <h1>Bonjour {user?.name?.split(' ')[0] || '👋'}</h1>
          <p>
            {mode === 'candidate'
              ? 'Votre recherche d’emploi, basée sur vos données réelles.'
              : 'Votre activité de recrutement, mise à jour en temps réel.'}
          </p>
        </div>
        <button className="action primary" onClick={openApplications}>
          <I.LayoutDashboard />
          Voir le pipeline
        </button>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      <section className="stats compact four">
        <div>
          <b>{mode === 'candidate' ? 'Candidatures' : 'Entreprises'}</b>
          <strong>
            {mode === 'candidate' ? applications.length : crm.companies}
          </strong>
          <small>En base</small>
        </div>
        <div>
          <b>{mode === 'candidate' ? 'Entretiens' : 'Contacts'}</b>
          <strong>{mode === 'candidate' ? interviews : crm.contacts}</strong>
          <small>Suivis</small>
        </div>
        <div>
          <b>{mode === 'candidate' ? 'Match moyen' : 'Opportunités'}</b>
          <strong>
            {mode === 'candidate' ? `${averageMatch}%` : crm.opportunities}
          </strong>
          <small>Actuellement</small>
        </div>
        <div>
          <b>Tâches ouvertes</b>
          <strong>{pendingTasks.length}</strong>
          <small>À traiter</small>
        </div>
      </section>
      <section className="automation-hero">
        <I.Sparkles />
        <div>
          <small>NEXORA AI · SIGNAL LOCAL</small>
          <h2>
            {followups.length
              ? `${followups.length} candidature(s) sans réponse depuis plus de 7 jours`
              : 'Aucune relance urgente détectée'}
          </h2>
          <p>
            Ce constat est calculé localement sans transmettre vos fiches CRM à
            un service externe.
          </p>
        </div>
        <button className="action" onClick={openApplications}>
          {followups.length ? 'Préparer les relances' : 'Voir les candidatures'}
        </button>
      </section>
      <section className="panel docs-table">
        <header>
          <h3>Activité récente</h3>
        </header>
        {applications.slice(0, 6).map((application) => (
          <article key={application.id}>
            <i>{application.companyName.slice(0, 2).toUpperCase()}</i>
            <b>{application.companyName}</b>
            <span>{application.roleTitle}</span>
            <span>{application.stage}</span>
            <span>
              {typeof application.matchScore === 'number'
                ? `${application.matchScore}%`
                : '—'}
            </span>
            <em>À jour</em>
          </article>
        ))}
        {!applications.length && (
          <p className="live-empty">Aucune candidature enregistrée.</p>
        )}
      </section>
    </div>
  );
}
