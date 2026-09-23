'use client';

import { useEffect, useState } from 'react';
import * as I from 'lucide-react';

type BillingData = {
  plan: 'FREE' | 'STARTER' | 'PRO';
  active: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  limits: { seats: number; aiRequestsPerMonth: number };
  usage: { aiRequestsThisMonth: number; seatsUsed: number };
};

const planLabels: Record<BillingData['plan'], string> = {
  FREE: 'Gratuit',
  STARTER: 'Starter',
  PRO: 'Pro',
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Opération impossible');
  return result;
}

export function BillingPanel() {
  const [billing, setBilling] = useState<BillingData | null>(null);
  const [error, setError] = useState('');
  const [notConfigured, setNotConfigured] = useState(false);
  const [pending, setPending] = useState<'STARTER' | 'PRO' | 'portal' | ''>('');

  useEffect(() => {
    void request('/api/billing')
      .then((result: BillingData) => setBilling(result))
      .catch((cause: Error) => setError(cause.message));
  }, []);

  function reportFailure(cause: unknown) {
    const message =
      cause instanceof Error ? cause.message : 'Opération impossible';
    if (message.includes('non configurée')) setNotConfigured(true);
    else setError(message);
    setPending('');
  }

  async function upgrade(plan: 'STARTER' | 'PRO') {
    setPending(plan);
    try {
      const result = await request('/api/billing/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ plan }),
      });
      window.location.assign(result.url);
    } catch (cause) {
      reportFailure(cause);
    }
  }

  async function openPortal() {
    setPending('portal');
    try {
      const result = await request('/api/billing/portal', { method: 'POST' });
      window.location.assign(result.url);
    } catch (cause) {
      reportFailure(cause);
    }
  }

  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Facturation</h1>
          <p>Plan, essai, consommation IA et sièges de votre organisation.</p>
        </div>
      </div>
      {notConfigured && (
        <div className="empty">
          Facturation non configurée : définissez `STRIPE_SECRET_KEY` côté
          serveur pour activer les abonnements payants. Le plan Gratuit reste
          pleinement fonctionnel sans Stripe.
        </div>
      )}
      {error && <div className="auth-alert">{error}</div>}
      {billing && (
        <>
          <section className="admin-kpis">
            <div>
              <I.CreditCard />
              <span>
                <small>PLAN ACTUEL</small>
                <b>{planLabels[billing.plan]}</b>
                <em>
                  {billing.trialEndsAt &&
                  new Date(billing.trialEndsAt) > new Date()
                    ? `Essai jusqu’au ${new Date(billing.trialEndsAt).toLocaleDateString('fr-FR')}`
                    : billing.subscriptionStatus
                      ? billing.subscriptionStatus
                      : 'Sans abonnement Stripe'}
                </em>
              </span>
            </div>
            <div>
              <I.Sparkles />
              <span>
                <small>CONSOMMATION IA (CE MOIS)</small>
                <b>
                  {billing.usage.aiRequestsThisMonth} /{' '}
                  {billing.limits.aiRequestsPerMonth}
                </b>
                <em>requêtes assistant</em>
              </span>
            </div>
            <div>
              <I.Users />
              <span>
                <small>SIÈGES</small>
                <b>
                  {billing.usage.seatsUsed} / {billing.limits.seats}
                </b>
                <em>membres de l’organisation</em>
              </span>
            </div>
          </section>
          <section className="panel settings-grid">
            <div className="settings-card">
              <I.ArrowUpCircle />
              <h3>Passer à Starter</h3>
              <p>10 sièges, 300 requêtes IA par mois.</p>
              <button
                className="action primary"
                disabled={pending !== '' || billing.plan !== 'FREE'}
                onClick={() => void upgrade('STARTER')}
              >
                {pending === 'STARTER' ? 'Redirection…' : 'Choisir Starter'}
              </button>
            </div>
            <div className="settings-card">
              <I.ArrowUpCircle />
              <h3>Passer à Pro</h3>
              <p>50 sièges, 2000 requêtes IA par mois.</p>
              <button
                className="action primary"
                disabled={pending !== '' || billing.plan === 'PRO'}
                onClick={() => void upgrade('PRO')}
              >
                {pending === 'PRO' ? 'Redirection…' : 'Choisir Pro'}
              </button>
            </div>
            <div className="settings-card">
              <I.Settings />
              <h3>Gérer mon abonnement</h3>
              <p>Moyen de paiement, factures et annulation, sur Stripe.</p>
              <button
                className="action"
                disabled={pending !== ''}
                onClick={() => void openPortal()}
              >
                {pending === 'portal' ? 'Redirection…' : 'Ouvrir le portail'}
              </button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
