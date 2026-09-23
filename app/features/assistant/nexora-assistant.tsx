'use client';

import { useState } from 'react';
import * as I from 'lucide-react';

type Proposal = {
  id: string;
  toolName: string;
  arguments: {
    tasks?: Array<{ title: string; dueInDays: number }>;
    updates?: Array<{ applicationId: string; stage: string }>;
  };
  preview?: string[];
};

export function NexoraAssistantPanel({
  mode,
  onClose,
}: {
  mode: 'candidate' | 'recruiter' | 'admin';
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const suggestions =
    mode === 'candidate'
      ? [
          'Quelles sont mes priorités cette semaine ?',
          'Comment améliorer mon taux d’entretien ?',
          'Crée un plan de relances',
        ]
      : [
          'Quelles sont les priorités du pipeline ?',
          'Crée les tâches de suivi de cette semaine',
          'Analyse les indicateurs de recrutement',
        ];

  async function ask(text = query) {
    if (!text.trim() || !consent) return;
    setPending(true);
    setError('');
    setAnswer('');
    try {
      const response = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message: text, allowExternalAI: true }),
      });
      const result = (await response.json()) as {
        answer: string;
        proposals?: Proposal[];
        error?: { message?: string };
      };
      if (!response.ok)
        throw new Error(result.error?.message ?? 'Nexora AI est indisponible');
      setAnswer(result.answer);
      setProposals(result.proposals ?? []);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Nexora AI est indisponible',
      );
    } finally {
      setPending(false);
    }
  }

  async function confirm(id: string) {
    const response = await fetch(`/api/ai/actions/${id}/confirm`, {
      method: 'POST',
    });
    const result = (await response.json()) as {
      result: { created?: number; updated?: number };
      error?: { message?: string };
    };
    if (!response.ok) {
      setError(result.error?.message ?? 'Action impossible');
      return;
    }
    setProposals((items) => items.filter((item) => item.id !== id));
    setAnswer(
      (value) =>
        `${value}\n\nAction confirmée : ${result.result.created ?? 0} tâche(s) créée(s), ${result.result.updated ?? 0} candidature(s) modifiée(s).`,
    );
  }

  return (
    <div className="assistant-backdrop">
      <aside className="assistant" aria-label="Assistant Nexora">
        <header>
          <div className="ai-orb">
            <I.Sparkles />
          </div>
          <span>
            <b>Ask Nexora</b>
            <small>Assistant sécurisé · contexte autorisé</small>
          </span>
          <button aria-label="Fermer" onClick={onClose}>
            <I.X />
          </button>
        </header>
        <div className="assistant-body">
          <div className="assistant-welcome">
            <I.Bot />
            <h2>Comment puis-je vous aider ?</h2>
            <p>
              {mode === 'candidate'
                ? 'Nexora analyse vos indicateurs agrégés.'
                : 'Nexora peut analyser un extrait limité des fiches CRM récentes de votre organisation pour répondre à vos questions.'}
            </p>
          </div>
          {!answer && !pending && (
            <div className="suggestions">
              {suggestions.map((item) => (
                <button
                  key={item}
                  onClick={() => {
                    setQuery(item);
                    void ask(item);
                  }}
                >
                  {item}
                  <I.ArrowUpRight />
                </button>
              ))}
            </div>
          )}
          {pending && (
            <div className="ai-answer">
              <p>Analyse en cours…</p>
            </div>
          )}
          {answer && (
            <div className="ai-answer">
              <small>ANALYSE NEXORA</small>
              <p style={{ whiteSpace: 'pre-wrap' }}>{answer}</p>
              {proposals.map((proposal) => (
                <div className="ai-proposal" key={proposal.id}>
                  <span>
                    {proposal.toolName === 'propose_create_tasks'
                      ? `${proposal.arguments.tasks?.length ?? 0} tâche(s) proposée(s)`
                      : `${proposal.arguments.updates?.length ?? 0} changement(s) de statut proposé(s)`}
                  </span>
                  {proposal.arguments.tasks?.map((task, index) => (
                    <p key={index}>
                      {task.title} · dans {task.dueInDays} jour(s)
                    </p>
                  ))}
                  {proposal.preview?.map((item, index) => (
                    <p key={index}>{item}</p>
                  ))}
                  <button
                    className="primary"
                    onClick={() => void confirm(proposal.id)}
                  >
                    Confirmer
                  </button>
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="auth-alert" role="alert">
              {error}
            </div>
          )}
        </div>
        <footer>
          <label className="ai-consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(event) => setConsent(event.target.checked)}
            />
            <span>
              J’autorise l’envoi de ma question et{' '}
              {mode === 'candidate'
                ? 'de mes indicateurs agrégés'
                : 'd’un extrait limité du CRM'}{' '}
              au fournisseur IA configuré.
            </span>
          </label>
          <div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void ask();
              }}
              placeholder="Demandez quelque chose à Nexora…"
            />
            <button disabled={!consent || pending} onClick={() => void ask()}>
              <I.ArrowUp />
            </button>
          </div>
          <small>Toute modification nécessite une confirmation séparée.</small>
        </footer>
      </aside>
    </div>
  );
}
