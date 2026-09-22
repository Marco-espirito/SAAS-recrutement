'use client';

import Link from 'next/link';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from 'react';

type State = 'loading' | 'authenticated' | 'anonymous' | 'unavailable';
type View = 'login' | 'register' | 'forgot' | 'reset' | 'invite' | 'verify';
export type CurrentUser = {
  id: string;
  email: string;
  name: string;
  organizationId: string;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'RECRUITER' | 'CANDIDATE';
  emailVerified: boolean;
  mfaEnabled: boolean;
};
type Organization = {
  id: string;
  name: string;
  role: string;
  current: boolean;
};
const SessionContext = createContext<CurrentUser | null>(null);
function initialView(): View {
  if (typeof window === 'undefined') return 'login';
  const params = new URLSearchParams(window.location.search);
  if (params.has('reset')) return 'reset';
  if (params.has('invite')) return 'invite';
  if (params.has('verify')) return 'verify';
  return 'login';
}
export function useCurrentUser() {
  return useContext(SessionContext);
}

async function api(path: string, body: Record<string, unknown>) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as {
    ok?: boolean;
    verificationRequired?: boolean;
    resetUrl?: string;
    error?: { code?: string; message?: string };
  };
  if (!response.ok) {
    const error = new Error(result.error?.message ?? 'Opération impossible');
    Object.assign(error, { code: result.error?.code });
    throw error;
  }
  return result;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>('loading');
  const [view, setView] = useState<View>(initialView);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(() => initialView() === 'verify');
  const [mfaRequired, setMfaRequired] = useState(false);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('verify')) {
      void api('/api/auth/verify-email', { token: params.get('verify') })
        .then(() => window.location.assign('/'))
        .catch((cause: Error) => {
          setError(cause.message);
          setPending(false);
        });
    }
    fetch('/api/auth/me', { credentials: 'same-origin' })
      .then(async (response) => {
        if (!response.ok) {
          setState('anonymous');
          return;
        }
        const result = (await response.json()) as { user: CurrentUser };
        setUser(result.user);
        setState('authenticated');
        const organizationResponse = await fetch('/api/organizations');
        const organizationResult = (await organizationResponse.json()) as {
          organizations?: Organization[];
        };
        setOrganizations(organizationResult.organizations ?? []);
      })
      .catch(() => setState('unavailable'));
  }, []);

  async function logout() {
    setPending(true);
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.assign('/');
  }
  async function switchOrganization(organizationId: string) {
    if (!organizationId || organizationId === user?.organizationId) return;
    setPending(true);
    try {
      await api('/api/auth/switch-organization', { organizationId });
      window.location.assign('/');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Changement impossible',
      );
      setPending(false);
    }
  }
  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    const payload = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const params = new URLSearchParams(window.location.search);
    try {
      if (view === 'forgot') {
        const result = await api('/api/auth/forgot-password', payload);
        setMessage(
          result.resetUrl
            ? `Lien local : ${result.resetUrl}`
            : 'Si ce compte existe, un e-mail vient d’être envoyé.',
        );
      } else if (view === 'reset') {
        await api('/api/auth/reset-password', {
          ...payload,
          token: params.get('reset'),
        });
        window.location.assign('/');
      } else if (view === 'invite') {
        await api('/api/organization/invitations/accept', {
          ...payload,
          token: params.get('invite'),
        });
        window.location.assign('/');
      } else if (view === 'register') {
        const result = await api('/api/auth/register', payload);
        if (result.verificationRequired) {
          setMessage(
            'Compte créé. Consultez votre e-mail pour valider votre adresse.',
          );
          setView('login');
        } else window.location.assign('/');
      } else {
        await api('/api/auth/login', payload);
        window.location.assign('/');
      }
    } catch (cause) {
      if (
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'MFA_REQUIRED'
      ) {
        setMfaRequired(true);
        setError('Saisissez le code de votre application d’authentification.');
      } else if (
        cause instanceof Error &&
        'code' in cause &&
        cause.code === 'EMAIL_NOT_VERIFIED'
      ) {
        try {
          await api('/api/auth/resend-verification', payload);
          setMessage(
            'Un nouveau lien de validation vient de vous être envoyé.',
          );
        } catch (resendError) {
          setError(
            resendError instanceof Error
              ? resendError.message
              : 'Impossible de renvoyer le lien de validation.',
          );
        }
      } else
        setError(
          cause instanceof Error ? cause.message : 'Opération impossible',
        );
    } finally {
      setPending(false);
    }
  }

  if (state === 'authenticated')
    return (
      <SessionContext.Provider value={user}>
        {children}
        <aside className="session-chip" aria-label="Session active">
          <span>
            <b>{user?.name}</b>
            <small>
              {user?.organizationName} · {user?.role}
            </small>
          </span>
          {organizations.length > 1 && (
            <select
              aria-label="Changer d’organisation"
              value={user?.organizationId}
              onChange={(event) => void switchOrganization(event.target.value)}
              disabled={pending}
            >
              {organizations.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name} · {organization.role}
                </option>
              ))}
            </select>
          )}
          <button onClick={() => void logout()} disabled={pending}>
            {pending ? '…' : 'Déconnexion'}
          </button>
        </aside>
      </SessionContext.Provider>
    );
  if (state === 'loading')
    return (
      <main className="auth-loading" aria-live="polite">
        Chargement sécurisé de Nexora…
      </main>
    );
  const title =
    view === 'register'
      ? 'Créer votre espace Nexora'
      : view === 'forgot'
        ? 'Réinitialiser le mot de passe'
        : view === 'reset'
          ? 'Choisir un nouveau mot de passe'
          : view === 'invite'
            ? 'Rejoindre l’organisation'
            : view === 'verify'
              ? 'Validation de votre adresse…'
              : 'Bienvenue sur Nexora';
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">
          <i>◆</i>
          <strong>Nexora</strong>
          <span>AI</span>
        </div>
        <p className="auth-kicker">AI RECRUITMENT & CAREER OS</p>
        <h1>{title}</h1>
        <p>
          Identité sécurisée, données isolées par organisation et contrôle
          complet des accès.
        </p>
        {state === 'unavailable' && (
          <div className="auth-alert">
            Le service est indisponible. Vérifiez PostgreSQL et DATABASE_URL.
          </div>
        )}
        {view !== 'verify' && (
          <form onSubmit={submit}>
            {(view === 'register' || view === 'invite') && (
              <label>
                Nom complet
                <input
                  name="name"
                  autoComplete="name"
                  required={view === 'register'}
                  minLength={2}
                />
              </label>
            )}
            {view === 'register' && (
              <label>
                Type d’espace
                <select name="accountType" defaultValue="CANDIDATE">
                  <option value="CANDIDATE">Je cherche un emploi</option>
                  <option value="RECRUITER">Je recrute</option>
                </select>
              </label>
            )}
            {view === 'register' && (
              <label>
                Nom de votre espace
                <input
                  name="organizationName"
                  autoComplete="organization"
                  required
                  minLength={2}
                />
              </label>
            )}
            {['login', 'register', 'forgot'].includes(view) && (
              <label>
                Adresse e-mail
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                />
              </label>
            )}
            {view !== 'forgot' && (
              <label>
                {view === 'reset' ? 'Nouveau mot de passe' : 'Mot de passe'}
                <input
                  name="password"
                  type="password"
                  autoComplete={
                    view === 'login' ? 'current-password' : 'new-password'
                  }
                  required
                  minLength={view === 'login' ? 1 : 12}
                />
              </label>
            )}
            {view === 'login' && mfaRequired && (
              <label>
                Code MFA
                <input
                  name="otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  required
                />
              </label>
            )}
            {error && (
              <div className="auth-alert" role="alert">
                {error}
              </div>
            )}
            {message && <output className="auth-success">{message}</output>}
            <button disabled={pending}>
              {pending
                ? 'Veuillez patienter…'
                : view === 'register'
                  ? 'Créer mon espace'
                  : view === 'forgot'
                    ? 'Envoyer le lien'
                    : view === 'invite'
                      ? 'Accepter l’invitation'
                      : view === 'reset'
                        ? 'Modifier le mot de passe'
                        : 'Se connecter'}
            </button>
          </form>
        )}
        {view === 'verify' && error && (
          <div className="auth-alert" role="alert">
            {error}
          </div>
        )}
        {view === 'login' && (
          <button className="auth-switch" onClick={() => setView('forgot')}>
            Mot de passe oublié ?
          </button>
        )}
        {view !== 'verify' && (
          <button
            className="auth-switch"
            onClick={() => {
              setView(
                view === 'login'
                  ? 'register'
                  : view === 'register'
                    ? 'login'
                    : 'login',
              );
              setError('');
              setMessage('');
              setMfaRequired(false);
            }}
          >
            {view === 'login'
              ? 'Créer un espace'
              : view === 'register'
                ? 'J’ai déjà un compte'
                : 'Retour à la connexion'}
          </button>
        )}
        {view === 'verify' && !pending && (
          <Link className="auth-switch" href="/">
            Retour à la connexion
          </Link>
        )}
      </section>
    </main>
  );
}
