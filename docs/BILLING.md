# Facturation (Stripe)

Le code est présent et testé (signature de webhook vérifiée avec un secret local, sans compte Stripe réel — voir `tests/integration/billing-webhook.test.ts`), mais **aucune transaction réelle n'est possible tant que vous n'avez pas créé les produits/prix Stripe et renseigné les variables ci-dessous**. Créer le compte Stripe, les produits et les prix reste entièrement de votre ressort.

## Ce qui existe déjà

- Chaque organisation démarre avec 14 jours d'essai du plan Starter (`lib/domain/billing.ts`), redescend automatiquement en Gratuit à l'échéance sans abonnement Stripe actif (`expire_billing_trials()`, appelée quotidiennement par le worker/cron).
- Quotas par plan (sièges, requêtes IA par mois) — `lib/domain/billing.ts`, appliqués avant chaque appel à l'assistant IA (`assertAiQuotaAvailable`, renvoie `429 AI_QUOTA_EXCEEDED` au-delà).
- `GET /api/billing` : plan, statut, essai, consommation IA du mois, sièges utilisés.
- `POST /api/billing/checkout` (OWNER) : crée une session Stripe Checkout et redirige.
- `POST /api/billing/portal` (OWNER) : ouvre le portail Stripe pour gérer moyen de paiement/factures/résiliation.
- `POST /api/billing/webhook` : reçoit `checkout.session.completed`, `customer.subscription.created/updated/deleted`. Idempotent (`stripe_webhook_events`, un événement redélivré par Stripe n'est jamais retraité).
- Onglet « Facturation » (Admin), affiche « non configurée » proprement tant que `STRIPE_SECRET_KEY` est absent — le plan Gratuit fonctionne sans Stripe.

## À faire pour activer

1. Créer un produit **Starter** et un produit **Pro** sur [dashboard.stripe.com](https://dashboard.stripe.com), chacun avec un prix récurrent mensuel. Notez leurs **Price ID** (`price_...`).
2. **Developers → API keys** : copiez la clé secrète (`sk_...`, celle de **test** d'abord).
3. **Developers → Webhooks → Add endpoint** : URL `{APP_URL}/api/billing/webhook`, événements à écouter : `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`. Copiez le **Signing secret** (`whsec_...`).
4. **Settings → Billing → Customer portal** : activez le portail client (nécessaire pour `POST /api/billing/portal`).
5. Renseignez côté serveur : `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO`.
6. Testez d'abord en mode **test** Stripe (cartes de test, jamais de vrai paiement) avant de basculer sur les clés **live**.

## Limites actuelles

- Les plans et leurs limites (`lib/domain/billing.ts`) sont des valeurs de code, pas administrables depuis l'interface — les modifier demande un déploiement.
- Pas de facturation à l'usage (metered billing) : uniquement des abonnements à prix fixe.
- « Gestion des organisations » ici signifie gérer **sa propre** organisation (plan, essai, sièges) — il n'existe pas de panneau super-admin inter-organisations ; l'architecture isole chaque organisation par RLS, y compris pour un futur opérateur de la plateforme.
