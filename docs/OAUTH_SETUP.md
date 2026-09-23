# Connexions OAuth Nexora

Le code OAuth est présent, mais aucune connexion réelle ne peut être validée avant l'enregistrement des applications Google, Microsoft et Slack. Ne placez jamais les secrets dans Git ni dans une conversation : utilisez les variables d'environnement du déploiement.

## Préparation commune

1. Définir `APP_URL` sur l'origine publique exacte, en HTTPS en production, sans chemin final. Configurer `APP_ENCRYPTION_KEY` avec 32 octets aléatoires encodés en base64 et le garder stable : changer cette clé rend les jetons déjà chiffrés illisibles.
2. Appliquer la migration `009_oauth_integrations.sql` sur la base correspondant au déploiement concerné, après vérification de la cible et sauvegarde. Ne pas copier la base de test sur la production.
3. Enregistrer les URL de rappel ci-dessous dans les consoles fournisseur. Les URL doivent correspondre à `APP_URL` ; un déploiement Preview avec une autre origine a besoin de ses propres URL et variables.
4. Renseigner les identifiants dans l'environnement serveur, redéployer, puis connecter un compte depuis « Admin → Intégrations ». L'interface signale les fournisseurs non configurés.

| Fournisseur | URL de rappel | Variables serveur | Permissions demandées |
| --- | --- | --- | --- |
| Google | `{APP_URL}/api/integrations/oauth/google/callback` | `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | `openid`, `email`, `gmail.readonly`, `gmail.send`, `calendar.events` |
| Microsoft Entra | `{APP_URL}/api/integrations/oauth/microsoft/callback` | `MICROSOFT_OAUTH_CLIENT_ID`, `MICROSOFT_OAUTH_CLIENT_SECRET`, `MICROSOFT_OAUTH_TENANT` | `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.ReadWrite`, `ChannelMessage.Send` (déléguées) |
| Slack | `{APP_URL}/api/integrations/oauth/slack/callback` | `SLACK_OAUTH_CLIENT_ID`, `SLACK_OAUTH_CLIENT_SECRET` | bot `chat:write` |

`MICROSOFT_OAUTH_TENANT` vaut `organizations` par défaut ; on peut utiliser `common`, `consumers` ou l'ID du locataire selon le public visé. Teams utilise **la même application Microsoft**, pas une quatrième application OAuth. L'envoi Teams exige l'ID d'une équipe et d'un canal auxquels l'utilisateur a accès. Certaines permissions Microsoft peuvent nécessiter le consentement d'un administrateur. Les scopes Gmail peuvent nécessiter la procédure de vérification Google avant une ouverture publique.

## Comportement et limites

- Le démarrage utilise un `state` à usage unique ; Google et Microsoft ajoutent PKCE S256. Les jetons et le vérificateur PKCE sont chiffrés côté serveur. Chaque connexion est liée à un utilisateur et une organisation. Déconnecter efface les jetons stockés ; cela ne révoque pas automatiquement le consentement dans la console fournisseur.
- Gmail importe d'abord les 20 messages les plus récents, puis suit les changements via History API. Google Calendar utilise un `syncToken`. Outlook et son calendrier utilisent les liens delta Microsoft Graph. Les copies locales ne stockent que l'objet, l'expéditeur, un extrait et les dates ; pas le corps intégral des messages.
- L'interface permet la synchronisation manuelle. Le worker Docker tente un passage toutes les minutes et planifie le prochain passage environ 15 minutes après un succès ; sur Vercel, le cron actuel est quotidien. Il n'y a pas de webhooks fournisseur : la réception n'est donc pas instantanée.
- Les opérations sortantes sont explicites : envoi d'un e-mail, création d'un événement ou publication d'une notification. La modification/suppression d'un événement distant, la réponse à un message, la lecture des conversations Slack/Teams et la résolution automatique des conflits ne sont pas implémentées. Un échec après acceptation par le fournisseur mais avant l'enregistrement local peut nécessiter de vérifier le compte distant avant un nouvel envoi, afin d'éviter un doublon.
- Le connecteur Gmail signale une erreur si une page d'historique dépasse sa limite de traitement ; il ne saute pas silencieusement des changements. Une intervention ou une resynchronisation complète peut alors être nécessaire. Les expirations de curseurs Gmail/Calendar remettent le curseur à zéro et marquent les anciennes copies concernées comme supprimées avant le prochain import.

## Vérification après configuration

Créer un compte de test par fournisseur ; autoriser Nexora ; confirmer l'identité affichée ; lancer une synchronisation ; créer un e-mail et un événement de test avec confirmation explicite ; vérifier leur présence côté fournisseur et le retour des changements entrants après le passage suivant. Vérifier enfin le refus d'accès depuis une autre organisation, la déconnexion, et le renouvellement du jeton après expiration. Ces essais ne peuvent pas être exécutés sans applications OAuth et comptes de test.

Références officielles : [Google OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Gmail Sync](https://developers.google.com/workspace/gmail/api/guides/sync), [Google Calendar Sync](https://developers.google.com/workspace/calendar/api/guides/sync), [Microsoft OAuth](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow), [Microsoft Graph delta](https://learn.microsoft.com/en-us/graph/delta-query-events), [Slack OAuth](https://docs.slack.dev/authentication/installing-with-oauth/).
