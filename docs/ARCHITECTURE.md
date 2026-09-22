# Architecture Nexora

## Composants

- **Next.js 16 / React 19** : interface et Route Handlers HTTP.
- **PostgreSQL 17** : comptes, CRM, candidatures, automatisations et audit.
- **Worker Node.js** : réclame les exécutions avec `FOR UPDATE SKIP LOCKED`, applique les actions et résiste aux indisponibilités temporaires de la base.
- **Assistant IA (OpenAI ou Gemini)** : optionnel. Seules la question et des métriques agrégées sont envoyées après consentement.
- **Docker Compose** : base, migrateur versionné, application et worker.

## Isolation des données

Chaque donnée métier porte un `organization_id`. Les Route Handlers construisent toutes les lectures et mutations avec l'organisation issue de la session. `tenantTransaction` ajoute également `app.organization_id` à la transaction pour les politiques PostgreSQL RLS.

## Automatisations

Un événement métier recherche les règles actives, évalue leurs conditions et crée une entrée `automation_runs`. Le worker réclame atomiquement une exécution disponible, applique les actions dans une transaction locataire puis enregistre le succès ou l'échec. Les brouillons d'e-mail restent des brouillons ; aucun envoi externe implicite n'est effectué.

## Assistant IA

Le navigateur doit activer le consentement externe. Le serveur ne transmet pas les lignes CRM brutes. Une action suggérée devient une entrée `ai_action_proposals` à durée limitée ; un second appel authentifié et confirmé est requis pour l'exécuter.

Deux fournisseurs sont supportés (`lib/server/ai.ts`), choisis via `AI_PROVIDER` ou, à défaut, par la clé configurée (Gemini si `GEMINI_API_KEY` est présente, sinon OpenAI si `OPENAI_API_KEY` l'est) — la décision elle-même est une fonction pure testée dans `lib/domain/ai.ts`. OpenAI utilise le SDK officiel (`responses.create`) ; Gemini est appelé directement en REST (`generateContent`), sans dépendance supplémentaire, dans le même style que les autres intégrations du projet. Les deux chemins exposent le même contrat interne (texte de réponse + appels d'outils normalisés) au reste de la route, qui ignore quel fournisseur a répondu.

## Offres persistantes

Chaque appel à `GET /api/integrations/jobs` upsert les résultats du fournisseur dans `job_offers` (clé de déduplication basée sur l'id fournisseur, ou à défaut sur `entreprise + titre + localisation` normalisés). Une offre déjà connue est mise à jour (`last_seen_at`, contenu) plutôt que dupliquée. Si une offre précédemment vue pour la même recherche (`query_key`) n'est plus renvoyée par le fournisseur, elle passe en statut `REMOVED` sans être supprimée ; si sa date d'expiration (`expires_at`) est dépassée, elle passe en `EXPIRED`. La ligne et son `raw_payload` d'origine restent en base indéfiniment : Nexora garde sa propre copie même si le fournisseur retire l'offre.

## Matching Nexora

Le score affiché au candidat n'est plus celui du fournisseur : `lib/domain/matching.ts` compare structurellement le profil candidat (compétences déclarées + compétences des expériences, localisations souhaitées, préférence de télétravail, fourchette salariale) à chaque offre persistée, pondère trois critères (compétences 60 %, localisation 20 %, rémunération 20 %) et produit une justification textuelle par critère. Les compétences manquantes ne sont listées qu'avec preuve (absentes des compétences déclarées et des expériences) ; si le profil n'a aucune compétence déclarée, Nexora refuse d'en inventer et signale `dataComplete: false` plutôt que d'afficher un score trompeur. Chaque calcul est persisté dans `candidate_offer_matches` (upsert par candidat/offre) avec le détail du score. Le candidat peut qualifier une recommandation (`RELEVANT`, `NOT_RELEVANT`, `APPLIED`) via `PATCH /api/candidate/matches/{id}`, ce qui alimente le taux de pertinence exposé par `GET /api/candidate/matches`.
