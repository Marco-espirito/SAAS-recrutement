import type { Metadata } from 'next';
import { readClientPortal } from '@/lib/server/client-portal';

export const metadata: Metadata = {
  title: 'Portail client Nexora',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};

export default async function ClientPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return (
    <main
      style={{
        maxWidth: 900,
        margin: '4rem auto',
        padding: '1rem',
        fontFamily: 'sans-serif',
      }}
    >
      <h1>Nexora · Portail client</h1>
      <p>
        Cette sélection est partagée par votre équipe de recrutement. Le lien
        expire automatiquement et peut être révoqué.
      </p>
      <ClientPortalContent token={token} />
    </main>
  );
}

async function ClientPortalContent({ token }: { token: string }) {
  const data = await readClientPortal(token).catch(() => null);
  if (!data) return <p>Lien invalide, expiré ou révoqué.</p>;
  return (
    <section>
      <h2>
        {data.companyName} · {data.shortlistName}
      </h2>
      {data.candidates.map((candidate) => (
        <article
          key={candidate.id}
          style={{
            border: '1px solid #d6dbe7',
            borderRadius: 12,
            padding: '1rem',
            margin: '1rem 0',
          }}
        >
          <h3>
            {candidate.firstName} {candidate.lastName}
          </h3>
          <p>
            {candidate.headline || 'Profil candidat'} ·{' '}
            {candidate.location || 'Lieu non renseigné'}
          </p>
          <p>{candidate.skills.join(' · ')}</p>
        </article>
      ))}
      {!data.candidates.length && <p>Aucun candidat dans cette sélection.</p>}
    </section>
  );
}
