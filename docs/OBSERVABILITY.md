# Observabilité

## Ce qui existe déjà

- **Logs structurés corrélés** (`lib/server/observability.ts`, fonction `log()`) : chaque entrée porte `level`, `service`, `message`, `correlationId`, `timestamp`, plus un contexte libre. `handleApiError` (`lib/server/http.ts`) y passe automatiquement toute erreur ≥ 500 ou non gérée — c'est le point de passage unique de toutes les routes API, donc aucune route n'a besoin d'appeler `log()` elle-même pour ses erreurs.
- **Corrélation des requêtes** : `correlationId()` réutilise l'en-tête `x-vercel-id` que Vercel pose sur chaque invocation (traverse déjà les retries et les sauts edge/origine). En local ou dans le worker Docker (hors contexte de requête Next.js), elle retombe sur un identifiant généré à la volée — les lignes d'une même exécution ne se corrèlent alors pas entre elles ; c'est une limite connue, pas un bug.
- **Battements de cœur du worker** (`worker_heartbeats`, migration 012) : le worker Docker (`docker-worker`) et le cron Vercel (`vercel-cron`) rapportent leur dernière exécution (OK/ERROR) — le worker toutes les 60 secondes, le cron à chaque passage. Selon le mode de déploiement, un seul des deux services apparaît réellement.
- **Alerte via `GET /api/health`** : renvoie `503` si la base est inaccessible OU si un service est resté silencieux au-delà de son seuil (`docker-worker` : 5 min ; `vercel-cron` : 26 h) OU en `ERROR`. Il n'y a pas de service de paging ici — branchez un moniteur externe (UptimeRobot, StatusCake, cron indépendant) sur cette URL pour être notifié.
- **Tableau de santé** (`GET /api/admin/health`, réservé OWNER/ADMIN, onglet « Santé ») : état de la base, battements de cœur, profondeur de la file d'automatisations (en attente/en cours, âge de la plus ancienne), connexions OAuth en erreur ou en retard de synchro, propositions IA en attente, volume de notifications sur 24h.

## Ce qui n'existe pas encore

- **Sentry** : aucun compte n'est configuré. `log()` est le point de branchement prévu — une fois `@sentry/nextjs` installé et `SENTRY_DSN` défini, ajoutez l'appel à `Sentry.captureException`/`captureMessage` dans le `if (level === 'error')` de `log()` ; aucune route n'a besoin d'être modifiée puisqu'elles passent déjà toutes par `handleApiError`.
- **OpenTelemetry / traces distribuées** : non instrumenté. `correlationId()` donne une corrélation basique par log, pas des spans avec durée et arborescence d'appels.
- **Backend de métriques externe** (Prometheus, Datadog…) : les métriques exposées le sont uniquement via `/api/admin/health`, interrogé à la demande — pas de séries temporelles historisées.
- **Alerte push automatique** (e-mail/Slack en cas de panne) : volontairement absente — il n'existe pas de destinataire évident pour une alerte « système » dans une architecture où chaque organisation est isolée. Utilisez un moniteur externe sur `/api/health` (voir ci-dessus).
