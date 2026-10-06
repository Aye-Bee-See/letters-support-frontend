import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllFacilities, linkRelayGroup, unlinkRelayGroup } from '../../api/facilities'
import { useApi } from '../../hooks/useApi'
import type { Chapter, Prison } from '../../types'
import { Section } from '../forms/ClassedParts'
import type { UiClasses } from '../forms/uiClasses'
import { linkRefusal, useLinkAction } from './useLinkAction'

// The facilities a group prints and mails for: PUT and DELETE /prison/relay
// (README "PUT /prison/relay and DELETE /prison/relay"). A site admin links any
// group (pages/admin/EditGroup.tsx); a group admin links their own active group
// (pages/org/OrgSettings.tsx; README "What each role can do"). Changes apply at
// once, apart from the form's Save.

interface Props {
  group: Chapter
  classes: UiClasses
  /** Where a facility's name links: its admin edit page, or its public page. */
  linkTo: (facility: Prison) => string
  /** Told how many facilities are linked, whenever that changes. */
  onCount?: (n: number) => void
}

export default function RelayFacilitiesPanel({ group: g, classes: c, linkTo, onCount }: Props) {
  const facilities = useApi(() => getAllFacilities({ sort: 'name' }), [])
  const [linked, setLinked] = useState<Prison[]>(() => g.relay_prisons ?? [])
  useEffect(() => onCount?.(linked.length), [linked, onCount])
  const [choice, setChoice] = useState('')
  const { busy, error, run } = useLinkAction(linkRefusal)
  const available = (facilities.data ?? []).filter((f) => !linked.some((l) => l.id === f.id))

  return (
    <div className={c.panel}>
      <Section classes={c} title="Relays for">
        <p className={c.hint}>
          Facilities this group prints and mails letters for. Linking and unlinking happen straight away, without Save.
          {g.accountStatus !== 'active' && ' While the group isn’t active, it can’t take letters for any of them.'}
        </p>
        {linked.length === 0 ? (
          <p className={c.static}>None linked.</p>
        ) : (
          <ul className={c.list}>
            {linked.map((f) => (
              <li key={f.id}>
                <Link to={linkTo(f)}>{f.prisonName}</Link>
                {f.country && <span className={c.listSub}> {f.country}</span>}
                <button
                  type="button"
                  className={c.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Stop ${g.name} relaying for ${f.prisonName}?`))
                      void run(async () => {
                        await unlinkRelayGroup(f.id, g.id)
                        setLinked((l) => l.filter((x) => x.id !== f.id))
                      })
                  }}
                >
                  Unlink
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className={c.addRow}>
          <select className={c.select} aria-label="Facility to link" value={choice} disabled={busy || !facilities.data} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{facilities.data ? 'Choose a facility…' : facilities.error ? 'Couldn’t load the facilities' : 'Loading facilities…'}</option>
            {available.map((f) => (
              <option key={f.id} value={f.id}>
                {f.prisonName}
                {f.country ? ` (${f.country})` : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={c.button}
            disabled={!choice || busy}
            onClick={() =>
              void run(async () => {
                await linkRelayGroup(Number(choice), g.id)
                const added = facilities.data?.find((f) => String(f.id) === choice)
                if (added) setLinked((l) => [...l, added].sort((a, b) => a.prisonName.localeCompare(b.prisonName)))
                setChoice('')
              })
            }
          >
            Link facility
          </button>
        </div>
        {error && <div className={c.alertErr}>{error}</div>}
      </Section>
    </div>
  )
}
