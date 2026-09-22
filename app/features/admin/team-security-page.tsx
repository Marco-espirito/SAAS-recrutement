'use client';

import { useEffect, useState, type SyntheticEvent } from 'react';
import * as I from 'lucide-react';
import { useCurrentUser } from '../auth/auth-gate';

type Member = {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'CANDIDATE';
  joinedAt: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
};

async function request(path: string, init?: RequestInit) {
  const response = await fetch(path, init);
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error?.message ?? 'Opération impossible');
  return result;
}

export function TeamPage({ toast }: { toast: (message: string) => void }) {
  const current = useCurrentUser();
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [error, setError] = useState('');
  const load = () =>
    void Promise.all([
      request('/api/organization/members'),
      request('/api/organization/invitations'),
    ])
      .then(([memberResult, invitationResult]) => {
        setMembers(memberResult.members);
        setInvitations(invitationResult.invitations);
      })
      .catch((cause: Error) => setError(cause.message));
  useEffect(load, []);
  async function invite(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const body = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    try {
      const result = await request('/api/organization/invitations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      toast(
        result.delivered
          ? 'Invitation envoyée'
          : result.inviteUrl
            ? `Invitation créée : ${result.inviteUrl}`
            : 'Invitation créée',
      );
      event.currentTarget.reset();
      load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Invitation impossible',
      );
    }
  }
  async function changeRole(member: Member, role: Member['role']) {
    try {
      await request(`/api/organization/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      toast('Rôle mis à jour');
      load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Modification impossible',
      );
    }
  }
  async function revoke(member: Member) {
    if (!window.confirm(`Révoquer l’accès de ${member.name} ?`)) return;
    try {
      await request(`/api/organization/members/${member.id}`, {
        method: 'DELETE',
      });
      toast('Accès révoqué');
      load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Révocation impossible',
      );
    }
  }
  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Équipe et accès</h1>
          <p>Invitations, rôles et révocation des accès à l’organisation.</p>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      <form className="live-create-form panel" onSubmit={invite}>
        <label>
          Adresse e-mail
          <input name="email" type="email" required />
        </label>
        <label>
          Rôle
          <select name="role" defaultValue="RECRUITER">
            <option value="RECRUITER">Recruteur</option>
            <option value="CANDIDATE">Candidat</option>
            {current?.role === 'OWNER' && (
              <option value="ADMIN">Administrateur</option>
            )}
          </select>
        </label>
        <button className="action primary">
          <I.UserPlus /> Inviter
        </button>
      </form>
      <section className="panel admin-table team-table">
        {members.map((member) => (
          <article key={member.id}>
            <span>
              <b>{member.name}</b>
              <small>{member.email}</small>
            </span>
            <select
              value={member.role}
              disabled={member.role === 'OWNER' && current?.role !== 'OWNER'}
              onChange={(event) =>
                void changeRole(member, event.target.value as Member['role'])
              }
            >
              <option value="OWNER">Propriétaire</option>
              <option value="ADMIN">Administrateur</option>
              <option value="RECRUITER">Recruteur</option>
              <option value="CANDIDATE">Candidat</option>
            </select>
            <span>
              {member.emailVerified ? 'E-mail validé' : 'E-mail à valider'} ·{' '}
              {member.mfaEnabled ? 'MFA actif' : 'MFA inactif'}
            </span>
            <button
              className="action danger"
              onClick={() => void revoke(member)}
            >
              <I.UserX /> Révoquer
            </button>
          </article>
        ))}
      </section>
      <div className="module-head compact">
        <div>
          <h2>Invitations récentes</h2>
        </div>
      </div>
      <section className="panel admin-table">
        {invitations.map((invitation) => (
          <article key={invitation.id}>
            <b>{invitation.email}</b>
            <span>{invitation.role}</span>
            <span>
              {invitation.acceptedAt
                ? 'Acceptée'
                : invitation.revokedAt
                  ? 'Révoquée'
                  : 'En attente'}
            </span>
            <time>
              {new Date(invitation.expiresAt).toLocaleDateString('fr-FR')}
            </time>
          </article>
        ))}
      </section>
    </div>
  );
}

export function SecurityPage({ toast }: { toast: (message: string) => void }) {
  const user = useCurrentUser();
  const [secret, setSecret] = useState('');
  const [error, setError] = useState('');
  async function submit(
    path: string,
    event: SyntheticEvent<HTMLFormElement>,
    after?: (result: Record<string, unknown>) => void,
  ) {
    event.preventDefault();
    setError('');
    try {
      const result = await request(path, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget).entries()),
        ),
      });
      after?.(result);
      toast('Paramètres de sécurité mis à jour');
      event.currentTarget.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Opération impossible');
    }
  }
  return (
    <div>
      <div className="module-head">
        <div>
          <h1>Sécurité du compte</h1>
          <p>Mot de passe, MFA et sessions actives.</p>
        </div>
      </div>
      {error && <div className="auth-alert">{error}</div>}
      <section className="settings-grid">
        <form
          className="panel settings-card"
          onSubmit={(event) => void submit('/api/auth/change-password', event)}
        >
          <I.KeyRound />
          <h3>Changer le mot de passe</h3>
          <label>
            Mot de passe actuel
            <input type="password" name="currentPassword" required />
          </label>
          <label>
            Nouveau mot de passe
            <input type="password" name="newPassword" minLength={12} required />
          </label>
          <button className="action primary">Modifier</button>
        </form>
        {!user?.mfaEnabled && (
          <form
            className="panel settings-card"
            onSubmit={(event) =>
              void submit('/api/auth/mfa', event, (result) =>
                setSecret(
                  typeof result.secret === 'string' ? result.secret : '',
                ),
              )
            }
          >
            <I.Smartphone />
            <h3>Authentification à deux facteurs</h3>
            <input type="hidden" name="action" value="setup" />
            <p>Ajoutez Nexora à votre application TOTP.</p>
            <label>
              Mot de passe
              <input type="password" name="password" required />
            </label>
            <button className="action primary">Configurer le MFA</button>
            {secret && <code className="mfa-secret">{secret}</code>}
          </form>
        )}
        {secret && (
          <form
            className="panel settings-card"
            onSubmit={(event) =>
              void submit('/api/auth/mfa', event, () => {
                setSecret('');
                window.location.reload();
              })
            }
          >
            <I.ShieldCheck />
            <h3>Confirmer le MFA</h3>
            <input type="hidden" name="action" value="confirm" />
            <label>
              Code à 6 chiffres
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
              />
            </label>
            <button className="action primary">Activer</button>
          </form>
        )}
        {user?.mfaEnabled && (
          <form
            className="panel settings-card"
            onSubmit={(event) =>
              void submit('/api/auth/mfa', event, () =>
                window.location.reload(),
              )
            }
          >
            <I.ShieldOff />
            <h3>Désactiver le MFA</h3>
            <input type="hidden" name="action" value="disable" />
            <label>
              Mot de passe
              <input type="password" name="password" required />
            </label>
            <label>
              Code actuel
              <input
                name="code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                required
              />
            </label>
            <button className="action danger">Désactiver</button>
          </form>
        )}
        <section className="panel settings-card">
          <I.LogOut />
          <h3>Sessions</h3>
          <p>
            Déconnectez tous vos appareils puis créez une nouvelle session sur
            celui-ci.
          </p>
          <button
            className="action"
            onClick={() =>
              void request('/api/auth/sessions/invalidate', { method: 'POST' })
                .then(() => {
                  toast('Toutes les sessions ont été invalidées');
                  window.location.assign('/');
                })
                .catch((cause: Error) => setError(cause.message))
            }
          >
            Invalider toutes les sessions
          </button>
        </section>
      </section>
    </div>
  );
}
