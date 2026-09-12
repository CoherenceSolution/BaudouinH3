// Scénario de bout en bout joué contre les émulateurs Firebase (npm run emulators) et le serveur Vite (npm run dev, .env avec VITE_USE_EMULATORS=true).
// Prérequis : npx playwright install chromium. Lancer : bash e2e/reset-emulators.sh && node e2e/scenario.mjs
// Il couvre : installation, création de match, amendes, buts, trois votants, orateur, lecture en direct, coups de cœur, rétrospective, mobile.

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

// 5. Votants
async function vote(name, best, worst, moment, comment, duoWith) {
  const p = await ctx('voter-' + name)
  await p.goto(BASE)
  await p.getByRole('button', { name: /Je vote/ }).click()
  await p.locator('input[placeholder="Rechercher un joueur…"]').fill(name)
  await p.getByRole('button', { name: new RegExp(name) }).first().click()
  await p.getByRole('button', { name: 'Continuer' }).click()
  await p.goto(BASE + `/votes/${matchId}`)
  await p.getByText('Vous votez en tant que').waitFor()
  if (duoWith) {
    await p.getByRole('switch').click()
    await p.locator('input[placeholder="Rechercher un joueur…"]').first().fill(duoWith)
    await p.getByRole('button', { name: new RegExp(duoWith) }).first().click()
  }
  const blocks = p.locator('article, .card').filter({ hasText: /Meilleur joueur|Pire joueur|Geste marquant/ })
  const bestBlock = p.locator('.card').filter({ hasText: '🏆' }).first()
  await bestBlock.locator('input[placeholder="Rechercher un joueur…"]').fill(best)
  await bestBlock.getByRole('button', { name: new RegExp(best) }).first().click()
  await bestBlock.locator('textarea').fill(comment)
  const worstBlock = p.locator('.card').filter({ hasText: '🥴' }).first()
  await worstBlock.locator('input[placeholder="Rechercher un joueur…"]').fill(worst)
  await worstBlock.getByRole('button', { name: new RegExp(worst) }).first().click()
  await worstBlock.locator('textarea').fill('Il a raté un but tout fait à la 12e.')
  const momentBlock = p.locator('.card').filter({ hasText: '⚡' }).first()
  await momentBlock.getByLabel('Le geste').fill(moment)
  await momentBlock.locator('textarea').fill('On en parlera encore à Noël.')
  void blocks
  return p
}
const ronny = await vote('Ronny', 'Vigne', 'Leyder', 'Le petit pont sur le 9 adverse', 'Deux buts, une masterclass.')
await shot(ronny, '08-ticket-form')
await ronny.getByRole('button', { name: 'Envoyer mon ticket' }).click()
await ronny.getByText('Ticket envoyé', { exact: true }).waitFor()
await shot(ronny, '09-ticket-sent')
const mathis = await vote('Mathis', 'Vigne', 'Verast', 'La roulette dans le rond central', 'Le passeur mérite aussi… mais bon.', 'Compere')
await mathis.getByRole('button', { name: 'Envoyer mon ticket' }).click()
await mathis.getByText('Ticket envoyé', { exact: true }).waitFor()
const jarne = await vote('Jarne', 'Verast', 'Leyder', 'La glissade du gardien', 'Solide derrière.')
// Jarne garde un brouillon (ne pas envoyer)
await jarne.waitForTimeout(1500)

// 6. Orateur
const speaker = await ctx('speaker')
await speaker.goto(BASE)
await speaker.getByRole('button', { name: /orateur/ }).click()
await speaker.locator('input[placeholder="Rechercher un joueur…"]').fill('Maxim ')
await speaker.getByRole('button', { name: /Maxim Leonard/ }).first().click()
await speaker.getByRole('button', { name: 'Entrer comme orateur' }).click()
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
await ronny.getByText('1 / 2 tickets lus').waitFor()
await ronny.locator('article button:has(svg)').first().click()
await ronny.waitForTimeout(500)
await shot(ronny, '13-en-direct')
await speaker.getByRole('button', { name: 'Lire' }).first().click()
await speaker.waitForTimeout(600)
await speaker.getByTitle('Afficher le nom de l’auteur').first().click()
await speaker.waitForTimeout(400)
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

// 9. Mobile
const m = await ctx('mobile', true)
await m.goto(BASE)
await m.waitForTimeout(800)
await shot(m, '19-mobile-login')
await m.getByRole('button', { name: /Je vote/ }).click()
await m.locator('input[placeholder="Rechercher un joueur…"]').fill('Kobe')
await m.getByRole('button', { name: /Kobe/ }).first().click()
await m.getByRole('button', { name: 'Continuer' }).click()
await m.waitForTimeout(800)
await shot(m, '20-mobile-home')
await m.goto(BASE + `/votes/${matchId}`)
await m.waitForTimeout(800)
await shot(m, '21-mobile-match')
await m.goto(BASE + '/amendes')
await m.waitForTimeout(800)
await shot(m, '22-mobile-amendes')

console.log('ERRORS', errors.length)
for (const e of errors) console.log(e)
await browser.close()
