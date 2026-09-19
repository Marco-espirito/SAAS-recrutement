import type { Metadata } from 'next';
import './globals.css';
import './nexora-v2.css';

export const metadata: Metadata = {
  title: 'Nexora — AI Recruitment & Career OS',
  description: 'CRM recrutement, recherche d’emploi et automatisations pilotés par une IA contextuelle.',
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
      <body>{children}</body>
    </html>
  );
}
