# Nexora — AI Recruitment & Career OS

Interface React 19 multi-espace : JobPilot pour les candidats, RecruitPilot pour les recruteurs, CRM entreprises/contacts, automatisations, assistant Nexora AI et administration.

## Déploiement Vercel

Projet : saas-recrutement. Dépôt : https://github.com/Marco-espirito/SAAS-recrutement

Vercel utilise Next.js et la commande npm run build:vercel, définie dans vercel.json. Installation reproductible avec npm ci. La préparation copie le worker PDF depuis la version installée de pdfjs-dist vers public ; ce fichier généré ne doit pas être commité.

Développement Vercel : npm run dev:vercel. La compilation historique Vinext/Cloudflare reste disponible avec npm run build.

## État fonctionnel constaté

L'application reste un prototype front-end interactif : aucune authentification, base de données partagée, ni service d'envoi d'emails réel. Le CRM et l'assistant Nexora AI simulent toujours leurs parcours produit avec des réponses préécrites.

Trois moteurs ont en revanche une logique réelle, exécutée dans le navigateur et persistée en localStorage (pas seulement des données codées en dur) :

- **Offres persistantes** (`lib/offers.ts`, onglet *Offres d'emploi*) : chaque synchronisation fusionne un lot d'offres simulé avec le fonds déjà enregistré — détection de doublons intra-lot et inter-source, suivi d'expiration par date, et conservation de la dernière version connue d'une offre retirée par la source (jamais supprimée, seulement requalifiée « retirée »).
- **Matching Nexora** (`lib/matching.ts`, onglet *Matching IA*) : score calculé comme somme pondérée de critères explicites (compétences, localisation, mode de travail, contrat, séniorité, disponibilité de l'offre), chaque compétence manquante reliée à la phrase de l'offre qui la mentionne, et retours candidats (pertinent / non pertinent) persistés pour un suivi de la qualité perçue des recommandations.
- **Constructeur d'automatisations** (`app/automation-builder.tsx`, onglet *Automatisations*) : déclencheur, arbre de conditions ET/OU imbriquables, délai optionnel et actions, avec un mode test qui évalue réellement les conditions contre des valeurs d'exemple (sans exécuter d'action) et un aperçu en langage naturel avant activation.

Le PDF de CV est analysé dans le navigateur (`app/cv-import.tsx`). Aucun de ces moteurs n'appelle de fournisseur externe réel (job board, LLM) : les données simulées sont conçues pour démontrer fidèlement le comportement attendu d'une intégration réelle.

## Validation

Compilation de production Next.js et vérification TypeScript réussies. Le lint existant signale encore des erreurs de style, typage et accessibilité dans les composants ; elles ne sont pas toutes corrigées par l'adaptation Vercel.

## Docker

L'image de production utilise le mode `standalone` de Next.js et s'exécute avec un utilisateur non privilégié :

```bash
docker compose up --build -d
```

Nexora est ensuite disponible sur `http://localhost:3000`. L'état du conteneur est vérifié via `GET /api/health`.

Le port peut être changé sans modifier le fichier : `NEXORA_PORT=8080 docker compose up -d`. Les futures clés de services doivent être fournies au démarrage du conteneur et ne doivent jamais être copiées dans l'image :

```bash
docker run --rm -p 3000:3000 --env-file .env.local nexora:latest
```
