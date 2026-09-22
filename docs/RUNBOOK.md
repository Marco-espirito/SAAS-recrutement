# Runbook d'exploitation

## Contrôles rapides

```bash
docker compose ps
docker compose logs --tail 200 nexora worker postgres
curl --fail http://localhost:3000/api/live
curl --fail http://localhost:3000/api/health
```

## Redémarrage

```bash
docker compose restart nexora worker
```

Les exécutions encore `QUEUED` restent en base. Une exécution interrompue après son passage à `RUNNING` doit être examinée avant toute remise en file afin d'éviter une action en double.

## Sauvegarde locale PostgreSQL

```bash
docker compose exec -T postgres pg_dump -U nexora -d nexora -Fc > nexora.dump
```

En production, automatiser la sauvegarde vers un stockage chiffré et tester régulièrement la restauration dans un environnement isolé.

## Migrations

Le service `migrate` s'exécute avant l'application. Une migration dont le checksum diffère est refusée. Corriger une erreur par une nouvelle migration ; ne pas modifier l'historique appliqué.

## Incident IA

Retirer `OPENAI_API_KEY` et redémarrer `nexora` désactive uniquement l'assistant. Les fonctions CRM et automatisations locales restent disponibles.
