# Conformité RGPD

## Registre des traitements

| Traitement                                | Finalité                                             | Données                                                                                                          | Base légale                                            | Sous-traitants                                        |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------------- |
| Compte et session                         | Authentification, accès à l'espace                   | Email, nom, mot de passe (haché), MFA                                                                            | Exécution du contrat                                   | Hébergeur (Vercel), base de données (Neon/PostgreSQL) |
| Profil candidat                           | Matching et candidatures                             | Coordonnées, expériences, compétences, CV, analyses ATS                                                          | Exécution du contrat / intérêt légitime                | —                                                     |
| CRM recruteur                             | Suivi entreprises, contacts, pipeline                | Coordonnées professionnelles de tiers, historique d'échanges                                                     | Intérêt légitime du client Nexora                      | —                                                     |
| Portail client                            | Accès en lecture par lien pour un contact entreprise | Avancement du recrutement, sans compte                                                                           | Intérêt légitime du client Nexora                      | —                                                     |
| Connexions OAuth (Google/Microsoft/Slack) | Synchroniser e-mails, calendrier, notifications      | Jetons chiffrés, métadonnées d'e-mails/événements (objet, expéditeur, extrait, dates — jamais le corps intégral) | Consentement explicite (autorisation OAuth)            | Google, Microsoft, Slack                              |
| Assistant Nexora AI                       | Réponses contextualisées, propositions d'action      | Indicateurs agrégés uniquement, jamais les fiches CRM brutes                                                     | Consentement explicite par requête (`allowExternalAI`) | OpenAI ou Google (selon `AI_PROVIDER`)                |
| Journal d'audit                           | Traçabilité de sécurité                              | Action, type d'entité, hash d'IP (jamais l'IP en clair)                                                          | Intérêt légitime / obligation de sécurité              | —                                                     |

## Droits des personnes

- **Export (portabilité)** : `GET /api/account/export` renvoie un fichier JSON téléchargeable avec le profil candidat, les expériences, analyses ATS, correspondances d'offres, documents (métadonnées, le contenu se télécharge séparément via `/api/documents`), connexions OAuth (métadonnées seulement — jamais les jetons), propositions IA, consentements et 500 dernières entrées d'audit dont la personne est l'auteur. Limité à l'organisation actuellement active dans la session.
- **Suppression (droit à l'effacement)** : `DELETE /api/account` supprime le compte. Si la personne est l'unique membre de son organisation, l'organisation entière est supprimée (données CRM incluses). Sinon, seules ses données personnelles disparaissent (profil, expériences, analyses ATS, connexions OAuth, documents personnels non liés à une candidature/entreprise) ; les enregistrements métier de l'organisation (candidatures, documents d'entreprise) restent, avec la référence à la personne mise à `null`. Un dernier propriétaire doit transférer la propriété avant de pouvoir supprimer son compte. Un compte membre de plusieurs organisations doit contacter le support (la suppression automatique n'agit que sur l'organisation de la session en cours, pour garantir qu'elle respecte l'isolation par organisation).
- **Consentement** : `GET/POST /api/account/consents` tient un registre append-only (`GRANTED`/`REVOKED` horodatés, jamais réécrits) pour les conditions d'utilisation, la politique de confidentialité et le traitement externe par l'IA. Les deux premiers sont enregistrés automatiquement à l'inscription (voir `CURRENT_POLICY_VERSION` dans `lib/domain/legal.ts`) ; toute évolution substantielle des textes doit incrémenter cette version pour redemander le consentement.
- **Rectification** : via les écrans de profil existants (`PATCH /api/candidate/profile`, gestion CRM).

## Durées de conservation

Politique par défaut dans `lib/domain/retention.ts` (ajuster les deux ensemble — le sweep SQL n'importe pas les constantes TypeScript) :

| Donnée                                           | Durée                                                 | Mécanisme                         |
| ------------------------------------------------ | ----------------------------------------------------- | --------------------------------- |
| Journal d'audit                                  | 365 jours                                             | `run_retention_sweep()`           |
| Analyses ATS                                     | 730 jours                                             | `run_retention_sweep()`           |
| Offres expirées/retirées                         | 365 jours après leur changement de statut             | `run_retention_sweep()`           |
| Jetons de vérification e-mail / réinitialisation | Jusqu'à expiration (24h)                              | `run_retention_sweep()`           |
| Autorisations OAuth (PKCE) non utilisées         | 1 jour après expiration (10 min)                      | `run_retention_sweep()`           |
| Propositions IA                                  | Marquées `EXPIRED` à échéance, purgées 90 jours après | `run_retention_sweep()`           |
| Sessions expirées, limites de débit              | Immédiat / 24h                                        | Nettoyage existant (worker, cron) |

`run_retention_sweep()` est une fonction PostgreSQL `SECURITY DEFINER` (comme `resolve_invitation_organization`) : elle agit à travers toutes les organisations, ce qui est nécessaire car le rôle applicatif est soumis aux politiques RLS par organisation. Elle est appelée quotidiennement par le worker Docker et par le cron Vercel (`/api/internal/automation-tick`).

## Anonymisation

La suppression de compte anonymise plutôt que de casser l'intégrité référentielle : les colonnes `owner_id`, `assignee_id`, `created_by`, `actor_id` passent à `NULL` (`ON DELETE SET NULL`) sur les enregistrements métier de l'organisation, qui restent exploitables sans révéler l'identité de la personne supprimée.
