// Fusion de deux matchs en double : tout ce qui est rattaché au match supprimé (votes, coups de cœur,
// coum, buts, amendes, listes maison) passe sur le match conservé, sans rien perdre.
// Pur et sans dépendance : le plan se calcule avant toute écriture, pour l'aperçu et pour les tests.
import type { Coum, Fine, Goal, Like, Match, MatchStatus, StatEntry, Ticket, VoteCategory } from './types.ts'

const CATEGORIES: VoteCategory[] = ['best', 'worst', 'moment']

/** Tout ce qui est rattaché à un match. */
export interface MatchData {
  tickets: Ticket[]
  likes: Like[]
  coums: Coum[]
  goals: Goal[]
  fines: Fine[]
  statEntries: StatEntry[]
}

export type MergeWrite =
  | { kind: 'set'; path: string; data: Record<string, unknown> }
  | { kind: 'update'; path: string; data: Record<string, unknown> }
  | { kind: 'delete'; path: string }

export interface MergeSummary {
  /** Votes déplacés (brouillons compris). */
  tickets: number
  /** Votes d'un même auteur dans les deux matchs : les deux sont gardés, le second est signalé « doublon ». */
  duplicates: number
  /** Brouillons vides écartés parce que l'auteur a un vrai vote de l'autre côté. */
  emptyDrafts: number
  likes: number
  coums: number
  goals: number
  fines: number
  statEntries: number
}

export interface MergePlan {
  /**
   * Écritures groupées : chaque groupe déplace un document (création + suppression) et doit partir
   * dans la même écriture atomique, pour qu'un document ne soit jamais perdu ni dédoublé.
   */
  groups: MergeWrite[][]
  /** Mise à jour du match conservé et marquage du match fusionné, à écrire après tout le reste. */
  matchWrites: MergeWrite[]
  status: MatchStatus
  summary: MergeSummary
}

/** Un vote qui contient quelque chose : un joueur désigné ou un commentaire dans au moins une catégorie. */
export function ticketHasContent(t: Ticket): boolean {
  return CATEGORIES.some((c) => Boolean(t[c]?.playerId) || Boolean(t[c]?.comment?.trim()))
}

/**
 * État du match après fusion. Si l'un des deux a encore ses votes ouverts, ils restent ouverts
 * (personne ne perd la possibilité de voter ; les votes déjà lus le restent). Sinon on garde l'état
 * le plus avancé, mais une lecture « terminée » repasse en lecture s'il reste des votes à lire.
 */
export function mergedStatus(a: MatchStatus, b: MatchStatus, hasUnreadSubmitted: boolean): MatchStatus {
  if (a === 'voting' || b === 'voting') return 'voting'
  if (a === 'scheduled' && b === 'scheduled') return 'scheduled'
  if (a === 'reading' || b === 'reading') return 'reading'
  return hasUnreadSubmitted ? 'reading' : 'closed'
}

/** Partie de l'identifiant qui suit « <matchId>_ » (l'auteur, ou « manual-… » pour un vote hors plateforme). */
function suffixOf(id: string, matchId: string, fallback: string): string {
  return id.startsWith(matchId + '_') ? id.slice(matchId.length + 1) : fallback
}

function strip<T extends { id: string }>(d: T): Omit<T, 'id'> {
  const { id: _id, ...rest } = d
  return rest
}

const empty = (v: unknown) => v === null || v === undefined || v === ''

/**
 * @param target  match conservé
 * @param source  match en double, qui disparaît de l'application
 * @param now     horodatage à écrire (serverTimestamp() côté Firestore)
 * @param withMatches  false pour un passage de rattrapage (documents arrivés pendant la fusion) :
 *                     les matchs ne sont alors plus modifiés.
 */
export function planMerge(
  target: Match,
  source: Match,
  t: MatchData,
  s: MatchData,
  { now, by, withMatches = true }: { now: unknown; by: string; withMatches?: boolean },
): MergePlan {
  const groups: MergeWrite[][] = []
  const summary: MergeSummary = { tickets: 0, duplicates: 0, emptyDrafts: 0, likes: 0, coums: 0, goals: 0, fines: 0, statEntries: 0 }

  // ---- Votes ----
  const targetTickets = new Map(t.tickets.map((x) => [x.id, x]))
  const readOrderOffset = Math.max(0, ...t.tickets.map((x) => x.readOrder ?? 0))
  const ticketIds = new Map<string, string>()
  for (const st of s.tickets) {
    const suffix = suffixOf(st.id, source.id, st.authorPlayerId)
    const id = `${target.id}_${suffix}`
    const existing = targetTickets.get(id)
    const moved = {
      ...strip(st),
      matchId: target.id,
      readOrder: st.readOrder == null ? null : st.readOrder + readOrderOffset,
      mergedFrom: source.id,
    }
    const group: MergeWrite[] = []
    if (!existing) {
      group.push({ kind: 'set', path: `tickets/${id}`, data: moved })
      ticketIds.set(st.id, id)
      summary.tickets++
    } else if (!ticketHasContent(st)) {
      // Brouillon vide : rien à récupérer, le vote de l'autre côté reste tel quel.
      ticketIds.set(st.id, id)
      summary.emptyDrafts++
    } else if (!ticketHasContent(existing)) {
      // Le vote conservé était vide : celui du doublon le remplace.
      const authorUids = [...new Set([...(existing.authorUids ?? []), ...(st.authorUids ?? [])])]
      group.push({ kind: 'set', path: `tickets/${id}`, data: { ...moved, authorUids } })
      ticketIds.set(st.id, id)
      summary.tickets++
      summary.emptyDrafts++
    } else {
      // Le même auteur a voté dans les deux matchs : on garde les deux, le second est signalé.
      const dupId = `${id}__${source.id}`
      group.push({ kind: 'set', path: `tickets/${dupId}`, data: { ...moved, mergeDuplicate: true } })
      ticketIds.set(st.id, dupId)
      summary.tickets++
      summary.duplicates++
    }
    group.push({ kind: 'delete', path: `tickets/${st.id}` })
    groups.push(group)
  }

  // ---- Coups de cœur ----
  const targetLikes = new Set(t.likes.map((x) => x.id))
  for (const l of s.likes) {
    const base = `${target.id}_${l.voterPlayerId}_${l.category}`
    // Un votant qui a donné son coup de cœur dans les deux matchs : les deux sont gardés.
    const id = targetLikes.has(base) ? `${base}__${source.id}` : base
    groups.push([
      { kind: 'set', path: `likes/${id}`, data: { ...strip(l), matchId: target.id, ticketId: ticketIds.get(l.ticketId) ?? l.ticketId, mergedFrom: source.id } },
      { kind: 'delete', path: `likes/${l.id}` },
    ])
    summary.likes++
  }

  // ---- La coum : une feuille par joueur ; deux feuilles du même soir se combinent ----
  const targetCoums = new Map(t.coums.map((x) => [x.id, x]))
  for (const c of s.coums) {
    const id = `${target.id}_${c.playerId}`
    const existing = targetCoums.get(id)
    const group: MergeWrite[] = []
    if (existing) {
      // Même soirée notée deux fois : on garde le plus grand nombre de coums demandées et reçues
      // (une coum payée d'un côté n'est jamais perdue), et le joueur n'est absent que s'il l'est des deux côtés.
      group.push({
        kind: 'update',
        path: `coums/${id}`,
        data: {
          rounds: Math.max(existing.rounds ?? 1, c.rounds ?? 1),
          paid: Math.max(existing.paid ?? 0, c.paid ?? 0),
          absent: Boolean(existing.absent) && Boolean(c.absent),
          updatedAt: now,
        },
      })
    } else {
      group.push({ kind: 'set', path: `coums/${id}`, data: { ...strip(c), matchId: target.id } })
    }
    group.push({ kind: 'delete', path: `coums/${c.id}` })
    groups.push(group)
    summary.coums++
  }

  // ---- Buts, amendes, listes maison : seul le match change ----
  const goalOffset = t.goals.length ? Math.max(...t.goals.map((g) => g.order ?? 0)) + 1 : 0
  for (const g of s.goals) {
    groups.push([{ kind: 'update', path: `goals/${g.id}`, data: { matchId: target.id, order: (g.order ?? 0) + goalOffset } }])
    summary.goals++
  }
  for (const f of s.fines) {
    groups.push([{ kind: 'update', path: `fines/${f.id}`, data: { matchId: target.id } }])
    summary.fines++
  }
  for (const e of s.statEntries) {
    groups.push([{ kind: 'update', path: `statEntries/${e.id}`, data: { matchId: target.id } }])
    summary.statEntries++
  }

  // ---- Les matchs ----
  const hasUnread = [...t.tickets, ...s.tickets].some((x) => x.status === 'submitted' && x.readAt == null)
  const status = mergedStatus(target.status, source.status, hasUnread)
  const matchWrites: MergeWrite[] = []
  if (withMatches) {
    const patch: Record<string, unknown> = { status, updatedAt: now }
    // Informations manquantes sur le match conservé : reprises du doublon.
    for (const k of ['time', 'venue', 'details', 'competition'] as const) {
      if (empty(target[k]) && !empty(source[k])) patch[k] = source[k]
    }
    if (target.homeScore == null && target.awayScore == null && (source.homeScore != null || source.awayScore != null)) {
      patch.homeScore = source.homeScore
      patch.awayScore = source.awayScore
    }
    if (!target.speakerUid && source.speakerUid) {
      Object.assign(patch, {
        speakerName: source.speakerName ?? null,
        speakerUid: source.speakerUid,
        speakerPlayerId: source.speakerPlayerId ?? null,
        speakerSince: source.speakerSince ?? null,
      })
    }
    if (status !== 'voting' && status !== 'scheduled' && !target.readingStartedAt && source.readingStartedAt) patch.readingStartedAt = source.readingStartedAt
    if (status === 'closed' && !target.closedAt && source.closedAt) patch.closedAt = source.closedAt
    if (status !== 'voting') Object.assign(patch, { voteDeadline: null, voteTimerBy: null })
    matchWrites.push({ kind: 'update', path: `matches/${target.id}`, data: patch })
    // Le doublon n'est pas supprimé : il est marqué fusionné et masqué. Un match Sportlink supprimé
    // reviendrait à la synchronisation suivante, et un lien vers lui mène désormais au match conservé.
    matchWrites.push({
      kind: 'update',
      path: `matches/${source.id}`,
      data: { mergedInto: target.id, mergedAt: now, mergedBy: by, status: 'closed', voteDeadline: null, voteTimerBy: null, updatedAt: now },
    })
  }

  return { groups, matchWrites, status, summary }
}

/** « 12 votes (1 doublon), 30 coups de cœur, 14 coums, 2 buts » */
export function describeMergeSummary(s: MergeSummary): string {
  const n = (count: number, one: string, many: string) => (count ? `${count} ${count > 1 ? many : one}` : '')
  const parts = [
    s.tickets ? `${n(s.tickets, 'vote', 'votes')}${s.duplicates ? ` (${n(s.duplicates, 'doublon gardé', 'doublons gardés')})` : ''}` : '',
    n(s.likes, 'coup de cœur', 'coups de cœur'),
    n(s.coums, 'coum', 'coums'),
    n(s.goals, 'but', 'buts'),
    n(s.fines, 'amende', 'amendes'),
    n(s.statEntries, 'entrée de liste', 'entrées de liste'),
  ].filter(Boolean)
  return parts.length ? parts.join(', ') : 'rien à déplacer'
}

/** Champs du match qui décrivent la rencontre (repris pour créer le nouveau match). */
const MATCH_INFO = ['date', 'time', 'opponent', 'competition', 'home', 'homeScore', 'awayScore', 'venue', 'details'] as const

/**
 * Nouveau match créé à partir de deux doublons : les informations viennent de `base`
 * (les manques sont ensuite comblés par l'autre lors de la fusion). Il n'est pas relié à Sportlink :
 * la synchronisation continue de viser l'ancien match, masqué.
 */
export function newMatchData(base: Match, by: string, now: unknown): Record<string, unknown> {
  const data: Record<string, unknown> = Object.fromEntries(MATCH_INFO.map((k) => [k, base[k] ?? null]))
  return { ...data, cancelled: false, status: base.status, createdBy: by, createdAt: now, updatedAt: now }
}

/** Ce que contiendra le match cible une fois un plan appliqué (le match cible étant vide au départ). */
function dataAfter(plan: MergePlan, source: MatchData): MatchData {
  const sets = (name: string) =>
    plan.groups.flat().flatMap((w) => (w.kind === 'set' && w.path.startsWith(name + '/') ? [{ id: w.path.slice(name.length + 1), ...w.data }] : []))
  const patched = <T extends { id: string }>(name: string, list: T[]) =>
    list.map((x) => {
      const w = plan.groups.flat().find((u) => u.kind === 'update' && u.path === `${name}/${x.id}`)
      return w && w.kind === 'update' ? { ...x, ...w.data } : x
    })
  return {
    tickets: sets('tickets') as unknown as MatchData['tickets'],
    likes: sets('likes') as unknown as MatchData['likes'],
    coums: sets('coums') as unknown as MatchData['coums'],
    goals: patched('goals', source.goals),
    fines: patched('fines', source.fines),
    statEntries: patched('statEntries', source.statEntries),
  }
}

/**
 * Deux matchs en double → un troisième, neuf, qui reçoit tout : d'abord `a` (ses votes gardent
 * leur place), puis `b` (un joueur qui a voté des deux côtés garde ses deux votes, le second signalé).
 * Les deux anciens sont marqués fusionnés et masqués. Sert à l'aperçu ; l'exécution relit la base entre les deux étapes.
 */
export function planMergeIntoNew(target: Match, a: Match, b: Match, da: MatchData, db: MatchData, opts: { now: unknown; by: string }) {
  const first = planMerge(target, a, { tickets: [], likes: [], coums: [], goals: [], fines: [], statEntries: [] }, da, opts)
  const second = planMerge({ ...target, status: first.status }, b, dataAfter(first, da), db, opts)
  const summary = { ...first.summary }
  for (const k of Object.keys(summary) as (keyof MergeSummary)[]) summary[k] += second.summary[k]
  return { first, second, status: second.status, summary }
}
