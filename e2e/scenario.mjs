// Scénario de bout en bout joué contre les émulateurs Firebase (npm run emulators) et le serveur Vite (npm run dev, .env avec VITE_USE_EMULATORS=true).
// Prérequis : npx playwright install chromium. Lancer : bash e2e/reset-emulators.sh && node e2e/scenario.mjs
// Il couvre : installation, création de match, la coum, amendes, buts, minuteur des votes, trois votants, orateur,
// lecture en direct (alerte à 3 voix), coups de cœur, listes maison, rétrospective, mobile.
import { chromium } from 'playwright'

const BASE = 'http://localhost:5173'
const S = process.env.SHOTS ?? new URL('./shots', import.meta.url).pathname
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const errors = []
async function ctx(name, mobile = false) {
  const c = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 860 } })
  const p = await c.newPage()
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] ${m.text()}`) })
  p.on('pageerror', (e) => errors.push(`[${name}] pageerror ${e.message}`))
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
await admin.getByRole('button', { name: 'Console' }).waitFor()
console.log('matchId', matchId)

// 2b. Compte admin relié à un joueur : l'admin vote sous ce nom
await admin.goto(BASE + '/admin/staff')
await admin.getByTitle('Joueur relié').first().waitFor()
await admin.getByTitle('Joueur relié').first().selectOption({ label: 'Bruno Huberty' })
await admin.getByText('joueur : Bruno Huberty').waitFor()
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Mon vote', exact: true }).click()
await admin.getByText('Vous votez en tant que Bruno Huberty').waitFor()
await shot(admin, '03b-admin-ticket')
await fillTicket(admin, 'Vigne', 'Leyder', 'Le contrôle orienté sur le corner', 'Trois passes décisives.')
await admin.getByRole('button', { name: 'Envoyer mon vote' }).click()
await admin.getByText('Vote envoyé', { exact: true }).waitFor()

// Remplit les trois catégories du formulaire de vote affiché.
async function fillTicket(p, best, worst, moment, comment) {
  const blocks = [['🏆', best, comment], ['🥴', worst, 'Il a raté un but tout fait à la 12e.'], ['⚡', best, moment]]
  for (const [emoji, who, text] of blocks) {
    const block = p.locator('.card').filter({ hasText: emoji }).first()
    await block.locator('input[placeholder="Rechercher un joueur…"]').fill(who)
    await block.getByRole('button', { name: new RegExp(who) }).first().click()
    await block.locator('textarea').fill(text)
  }
}

// 2c. Code des secrétaires + droits à Jarne
await admin.goto(BASE + '/admin/staff')
await admin.getByLabel('Code (4 à 8 chiffres)').fill('2468')
await admin.getByRole('button', { name: 'Définir le code' }).click()
await admin.getByText('Un code est défini').waitFor({ timeout: 20000 })
await admin.getByPlaceholder('Rechercher un joueur…').fill('Jarne')
await admin.getByRole('button', { name: 'Rendre secrétaire' }).first().click()
await admin.getByText('est maintenant secrétaire').waitFor()
await shot(admin, '03c-droits')

// 2d. La coum : encaissements, absent, recoum
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Coum', exact: true }).click()
await admin.getByText('La coum du match').waitFor()
await admin.getByText('10,00 € par personne').waitFor()
await shot(admin, '03d-coum-depart')
await admin.getByRole('button', { name: 'Encaissé' }).first().click()
await admin.waitForTimeout(600)
await admin.getByRole('button', { name: 'Encaissé' }).first().click()
await admin.waitForTimeout(600)
if ((await admin.getByText('A coumé', { exact: true }).count()) !== 2) throw new Error('deux joueurs devraient avoir coumé')
await admin.getByTitle('Noter absent (ne doit pas la coum)').first().click()
await admin.waitForTimeout(600)
await admin.getByText('Absent', { exact: true }).waitFor()
await shot(admin, '03e-coum-encaisse')
await admin.getByRole('button', { name: 'Recoumer les présents' }).click()
await admin.getByText('Recoum lancée').first().waitFor()
await admin.waitForTimeout(800)
if ((await admin.getByText('A coumé', { exact: true }).count()) !== 0) throw new Error('après une recoum, tout le monde redoit une coum')
if (!(await admin.locator('.card', { hasText: 'Dans le pot' }).first().innerText()).includes('20,00')) throw new Error('le pot devrait rester à 20 €')
await shot(admin, '03f-coum-recoum')

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
  await dlg.locator('input[placeholder="Rechercher un joueur…"]').nth(0).fill(scorer)
  await dlg.getByRole('button', { name: new RegExp(scorer) }).first().click()
  if (assist) {
    await dlg.locator('input[placeholder="Rechercher un joueur…"]').nth(0).fill(assist)
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

// 4b. Minuteur des votes (admin ou secrétaire uniquement)
await admin.goto(BASE + `/votes/${matchId}`)
await admin.getByRole('button', { name: 'Console', exact: true }).click()
await admin.getByText('Minuteur des votes').waitFor()
await admin.getByRole('button', { name: '10 min' }).click()
await admin.getByText('Minuteur lancé : 10 minutes').first().waitFor()
await admin.getByText(/Il reste (9:5\d|10:00) aux votants/).waitFor()
await shot(admin, '07c-minuteur')

// 5. Votants
async function login(name, firstName, lastName, mode = 'public', pin = null) {
  const p = await ctx('voter-' + name)
  await p.goto(BASE)
  await p.getByRole('button', { name: mode === 'speaker' ? /orateur/ : /Je vote/ }).click()
  await p.getByLabel('Prénom').fill(firstName)
  await p.getByLabel('Nom', { exact: true }).fill(lastName)
  await p.getByRole('button', { name: mode === 'speaker' ? 'Entrer comme orateur' : 'Continuer' }).click()
  if (pin) {
    await p.getByText('Code des secrétaires').waitFor()
    await p.getByLabel('Code').fill('0000')
    await p.getByRole('button', { name: 'Valider' }).click()
    await p.getByText('Code incorrect.').waitFor({ timeout: 15000 })
    await p.getByLabel('Code').fill(pin)
    await p.getByRole('button', { name: 'Valider' }).click()
    await p.getByRole('link', { name: 'Gestion' }).first().waitFor({ timeout: 20000 })
  }
  return p
}
async function vote(name, best, worst, moment, comment, pin = null) {
  const [firstName, lastName] = name
  const p = await login(firstName, firstName, lastName, 'public', pin)
  await p.goto(BASE + `/votes/${matchId}`)
  await p.getByText('Vous votez en tant que').waitFor()
  await p.getByText(/Il vous reste du temps pour voter/).waitFor()
  await fillTicket(p, best, worst, moment, comment)
  return p
}
const ronny = await vote(['Ronny', 'verast'], 'Vigne', 'Leyder', 'Le petit pont sur le 9 adverse', 'Deux buts, une masterclass.')
await shot(ronny, '08-ticket-form')
await ronny.getByRole('button', { name: 'Envoyer mon vote' }).click()
await ronny.getByText('Vote envoyé', { exact: true }).waitFor()
await shot(ronny, '09-ticket-sent')
const mathis = await vote(['mathis', 'LEYDER'], 'Vigne', 'Verast', 'La roulette dans le rond central', 'Le passeur mérite aussi… mais bon.')
await mathis.getByRole('button', { name: 'Envoyer mon vote' }).click()
await mathis.getByText('Vote envoyé', { exact: true }).waitFor()
const jarne = await vote(['Jarne', 'Bellinghen'], 'Verast', 'Leyder', 'La glissade du gardien', 'Solide derrière.', '2468')
await shot(jarne, '07b-secretaire-par-code')
// Jarne garde un brouillon (ne pas envoyer)
await jarne.waitForTimeout(1500)

// 6. Orateur
const speaker = await login('speaker', 'Maxim', 'Leonard', 'speaker')
await speaker.goto(BASE + `/votes/${matchId}`)
await speaker.getByText('Phase de vote').waitFor()
await speaker.getByRole('button', { name: 'Participation' }).click()
await speaker.waitForTimeout(800)
await shot(speaker, '10-participation')
await speaker.getByRole('button', { name: 'Console' }).click()
await speaker.waitForTimeout(600)
await shot(speaker, '11-console-avant')
await speaker.getByRole('button', { name: 'Clôturer les votes et lire' }).click()
await speaker.getByText('Lecture par Maxim Leonard').waitFor()
await speaker.getByRole('button', { name: 'Mélanger' }).click()
await speaker.waitForTimeout(500)
await speaker.getByTitle('Attribuer une petite étoile').first().click()
await speaker.getByRole('button', { name: 'Lire' }).first().click()
await speaker.getByText('Lecture annoncée').waitFor()
await speaker.waitForTimeout(600)
await shot(speaker, '12-console-lecture')

// 7. Votant en direct + coup de coeur
await ronny.getByRole('button', { name: 'En direct' }).click()
await ronny.getByText('1 / 3 votes lus').waitFor()
await ronny.locator('article button:has(svg)').first().click()
await ronny.waitForTimeout(500)
await shot(ronny, '13-en-direct')
await speaker.getByRole('button', { name: 'Lire' }).first().click()
await speaker.waitForTimeout(600)
await speaker.getByTitle('Voir le nom de l’auteur (pour vous seul)').first().click()
await speaker.waitForTimeout(300)
await shot(speaker, '12b-console-nom-orateur')
await speaker.waitForTimeout(400)
if (await ronny.getByText('Vote anonyme').count() < 2) throw new Error('Les votes lus devraient être anonymes pour un votant')

// 7b. Troisième lecture : Maxime Vigne atteint 3 voix, le direct le signale
await speaker.getByRole('button', { name: 'Lire' }).first().click()
await speaker.getByText('Lecture annoncée').first().waitFor()
await ronny.getByText('3 / 3 votes lus').waitFor()
await ronny.getByText('3 voix atteintes').waitFor()
if ((await ronny.getByText('3e voix').count()) < 1) throw new Error('Le vote lu devrait porter le badge « 3e voix »')
await shot(ronny, '13b-alerte-3-voix')
await ronny.getByRole('button', { name: 'Classement' }).click()
await ronny.waitForTimeout(500)
await shot(ronny, '14-classement')
await speaker.getByRole('button', { name: 'Terminer la soirée' }).click()
await speaker.getByText('Soirée terminée').first().waitFor()

// 8. Admin : rétrospective + activité + accueil
await admin.goto(BASE + '/historique')
await admin.waitForTimeout(800)
await shot(admin, '15-retrospective')
await admin.goto(BASE + '/admin/activite')
await admin.waitForTimeout(800)
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
// Coum par défaut et seuil de l'alerte du direct
await admin.getByLabel(/Montant de la coum/).fill('12')
await admin.getByLabel(/Alerte en direct/).fill('3')
await admin.locator('.card', { hasText: 'La coum et le direct' }).getByRole('button', { name: 'Enregistrer' }).click()
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

// 8d. Récapitulatif des coums de la saison
await admin.goto(BASE + '/amendes')
await admin.getByRole('button', { name: /Coums/ }).click()
await admin.getByText('Par joueur').waitFor()
await admin.getByText('Par match').waitFor()
await shot(admin, '17d-coums-saison')

// 9. Mobile
const m = await ctx('mobile', true)
await m.goto(BASE)
await m.waitForTimeout(800)
await shot(m, '19-mobile-login')
await m.getByRole('button', { name: /Je vote/ }).click()
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

console.log('ERRORS', errors.length)
for (const e of errors) console.log(e)
await browser.close()
