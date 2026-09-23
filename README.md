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
- CRM enrichi : recherche transversale, import CSV d'entreprises, responsables et tags, fusion contrôlée des doublons, pièces jointes et timeline unifiée ;
- recrutement collaboratif : scorecards d'entretien, commentaires candidats, shortlists, viviers dynamiques et portail client en lecture seule par lien temporaire révocable ;
- Nexora AI : contexte CRM limité aux données autorisées, recherche par termes, préparation d'entretien et propositions de changements groupés du pipeline, toujours avec aperçu et confirmation.

Les écrans CV et ATS ne chargent aucune identité ou statistique de démonstration : ils attendent un PDF réel, analysent son contenu dans le navigateur puis archivent le document autorisé en base. La recherche d’offres et le matching restent explicitement indisponibles (`503`) tant qu’un fournisseur n’est pas configuré.

## Démarrage avec Docker Desktop

Copier `.env.example` vers `.env`, remplacer au minimum le mot de passe PostgreSQL, puis lancer :

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

Le constructeur d’automatisations permet de combiner des conditions ET/OU et de simuler un événement avant activation. Le mode test vérifie les conditions, le délai et les actions prévues sans exécuter ces actions. Seuls les déclencheurs « candidature créée » et « statut modifié » sont actuellement câblés. Sur Docker, le worker dédié traite la file en continu. Sur Vercel, un cron quotidien traite jusqu’à 20 exécutions par passage ; définir `CRON_SECRET` (chaîne aléatoire d’au moins 16 caractères) dans les variables de production avant le déploiement. Un plan Vercel autorisant une fréquence plus élevée ou un worker externe est nécessaire si les délais doivent être précis à l’heure près.

Les offres reçues sont conservées dans PostgreSQL et restent consultables dans « Offres conservées » même après leur retrait par le fournisseur. Les correspondances enregistrées sont consultables séparément, sans nouvel appel au fournisseur. La recherche de nouvelles offres dépend toujours de `JOBS_PROVIDER_URL` et `JOBS_PROVIDER_API_KEY`.

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

Tests API contre une vraie PostgreSQL (`npm run test:integration`), bout en bout/accessibilité/mobile (`npm run test:e2e`, Playwright) et de charge (`npm run test:load`, k6, jamais automatisé) : voir [docs/TESTING.md](docs/TESTING.md).

Les migrations sont ordonnées par nom, exécutées dans une transaction, enregistrées dans `schema_migrations` et protégées par checksum. Ne jamais modifier une migration déjà appliquée : ajouter un nouveau fichier numéroté.

## Sécurité et production

Les secrets restent exclusivement dans les variables d'environnement. Les cookies de session sont opaques, hachés en base, `HttpOnly`, `SameSite=Lax` et `Secure` lorsque `APP_URL` utilise HTTPS. Les données métier sont filtrées par organisation dans chaque requête et les tables disposent également de politiques RLS.

Avant une mise en production publique, utiliser une URL HTTPS, un secret PostgreSQL long, un utilisateur PostgreSQL applicatif à privilèges minimaux, des sauvegardes testées et un fournisseur de logs/alertes. Voir [docs/SECURITY.md](docs/SECURITY.md) et [docs/RUNBOOK.md](docs/RUNBOOK.md).

Les contrats des adaptateurs d’offres, d’e-mail et de calendrier sont décrits dans [docs/INTEGRATIONS.md](docs/INTEGRATIONS.md). Ils restent fermés par défaut et répondent `503` tant que leurs URL et clés ne sont pas configurées.

Les flux OAuth Google, Microsoft (Outlook, calendrier et Teams) et Slack sont implémentés, mais **désactivés tant que les applications fournisseur et leurs secrets ne sont pas configurés**. Les e-mails et événements entrants sont synchronisés par curseurs ; l'envoi d'e-mails, la création d'événements et les notifications sortantes exigent un clic explicite. Il ne s'agit pas encore d'une réplication temps réel ni d'une édition/suppression bidirectionnelle complète. Voir [docs/OAUTH_SETUP.md](docs/OAUTH_SETUP.md) pour les URL de rappel, permissions, variables et limites. Les anciens adaptateurs génériques restent distincts des connexions OAuth.

La facturation Stripe (essai de 14 jours, plans, quotas, portail client) est implémentée et testée, mais **désactivée tant que les produits Stripe et leurs identifiants ne sont pas configurés** — le plan Gratuit reste pleinement fonctionnel sans Stripe. Voir [docs/BILLING.md](docs/BILLING.md).

## Architecture

Le détail des composants et des flux est décrit dans [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
