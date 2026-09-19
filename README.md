# Nexora — AI Recruitment & Career OS

Interface React 19 multi-espace : JobPilot pour les candidats, RecruitPilot pour les recruteurs, CRM entreprises/contacts, automatisations, assistant Nexora AI et administration.

## Déploiement Vercel

Projet : saas-recrutement. Dépôt : https://github.com/Marco-espirito/SAAS-recrutement

Vercel utilise Next.js et la commande npm run build:vercel, définie dans vercel.json. Installation reproductible avec npm ci. La préparation copie le worker PDF depuis la version installée de pdfjs-dist vers public ; ce fichier généré ne doit pas être commité.

Développement Vercel : npm run dev:vercel. La compilation historique Vinext/Cloudflare reste disponible avec npm run build.

## État fonctionnel constaté

L'application reste un prototype front-end interactif. Les données sont codées en dur ou conservées dans localStorage. Le PDF est analysé dans le navigateur. Le CRM, les automatisations et Nexora AI simulent les parcours produit mais ne sont pas encore reliés à une authentification, une base partagée, un LLM ni un service d'envoi d'emails.

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
