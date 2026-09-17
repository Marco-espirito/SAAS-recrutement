# JobPilot — SaaS recrutement

Interface React 19 de recrutement : tableaux de bord candidat et administrateur, import de CV PDF, analyse ATS, offres, candidatures, relances et documents.

## Déploiement Vercel

Projet : saas-recrutement. Dépôt : https://github.com/Marco-espirito/SAAS-recrutement

Vercel utilise Next.js et la commande npm run build:vercel, définie dans vercel.json. Installation reproductible avec npm ci. La préparation copie le worker PDF depuis la version installée de pdfjs-dist vers public ; ce fichier généré ne doit pas être commité.

Développement Vercel : npm run dev:vercel. La compilation historique Vinext/Cloudflare reste disponible avec npm run build.

## État fonctionnel constaté

L'application est principalement une interface de démonstration. Des données sont codées en dur et certaines données utilisateur sont conservées dans localStorage. Le PDF est analysé dans le navigateur. Aucun backend d'authentification, base de données partagée ou appel aux services IA, offres et emails n'est implémenté dans app ou lib. Les variables de .env.example sont des emplacements réservés, non nécessaires au déploiement actuel.

## Validation

Compilation de production Next.js et vérification TypeScript réussies. Le lint existant signale encore des erreurs de style, typage et accessibilité dans les composants ; elles ne sont pas toutes corrigées par l'adaptation Vercel.
