# Déploiement

Comment le site arrive en ligne, où chaque pièce est écrite, et quoi faire quand ça coince.

Adresse publique : **https://baudouinheren3.web.app**
Projet Firebase : `baudouinheren3` (numéro `456086247`), plan Spark (gratuit).
Dépôt GitHub : `CoherenceSolution/BaudouinH3`.

## 1. Ce qui se passe à chaque envoi de code

Il n'y a rien à lancer à la main, ni sur votre ordinateur ni ailleurs. Dès qu'un commit est poussé sur
`main` ou sur la branche de développement, GitHub fait tout :

```
push sur GitHub
   └─ GitHub Actions démarre le workflow « Deploy »
        1. récupère le code
        2. installe Node 22 et les dépendances (npm ci)
        3. vérifie les types et construit le site (npm run build → dossier dist/)
        4. s'authentifie auprès de Google sans aucune clé stockée
        5. firebase deploy --only hosting,firestore:rules
             ├─ dist/ part sur Firebase Hosting
             └─ firestore.rules part sur Firestore
        6. affiche l'adresse du site
```

Durée : une minute environ. Si l'étape 3 échoue (erreur de type, build cassé), le déploiement s'arrête
là et le site en ligne reste sur sa version précédente. Rien de cassé n'est jamais publié.

**Le fichier qui décrit tout ça : [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).**
Chaque étape y est nommée en français.

## 2. L'authentification sans clé

C'est le point le moins évident, donc le voici en détail.

Google interdit, sur votre organisation, la création de clés de compte de service (le message
« Key creation is not allowed on this service account » vu dans la console). Le déploiement utilise donc
la **fédération d'identité** (*Workload Identity Federation*) : GitHub présente à Google un jeton signé
prouvant « je suis une exécution du dépôt CoherenceSolution/BaudouinH3 », et Google lui prête l'identité
du compte de service `github-deploy@baudouinheren3.iam.gserviceaccount.com`.

Conséquences :

- **Aucun mot de passe ni fichier JSON n'est stocké** dans GitHub ni dans le dépôt.
- Seul ce dépôt précis peut déployer. La condition est inscrite côté Google
  (`assertion.repository == 'CoherenceSolution/BaudouinH3'`) : un autre dépôt, même copié à l'identique,
  est refusé.
- Pour couper l'accès, il suffit de supprimer le compte de service ou la fédération dans Google Cloud.

**Le fichier qui a mis ça en place : [`scripts/setup-github-deploy.sh`](scripts/setup-github-deploy.sh).**
Il a été exécuté une seule fois dans Google Cloud Shell, par le propriétaire du projet. Il active les API
nécessaires, crée le compte de service, lui donne le rôle `roles/firebase.admin`, crée la fédération et
autorise le dépôt. Il est idempotent : le relancer ne casse rien.

Un mode de repli existe : si un secret GitHub `FIREBASE_SERVICE_ACCOUNT` contenant une clé JSON est
présent, le workflow l'utilise à la place de la fédération. Aujourd'hui ce secret n'existe pas et n'est
pas nécessaire.

## 3. Les workflows GitHub

| Fichier | Quand | Ce qu'il fait |
|---|---|---|
| `.github/workflows/deploy.yml` | À chaque push sur `main` ou la branche de développement, et à la demande | Construit et publie le site + les règles Firestore |
| `.github/workflows/sync-calendar.yml` | Tous les jours vers 6 h (heure belge), et à la demande | Lit l'agenda Sportlink et met à jour les matchs dans Firestore |

Il n'y a **pas** de workflow de test sur GitHub : les vérifications tournent dans la session de travail,
gratuitement, avant chaque envoi de code. Voir la section suivante.

La synchronisation de l'agenda réutilise **la même identité sans clé** que le déploiement : le compte de
service `github-deploy` et la même fédération. Il n'y a donc rien de plus à configurer côté Google pour
elle. Les tâches planifiées de GitHub ne s'exécutent que depuis la branche `main` ; tant que le travail
vit sur la branche de développement, la synchronisation quotidienne doit être lancée à la main depuis
l'onglet *Actions*.

## 4. Les vérifications, en local et gratuites

Rien n'est publié sans avoir été vérifié, et la vérification ne consomme aucune minute GitHub : elle
tourne dans la session, sur la machine de travail.

| Commande | Durée | Ce qu'elle vérifie |
|---|---|---|
| `npm run verify` | ~30 s | Types TypeScript, tests unitaires, construction du site |
| `npm run verify:e2e` | ~2 min | Une soirée complète jouée dans un vrai navigateur, contre des émulateurs Firebase locaux |
| `npm run verify:all` | ~3 min | Les deux |

`npm run verify:e2e` ([`scripts/e2e.sh`](scripts/e2e.sh)) démarre les émulateurs Firebase et le serveur
de développement, vide les données de test, joue [`e2e/scenario.mjs`](e2e/scenario.mjs) puis arrête tout.
Le scénario crée un match, encode buts et amendes, fait voter plusieurs personnes, anime la lecture côté
orateur, vérifie l'anonymat, les classements, la rétrospective et l'affichage mobile. Il échoue si une
erreur apparaît dans la console du navigateur ; les erreurs volontaires (code faux refusé) sont annoncées
comme telles, et les ressources externes bloquées par un pare-feu sont ignorées.

Les données de test vivent dans un projet fictif `demo-baudouin-h3` servi par les émulateurs
([`firebase.e2e.json`](firebase.e2e.json), [`.env.e2e`](.env.e2e)) : **la base réelle n'est jamais
touchée**.

Chaque session de travail est préparée automatiquement par
[`.claude/hooks/session-start.sh`](.claude/hooks/session-start.sh), qui installe les dépendances et
repère le navigateur. Il n'y a donc rien à lancer à la main avant de pouvoir tester.

## 5. Ce qui est déployé, et ce qui ne l'est pas

| Déployé à chaque push | Pas déployé |
|---|---|
| Le site (`dist/`, produit par Vite) vers Firebase Hosting | Les données : joueurs, votes, amendes, buts restent dans Firestore, jamais écrasés |
| Les règles de sécurité `firestore.rules` | Les comptes et mots de passe (Firebase Authentication) |
| | Les paramètres de la console Firebase (méthodes de connexion, région) |

La correspondance est écrite dans [`firebase.json`](firebase.json) : `hosting.public` vaut `dist`, et la
règle de réécriture envoie toutes les adresses vers `index.html` (nécessaire pour une application à page
unique : `/amendes` doit fonctionner même en accès direct).

Le projet visé est écrit dans [`.firebaserc`](.firebaserc) et répété dans le workflow (`PROJECT_ID`).

## 6. Les clés Firebase du navigateur

[`.env.production`](.env.production) contient la configuration Firebase de l'application web
(`apiKey`, `authDomain`, `projectId`…). Ce fichier est **committé volontairement** : ces valeurs ne sont
pas des secrets, elles sont livrées dans le navigateur de chaque utilisateur et visibles par n'importe
qui inspecte la page. Ce qui protège les données, ce sont les règles `firestore.rules`, pas ces clés.

En revanche `.env` (développement local) est ignoré par git, voir [`.gitignore`](.gitignore).

## 7. Vérifier un déploiement

- **L'historique complet** : https://github.com/CoherenceSolution/BaudouinH3/actions
  Une ligne par envoi de code, avec une coche verte ou une croix rouge. Cliquer dessus montre chaque
  étape et ses messages.
- **La version en ligne** : ouvrir https://baudouinheren3.web.app et forcer le rechargement
  (sur téléphone, fermer complètement l'onglet et rouvrir).
- **Côté Firebase** : console Firebase → Hosting, qui liste les versions publiées avec leur date.

## 8. Cas particuliers

**Déclencher un déploiement sans changer le code.** Onglet *Actions* du dépôt → workflow *Deploy* →
bouton *Run workflow*. C'est prévu par la ligne `workflow_dispatch` du fichier.

**Revenir en arrière.** Console Firebase → Hosting → l'historique des versions propose « Restaurer »
sur une version précédente. Le site revient instantanément à cet état. Attention : cela ne remet pas les
règles Firestore en arrière, et le prochain push republiera la version du dépôt.

**Changer de branche déclencheuse.** La ligne `branches: [main, claude/wonderful-heisenberg-3b07bp]`
dans le workflow. Quand la branche de développement sera fusionnée dans `main`, on pourra ne garder
que `main`.

**Déployer depuis un ordinateur**, quand GitHub est indisponible ou bloqué (facturation, panne) :

```bash
npm install -g firebase-tools   # une seule fois
firebase login                  # une seule fois, avec le compte propriétaire du projet
npm run deploy                  # construit puis publie Hosting + règles Firestore
```

C'est exactement ce que fait le workflow, en local. La commande est définie dans
[`package.json`](package.json). Le déploiement automatique reprend ensuite sans rien faire de plus.

**Savoir quelle version est réellement en ligne.** Un push ne garantit rien : c'est le déploiement qui
compte. L'onglet *Actions* donne la réponse — le dernier *Deploy* avec une coche verte, et le commit
qu'il portait. Si les déploiements suivants ont échoué, le site est resté sur cette version-là, même si
le dépôt a beaucoup avancé depuis.

## 9. Si un déploiement échoue

Le détail est toujours dans l'onglet *Actions*, sur l'étape marquée en rouge.

| Message | Cause | Solution |
|---|---|---|
| `The job was not started because recent account payments have failed or your spending limit needs to be increased` | Facturation GitHub : minutes d'exécution épuisées ou paiement en échec. Le travail n'a jamais démarré (il échoue en deux secondes, sans aucune étape) | Régler dans GitHub → *Settings* → *Billing & plans*. En attendant, déployer depuis un ordinateur (section 7) |
| `failed to generate Google Cloud federated token … invalid_target` | La fédération n'existe pas ou est incomplète côté Google | Rejouer `scripts/setup-github-deploy.sh` dans Cloud Shell, avec le compte propriétaire du projet |
| `Permission denied` sur le déploiement | Le compte de service a perdu son rôle | Même script : il réattribue `roles/firebase.admin` |
| Erreur à l'étape « Vérification et build » | Erreur de code (types, import) | Corriger le code ; le site en ligne n'a pas bougé |
| `HTTP Error: 403` sur Firestore | API désactivée sur le projet | Le script réactive les API nécessaires |

## 10. Résumé : où est écrit quoi

| Fichier | Rôle |
|---|---|
| `.github/workflows/deploy.yml` | Le déploiement : quand, quoi, comment |
| `.github/workflows/sync-calendar.yml` | Synchronisation quotidienne de l'agenda Sportlink |
| `scripts/calendar/sync.mjs` | Le programme de synchronisation lancé par ce workflow |
| `scripts/e2e.sh` | Le test de bout en bout : émulateurs, serveur, scénario, arrêt |
| `e2e/scenario.mjs` | Le scénario joué dans le navigateur |
| `firebase.e2e.json`, `.env.e2e` | La configuration du projet fictif utilisé par les tests |
| `.claude/hooks/session-start.sh` | Préparation automatique de chaque session de travail |
| `scripts/setup-github-deploy.sh` | La configuration unique côté Google (compte de service, fédération) |
| `firebase.json` | Quel dossier publier, les réécritures, les fichiers de règles, les ports des émulateurs |
| `.firebaserc` | Le projet Firebase visé |
| `firestore.rules` | Les règles de sécurité déployées avec le site |
| `.env.production` | La configuration Firebase publique du navigateur |
| `package.json` | Les commandes `build`, `deploy`, `emulators` |
| `README.md` | Prise en main générale |
| `ARCHITECTURE.md` | Modèle de données, rôles, choix techniques |
| `DEPLOIEMENT.md` | Ce document |
