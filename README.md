# Baudouin H3

Votes d'après-match, suivi de la coum, amendes et statistiques de buts/passes pour l'équipe Baudouin H3.
Stack : React + Vite + TypeScript + Tailwind, données et hébergement Firebase (plan gratuit).

L'architecture détaillée est dans [ARCHITECTURE.md](./ARCHITECTURE.md).

## Mise en route (10 minutes)

### 1. Créer le projet Firebase

1. Sur <https://console.firebase.google.com>, créez un projet (ex. `baudouin-h3`). Le plan Spark (gratuit) suffit,
   aucune carte bancaire n'est demandée.
2. **Authentication → Sign-in method** : activez **E-mail/Mot de passe** et **Anonyme**.
3. **Firestore Database** : créez la base en mode production (les règles seront déployées à l'étape 4),
   région `europe-west1` (Belgique).
4. **Paramètres du projet → Vos applications → Ajouter une application Web** : copiez la configuration.

### 2. Configurer l'application

```bash
git clone <ce dépôt> && cd BaudouinH3
npm install
cp .env.example .env      # collez-y les clés de la configuration Firebase
```

Remplacez aussi `baudouin-h3` par l'identifiant de votre projet dans `.firebaserc`.

### 3. Lancer en local

```bash
npm run dev               # http://localhost:5173
```

Pour travailler sans toucher aux vraies données, utilisez les émulateurs (Java requis) :

```bash
npm run emulators         # Auth + Firestore locaux
# dans .env : VITE_USE_EMULATORS=true
npm run dev
```

### 4. Déployer

```bash
npm install -g firebase-tools
firebase login
firebase deploy           # déploie les règles Firestore + le site (npm run build est lancé par npm run deploy)
```

Le site est servi sur `https://<projet>.web.app`. Les membres peuvent l'ajouter à leur écran d'accueil (PWA).

### 5. Première utilisation

Au premier chargement, l'application affiche **Première installation** : créez le compte administrateur.
L'équipe (21 joueurs), le barème d'amendes (retard 1 €/min après 5 min plafonné à 15 €, équipement, cartons)
et deux catégories maison sont préchargés. Cet écran n'apparaît plus ensuite.

Depuis **Gestion → Staff**, l'admin définit le code commun des secrétaires et choisit quels joueurs ont les droits.

### Surnoms

Chaque joueur peut recevoir un **surnom** (Gestion → Joueurs, champ « Surnom » à l'ajout ou via le crayon).
Le surnom remplace alors le nom partout à l'écran — listes de vote, classements, amendes, statistiques — le nom
complet restant affiché en petit dessous dans les écrans de gestion et les sélecteurs. Les recherches acceptent
indifféremment le prénom, le nom ou le surnom. La connexion, elle, se fait toujours par le prénom et le nom :
le surnom n'y est pas accepté.

### Vote « commentaire d'abord »

Dans le formulaire de vote, chaque catégorie porte une case **« Demander à l'orateur de lire le commentaire avant
le nom »**. Quand elle est cochée, la console de l'orateur place le commentaire au-dessus et remplace le nom par
un bouton **« Annoncer le nom »**, avec la consigne, la première fois : « Lisez d'abord le commentaire, puis
annoncez le nom voté. » Un appui affiche le nom dans sa console.

C'est un simple guide de lecture : rien n'est caché ailleurs. La lecture en direct, les classements et la
rétrospective affichent le vote normalement pour tout le monde.

## Utilisation

| Qui | Comment se connecter | Que faire |
|---|---|---|
| Votant | « Je vote » puis prénom et nom | Remplir son vote (trois catégories), suivre la lecture et le compte à rebours, voter ses coups de cœur, voir qui a coumé |
| Orateur | « Je suis l'orateur » puis prénom et nom | Console : ordre, mélange, étoiles, lecture guidée (commentaire avant le nom), révélation d'auteur, clôture |
| Secrétaire | « Je vote », prénom et nom, puis le code commun (une fois par téléphone) | Matchs, **coum** (qui a payé, absents, recoum), minuteur des votes, amendes, buts et passes, joueurs, listes maison, paramètres, journal d'activité |
| Administrateur | E-mail + mot de passe | Tout ce que fait le secrétaire + droits des joueurs et code commun (Gestion → Staff) |

### Agenda Sportlink (matchs automatiques)

Les matchs de l'équipe arrivent tout seuls depuis l'agenda Sportlink : plus besoin de les créer à la main.

**Mise en place (une fois, 1 minute)** : l'admin ou un secrétaire colle le lien de l'agenda
(`https://data.sportlink.com/ical-team?token=…`) dans **Gestion → Paramètres → Agenda Sportlink** et enregistre.
C'est tout : la synchronisation utilise le même accès Google que le déploiement automatique.

- **Chaque matin (vers 6 h)**, les matchs à venir sont ajoutés, avec la date, l'heure, le lieu (lien Google Maps)
  et l'adversaire ; domicile ou extérieur est déduit du titre « Équipe A - Équipe B ».
- **Match déplacé ou avancé** dans Sportlink : la date, l'heure et le lieu sont mis à jour dans l'application
  (et notés dans le journal d'activité).
- **Match retiré de l'agenda** : il est marqué « Annulé », jamais supprimé.
- **Jamais touchés** : les matchs passés (non importés), les scores, la compétition, les votes, la coum, les buts.
- **Votes** : un match à venir est grisé, on peut l'ouvrir pour voir la date, l'heure et le lieu. Les votes
  s'ouvrent automatiquement **le jour du match**.
- Les matchs ajoutés à la main (amical, tournoi…) restent possibles ; la synchronisation n'y touche pas.
- Pour synchroniser tout de suite : GitHub → onglet **Actions** → « Synchroniser l'agenda » → **Run workflow**.
  La dernière synchronisation (ou son erreur) s'affiche dans Gestion → Paramètres et Gestion → Matchs.

À savoir : GitHub n'exécute les tâches planifiées que depuis la branche `main`, et les suspend après 60 jours
sans aucune activité sur le dépôt (un clic sur « Enable workflow » dans l'onglet Actions les relance).

### La coum

Onglet **Coum** de chaque match : une feuille du moment, pour les présents du jour. On garde simplement la trace
de qui a coumé — pas de montants, pas de caisse, pas d'historique de saison, et rien à voir avec les amendes.

- Le trésorier (secrétaire ou admin) clique **A payé** quand un joueur lui donne sa coum.
- Un joueur peut être noté **absent** : il ne doit rien pour ce match.
- **Recoumer les présents** redemande une coum à tous ceux qui sont là (ou joueur par joueur avec l'icône ↻) :
  ceux qui avaient déjà payé repassent « pas encore » pour le tour suivant.
- Quand tous les présents ont payé, la feuille affiche « Tout le monde a coumé » : c'est terminé.
- Tout le monde voit qui a coumé ; seuls le secrétaire et l'admin tiennent la liste à jour.

### Minuteur des votes

Dans la console, l'admin ou un secrétaire lance un compte à rebours (5, 10, 15 minutes ou une durée libre),
le prolonge (+ 2 min) ou l'arrête. Tout le monde voit le temps restant sur les pages du match ; ceux qui n'ont
pas encore envoyé leur vote lisent « Il vous reste du temps pour voter ». Rien ne se ferme tout seul : la clôture
reste un geste de l'orateur.

### Alerte en direct

Pendant la lecture, dès qu'un joueur atteint **3 voix** dans une catégorie (seuil réglable dans Gestion →
Paramètres), un bandeau le signale dans l'onglet « En direct » et le vote lu porte un badge « 3ᵉ voix ».

### Listes maison

Gestion → **Listes** rassemble les listes du genre « Papa de l'année » ou « Homme du match » : création,
renommage, masquage et **suppression** (la suppression efface aussi les entrées de la liste). Elles s'affichent
dans l'onglet Stats.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification TypeScript + build de production dans `dist/` |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm run emulators` | Émulateurs Firebase Auth + Firestore |
| `npm run deploy` | Build puis `firebase deploy` |
| `npm test` | Tests de la lecture de l'agenda et de la synchronisation |
| `npm run sync:calendar` | Synchronisation de l'agenda Sportlink (identifiants Google requis ; `SYNC_DRY_RUN=1` pour un essai à blanc) |

## Sécurité et confidentialité

- Les votants n'ont pas de mot de passe : l'identité est déclarative (saisie du nom), comme souhaité.
- Les secrétaires n'ont pas de mot de passe personnel : un code commun, fixé par l'admin, active leurs droits.
- Les tickets restent anonymes pour l'orateur tant qu'il ne choisit pas d'afficher un nom ; le staff connecté
  voit les auteurs.
- Seuls les comptes staff peuvent écrire amendes, coums, buts, joueurs et matchs : c'est garanti par `firestore.rules`,
  pas seulement par l'interface. Le minuteur des votes est lui aussi réservé à l'admin et aux secrétaires.
- Le journal d'activité (Gestion → Activité) est en ajout seul.

## Test de bout en bout

`e2e/scenario.mjs` rejoue une soirée complète (installation, match, surnoms, coum, amendes, buts, minuteur des
votes, votants, vote « commentaire d'abord », orateur, lecture guidée, alerte à 3 voix, coups de cœur, listes
maison, rétrospective, vue mobile) avec Playwright contre les émulateurs :

```bash
npm run emulators                      # terminal 1
VITE_USE_EMULATORS=true npm run dev    # terminal 2
npx playwright install chromium        # une fois
bash e2e/reset-emulators.sh && node e2e/scenario.mjs   # terminal 3, captures dans e2e/shots/
```

## Déploiement automatique (GitHub Actions)

Chaque push sur `main` (ou sur la branche de développement) construit et déploie le site sur Firebase via
`.github/workflows/deploy.yml`, **sans aucune clé stockée** : GitHub s'authentifie auprès de Google par
fédération d'identité (Workload Identity Federation), ce qui respecte les organisations qui interdisent les
clés de compte de service.

Mise en place unique, par le propriétaire du projet Firebase :

1. Ouvrir https://shell.cloud.google.com (Cloud Shell, dans le navigateur, rien à installer).
2. Coller et exécuter le contenu de `scripts/setup-github-deploy.sh`.
3. C'est tout : le prochain push déclenche le déploiement. L'onglet **Actions** du dépôt GitHub montre le résultat.

Repli : si un secret GitHub `FIREBASE_SERVICE_ACCOUNT` (clé JSON d'un compte de service) existe, le workflow
l'utilise à la place de la fédération.
