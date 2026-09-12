# Baudouin H3

Votes d'après-match, amendes et statistiques de buts/passes pour l'équipe Baudouin H3.
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

Depuis **Gestion → Staff**, l'admin crée les comptes des secrétaires.

## Utilisation

| Qui | Comment se connecter | Que faire |
|---|---|---|
| Votant | « Je vote » puis son nom | Remplir son ticket (meilleur, pire, geste), suivre la lecture, voter ses coups de cœur |
| Orateur | « Je suis l'orateur » puis son nom | Console : ordre, mélange, étoiles, lecture, révélation d'auteur, clôture |
| Secrétaire / Admin | E-mail + mot de passe | Matchs, amendes, buts et passes, joueurs, journal d'activité |

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur de développement |
| `npm run build` | Vérification TypeScript + build de production dans `dist/` |
| `npm run typecheck` | Vérification TypeScript seule |
| `npm run emulators` | Émulateurs Firebase Auth + Firestore |
| `npm run deploy` | Build puis `firebase deploy` |

## Sécurité et confidentialité

- Les votants n'ont pas de mot de passe : l'identité est déclarative (choix du nom), comme souhaité.
- Les tickets restent anonymes pour l'orateur tant qu'il ne choisit pas d'afficher un nom ; le staff connecté
  voit les auteurs.
- Seuls les comptes staff peuvent écrire amendes, buts, joueurs et matchs : c'est garanti par `firestore.rules`,
  pas seulement par l'interface.
- Le journal d'activité (Gestion → Activité) est en ajout seul.

## Test de bout en bout

`e2e/scenario.mjs` rejoue une soirée complète (installation, match, amendes, buts, votants, orateur, lecture,
coups de cœur, rétrospective, vue mobile) avec Playwright contre les émulateurs :

```bash
npm run emulators                      # terminal 1
VITE_USE_EMULATORS=true npm run dev    # terminal 2
npx playwright install chromium        # une fois
bash e2e/reset-emulators.sh && node e2e/scenario.mjs   # terminal 3, captures dans e2e/shots/
```
