import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getFacilities, linkRelayGroup, unlinkRelayGroup } from '../../api/facilities'
import type { Chapter, Prison } from '../../types'
import { Section } from '../forms/ClassedParts'
import RecordPicker from '../forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../forms/recordPickerState'
import type { UiClasses } from '../forms/uiClasses'
import { linkRefusal, useLinkAction } from './useLinkAction'

// The facilities a group prints and mails for: PUT and DELETE /prison/relay
// (README "PUT /prison/relay and DELETE /prison/relay"). A site admin links any
// group (pages/admin/EditGroup.tsx); a group admin links their own active group
// (pages/org/OrgSettings.tsx; README "What each role can do"). Changes apply at
// once, apart from the form's Save. The facility to link is searched for
// (RecordPicker), not picked from the whole directory.

interface Props {
  group: Chapter
  classes: UiClasses
  /** Where a facility's name links: its admin edit page, or its public page. */
  linkTo: (facility: Prison) => string
  /** Told how many facilities are linked, whenever that changes. */
  onCount?: (n: number) => void
}

export default function RelayFacilitiesPanel({ group: g, classes: c, linkTo, onCount }: Props) {
  const [linked, setLinked] = useState<Prison[]>(() => g.relay_prisons ?? [])
  useEffect(() => onCount?.(linked.length), [linked, onCount])
  const [choice, setChoice] = useState<Prison | null>(null)
  const { busy, error, run } = useLinkAction(linkRefusal)

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
          <RecordPicker<Prison>
            classes={{ input: c.input }}
            label="Facility to link"
            placeholder="Search facilities by name…"
            disabled={busy}
            fetch={(q) => getFacilities({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
            exclude={linked.map((f) => f.id)}
            render={(f) => (
              <>
                {f.prisonName}
                {f.country ? ` (${f.country})` : ''}
              </>
            )}
            onSelect={setChoice}
          />
          {choice && (
            <span className={c.static}>
              {choice.prisonName}
              {choice.country ? ` (${choice.country})` : ''}
            </span>
          )}
          <button
            type="button"
            className={c.button}
            disabled={!choice || busy}
            onClick={() => {
              const added = choice
              if (added)
                void run(async () => {
                  await linkRelayGroup(added.id, g.id)
                  setLinked((l) => [...l, added].sort((a, b) => a.prisonName.localeCompare(b.prisonName)))
                  setChoice(null)
                })
            }}
          >
            Link facility
          </button>
        </div>
        {error && <div className={c.alertErr}>{error}</div>}
      </Section>
    </div>
  )
}
