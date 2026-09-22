import type { Metadata } from 'next';
import './globals.css';
import './nexora-v2.css';
import './auth.css';
import { AuthGate } from './features/auth/auth-gate';

export const metadata: Metadata = {
<<<<<<< Updated upstream
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  ),
=======
  metadataBase: new URL(process.env.APP_URL ?? 'http://localhost:3000'),
>>>>>>> Stashed changes
  title: 'Nexora — AI Recruitment & Career OS',
  description:
    'CRM recrutement, recherche d’emploi et automatisations pilotés par une IA contextuelle.',
  openGraph: {
    title: 'Nexora — AI Recruitment & Career OS',
    description: 'Le système d’exploitation du recrutement et de la carrière.',
    images: [{ url: '/og.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Nexora — AI Recruitment & Career OS',
    description: 'Le système d’exploitation du recrutement et de la carrière.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
