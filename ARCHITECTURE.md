# Baudouin H3 — Architecture

Application web légère pour l'équipe Baudouin H3 : votes d'après-match (meilleur joueur, pire joueur,
geste marquant), le suivi de la coum à chaque match, gestion des amendes, statistiques de buts et
passes décisives, journal d'activité.

## 1. Choix techniques

| Sujet | Choix | Pourquoi |
|---|---|---|
| Hébergement + données | **Firebase, plan Spark (gratuit)** : Firestore, Authentication, Hosting | 0 €/mois à l'échelle d'une équipe (quota : 50 000 lectures et 20 000 écritures par jour). Temps réel natif pour les classements. Aucun serveur à maintenir. |
| Cloud Functions | **Aucune** | Elles imposent le plan payant (Blaze). Toute la logique tourne dans le navigateur, la sécurité repose sur les règles Firestore. |
| Agenda Sportlink | **GitHub Actions planifiée** (1×/jour) + bouton de l'admin | Seule tâche « serveur » : lire l'agenda iCal et écrire les matchs avec le compte de service du déploiement. Gratuit, sans Cloud Functions. Le bouton fait la même chose depuis le navigateur quand Sportlink l'autorise. |
| Frontend | **React 19 + Vite 7 + TypeScript + Tailwind CSS 4** | Rapide à développer, bundle léger, installable comme PWA sur téléphone. |
| Routage | react-router 7 | SPA, une seule page HTML servie par Firebase Hosting. |
| Icônes | lucide-react | Sobres, cohérentes avec le style épuré. |
| Cache local | Firestore `persistentLocalCache` | L'application reste lisible hors ligne (vestiaire sans réseau) et se synchronise dès le retour du réseau. |

Alternatives étudiées : Scalingo (≈ 15 €/mois, pas de palier gratuit), Supabase gratuit (projet mis en pause après 7 jours
d'inactivité), Cloudflare Pages + D1 (gratuit mais temps réel à recoder), VPS + PocketBase (≈ 4 €/mois, administration à charge).

## 2. Rôles et authentification

| Rôle | Connexion | Peut |
|---|---|---|
| **Membre public (votant)** | Connexion anonyme Firebase + saisie de son prénom et de son nom, qui doivent correspondre à un joueur de l'équipe (comparaison sans accents ni majuscules). Identité mémorisée sur l'appareil. | Remplir et modifier son vote (et demander que l'orateur lise son commentaire avant le nom), suivre la lecture et le compte à rebours, voter « coup de cœur », voir qui a coumé, consulter amendes et stats. |
| **Orateur** | Idem membre public, en cochant « Je suis l'orateur » à la connexion (choix libre, sur base de confiance). | Voir qui a voté et la complétion, réorganiser / mélanger l'ordre, attribuer des petites étoiles, conserver des tickets, annoncer chaque lecture, suivre la consigne « commentaire avant le nom », afficher le nom d'un auteur, clôturer les votes et terminer la soirée. |
| **Secrétaire** | Aucun e-mail ni mot de passe personnel. L'admin accorde les droits à un joueur (`players.role = 'secretary'`). Le membre se connecte par son nom, puis entre une fois le **code commun** (4 à 8 chiffres) fixé par l'admin ; ce code ouvre un compte technique partagé (`staff/{uid}`, rôle `secretary`, `shared: true`) qui reste connecté sur l'appareil. | Tout ce que fait l'orateur + créer/modifier les matchs, infliger des amendes, gérer le barème, encoder buts et passes, gérer les catégories maison, ajouter des joueurs à la volée, paramètres, journal d'activité. Tient aussi le rôle de **trésorier** : note qui a coumé, marque les absents, « recoume », lance le minuteur des votes. |
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
config/calendar               { icalUrl, teamKeyword, lastSync: { at, ok, events, created, updated, cancelled, error } }
players/{id}                  { firstName, lastName, nickname, active, role: 'secretary'|null, createdAt }
matches/{id}                  { date, time, venue, details, opponent, competition, home, homeScore, awayScore,
                                source: 'sportlink'?, externalId, cancelled, syncedAt,
                                status: 'scheduled'|'voting'|'reading'|'closed',
                                speakerName, speakerUid, readingStartedAt, closedAt,
                                voteDeadline, voteTimerMinutes, voteTimerBy,
                                createdBy, createdAt, updatedAt }
tickets/{matchId_authorId}    { matchId, authorPlayerId, authorUids[],
                                best:{playerId, proposal, comment, commentFirst}, worst:{…}, moment:{…},
                                status: 'draft'|'submitted', readAt, readOrder, starred, saved, revealAuthor,
                                createdAt, updatedAt }
likes/{matchId_voterId_cat}   { matchId, voterPlayerId, category, ticketId, createdAt }
coums/{matchId_playerId}      { matchId, playerId, rounds, paid, absent, lastPaidAt,
                                collectedBy, collectedByName, createdAt, updatedAt }
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
  Les recherches de joueur comparent prénom, nom **et** surnom, sans accents ni majuscules (`playerMatches`) ;
  la connexion, elle, reste sur prénom + nom (`findPlayerByName`), le surnom n'y donne pas accès.
- **« Commentaire d'abord »** : le votant coche `commentFirst` sur une catégorie. C'est une consigne de lecture,
  pas un secret : elle n'agit que dans la console de l'orateur (`speakerView`), où le commentaire passe au-dessus
  et où le nom attend un appui sur « Annoncer le nom ». Ce repli est un simple état local du composant — rien
  n'est écrit dans la base, rien ne change pour la salle, les classements ni la rétrospective.
- **Brouillon auto-sauvegardé** : chaque modification écrit un `draft` après 800 ms ; l'orateur et le staff voient
  ainsi la complétion (0/3, 1/3, 2/3) des votes ouverts mais non envoyés.
- **Classements en temps réel** : seuls les tickets `submitted` **et** `readAt != null` comptent. Le compteur bouge
  donc exactement au moment où l'orateur annonce une lecture.
- **Coup de cœur** : un seul choix par votant et par catégorie (identifiant `matchId_voterId_category`), modifiable.
- **La coum** : feuille du moment, pour les présents d'un match. L'application ne suit que le geste —
  **ni montants, ni caisse, ni historique de saison** : une fois que tous les présents ont payé, la feuille est
  simplement bouclée. Elle est indépendante des amendes (page Amendes inchangée). Un document par joueur et par
  match : `rounds` compte les coums demandées, `paid` celles que le trésorier a reçues, `absent` exclut le joueur
  du match. Trois états en découlent : **a coumé**, **pas encore**, **absent**. « **Recoumer** » ajoute une coum
  à tous les présents (ou à un joueur précis) : `rounds` passe à 2, 3… et ceux qui avaient payé repassent
  « pas encore ». Tout le monde voit qui a coumé ; seul le staff écrit (règles Firestore).
- **Minuteur des votes** : l'admin ou un secrétaire pose une échéance (`matches.voteDeadline`) depuis la console.
  Tous les appareils affichent le même compte à rebours, avec un message adapté à ceux qui n'ont pas encore envoyé
  leur vote. Rien ne se ferme tout seul : la clôture reste un geste de l'orateur, et l'échéance est effacée à la clôture.
- **Alerte du direct** : pendant la lecture, le décompte des nominations est refait lecture par lecture
  (`nominationProgress`). Dès qu'un joueur atteint le seuil (3 voix par défaut, réglable) dans une catégorie,
  un bandeau le signale en direct et le vote lu porte un badge « 3ᵉ voix ».
- **Collections de premier niveau** pour tickets, likes et buts (plutôt que des sous-collections) : la rétrospective
  de saison lit tout en une requête simple, sans index composites ni requêtes de groupe de collections.
- **Montant d'une amende** calculé côté client depuis le barème (`(quantité − unités offertes) × tarif`, plafonné) et
  figé dans le document `fines` avec le libellé, pour que l'historique reste exact si le barème change.
- **Passes décisives liées aux buts** : chaque but porte son passeur ; le classement des duos (« Mathis a fait
  17 assists à Max Vigne ») est une agrégation `assistPlayerId → scorerPlayerId`.
- **Listes maison** (« Papa de l'année », « Homme du match »…) : collections `statCategories` / `statEntries`,
  créées, renommées, masquées ou **supprimées** depuis Gestion → Listes (ou depuis la page Stats). La suppression
  d'une liste efface aussi toutes ses entrées, par lots de 400 écritures.
- **Agenda Sportlink** (`src/lib/calendar/`, `scripts/calendar/sync.mjs`, `.github/workflows/sync-calendar.yml`) :
  chaque matin, et quand l'admin appuie sur « Mettre à jour le calendrier », l'agenda iCal est lu et comparé aux matchs `source: 'sportlink'`. L'identifiant du match dérive de l'UID de l'événement
  (`sl_<sha1>`), ce qui relie un match déplacé à sa fiche. Seuls `date, time, opponent, home, venue, details,
  cancelled` sont écrits ; score, compétition et état des votes jamais. Les événements passés ne sont ni importés
  ni modifiés ; un match futur qui disparaît de l'agenda est marqué `cancelled`, jamais supprimé. Le lien (qui
  contient un jeton) vit dans `config/calendar`, lisible par le staff seul, et n'est jamais écrit dans le journal.
  La logique (lecture iCal, plan, écritures) est un seul code TypeScript pur, partagé : le bouton l'applique avec
  le SDK web et les droits de l'admin, la tâche du matin avec firebase-admin (Node exécute le TypeScript
  directement). Si Sportlink refuse la lecture depuis le navigateur (CORS), le bouton renvoie vers le lancement
  manuel de la tâche GitHub.
- **Matchs à venir** : état `scheduled`, votes fermés, carte grisée et fiche « date, heure, lieu ». Le jour du match,
  l'application les affiche en « votes ouverts » (`withEffectiveStatus`, calculé à la lecture) : aucune tâche
  planifiée ni geste n'est nécessaire, et un match reporté se referme de lui-même. Les matchs à venir sont exclus
  des statistiques, de la rétrospective et des listes de choix (amendes, listes maison).
- **Saisons** : août → juillet, calculées depuis la date (`2026-27`). Tout est filtrable par saison.
- **Journal d'activité** en ajout seul : chaque action de création/modification/suppression du staff ou de l'orateur
  écrit une ligne lisible (« Amende infligée : Retard 15,00 € — Ronny Verast »). Rien ne peut y être modifié.

## 4. Règles de sécurité (firestore.rules)

- Lecture de toutes les données métier : utilisateur connecté (anonyme compris).
- Écriture joueurs, matchs, amendes, barème, buts, coums, catégories, statistiques : **staff uniquement**
  (`exists(staff/{uid})`, c'est-à-dire l'admin ou le compte technique ouvert par le code). L'admin seul gère
  `staff`, `config/secretaryAccess` et le champ `players.role`.
- Tickets et coups de cœur : tout utilisateur connecté (modèle de confiance : l'identité du votant est déclarative,
  comme demandé, sans adresse e-mail).
- Cycle de vie d'un match par l'orateur anonyme : autorisé uniquement pour les champs
  `status, speakerName, speakerUid, readingStartedAt, closedAt, updatedAt` (`diff().affectedKeys().hasOnly`).
  Le minuteur (`voteDeadline`…) n'en fait pas partie : il reste réservé au staff, comme demandé
  (« déclenchement par un admin ou un secrétaire »).
- Agenda (`config/calendar`) : lecture et écriture par le staff seul ; la synchronisation passe par le compte de service.
- Coums : lecture par tout utilisateur connecté (tout le monde voit qui a coumé), écriture par le staff seul.
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
    coums.ts                 La coum : états (a coumé / pas encore / absent) et comptes d'un match
    statCategories.ts        Suppression d'une liste maison et de ses entrées
    rankings.ts              Classements (nominations, coups de cœur, buts, duos), complétion des tickets
    format.ts                Dates, noms et surnoms, recherche de joueur, saisons, titres de match
    matches.ts               Matchs à venir : ouverture des votes le jour J, prochain match, heure, lien Maps
    calendar/                Agenda Sportlink : lecture iCal, plan de synchronisation, bouton « Mettre à jour » (navigateur)
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
    VoteTimer.tsx            Compte à rebours des votes (bandeau public + réglage staff)
    StatCategoryModal.tsx    Création / renommage / suppression d'une liste maison
    MatchFormModal.tsx       Création / édition d'un match
    MatchCard.tsx, RankingList.tsx
  layout/AppShell.tsx        Barre latérale (desktop) + barre du bas (mobile)
  pages/
    LoginPage, SetupPage, HomePage, ConfigMissingPage
    votes/                   Liste des matchs, page match (TicketForm, SpeakerConsole, Participation, LiveReading, Rankings, TicketCard, CoumPanel)
    fines/                   Amendes par joueur, historique, barème, modale d'ajout
    stats/                   Buteurs, passeurs, duos, catégories maison, feuille de match (buts)
    history/                 Rétrospective de saison
    admin/                   Joueurs, matchs, staff, listes maison, paramètres, journal d'activité
```

## 6. Déroulement d'une soirée

1. Le match arrive tout seul depuis l'agenda Sportlink (ou le secrétaire le crée à la main) ; ses votes s'ouvrent le jour du match. Il peut lancer un
   **minuteur** (5, 10, 15 minutes ou une durée libre) : tout le monde voit le compte à rebours.
2. Chaque membre présent choisit son nom, remplit son ticket (3 catégories, commentaire lu à voix
   haute), éventuellement à deux, puis l'envoie. Il peut demander, catégorie par catégorie, que l'orateur lise son
   commentaire avant d'annoncer le nom. Il peut modifier son vote tant que la lecture n'a pas commencé.
3. L'orateur suit la participation (envoyés / en cours / sans vote), prépare l'ordre (manuel ou mélangé) et les étoiles.
4. Il clôture les votes : les tickets sont figés. Il annonce chaque lecture ; le ticket apparaît en direct chez tous,
   les classements se mettent à jour, les membres votent leur coup de cœur par catégorie. Quand un votant l'a
   demandé, sa console lui présente le commentaire avant le nom et lui rappelle de le lire en premier. Dès qu'un
   joueur atteint 3 voix dans une catégorie, le direct le signale.
5. Il peut afficher le nom de l'auteur d'un ticket, conserver un ticket, puis termine la soirée.
   Pendant ce temps, le trésorier note **la coum** dans l'onglet du même nom : une ligne par joueur
   (a coumé / pas encore / absent), un bouton « Recoumer les présents » pour un tour supplémentaire.
6. En fin d'année, la rétrospective compile tout : meilleur/pire joueur cumulés, buteurs, passeurs, duo de la saison,
   caisse des amendes, petites étoiles et tickets conservés, contributions préférées du public.

## 7. Évolutions possibles

- Code PIN pour l'orateur ou restriction au staff (un simple changement de l'écran de connexion et d'une règle).
- Export CSV / PDF de la rétrospective.
- Notifications push (nécessite Firebase Cloud Messaging, gratuit).
- Multi-équipes : ajouter un champ `teamId` sur chaque document et une règle par équipe.
