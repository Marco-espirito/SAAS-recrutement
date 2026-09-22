# Intégrations

Les adaptateurs Nexora sont génériques et désactivés par défaut. Les URL sont définies uniquement par l’exploitant via les variables d’environnement ; un utilisateur ne peut pas fournir une URL arbitraire.

## Assistant IA

`GEMINI_API_KEY` (+ `GEMINI_MODEL`, défaut `gemini-3.6-flash`) ou `OPENAI_API_KEY` (+ `OPENAI_MODEL`, défaut `gpt-5-mini`) activent l’assistant. `AI_PROVIDER=openai|gemini` force le choix explicitement ; sans cette variable, Gemini est utilisé s’il est configuré, sinon OpenAI. Aucune clé configurée → `POST /api/ai/assistant` renvoie `503 AI_NOT_CONFIGURED`.

## Offres d’emploi

`JOBS_PROVIDER_URL` reçoit un `GET` avec `query` et éventuellement `location`, plus `Authorization: Bearer <clé>`. La réponse attendue est limitée à 100 éléments et suit ce contrat :

```json
{
  "jobs": [
    {
      "id": "provider-id",
      "company": "Entreprise",
      "title": "Data Analyst",
      "location": "Lyon, France",
      "salary": "45–55 k€",
      "match": 82,
      "skills": ["SQL", "Power BI"],
      "url": "https://provider.example/jobs/provider-id"
    }
  ]
}
```

`id`, `company` et `title` sont obligatoires. Les champs `location`, `salary`, `match` et `skills` ont des valeurs par défaut ; `url`, lorsqu’il est présent, doit être une URL valide. Un champ optionnel `expiresAt` (date ISO) permet au fournisseur d’indiquer une expiration explicite. Nexora valide la réponse, impose un timeout de dix secondes et limite le débit.

Chaque offre reçue est persistée dans `job_offers` (déduplication, suivi d’expiration, conservation même si le fournisseur retire l’offre — voir `docs/ARCHITECTURE.md`). Le champ `match` renvoyé au client n’est plus celui du fournisseur : c’est le score calculé par le moteur de matching propriétaire de Nexora (`lib/domain/matching.ts`) lorsqu’un profil candidat existe ; sinon, le score brut du fournisseur reste utilisé en repli. La réponse inclut aussi `matchId`, `matchBreakdown`, `missingSkills` et `dataComplete` pour justifier le score. Le bouton de candidature crée ensuite directement une candidature tenant-isolée en base.

## E-mail

`EMAIL_PROVIDER_URL` reçoit un `POST` JSON `{ to, subject, text }`. L’appel Nexora exige `confirmed: true`, une session valide et une origine autorisée. Le destinataire n’est conservé dans l’audit que sous forme de hash.

## Calendrier

`CALENDAR_PROVIDER_URL` reçoit un `POST` JSON avec `title`, `startsAt`, `endsAt`, `attendeeEmail` et `location`. La date de fin est validée et une confirmation explicite est obligatoire.

## État

Un propriétaire ou administrateur peut appeler `GET /api/integrations/status`. La réponse expose uniquement des booléens de configuration, jamais les URL ni les secrets.
