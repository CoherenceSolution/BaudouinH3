# Baudouin H3 — Architecture

Application web légère pour l'équipe Baudouin H3 : votes d'après-match (meilleur joueur, pire joueur,
geste marquant), gestion des amendes, statistiques de buts et passes décisives, journal d'activité.

## 1. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Hébergement + données | **Firebase, plan Spark (gratuit)** : Firestore, Authentication, Hosting | 0 €/mois à l'échelle d'une équipe (quota : 50 000 lectures et 20 000 écritures par jour). Temps réel natif pour les classements. Aucun serveur à maintenir. |
| Cloud Functions | **Aucune** | Elles imposent le plan payant (Blaze). Toute la logique tourne dans le navigateur, la sécurité repose sur les règles Firestore. |
| Frontend | **React 19 + Vite 7 + TypeScript + Tailwind CSS 4** | Rapide à développer, bundle léger, installable comme PWA sur téléphone. |
| Routage | react-router 7 | SPA, une seule page HTML servie par Firebase Hosting. |
| Icônes | lucide-react | Sobres, cohérentes avec le style épuré. |
| Cache local | Firestore `persistentLocalCache` | L'application reste lisible hors ligne (vestiaire sans réseau) et se synchronise dès le retour du réseau. |

Alternatives étudiées : Scalingo (≈ 15 €/mois, pas de palier gratuit), Supabase gratuit (projet mis en pause après 7 jours
d'inactivité), Cloudflare Pages + D1 (gratuit mais temps réel à recoder), VPS + PocketBase (≈ 4 €/mois, administration à charge).

## 2. Rôles et authentification

| Rôle | Connexion | Peut |
|---|---|---|
| **Membre public (votant)** | Connexion anonyme Firebase + saisie de son prénom et de son nom, ou de son seul surnom, qui doivent correspondre à un joueur de l'équipe (comparaison sans accents ni majuscules). Identité mémorisée sur l'appareil. | Remplir et modifier son vote (y compris demander que l'orateur lise le commentaire avant le nom), suivre la lecture, voter « coup de cœur », consulter amendes et stats. |
| **Orateur** | Idem membre public, en cochant « Je suis l'orateur » à la connexion (choix libre, sur base de confiance). | Voir qui a voté et la complétion, réorganiser / mélanger l'ordre, attribuer des petites étoiles, conserver des tickets, annoncer chaque lecture, annoncer les noms mis en suspense, afficher le nom d'un auteur, clôturer les votes et terminer la soirée. |
| **Secrétaire** | Aucun e-mail ni mot de passe personnel. L'admin accorde les droits à un joueur (`players.role = 'secretary'`). Le membre se connecte par son nom, puis entre une fois le **code commun** (4 à 8 chiffres) fixé par l'admin ; ce code ouvre un compte technique partagé (`staff/{uid}`, rôle `secretary`, `shared: true`) qui reste connecté sur l'appareil. | Tout ce que fait l'orateur + créer/modifier les matchs, infliger des amendes, gérer le barème, encoder buts et passes, gérer les catégories maison, ajouter des joueurs à la volée, paramètres, journal d'activité. |
| **Administrateur** | Seul compte e-mail + mot de passe (Firebase Auth), rôle `admin` dans `staff/{uid}`, relié à un joueur pour voter. | Tout ce que fait le secrétaire + accorder/retirer les droits de secrétaire, définir ou changer le code commun. |

Première installation : au premier lancement, si `config/bootstrap` n'existe pas, l'application affiche un écran
« Première installation » qui crée le compte admin, le document `config/bootstrap` et précharge l'équipe
(21 joueurs), le barème d'amendes et deux catégories maison, en une seule écriture atomique.

Le compte technique des secrétaires est créé par l'admin depuis l'application via une **instance Firebase
secondaire** (sans déconnecter l'admin, sans Cloud Functions). Le code est le mot de passe de ce compte
(préfixé), stocké nulle part en clair ; en cas d'oubli, l'admin crée un nouvel accès et l'ancien code cesse de
fonctionner. Ce choix garde les règles Firestore verrouillées : sans le code, aucune écriture n'est possible même
en connaissant le nom d'un secrétaire.

## 3. Modèle de données Firestore

```
config/bootstrap              { claimedBy, at }
staff/{uid}                   { email, displayName, role: 'admin'|'secretary', playerId, createdAt }
config/settings               { categories: { best|worst|moment: { label, emoji } } }
config/secretaryAccess        { email, uid, updatedAt }   ← compte technique courant des secrétaires
players/{id}                  { firstName, lastName, nickname, active, role: 'secretary'|null, createdAt }
matches/{id}                  { date, opponent, competition, home, homeScore, awayScore,
                                status: 'voting'|'reading'|'closed',
                                speakerName, speakerUid, readingStartedAt, closedAt, createdBy, createdAt, updatedAt }
tickets/{matchId_authorId}    { matchId, authorPlayerId, authorUids[],
                                best:{playerId, proposal, comment, commentFirst, nameRevealed}, worst:{…}, moment:{…},
                                status: 'draft'|'submitted', readAt, readOrder, starred, saved, revealAuthor,
                                createdAt, updatedAt }
likes/{matchId_voterId_cat}   { matchId, voterPlayerId, category, ticketId, createdAt }
goals/{id}                    { matchId, scorerPlayerId, assistPlayerId, minute, order, createdAt }
fineTypes/{id}                { label, description, kind: 'fixed'|'perUnit', amount, unitLabel, freeUnits, cap, active, order }
fines/{id}                    { playerId, fineTypeId, label, matchId, date, quantity, amount, note, paid, paidAt,
                                createdBy, createdByName, createdAt }
statCategories/{id}           { label, emoji, active, order }
statEntries/{id}              { categoryId, playerId, matchId, date, value, note, createdBy, createdAt }
activity/{id}                 { actorUid, actorName, actorRole, action: 'create'|'update'|'delete',
                                entity, entityId, summary, at }
```

Points de conception :

- **Un vote par auteur et par match** (« ticket » dans le code, « vote » à l'écran) : l'identifiant `matchId_authorPlayerId`
  garantit l'unicité sans requête. Le champ `authorUids` accumule les appareils ayant modifié le vote ; le votant et
  l'orateur voient un avertissement « double auteur » si plusieurs appareils ont touché le même vote.
- **Catégories renommables** : les libellés et emojis des trois catégories vivent dans `config/settings`
  (Gestion → Paramètres) ; chacune désigne un joueur et porte un commentaire lu à voix haute.
- **Anonymat** : les votes lus sont anonymes pour tout le monde, staff compris. Seul l'orateur peut, vote par vote,
  consulter le nom de l'auteur dans sa console (`revealAuthor`), sans que ce nom soit montré ailleurs.
- **Surnoms** : `players.nickname` (facultatif) devient le nom affiché partout (`playerName`), le nom d'état civil
  restant disponible (`fullName`) pour les écrans de gestion, le journal d'activité et les exports (`playerFullLabel`).
  Les recherches et la connexion comparent prénom, nom **et** surnom, sans accents ni majuscules (`playerMatches`).
- **« Commentaire d'abord »** : le votant coche `commentFirst` sur une catégorie ; le nom désigné est alors masqué
  pour tout le monde, orateur compris, et l'ordre d'affichage s'inverse (commentaire, puis nom). L'orateur appuie
  sur « Annoncer le nom » (`nameRevealed`, écrit dans le ticket, donc partagé en temps réel). Tant qu'un nom n'est
  pas annoncé, il ne compte pas dans le classement du match ; terminer la soirée révèle ce qui reste, pour que la
  rétrospective de saison n'en perde aucun.
- **Brouillon auto-sauvegardé** : chaque modification écrit un `draft` après 800 ms ; l'orateur et le staff voient
  ainsi la complétion (0/3, 1/3, 2/3) des votes ouverts mais non envoyés.
- **Classements en temps réel** : seuls les tickets `submitted` **et** `readAt != null` comptent. Le compteur bouge
  donc exactement au moment où l'orateur annonce une lecture.
- **Coup de cœur** : un seul choix par votant et par catégorie (identifiant `matchId_voterId_category`), modifiable.
- **Collections de premier niveau** pour tickets, likes et buts (plutôt que des sous-collections) : la rétrospective
  de saison lit tout en une requête simple, sans index composites ni requêtes de groupe de collections.
- **Montant d'une amende** calculé côté client depuis le barème (`(quantité − unités offertes) × tarif`, plafonné) et
  figé dans le document `fines` avec le libellé, pour que l'historique reste exact si le barème change.
- **Passes décisives liées aux buts** : chaque but porte son passeur ; le classement des duos (« Mathis a fait
  17 assists à Max Vigne ») est une agrégation `assistPlayerId → scorerPlayerId`.
- **Saisons** : août → juillet, calculées depuis la date (`2026-27`). Tout est filtrable par saison.
- **Journal d'activité** en ajout seul : chaque action de création/modification/suppression du staff ou de l'orateur
  écrit une ligne lisible (« Amende infligée : Retard 15,00 € — Ronny Verast »). Rien ne peut y être modifié.

## 4. Règles de sécurité (firestore.rules)

- Lecture de toutes les données métier : utilisateur connecté (anonyme compris).
- Écriture joueurs, matchs, amendes, barème, buts, catégories, statistiques : **staff uniquement**
  (`exists(staff/{uid})`, c'est-à-dire l'admin ou le compte technique ouvert par le code). L'admin seul gère
  `staff`, `config/secretaryAccess` et le champ `players.role`.
- Tickets et coups de cœur : tout utilisateur connecté (modèle de confiance : l'identité du votant est déclarative,
  comme demandé, sans adresse e-mail).
- Cycle de vie d'un match par l'orateur anonyme : autorisé uniquement pour les champs
  `status, speakerName, speakerUid, readingStartedAt, closedAt, updatedAt` (`diff().affectedKeys().hasOnly`).
- Bootstrap : création de l'admin et des données initiales autorisée seulement tant que `config/bootstrap` n'existe pas ;
  ce document ne peut être créé que par un compte e-mail et jamais modifié ni supprimé.
- Journal : création par tout connecté, lecture par le staff, aucune modification ni suppression.

Les règles ont été validées avec l'émulateur Firestore (scénario complet joué automatiquement, voir README).

## 5. Structure du code

```
src/
  main.tsx, App.tsx          Point d'entrée, routes, aiguillage installation / connexion / application
  index.css                  Thème Tailwind 4 (couleurs, utilitaires card/field/label)
  auth/AuthProvider.tsx      Session : utilisateur Firebase, rôle staff, identité publique (localStorage)
  lib/
    firebase.ts              Initialisation (cache persistant, émulateurs en dev)
    types.ts                 Types du modèle de données
    fines.ts                 Calcul et formatage des amendes
    rankings.ts              Classements (nominations, coups de cœur, buts, duos), complétion des tickets
    format.ts                Dates, noms et surnoms, recherche de joueur, saisons, titres de match
    activity.ts              Journal d'activité
    players.ts               Ajout rapide d'un joueur
    initialPlayers.ts        Données de première installation
  hooks/
    useCollection.ts         Abonnement temps réel générique à une requête Firestore
    useData.ts               Un hook par collection (players, matches, tickets, likes, goals, fines…)
    useActor.ts              Acteur courant pour le journal
    useLocalFlag.ts          Indicateur mémorisé sur l'appareil (consignes affichées une seule fois)
  components/
    ui/                      Kit d'interface (Button, Input, Select, Modal, Tabs, Badge, Avatar, Stat, Toast…)
    PlayerPicker.tsx         Sélecteur de joueur avec recherche et ajout à la volée (staff)
    MatchFormModal.tsx       Création / édition d'un match
    MatchCard.tsx, RankingList.tsx
  layout/AppShell.tsx        Barre latérale (desktop) + barre du bas (mobile)
  pages/
    LoginPage, SetupPage, HomePage, ConfigMissingPage
    votes/                   Liste des matchs, page match (TicketForm, SpeakerConsole, Participation, LiveReading, Rankings, TicketCard)
    fines/                   Amendes par joueur, historique, barème, modale d'ajout
    stats/                   Buteurs, passeurs, duos, catégories maison, feuille de match (buts)
    history/                 Rétrospective de saison
    admin/                   Joueurs, matchs, staff, journal d'activité
```

## 6. Déroulement d'une soirée

1. Le secrétaire crée le match (date, adversaire, score facultatif) : les votes s'ouvrent.
2. Chaque membre présent choisit son nom (ou son surnom), remplit son ticket (3 catégories, commentaire lu à voix
   haute), éventuellement à deux, puis l'envoie. Il peut demander, catégorie par catégorie, que l'orateur lise son
   commentaire avant d'annoncer le nom. Il peut modifier son vote tant que la lecture n'a pas commencé.
3. L'orateur suit la participation (envoyés / en cours / sans vote), prépare l'ordre (manuel ou mélangé) et les étoiles.
4. Il clôture les votes : les tickets sont figés. Il annonce chaque lecture ; le ticket apparaît en direct chez tous,
   les classements se mettent à jour, les membres votent leur coup de cœur par catégorie. Pour une catégorie mise
   en suspense, il lit le commentaire puis appuie sur « Annoncer le nom » : le nom apparaît alors chez tout le monde.
5. Il peut afficher le nom de l'auteur d'un ticket, conserver un ticket, puis termine la soirée : les noms encore
   en suspense sont révélés automatiquement.
6. En fin d'année, la rétrospective compile tout : meilleur/pire joueur cumulés, buteurs, passeurs, duo de la saison,
   caisse des amendes, petites étoiles et tickets conservés, contributions préférées du public.

## 7. Évolutions possibles

- Code PIN pour l'orateur ou restriction au staff (un simple changement de l'écran de connexion et d'une règle).
- Export CSV / PDF de la rétrospective.
- Notifications push (nécessite Firebase Cloud Messaging, gratuit).
- Multi-équipes : ajouter un champ `teamId` sur chaque document et une règle par équipe.
