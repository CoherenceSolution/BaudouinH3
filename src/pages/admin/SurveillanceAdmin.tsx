import { useEffect, useMemo, useState } from 'react'
import { collection, doc, getDoc, getDocs, limit, orderBy, query, Timestamp, where } from 'firebase/firestore'
import { AlertTriangle, Ban, CheckCircle2, Eye, Info, RotateCcw, ShieldAlert, Undo2 } from 'lucide-react'
import { db } from '@/lib/firebase'
import { useActivity, useStaffList } from '@/hooks/useData'
import { useActor } from '@/hooks/useActor'
import { analyse, applyUndo, detectAlerts, type Alert, type EntryStatus, type Trust } from '@/lib/undo'
import type { ActivityLog } from '@/lib/types'
import { cx, formatDateTime } from '@/lib/format'
import { Badge, Button, Card, Chip, Input, Select, Spinner } from '@/components/ui'
import { useToast } from '@/components/ui/Toast'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const MAX = 3000

type Period = { kind: 'hour' } | { kind: 'day24' } | { kind: 'date'; date: string } | { kind: 'range'; from: number; to: number; label: string }

const ROLE_LABEL: Record<string, string> = { admin: 'Admin', secretary: 'Secrétaire', speaker: 'Orateur', public: 'Membre' }

/** Bornes [début, fin] d'une période, en millisecondes. */
function bounds(p: Period, now: number): { from: number; to: number; label: string } {
  if (p.kind === 'hour') return { from: now - HOUR, to: now, label: 'la dernière heure' }
  if (p.kind === 'day24') return { from: now - DAY, to: now, label: 'les dernières 24 h' }
  if (p.kind === 'date') {
    const start = new Date(`${p.date}T00:00:00`).getTime()
    return { from: start, to: start + DAY - 1, label: `le ${new Date(start).toLocaleDateString('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' })}` }
  }
  return { from: p.from, to: p.to, label: p.label }
}

/**
 * Surveillance (admin) : ce qui sort de l'ordinaire dans le journal, et l'annulation groupée
 * des actions d'une personne sur une période (dernière heure, un jour précis…).
 */
export function SurveillanceAdmin() {
  const recent = useActivity(1500)
  const staff = useStaffList()
  const actor = useActor()
  const toast = useToast()

  const [person, setPerson] = useState('all')
  const [period, setPeriod] = useState<Period>({ kind: 'hour' })
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10))
  const [now, setNow] = useState(() => Date.now())
  const [loaded, setLoaded] = useState<ActivityLog[] | null>(null)
  const [truncated, setTruncated] = useState(false)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)
  const [identityTrust, setIdentityTrust] = useState<Map<string, Trust>>(new Map())

  const range = bounds(period, now)

  // Alertes : les 7 derniers jours.
  const alerts = useMemo(() => {
    const since = Date.now() - 7 * DAY
    return detectAlerts(recent.data.filter((a) => (a.at?.toMillis?.() ?? Date.now()) >= since))
  }, [recent.data])

  // Personnes : un appareil = une entrée (les droits de secrétaire suivent le nom, un nom peut avoir plusieurs appareils).
  const people = useMemo(() => {
    const m = new Map<string, { uid: string; name: string; role: string }>()
    for (const a of [...(loaded ?? []), ...recent.data]) if (a.actorUid && !m.has(a.actorUid)) m.set(a.actorUid, { uid: a.actorUid, name: a.actorName, role: a.actorRole })
    const list = [...m.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
    const count = new Map<string, number>()
    return list.map((p) => {
      const n = (count.get(p.name) ?? 0) + 1
      count.set(p.name, n)
      const twins = list.filter((x) => x.name === p.name).length
      return { ...p, label: `${p.name} · ${ROLE_LABEL[p.role] ?? p.role}${twins > 1 ? ` · appareil ${n}` : ''}` }
    })
  }, [loaded, recent.data])

  // Tout le journal depuis le début de la période : la période elle-même, et ce qui a suivi (conflits).
  useEffect(() => {
    let cancelled = false
    setLoaded(null)
    getDocs(query(collection(db, 'activity'), where('at', '>=', Timestamp.fromMillis(range.from)), orderBy('at', 'desc'), limit(MAX)))
      .then((snap) => {
        if (cancelled) return
        setLoaded(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ActivityLog, 'id'>) })))
        setTruncated(snap.size >= MAX)
      })
      .catch((e) => {
        console.error(e)
        if (!cancelled) setLoaded([])
      })
    return () => {
      cancelled = true
    }
  }, [range.from, reload])

  const selected = useMemo(
    () =>
      (loaded ?? []).filter((a) => {
        const t = a.at?.toMillis?.() ?? Date.now()
        return t >= range.from && t <= range.to && (person === 'all' || a.actorUid === person)
      }),
    [loaded, range.from, range.to, person],
  )

  // Droits actuels des auteurs : admin et ancien compte partagé (staff), secrétaires par leur nom (identities).
  useEffect(() => {
    const uids = [...new Set(selected.map((a) => a.actorUid))].filter((u) => u && !identityTrust.has(u) && !staff.data.some((s) => s.id === u))
    if (!uids.length) return
    let cancelled = false
    Promise.all(
      uids.map(async (uid): Promise<[string, Trust]> => {
        try {
          const id = await getDoc(doc(db, 'identities', uid))
          const playerId = id.exists() ? (id.data().playerId as string) : null
          const player = playerId ? await getDoc(doc(db, 'players', playerId)) : null
          return [uid, player?.exists() && player.data().role === 'secretary' ? 'staff' : 'public']
        } catch {
          return [uid, 'public']
        }
      }),
    ).then((pairs) => {
      if (!cancelled) setIdentityTrust((cur) => new Map([...cur, ...pairs]))
    })
    return () => {
      cancelled = true
    }
  }, [selected, staff.data, identityTrust])

  const trustOf = useMemo(
    () => (uid: string): Trust => {
      const s = staff.data.find((x) => x.id === uid)
      if (s) return s.role === 'admin' ? 'admin' : 'staff'
      return identityTrust.get(uid) ?? 'public'
    },
    [staff.data, identityTrust],
  )

  const statuses = useMemo(() => analyse(selected, loaded ?? [], trustOf), [selected, loaded, trustOf])

  // Cochées d'office : les actions annulables sans risque.
  useEffect(() => {
    setChecked(new Set(selected.filter((a) => statuses.get(a.id)?.kind === 'ok').map((a) => a.id)))
  }, [selected, statuses])

  function toggle(id: string) {
    setChecked((cur) => {
      const next = new Set(cur)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function examine(al: Alert) {
    setPerson(al.actorUid ?? 'all')
    setPeriod({ kind: 'range', from: al.from - 60_000, to: al.to + 60_000, label: `l’alerte « ${al.title} »` })
    document.getElementById('undo-tool')?.scrollIntoView({ behavior: 'smooth' })
  }

  const who = person === 'all' ? 'tout le monde' : (people.find((p) => p.uid === person)?.name ?? 'cette personne')
  const chosen = selected.filter((a) => checked.has(a.id))

  async function run() {
    if (!chosen.length) return
    if (!confirm(`Annuler ${chosen.length} action${chosen.length > 1 ? 's' : ''} de ${who} sur ${range.label} ? Les données reviennent à leur état d’avant. L’annulation est inscrite au journal et peut elle-même être annulée.`)) return
    setBusy(true)
    try {
      const { applied, skipped } = await applyUndo(chosen, actor, `${who}, ${range.label}`)
      toast(`${applied} action${applied > 1 ? 's' : ''} annulée${applied > 1 ? 's' : ''}${skipped ? ` (${skipped} écriture${skipped > 1 ? 's' : ''} sautée${skipped > 1 ? 's' : ''} : document supprimé depuis)` : ''}`)
      setNow(Date.now())
      setReload((n) => n + 1)
    } catch (e) {
      console.error(e)
      toast('Annulation impossible', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><ShieldAlert className="size-4" /> À surveiller (7 derniers jours)</h3>
        <p className="mb-3 text-[13px] text-muted">Repéré automatiquement dans le journal : rafales de modifications, suppressions en série, actions en pleine nuit, droits de secrétaire utilisés depuis plusieurs téléphones, score modifié plusieurs fois.</p>
        {recent.loading && recent.data.length === 0 ? (
          <Spinner />
        ) : alerts.length === 0 ? (
          <Card className="flex items-center gap-3 px-4 py-3 text-[14px]"><CheckCircle2 className="size-5 text-accent-strong" /> Rien d’inhabituel.</Card>
        ) : (
          <div className="space-y-2">
            {alerts.map((al) => (
              <Card key={al.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                {al.level === 'warn' ? <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" /> : <Info className="mt-0.5 size-5 shrink-0 text-sky" />}
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold">{al.title}</div>
                  <div className="text-[12px] text-muted">{al.detail}</div>
                  <div className="text-[12px] text-muted">{formatDateTime(new Date(al.from))}{al.to - al.from > 60_000 ? ` → ${formatDateTime(new Date(al.to))}` : ''}</div>
                </div>
                <Button size="sm" variant="secondary" icon={<Eye className="size-4" />} onClick={() => examine(al)}>Examiner</Button>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section id="undo-tool">
        <h3 className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Undo2 className="size-4" /> Annuler des actions</h3>
        <p className="mb-3 text-[13px] text-muted">
          Choisissez une personne et une période : ses actions s’affichent, celles qui peuvent être annulées sans risque sont cochées. Les données reviennent à leur état d’avant ; le journal garde tout, annulation comprise.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Select value={person} onChange={(e) => setPerson(e.target.value)} title="Personne">
            <option value="all">Tout le monde</option>
            {people.map((p) => <option key={p.uid} value={p.uid}>{p.label}</option>)}
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <Chip active={period.kind === 'hour'} onClick={() => { setNow(Date.now()); setPeriod({ kind: 'hour' }) }}>Dernière heure</Chip>
            <Chip active={period.kind === 'day24'} onClick={() => { setNow(Date.now()); setPeriod({ kind: 'day24' }) }}>24 h</Chip>
            <Chip active={period.kind === 'date'} onClick={() => setPeriod({ kind: 'date', date: day })}>Le jour…</Chip>
            {period.kind === 'date' && <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); if (e.target.value) setPeriod({ kind: 'date', date: e.target.value }) }} className="w-40" aria-label="Jour" />}
          </div>
        </div>
        {period.kind === 'range' && <p className="mt-2 text-[12px] text-muted">Période de {range.label} : {formatDateTime(new Date(range.from))} → {formatDateTime(new Date(range.to))}</p>}

        <div className="mt-3">
          {loaded === null ? (
            <Spinner />
          ) : selected.length === 0 ? (
            <Card className="px-4 py-8 text-center text-[13px] text-muted">Aucune action de {who} sur {range.label}.</Card>
          ) : (
            <Card className="divide-y divide-line">
              {selected.map((a) => (
                <UndoRow key={a.id} a={a} status={statuses.get(a.id)} checked={checked.has(a.id)} onToggle={() => toggle(a.id)} />
              ))}
            </Card>
          )}
          {truncated && <p className="mt-2 text-[12px] text-amber-700">Période très chargée : seules les {MAX} dernières entrées sont prises en compte. Choisissez une période plus courte.</p>}
        </div>

        {selected.length > 0 && (
          <div className="sticky bottom-20 mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-sm md:bottom-2">
            <span className="text-[13px] text-muted">{chosen.length} sur {selected.length} sélectionnée{chosen.length > 1 ? 's' : ''}</span>
            <Button variant="danger" icon={<RotateCcw className="size-4" />} disabled={!chosen.length} loading={busy} onClick={run}>
              Annuler {chosen.length} action{chosen.length > 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </section>
    </div>
  )
}

const STATUS_TEXT: Record<EntryStatus['kind'], string> = {
  ok: 'Annulable',
  undone: 'Déjà annulée',
  impossible: 'Rien à annuler',
  forbidden: 'Refusée',
  beyond: 'À vérifier',
  conflict: 'Modifié ensuite',
}

function UndoRow({ a, status, checked, onToggle }: { a: ActivityLog; status: EntryStatus | undefined; checked: boolean; onToggle: () => void }) {
  const kind = status?.kind ?? 'impossible'
  const selectable = kind === 'ok' || kind === 'conflict' || kind === 'beyond'
  const tone = kind === 'ok' ? 'accent' : kind === 'conflict' || kind === 'beyond' ? 'gold' : kind === 'forbidden' ? 'rose' : 'neutral'
  return (
    <label className={cx('flex items-start gap-3 px-4 py-2.5', selectable ? 'cursor-pointer' : 'opacity-60')}>
      <input type="checkbox" className="mt-1 size-4 shrink-0" checked={checked} disabled={!selectable} onChange={onToggle} />
      <div className="min-w-0 flex-1">
        <div className="text-[14px]">{a.summary}</div>
        {a.changes && a.changes.length > 0 && (
          <div className="mt-0.5 text-[12px] text-muted">{a.changes.map((c) => `${c.field} : ${c.before} → ${c.after}`).join(' ; ')}</div>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px] text-muted">
          <span>{formatDateTime(a.at?.toDate?.())}</span>
          <span className="font-medium text-ink-2">{a.actorName}</span>
          <Badge tone={tone}>{kind === 'forbidden' ? <Ban className="size-3" /> : null}{STATUS_TEXT[kind]}</Badge>
        </div>
        {status?.kind === 'conflict' && (
          <p className="mt-1 text-[12px] text-amber-700">
            Modifié ensuite par {[...new Set(status.later.map((b) => b.actorName))].join(', ')} ({status.later[0].summary}). L’annuler effacerait aussi ces changements : cochez seulement si c’est voulu.
          </p>
        )}
        {status?.kind === 'beyond' && <p className="mt-1 text-[12px] text-amber-700">Va au-delà des droits actuels de son auteur (droits retirés depuis ?). Cochez seulement après vérification.</p>}
        {status?.kind === 'forbidden' && <p className="mt-1 text-[12px] text-rose">Cette entrée demande de toucher à des données que son auteur ne peut pas modifier : elle n’est jamais appliquée.</p>}
        {status?.kind === 'undone' && <p className="mt-1 text-[12px] text-muted">Annulée par {status.by}.</p>}
      </div>
    </label>
  )
}
