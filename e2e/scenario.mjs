// Scénario de bout en bout joué contre les émulateurs Firebase (npm run emulators) et le serveur Vite (npm run dev, .env avec VITE_USE_EMULATORS=true).
// Prérequis : npx playwright install chromium. Lancer : bash e2e/reset-emulators.sh && node e2e/scenario.mjs
// Il couvre : installation, création de match, surnoms, la coum, amendes, buts, minuteur des votes, trois votants,
// vote « commentaire d'abord », orateur (vote, minuteur et clôture depuis sa console), file de lecture et « Valider le vote »,
// lecture guidée dans la console, vote hors plateforme, correction d'un nom, lecture en direct (alerte à 3 voix),
// coups de cœur, listes maison, rétrospective, mobile.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const S = process.env.SHOTS ?? new URL('./shots', import.meta.url).pathname
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
// Certaines étapes provoquent volontairement une erreur (code faux, accès refusé). Pendant
// celles-ci, les erreurs de console sont attendues et ne comptent pas comme des défauts.
let expecting = 0
async function expectError(label, fn) {
  expecting++
  try {
    return await fn()
  } finally {
    expecting--
    console.log(`  (erreur attendue vérifiée : ${label})`)
  }
}
async function ctx(name, mobile = false) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })
  const p = await c.newPage()
  p.on('console', (m) => { if (m.type() === 'error' && !expecting) errors.push(`[${name}] ${m.text()}`) })
  p.on('pageerror', (e) => { if (!expecting) errors.push(`[${name}] pageerror ${e.message}`) })
  p.on('dialog', (d) => d.accept())
  return p
}
const shot = (p, n) => p.screenshot({ path: `${S}/${n}.png`, fullPage: true })

// 1. Première installation
const admin = await ctx('admin')
await admin.goto(BASE)
await admin.getByText('Première installation').waitFor({ timeout: 20000 })
await shot(admin, '01-setup')
await admin.getByLabel('Votre nom').fill('Bruno Huberty')
await admin.getByLabel('Adresse e-mail').fill('admin@baudouinh3.be')
await admin.getByLabel('Mot de passe').fill('secret123')
await admin.getByRole('button', { name: 'Créer l’administrateur' }).click()
await admin.getByText('Aucun vote en cours').waitFor({ timeout: 20000 })
await shot(admin, '02-home-admin-empty')

// 2. Création d'un match
await admin.goto(BASE + '/votes')
await admin.getByRole('button', { name: 'Nouveau match' }).click()
await admin.getByLabel('Adversaire').fill('RSC Anderlecht Vétérans')
await admin.getByLabel('Compétition').fill('Championnat')
const scores = admin.locator('#match-form input[type=number]')
await scores.nth(0).fill('3')
await scores.nth(1).fill('2')
await admin.getByRole('button', { name: 'Créer et ouvrir les votes' }).click()
await admin.getByText('Votes ouverts').first().waitFor()
await shot(admin, '03-votes-list')
const href = await admin.locator('a[href^="/votes/"]').first().getAttribute('href')
const matchId = href.split('/').pop()
await admin.goto(BASE + href)
await admin.getByRole('button', { name: 'Console orateur' }).waitFor()
console.log('matchId', matchId)

// 2b. Compte admin relié à un joueur : l'admin vote sous ce nom
await admin.goto(BASE + '/admin/staff')
await admin.getByTitle('Joueur relié').first().waitFor()
await admin.getByTitle('Joueur relié').first().selectOption({ label: 'Bruno Huberty' })
await admin.getByText('joueur : Bruno Huberty').waitFor()
await admin.goto(BASE + `/votes/${matchId}`)
// Le staff vote depuis la console, au même endroit que le reste.
await admin.getByText('Vous votez en tant que Bruno Huberty').waitFor()
await shot(admin, '03b-admin-ticket')
await fillTicket(admin, 'Vigne', 'Leyder', 'Le contrôle orienté sur le corner', 'Trois passes décisives.')
await admin.getByRole('button', { name: 'Envoyer mon vote' }).click()
await admin.getByText('Vote envoyé', { exact: true }).waitFor()

// Remplit les trois catégories du formulaire de vote affiché.
async function fillTicket(p, best, worst, moment, comment, commentFirst = false) {
  const blocks = [['🏆', best, comment], ['🥴', worst, 'Il a raté un but tout fait à la 12e.'], ['⚡', best, moment]]
  for (const [emoji, who, text] of blocks) {
    const block = p.locator('.card').filter({ hasText: emoji }).first()
    await block.locator('input[placeholder^="Rechercher un joueur"]').fill(who)
    await block.getByRole('button', { name: new RegExp(who) }).first().click()
    await block.locator('textarea').fill(text)
    // Consigne : l'orateur devra lire le commentaire avant d'annoncer le nom.
    if (commentFirst && emoji === '🏆') await block.getByRole('checkbox').check()
  }
}

// 2c. Droits de secrétaire à Jarne (aucun code : ils suivent son nom)
await admin.goto(BASE + '/admin/staff')
await admin.getByPlaceholder(/Rechercher un nom ou un surnom/).fill('Jarne')
await admin.getByRole('button', { name: 'Rendre secrétaire' }).first().click()
await admin.getByText('est maintenant secrétaire').waitFor()
// Liste des orateurs : Maxim Leonard est désigné par l'admin
await admin.getByPlaceholder(/Rechercher un nom ou un surnom/).fill('Leonard')
await admin.getByRole('button', { name: 'Orateur', exact: true }).first().click()
await admin.getByText('peut être orateur').waitFor()
await shot(admin, '03c-droits')


// 2d. Surnom : « Sniper » pour Maxime Vigne (affiché à la place du nom, et retrouvé par la recherche)
await admin.goto(BASE + '/admin/joueurs')
await admin.getByPlaceholder(/Rechercher un nom ou un surnom/).fill('Vigne')
await admin.getByTitle('Renommer').first().click()
const renameDlg = admin.getByRole('dialog')
await renameDlg.getByLabel('Surnom').fill('Sniper')
await renameDlg.getByRole('button', { name: 'Enregistrer' }).click()
await renameDlg.waitFor({ state: 'hidden' })
await admin.getByText('Joueur renommé').waitFor()
await admin.getByPlaceholder(/Rechercher un nom ou un surnom/).fill('sniper')
await admin.getByText('Maxime Vigne').waitFor()
await shot(admin, '03d-surnom')

// 2e. La coum : qui a payé, absent, recoum
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Coum', exact: true }).click()
await admin.getByText('La coum du match').waitFor()
await shot(admin, '03d-coum-depart')
await admin.getByRole('button', { name: 'A payé' }).first().click()
await admin.waitForTimeout(600)
await admin.getByRole('button', { name: 'A payé' }).first().click()
await admin.waitForTimeout(600)
if ((await admin.getByText('A coumé', { exact: true }).count()) !== 2) throw new Error('deux joueurs devraient avoir coumé')
if (!(await admin.locator('.card', { hasText: 'Ont coumé' }).first().innerText()).includes('2 / 21')) throw new Error('le compteur devrait afficher 2 / 21')
await admin.getByTitle('Noter absent (ne doit pas la coum)').first().click()
await admin.waitForTimeout(600)
await admin.getByText('Absent', { exact: true }).waitFor()
await shot(admin, '03e-coum-a-paye')
await admin.getByRole('button', { name: 'Recoumer les présents' }).click()
await admin.getByText('Recoum lancée').first().waitFor()
await admin.waitForTimeout(800)
if ((await admin.getByText('A coumé', { exact: true }).count()) !== 0) throw new Error('après une recoum, tout le monde redoit une coum')
await admin.getByText(/2 coums reçues sur \d+ demandées/).waitFor()
await shot(admin, '03f-coum-recoum')

// Tous les présents finissent par payer : la feuille est bouclée, il n'y a rien à conserver après.
const payer = admin.getByRole('button', { name: 'A payé' })
for (let i = 0; i < 60 && (await payer.count()) > 0; i++) {
  await payer.first().click()
  await admin.waitForTimeout(250)
}
await admin.getByText('Tout le monde a coumé. Rien à relancer.').waitFor()
await shot(admin, '03g-coum-bouclee')

// 3. Amende : retard 20 min -> 15 €
await admin.goto(BASE + '/amendes')
await admin.getByRole('button', { name: 'Infliger une amende' }).click()
await admin.getByRole('dialog').getByRole('button', { name: /Verast/ }).click()
await admin.getByLabel('Type d’amende').selectOption({ index: 0 })
await admin.getByLabel(/Nombre de/).fill('20')
await admin.getByText('Confirmer 15,00').waitFor()
await admin.getByRole('button', { name: /Confirmer/ }).click()
await admin.getByRole('dialog').waitFor({ state: 'hidden' })
await admin.getByRole('button', { name: 'Infliger une amende' }).click()
await admin.getByRole('dialog').getByRole('button', { name: /Leyder/ }).click()
await admin.getByLabel('Type d’amende').selectOption({ index: 6 })
await admin.getByRole('button', { name: /Confirmer/ }).click()
await admin.getByRole('dialog').waitFor({ state: 'hidden' })
await admin.waitForTimeout(500)
await shot(admin, '04-amendes')
await admin.getByRole('button', { name: 'Barème' }).click()
await admin.waitForTimeout(300)
await shot(admin, '05-bareme')

// 4. Buts et passes
await admin.goto(BASE + `/stats/${matchId}`)
for (const [scorer, assist] of [['Vigne', 'Leyder'], ['Vigne', 'Leyder'], ['Verast', null]]) {
  await admin.getByRole('button', { name: 'Ajouter un but' }).click()
  const dlg = admin.getByRole('dialog')
  await dlg.locator('div').filter({ hasText: /^⚽ Buteur/ }).first().waitFor()
  const pickers = dlg.locator('label.label')
  // buteur
  await dlg.locator('input[placeholder^="Rechercher un joueur"]').nth(0).fill(scorer)
  await dlg.getByRole('button', { name: new RegExp(scorer) }).first().click()
  if (assist) {
    await dlg.locator('input[placeholder^="Rechercher un joueur"]').nth(0).fill(assist)
    await dlg.getByRole('button', { name: new RegExp(assist) }).first().click()
  }
  await dlg.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await dlg.waitFor({ state: 'hidden' })
  await admin.waitForTimeout(400)
  void pickers
}
await shot(admin, '06-feuille-de-match')
await admin.goto(BASE + '/stats')
await admin.getByRole('button', { name: /Duos/ }).click()
await admin.waitForTimeout(400)
await shot(admin, '07-stats-duos')

// 4b. Minuteur des votes, depuis la console
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Console orateur', exact: true }).click()
await admin.getByText('Minuteur des votes').waitFor()
await admin.getByRole('button', { name: '10 min' }).click()
await admin.getByText('Minuteur lancé : 10 minutes').first().waitFor()
await admin.getByText(/Il reste (9:5\d|10:00) aux votants/).waitFor()
await shot(admin, '07c-minuteur')

// 5. Votants
async function login(name, firstName, lastName, mode = 'public', secretary = false) {
  const p = await ctx('voter-' + name)
  await p.goto(BASE)
  // Un seul formulaire pour tout le monde ; l'orateur coche simplement la case.
  await p.getByLabel('Prénom').fill(firstName)
  await p.getByLabel('Nom', { exact: true }).fill(lastName)
  if (mode === 'speaker') await p.getByRole('checkbox').check()
  await p.getByRole('button', { name: mode === 'speaker' ? 'Entrer comme orateur' : 'Continuer' }).click()
  // Secrétaire : les droits s'appliquent dès la connexion par le nom, sans code.
  if (secretary) await p.getByRole('link', { name: 'Gestion' }).first().waitFor({ timeout: 20000 })
  return p
}
async function vote(name, best, worst, moment, comment, secretary = false, commentFirst = false) {
  const [firstName, lastName] = name
  const p = await login(firstName, firstName, lastName, 'public', secretary)
  // Le compte à rebours est visible partout, pas seulement sur la page du match.
  await p.getByText(/Contre RSC Anderlecht Vétérans/).first().waitFor()
  await p.goto(BASE + `/votes/${matchId}`)
  await p.getByText('Vous votez en tant que').waitFor()
  await p.getByText(/Il vous reste du temps pour voter/).waitFor()
  await fillTicket(p, best, worst, moment, comment, commentFirst)
  return p
}
const ronny = await vote(['Ronny', 'verast'], 'Vigne', 'Leyder', 'Le petit pont sur le 9 adverse', 'Deux buts, une masterclass.', false, true)
await shot(ronny, '08-ticket-form')
await ronny.getByRole('button', { name: 'Envoyer mon vote' }).click()
await ronny.getByText('Vote envoyé', { exact: true }).waitFor()
await ronny.getByText('L’orateur lira le commentaire avant d’annoncer le nom').waitFor()
// Le surnom remplace le nom partout à l'affichage
await ronny.getByText('Sniper').first().waitFor()
if (await ronny.getByText('Maxime Vigne').count() !== 0) throw new Error('Le surnom devrait remplacer le nom à l’affichage')
await shot(ronny, '09-ticket-sent')
const mathis = await vote(['mathis', 'LEYDER'], 'Vigne', 'Verast', 'La roulette dans le rond central', 'Le passeur mérite aussi… mais bon.')
await mathis.getByRole('button', { name: 'Envoyer mon vote' }).click()
await mathis.getByText('Vote envoyé', { exact: true }).waitFor()
const jarne = await vote(['Jarne', 'Bellinghen'], 'Verast', 'Leyder', 'La glissade du gardien', 'Solide derrière.', true)
await shot(jarne, '07b-secretaire-par-nom')
// Jarne garde un brouillon (ne pas envoyer)
await jarne.waitForTimeout(1500)

// 6. Orateur
// Un joueur hors de la liste ne peut pas se déclarer orateur
const intrus = await ctx('intrus')
await intrus.goto(BASE)
await intrus.getByLabel('Prénom').fill('Ronny')
await intrus.getByLabel('Nom', { exact: true }).fill('Verast')
await intrus.getByRole('checkbox').check()
await intrus.getByRole('button', { name: 'Entrer comme orateur' }).click()
await intrus.getByText(/pas dans la liste des orateurs/).waitFor()
await intrus.close()
const speaker = await login('speaker', 'Maxim', 'Leonard', 'speaker')
await speaker.goto(BASE + `/votes/${matchId}`)
await speaker.getByText('Console de l’orateur').waitFor()
// L'orateur désigné prend la main en ouvrant sa console : il est l'orateur en cours.
await speaker.getByText('Vous êtes l’orateur en cours.').waitFor()
await speaker.getByRole('button', { name: 'Participation' }).click()
await speaker.waitForTimeout(800)
await shot(speaker, '10-participation')
await speaker.getByRole('button', { name: 'Console orateur' }).click()
await speaker.waitForTimeout(600)
await shot(speaker, '11-console-avant')
// L'orateur vote lui-même, depuis sa console
await speaker.getByText('Vous votez en tant que Maxim Leonard').waitFor()
await fillTicket(speaker, 'Vigne', 'Verast', 'Le tir en pivot', 'Intouchable ce soir.')
await speaker.getByRole('button', { name: 'Envoyer mon vote' }).click()
await speaker.getByText('Vote envoyé', { exact: true }).waitFor()
// …relance le minuteur (plus besoin d'un secrétaire)…
await speaker.getByRole('button', { name: '5 min', exact: true }).click()
await speaker.getByText('Minuteur lancé : 5 minutes').first().waitFor()
await ronny.getByText(/Minuteur lancé par Maxim Leonard/).waitFor()
await shot(speaker, '11b-console-vote-minuteur')
// …et clôture les votes de tout le monde
await speaker.getByRole('button', { name: 'Clôturer les votes de tout le monde' }).click()
await speaker.getByText('Lecture par Maxim Leonard').waitFor()
await speaker.getByRole('button', { name: 'Mélanger' }).click()
await speaker.waitForTimeout(500)
await speaker.getByTitle('Attribuer une petite étoile').first().click()
await speaker.getByRole('button', { name: 'Valider le vote' }).click()
await speaker.getByText('Vote validé et envoyé à tous').waitFor()
await speaker.waitForTimeout(600)
await shot(speaker, '12-console-lecture')

// 7. Votant en direct + coup de coeur
await ronny.getByRole('button', { name: 'En direct' }).click()
await ronny.getByText('1 / 4 votes lus').waitFor()
if (await ronny.getByRole('button', { name: 'Modifier' }).count() !== 0) throw new Error('Un votant ne doit pas pouvoir corriger un vote')
await ronny.locator('article button:has(svg)').first().click()
await ronny.waitForTimeout(500)
await shot(ronny, '13-en-direct')
await speaker.getByRole('button', { name: 'Valider le vote' }).click()
await speaker.waitForTimeout(600)
await speaker.getByTitle('Voir le nom de l’auteur (pour vous seul)').first().click()
await speaker.waitForTimeout(300)
await shot(speaker, '12b-console-nom-orateur')

// 7a. Orateur en cours : seul lui (et l'admin) voit le nom des votants. Une secrétaire qui prend
// la main le devient ; l'ancien orateur est prévenu et perd l'accès aux noms.
await jarne.goto(BASE + `/votes/${matchId}`)
await jarne.getByText(/Orateur en cours : Maxim/).waitFor()
if (await jarne.getByTitle('Voir le nom de l’auteur (pour vous seul)').count() !== 0) throw new Error('Seul l’orateur en cours peut voir le nom des votants')
if (await jarne.getByText('Auteur non précisé').count() + (await jarne.locator('article header').getByText(/Leonard|Verast|Leyder/).count()) !== 0) throw new Error('Aucun nom d’auteur ne doit apparaître chez une secrétaire')
await jarne.getByRole('button', { name: 'Prendre la main' }).click()
await jarne.getByText('Vous êtes l’orateur en cours.').waitFor()
await jarne.getByTitle('Voir le nom de l’auteur (pour vous seul)').first().waitFor()
await speaker.getByText(/a pris la main sur la lecture/).waitFor()
await speaker.getByText(/Orateur en cours : Jarne/).waitFor()
await shot(speaker, '12b2-main-reprise')
if (await speaker.getByTitle(/nom de l’auteur/).count() !== 0) throw new Error('L’ancien orateur ne doit plus voir le nom des votants')
// L'orateur reprend la main pour continuer la lecture ; Jarne est prévenue à son tour.
await speaker.getByRole('button', { name: 'Prendre la main' }).click()
await speaker.getByText('Vous êtes l’orateur en cours.').waitFor()
await jarne.getByText(/a pris la main sur la lecture/).waitFor()
if (await jarne.getByTitle(/nom de l’auteur/).count() !== 0) throw new Error('La secrétaire ne doit plus voir le nom des votants')
await speaker.waitForTimeout(400)
if (await ronny.getByText('Vote anonyme').count() < 2) throw new Error('Les votes lus devraient être anonymes pour un votant')

// 7b. Consigne « commentaire d'abord » : elle ne concerne que la console de l'orateur
if (await ronny.getByRole('button', { name: 'Annoncer le nom' }).count() !== 0) throw new Error('La consigne ne doit rien changer pour la salle')
// L'ordre a été mélangé : on valide jusqu'à ce que le vote de Ronny soit passé.
while (await ronny.getByText('Deux buts, une masterclass.').count() === 0) {
  await speaker.getByRole('button', { name: 'Valider le vote' }).click()
  await speaker.waitForTimeout(800)
}
if (await ronny.getByText('Deux buts, une masterclass.').count() !== 1) throw new Error('Le vote devrait être lisible en entier pour la salle')
await speaker.getByText('Lisez d’abord le commentaire, puis annoncez le nom voté.').waitFor()
await shot(speaker, '12c-console-consigne')
await speaker.getByRole('button', { name: 'Annoncer le nom' }).first().click()
await speaker.waitForTimeout(600)
if (await speaker.getByRole('button', { name: 'Annoncer le nom' }).count() !== 0) throw new Error('Le nom devrait s’afficher dans la console après l’annonce')
await shot(speaker, '12d-console-nom-annonce')

// 7c. Troisième lecture : le même joueur atteint 3 voix, le direct le signale
while (await speaker.getByRole('button', { name: 'Valider le vote' }).count() > 0) {
  await speaker.getByRole('button', { name: 'Valider le vote' }).click()
  await speaker.waitForTimeout(600)
}
await ronny.getByText('4 / 4 votes lus').waitFor()
await ronny.getByText('3 voix atteintes').waitFor()
if ((await ronny.getByText('3e voix').count()) < 1) throw new Error('Le vote lu devrait porter le badge « 3e voix »')
await shot(ronny, '13b-alerte-3-voix')
await ronny.getByRole('button', { name: 'Classement' }).click()
await ronny.waitForTimeout(500)
await shot(ronny, '14-classement')
await shot(speaker, '12e-console-lus-grises')

// 7d. Vote hors plateforme (staff) : rejoint la file et se valide comme les autres
await admin.goto(BASE + `/votes/${matchId}`)
// L'admin voit le nom des votants sans avoir la main.
await admin.getByTitle('Voir le nom de l’auteur (pour vous seul)').first().waitFor()
await admin.getByRole('button', { name: 'Vote hors plateforme' }).click()
const manualDlg = admin.getByRole('dialog')
const manualBest = manualDlg.locator('.card').filter({ hasText: '🏆' }).first()
await manualBest.locator('input[placeholder^="Rechercher un joueur"]').fill('Verast')
await manualBest.getByRole('button', { name: /Verast/ }).first().click()
await manualBest.locator('textarea').fill('Voté sur papier au bar.')
await shot(admin, '12f-vote-hors-plateforme')
await manualDlg.getByRole('button', { name: 'Comptabiliser ce vote' }).click()
await admin.getByText('Vote ajouté à la file de lecture').waitFor()
await speaker.getByText('Hors plateforme').first().waitFor()
await speaker.getByRole('button', { name: 'Valider le vote' }).click()
await ronny.getByRole('button', { name: 'En direct' }).click()
await ronny.getByText('5 / 5 votes lus').waitFor()

// 7e. Correction d'un nom mal choisi (orateur) : depuis le direct, « Modifier »
await speaker.getByRole('button', { name: 'En direct' }).click()
await speaker.getByRole('button', { name: 'Modifier' }).first().click()
const editDlg = speaker.getByRole('dialog')
const editBest = editDlg.locator('section').filter({ hasText: '🏆' }).first()
await editBest.getByLabel('Changer de joueur').click()
await editBest.locator('input[placeholder^="Rechercher un joueur"]').fill('Leonard')
await editBest.getByRole('button', { name: /Leonard/ }).first().click()
await shot(speaker, '12g-correction-nom')
await editDlg.getByRole('button', { name: 'Enregistrer la correction' }).click()
await speaker.getByText('Vote corrigé, classements mis à jour').waitFor()
await speaker.getByRole('button', { name: 'Console orateur' }).click()
await speaker.getByText(/Nom corrigé par Maxim Leonard/).first().waitFor()
await speaker.getByRole('button', { name: 'La lecture des votes est terminée' }).click()
await speaker.getByText('Lecture des votes terminée').first().waitFor()
// Une lecture terminée peut rouvrir les votes (un retardataire), puis se refermer.
await speaker.getByRole('button', { name: 'Rouvrir les votes' }).click()
await speaker.getByRole('button', { name: 'Clôturer les votes de tout le monde' }).click()
await speaker.getByRole('button', { name: 'La lecture des votes est terminée' }).click()
await speaker.getByText('Lecture des votes terminée').first().waitFor()

// Match à venir : les votes peuvent être ouverts à la main, sans attendre le jour du match.
await admin.goto(BASE + '/votes')
await admin.getByRole('button', { name: 'Nouveau match' }).click()
await admin.getByLabel('Adversaire').fill('Match avancé FC')
await admin.getByLabel('Date').fill('2099-06-01')
await admin.getByRole('button', { name: 'Ajouter le match' }).click()
await admin.getByText('Match avancé FC').first().click()
await admin.getByText('Les votes s’ouvriront le jour du match.').waitFor()
await admin.getByRole('button', { name: 'Ouvrir les votes maintenant' }).click()
await admin.getByText('Votes ouverts', { exact: true }).first().waitFor()
await admin.getByRole('button', { name: 'Console orateur', exact: true }).waitFor()

// L'admin rouvre un match terminé : depuis Gestion → Matchs, puis depuis la page du match.
await admin.goto(BASE + '/admin/matchs')
const doneRow = admin.locator('div', { has: admin.getByText('RSC Anderlecht Vétérans') }).filter({ has: admin.getByRole('button', { name: 'Rouvrir les votes' }) }).last()
await doneRow.getByRole('button', { name: 'Rouvrir les votes' }).click()
await admin.getByText('Votes rouverts').first().waitFor()
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Clôturer les votes de tout le monde' }).click()
await admin.getByRole('button', { name: 'La lecture des votes est terminée' }).click()
await admin.getByText('Lecture des votes terminée').first().waitFor()
await admin.getByRole('button', { name: 'Rouvrir les votes' }).first().click()
await admin.getByText('Votes rouverts').first().waitFor()
await admin.getByRole('button', { name: 'Clôturer les votes de tout le monde' }).click()
await admin.getByRole('button', { name: 'La lecture des votes est terminée' }).click()
await admin.getByText('Lecture des votes terminée').first().waitFor()

// 8. Admin : rétrospective + activité + accueil
await admin.goto(BASE + '/historique')
await admin.waitForTimeout(800)
await shot(admin, '15-retrospective')
await admin.goto(BASE + '/admin/activite')
// Traçabilité : chaque geste de la lecture est journalisé, avec l'avant → après des corrections
await admin.getByText(/Vote validé et affiché à tous/).first().waitFor()
await admin.getByText(/Vote corrigé/).first().waitFor()
await admin.getByText(/Coup de cœur donné/).first().waitFor()
await admin.getByText('Ordre de lecture mélangé', { exact: false }).first().waitFor()
await admin.getByText(/ajouté à la liste des orateurs/).first().waitFor()
await shot(admin, '16-activite')
await admin.goto(BASE + '/admin/staff')
await admin.waitForTimeout(500)
await shot(admin, '17-staff')
await admin.goto(BASE + '/')
await admin.waitForTimeout(800)
await shot(admin, '18-home')

// 8b. Paramètres : renommer la 3e catégorie
await admin.goto(BASE + '/admin/parametres')
await admin.getByLabel(/Catégorie 3/).fill('Moment de la soirée')
await admin.locator('.card', { hasText: 'Catégories de vote' }).getByRole('button', { name: 'Enregistrer' }).click()
await admin.getByText('Paramètres enregistrés').first().waitFor()
// Seuil de l'alerte du direct
await admin.getByLabel('Nombre de voix').fill('3')
await admin.locator('.card', { hasText: 'Alerte en direct' }).getByRole('button', { name: 'Enregistrer' }).click()
await admin.getByText('Paramètres enregistrés').first().waitFor()
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Classement' }).click()
await admin.getByText('Moment de la soirée').first().waitFor()
await shot(admin, '17b-parametres-renommes')

// 8c. Listes maison : suppression d'une liste (« Homme du match »)
await admin.goto(BASE + '/admin/listes')
await admin.getByText('Papa dans l’année', { exact: true }).waitFor()
await admin.getByText('Homme du match', { exact: true }).waitFor()
await shot(admin, '17c-listes')
await admin.getByTitle('Supprimer la liste').nth(1).click()
await admin.getByText('Liste supprimée').first().waitFor()
await admin.waitForTimeout(600)
if ((await admin.getByText('Homme du match', { exact: true }).count()) !== 0) throw new Error('La liste devrait avoir disparu')

// 9. Mobile
const m = await ctx('mobile', true)
await m.goto(BASE)
await m.waitForTimeout(800)
await shot(m, '19-mobile-login')
await m.getByLabel('Prénom').fill('Kobe')
await m.getByLabel('Nom', { exact: true }).fill('van bellinghen')
await m.getByRole('button', { name: 'Continuer' }).click()
await m.waitForTimeout(800)
await shot(m, '20-mobile-home')
await m.goto(BASE + `/votes/${matchId}`)
await m.waitForTimeout(800)
await shot(m, '21-mobile-match')
await m.getByRole('button', { name: 'Coum', exact: true }).click()
await m.getByText('La coum du match').waitFor()
await shot(m, '21b-mobile-coum')
await m.goto(BASE + '/amendes')
await m.waitForTimeout(800)
await shot(m, '22-mobile-amendes')

await browser.close()

// Bruit d'environnement, pas des défauts de l'application : polices Google et autres ressources
// externes bloquées par un pare-feu ou un proxy (bac à sable, machine sans accès Internet).
const NOISE = /ERR_CERT_AUTHORITY_INVALID|ERR_CONNECTION_RESET|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|fonts\.(googleapis|gstatic)\.com/
const real = errors.filter((e) => !NOISE.test(e))
const ignored = errors.length - real.length

if (ignored) console.log(`(${ignored} message${ignored > 1 ? 's' : ''} d'environnement ignoré${ignored > 1 ? 's' : ''} : ressources externes bloquées)`)
if (real.length === 0) {
  console.log('Aucune erreur de console.')
} else {
  console.log(`${real.length} erreur${real.length > 1 ? 's' : ''} de console :`)
  for (const e of real) console.log('  ' + e)
  process.exitCode = 1
}
