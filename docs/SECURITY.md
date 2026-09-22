# Sécurité

## Mesures intégrées

- mots de passe dérivés avec `scrypt` et comparaison à temps constant ;
- MFA TOTP, avec secret chiffré en AES-256-GCM via `APP_ENCRYPTION_KEY` ;
- jetons à usage unique et durée limitée pour validation e-mail, invitations et réinitialisation de mot de passe ;
- jetons de session aléatoires, dont seul le hash est stocké ;
- cookies `HttpOnly`, `SameSite=Lax` et `Secure` sous HTTPS ;
- contrôle de l'en-tête `Origin` sur les mutations navigateur ;
- validation Zod des entrées et requêtes SQL paramétrées ;
- autorisation par rôle et organisation ;
- protection du dernier propriétaire, révocation immédiate des sessions d’un membre retiré et invalidation globale des sessions ;
- limitation de débit persistante sur l'authentification et l'IA ;
- journal d'audit sans adresse IP en clair ;
- en-têtes anti-sniffing, anti-framing, permissions et referrer policy ;
- image applicative exécutée par un utilisateur non privilégié ;
- confirmation distincte avant une action proposée par l'IA.

## Exigences de déploiement

1. Utiliser HTTPS et définir `APP_URL` avec l'origine publique exacte.
2. Remplacer toutes les valeurs d'exemple et gérer les secrets dans un coffre-fort.
3. Générer une clé `APP_ENCRYPTION_KEY` aléatoire de 32 octets, la conserver durablement et préparer sa rotation avant d’activer le MFA.
4. Configurer l’adaptateur e-mail avant de définir `REQUIRE_EMAIL_VERIFICATION=true`.
5. Conserver les rôles PostgreSQL séparés : le migrateur utilise `POSTGRES_USER`, l’application utilise le rôle non-superutilisateur `POSTGRES_APP_USER`, provisionné automatiquement sans droit DDL.
6. Restreindre l'accès réseau à PostgreSQL aux seuls services Nexora.
7. Activer sauvegardes chiffrées, restauration testée, logs centralisés et alertes.
8. Lancer `npm audit`, les tests, le smoke test et la compilation à chaque livraison.

## Signalement

Ne jamais inclure de secret, CV réel ou donnée personnelle dans un ticket public. Révoquer immédiatement toute clé exposée et invalider les sessions concernées.
