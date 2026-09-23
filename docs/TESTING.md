# Tests

Quatre niveaux, du plus rapide au plus coûteux.

## 1. Unitaires (`npm test`)

Fonctions pures de `lib/domain/*` uniquement — aucune base de données, aucun réseau. C'est la suite qui tourne à chaque commit (`quality` dans la CI) ; elle doit rester rapide.

## 2. API contre une vraie base (`npm run test:integration`)

Appelle directement les handlers de route (`GET`/`POST`/... exportés par `app/api/**/route.ts`) contre une vraie instance PostgreSQL — pas de mock de la base, pas de serveur HTTP. C'est le seul niveau qui vérifie réellement les politiques RLS (l'isolation entre organisations ne peut pas être testée avec une base mockée, puisque RLS est appliqué par PostgreSQL lui-même).

`next/headers` (utilisé par `lib/server/auth.ts` pour lire/écrire le cookie de session) n'existe que dans le contexte d'une requête Next.js réelle ; `vitest.integration.config.ts` l'alias vers `tests/next-headers.ts`, un magasin de cookies en mémoire. Appelez `resetTestCookies()` entre les tests pour éviter qu'une session fuite d'un test à l'autre.

Prérequis : une base PostgreSQL jetable, migrée, à laquelle on se connecte **via le rôle applicatif** (pas le superutilisateur — sinon RLS est ignoré silencieusement et les tests d'isolation ne prouvent rien) :

```bash
# Démarrer une base jetable (ou réutiliser celle de docker-compose)
docker run -d --name nexora-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=nexora_test -p 55432:5432 postgres:17-alpine

# Migrer et provisionner le rôle applicatif
DATABASE_URL="postgresql://postgres:test@localhost:55432/nexora_test" \
POSTGRES_APP_USER=nexora_app_test POSTGRES_APP_PASSWORD=test_app_password \
npm run db:migrate

# Lancer les tests en tant que rôle applicatif
DATABASE_URL="postgresql://nexora_app_test:test_app_password@localhost:55432/nexora_test" \
APP_URL="http://localhost:3000" \
npm run test:integration
```

La CI (`integration` dans `.github/workflows/ci.yml`) fait exactement ceci avec un service Postgres GitHub Actions.

## 3. Bout en bout, accessibilité et mobile (`npm run test:e2e`)

Playwright pilote un vrai navigateur contre un vrai serveur Next.js (`npm run dev`, démarré automatiquement par `playwright.config.ts` si `E2E_SKIP_WEBSERVER` n'est pas défini). Deux projets :

- `desktop` (Chromium) ;
- `mobile` (Chromium avec l'émulation Pixel 7 — volontairement pas le préréglage iPhone, qui utilise WebKit et exigerait un second navigateur à installer).

`tests/e2e/accessibility.spec.ts` utilise `@axe-core/playwright` et échoue sur toute violation WCAG 2.0/2.1 A/AA de gravité `serious` ou `critical`. `tests/e2e/responsive.spec.ts` vérifie l'absence de défilement horizontal.

Prérequis : navigateur Chromium installé (`npx playwright install chromium`), plus une base migrée comme pour les tests d'intégration (le serveur `next dev` démarré par Playwright a besoin de `DATABASE_URL`/`APP_URL` dans l'environnement).

```bash
DATABASE_URL="postgresql://nexora_app_test:test_app_password@localhost:55432/nexora_test" \
APP_URL="http://localhost:3100" \
npm run test:e2e
```

## 4. Charge (`tests/load/*.js`, k6)

**Jamais exécutés automatiquement, ni par une CI, ni par un agent — vous seul décidez quand et contre quel environnement.** Lancer un test de charge contre la production peut dégrader le service réel et coûter du compute Neon inutilement.

- `tests/load/health-check.js` : lecture seule (`GET /api/health`), sans risque, sert de ligne de base.
- `tests/load/authenticated-read.js` : exige un compte de test que vous créez vous-même au préalable (`LOAD_TEST_EMAIL`/`LOAD_TEST_PASSWORD`) — le script ne crée jamais de compte, pour ne jamais polluer une base avec des inscriptions en masse.

```bash
# Installer k6 : https://grafana.com/docs/k6/latest/set-up/install-k6/
BASE_URL=https://votre-environnement-de-test.example npm run test:load
```
