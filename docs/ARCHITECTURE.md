# Architecture Nexora

## Composants

- **Next.js 16 / React 19** : interface et Route Handlers HTTP.
- **PostgreSQL 17** : comptes, CRM, candidatures, automatisations et audit.
- **Worker Node.js** : réclame les exécutions avec `FOR UPDATE SKIP LOCKED`, applique les actions et résiste aux indisponibilités temporaires de la base.
- **OpenAI Responses API** : assistant optionnel. Seules la question et des métriques agrégées sont envoyées après consentement.
- **Docker Compose** : base, migrateur versionné, application et worker.

## Isolation des données

Chaque donnée métier porte un `organization_id`. Les Route Handlers construisent toutes les lectures et mutations avec l'organisation issue de la session. `tenantTransaction` ajoute également `app.organization_id` à la transaction pour les politiques PostgreSQL RLS.

## Automatisations

Un événement métier recherche les règles actives, évalue leurs conditions et crée une entrée `automation_runs`. Le worker réclame atomiquement une exécution disponible, applique les actions dans une transaction locataire puis enregistre le succès ou l'échec. Les brouillons d'e-mail restent des brouillons ; aucun envoi externe implicite n'est effectué.

## Assistant IA

Le navigateur doit activer le consentement externe. Le serveur ne transmet pas les lignes CRM brutes. Une action suggérée devient une entrée `ai_action_proposals` à durée limitée ; un second appel authentifié et confirmé est requis pour l'exécuter.
