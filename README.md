# Nexora — AI Recruitment & Career OS

Nexora est un SaaS multi-espace pour candidats, recruteurs et administrateurs. Il réunit un CRM de recrutement, le suivi des candidatures, des automatisations exécutées en arrière-plan et un assistant IA avec consentement et confirmation des actions.

## Fonctionnalités disponibles

- authentification par session sécurisée, validation e-mail, réinitialisation du mot de passe et MFA TOTP ;
- gestion d’équipe : invitations à durée limitée, membres, rôles, révocation, multi-organisation et changement d’espace ;
- rôles `OWNER`, `ADMIN`, `RECRUITER` et `CANDIDATE` ;
- création d’un espace personnel candidat ou d’une organisation recruteur, avec accès UI et API séparés par rôle ;
- CRM PostgreSQL : entreprises, contacts, opportunités et historique ;
- candidatures, tâches et pipeline persistants ;
- relances atomiques : historique e-mail, dernier contact, statut et clôture du rappel sont enregistrés dans une même transaction ;
- automatisations avec déclencheurs, conditions, délais, actions et journal d'exécution ;
- assistant Nexora AI via l'API Responses, désactivé sans clé et soumis à un consentement explicite ;
- propositions d'actions IA stockées puis confirmées avant exécution ;
- audit, limitation de débit, contrôles d'origine, en-têtes de sécurité et health checks ;
- image Docker non privilégiée, PostgreSQL, migrateur et worker dédiés.
- profil candidat persistant : coordonnées, préférences, compétences, expériences, CV principal et historique ATS.

Les écrans CV et ATS ne chargent aucune identité ou statistique de démonstration : ils attendent un PDF réel, analysent son contenu dans le navigateur puis archivent le document autorisé en base. La recherche d’offres et le matching restent explicitement indisponibles (`503`) tant qu’un fournisseur n’est pas configuré.

## Démarrage avec Docker Desktop

<<<<<<< Updated upstream
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
=======
Copier `.env.example` vers `.env`, remplacer au minimum le mot de passe PostgreSQL, puis lancer :
>>>>>>> Stashed changes

```bash
docker compose up --build -d
```

L'application est disponible sur `http://localhost:3000`. Les services utiles sont :

```bash
docker compose ps
docker compose logs -f nexora worker
curl http://localhost:3000/api/health
```

`/api/live` vérifie uniquement le processus HTTP ; `/api/health` vérifie aussi PostgreSQL. Pour changer le port public, définir `NEXORA_PORT`, par exemple `NEXORA_PORT=8080`.

## Développement local

Prérequis : Node.js 22.13+ et PostgreSQL 17.

```bash
npm ci
npm run db:migrate
npm run dev
```

Le worker d'automatisation se lance séparément avec `npm run worker`.

Variables obligatoires : `DATABASE_URL` et `APP_URL`. Définir aussi `APP_ENCRYPTION_KEY` avec 32 octets aléatoires encodés en base64 pour activer le MFA. `REQUIRE_EMAIL_VERIFICATION=true` impose la validation des nouveaux comptes et nécessite l’adaptateur e-mail. `OPENAI_API_KEY` reste optionnelle ; sans elle, le reste du produit fonctionne normalement et l'API IA répond avec un statut d'indisponibilité explicite.

## Vérifications

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm audit
node scripts/smoke-identity.mjs
```

Les migrations sont ordonnées par nom, exécutées dans une transaction, enregistrées dans `schema_migrations` et protégées par checksum. Ne jamais modifier une migration déjà appliquée : ajouter un nouveau fichier numéroté.

## Sécurité et production

Les secrets restent exclusivement dans les variables d'environnement. Les cookies de session sont opaques, hachés en base, `HttpOnly`, `SameSite=Lax` et `Secure` lorsque `APP_URL` utilise HTTPS. Les données métier sont filtrées par organisation dans chaque requête et les tables disposent également de politiques RLS.

Avant une mise en production publique, utiliser une URL HTTPS, un secret PostgreSQL long, un utilisateur PostgreSQL applicatif à privilèges minimaux, des sauvegardes testées et un fournisseur de logs/alertes. Voir [docs/SECURITY.md](docs/SECURITY.md) et [docs/RUNBOOK.md](docs/RUNBOOK.md).

Les contrats des adaptateurs d’offres, d’e-mail et de calendrier sont décrits dans [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Ils restent fermés par défaut et répondent `503` tant que leurs URL et clés ne sont pas configurées.

## Architecture

Le détail des composants et des flux est décrit dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
