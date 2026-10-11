import { useEffect, useMemo, useState } from 'react'
import { ArrowDown, Copy, Merge, RefreshCw } from 'lucide-react'
import type { Match } from '@/lib/types'
import { formatDate, matchTitle, normalize } from '@/lib/format'
import { formatTime } from '@/lib/matches'
import { mergeMatches, previewMerge } from '@/lib/matchActions'
import { describeMergeSummary, type MergePlan } from '@/lib/matchMerge'
import { useActor } from '@/hooks/useActor'
import { useToast } from '@/components/ui/Toast'
import { Badge, Button, Modal, Select, Spinner } from '@/components/ui'
import { MatchStatusBadge } from '@/components/MatchCard'

const STATUS_AFTER: Record<Match['status'], string> = {
  scheduled: 'à venir',
  voting: 'votes ouverts',
  reading: 'lecture en cours',
  closed: 'terminé',
}

/** Ressemblance avec un doublon : 2 = même jour et même adversaire, 1 = l'un des deux, 0 = aucun. */
function likeness(a: Match, b: Match) {
  return Number(a.date === b.date) + Number(normalize(a.opponent) === normalize(b.opponent))
}
const looksLikeDuplicate = (a: Match, b: Match) => likeness(a, b) > 0

/**
 * Admin : fusionne deux matchs en double. Tout ce qui est rattaché au doublon (votes, coups de cœur, coum,
 * buts, amendes, listes) passe sur le match conservé ; un aperçu montre ce qui sera récupéré avant d'écrire.
 */
export function MergeMatchesModal({ match, matches, onClose }: { match: Match | null; matches: Match[]; onClose: () => void }) {
  const actor = useActor()
  const toast = useToast()
  const [otherId, setOtherId] = useState('')
  const [keepId, setKeepId] = useState('')
  const [plan, setPlan] = useState<MergePlan | null>(null)
  const [previewError, setPreviewError] = useState(false)
  const [busy, setBusy] = useState(false)

  // Les doublons probables d'abord.
  const candidates = useMemo(() => {
    if (!match) return []
    // Tri stable : à ressemblance égale, l'ordre de la liste (plus récents d'abord) est gardé.
    return matches.filter((m) => m.id !== match.id).sort((a, b) => likeness(b, match) - likeness(a, match))
  }, [match, matches])
  const other = candidates.find((m) => m.id === otherId)

  useEffect(() => {
    if (!match) return
    const first = candidates.find((m) => looksLikeDuplicate(m, match))
    setOtherId(first?.id ?? '')
  }, [match, candidates])

  // Par défaut on garde le match relié à Sportlink (ses mises à jour continuent), sinon celui choisi dans la liste.
  useEffect(() => {
    if (!match || !other) return setKeepId('')
    setKeepId(other.source === 'sportlink' && match.source !== 'sportlink' ? other.id : match.id)
  }, [match, other])

  const keep = keepId === match?.id ? match : other
  const drop = keepId === match?.id ? other : match

  useEffect(() => {
    setPlan(null)
    setPreviewError(false)
    if (!keep || !drop) return
    let cancelled = false
    previewMerge(keep.id, drop.id)
      .then((p) => !cancelled && setPlan(p))
      .catch((e) => {
        console.error(e)
        if (!cancelled) setPreviewError(true)
      })
    return () => {
      cancelled = true
    }
  }, [keep, drop])

  async function merge() {
    if (!keep || !drop) return
    if (!confirm(`Fusionner « ${matchTitle(drop)} » dans « ${matchTitle(keep)} » ? Tous ses votes y sont déplacés ; le doublon disparaît de la liste.`)) return
    setBusy(true)
    try {
      const summary = await mergeMatches(keep.id, drop.id, actor)
      toast(`Matchs fusionnés : ${describeMergeSummary(summary)}`)
      onClose()
    } catch (e) {
      console.error(e)
      toast('Fusion impossible : rien n’a été perdu, vous pouvez réessayer', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={match !== null}
      onClose={onClose}
      title="Fusionner deux matchs en double"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Annuler</Button>
          <Button icon={<Merge className="size-4" />} loading={busy} disabled={!plan} onClick={merge}>Fusionner</Button>
        </>
      }
    >
      {match && (
        <div className="space-y-4">
          <Select label="Match en double" value={otherId} onChange={(e) => setOtherId(e.target.value)}>
            <option value="">Choisir un match…</option>
            {candidates.map((m) => (
              <option key={m.id} value={m.id}>
                {looksLikeDuplicate(m, match) ? '★ ' : ''}{formatDate(m.date)}{m.time ? ` ${formatTime(m.time)}` : ''} — {matchTitle(m)}
              </option>
            ))}
          </Select>

          {keep && drop && (
            <>
              <div className="space-y-2">
                <p className="label">Match conservé</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[match, other!].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setKeepId(m.id)}
                      className={`rounded-xl border px-3 py-2.5 text-left ${keepId === m.id ? 'border-ink ring-2 ring-ink/10' : 'border-line hover:bg-slate-50'}`}
                    >
                      <div className="text-[14px] font-semibold">{matchTitle(m)}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
                        {formatDate(m.date)}{m.time && ` · ${formatTime(m.time)}`} <MatchStatusBadge status={m.status} cancelled={m.cancelled} />
                        {m.source === 'sportlink' && <Badge tone="sky"><RefreshCw className="size-3" /> Sportlink</Badge>}
                      </div>
                      <div className="mt-1.5 text-[12px] font-medium">{keepId === m.id ? 'Conservé' : 'Fusionné dedans, puis masqué'}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-xl bg-slate-50 px-4 py-3 text-[13px]">
                {previewError ? (
                  <p className="text-rose-600">Aperçu impossible. Vérifiez la connexion et réessayez.</p>
                ) : !plan ? (
                  <Spinner />
                ) : (
                  <div className="space-y-2">
                    <p className="flex items-center gap-1.5 font-medium"><ArrowDown className="size-4" /> Récupéré depuis « {matchTitle(drop)} » : {describeMergeSummary(plan.summary)}.</p>
                    {plan.summary.duplicates > 0 && (
                      <p className="flex gap-1.5 text-amber-700">
                        <Copy className="mt-0.5 size-4 shrink-0" />
                        {plan.summary.duplicates} joueur{plan.summary.duplicates > 1 ? 's ont' : ' a'} voté dans les deux matchs : les deux votes sont gardés. Le second porte
                        le badge « Doublon de fusion » dans la console de l’orateur, qui décide quoi en faire.
                      </p>
                    )}
                    <p className="text-muted">
                      Après la fusion, le match sera : {STATUS_AFTER[plan.status]}. Les votes déjà lus le restent, les autres rejoignent la file de lecture.
                      Les informations manquantes (heure, lieu, score…) sont reprises du doublon.
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  )
}
