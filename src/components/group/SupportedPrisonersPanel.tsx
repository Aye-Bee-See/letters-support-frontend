import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getPrisoners, linkSupportGroup, unlinkSupportGroup } from '../../api/prisoners'
import type { Chapter, Prisoner } from '../../types'
import { displayName } from '../../utils/prisoners'
import { Section } from '../forms/ClassedParts'
import RecordPicker from '../forms/RecordPicker'
import { PICKER_PAGE_SIZE } from '../forms/recordPickerState'
import type { UiClasses } from '../forms/uiClasses'
import { linkRefusal, useLinkAction } from './useLinkAction'

// The prisoners a group supports, each with a short public description: PUT and
// DELETE /prisoner/support (README "PUT /prisoner/support and DELETE
// /prisoner/support"). A site admin links any group; a group admin their own
// active group (README "What each role can do"). Changes apply at once. The
// prisoner to link is searched for (RecordPicker), not picked from the whole directory.

type Supported = Prisoner & { PrisonerSupport?: { description: string | null } }

interface Props {
  group: Chapter
  classes: UiClasses
  /** Where a prisoner's name links: their admin edit page, or their public page. */
  linkTo: (prisoner: Prisoner) => string
}

export default function SupportedPrisonersPanel({ group: g, classes: c, linkTo }: Props) {
  const [linked, setLinked] = useState<Supported[]>(() => g.supported_prisoners ?? [])
  const [choice, setChoice] = useState<Prisoner | null>(null)
  const [description, setDescription] = useState('')
  const { busy, error, run } = useLinkAction(linkRefusal)
  /** A prisoner as the picker and the chosen line name them; a site admin sees records not yet published, marked. */
  const nameOf = (p: Prisoner) => `${displayName(p)}${p.recordStatus && p.recordStatus !== 'published' ? ` [${p.recordStatus}]` : ''}`

  return (
    <div className={c.panel}>
      <Section classes={c} title="Supports">
        <p className={c.hint}>
          Prisoners this group supports, shown on both their pages with the description. Linking and unlinking happen straight away, without Save.
        </p>
        {linked.length === 0 ? (
          <p className={c.static}>None linked.</p>
        ) : (
          <ul className={c.list}>
            {linked.map((p) => (
              <li key={p.id}>
                <Link to={linkTo(p)}>{displayName(p)}</Link>
                {p.PrisonerSupport?.description && <span className={c.listSub}> {p.PrisonerSupport.description}</span>}
                <button
                  type="button"
                  className={c.dangerButton}
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(`Stop listing ${g.name} as supporting ${displayName(p)}?`))
                      void run(async () => {
                        await unlinkSupportGroup(p.id, g.id)
                        setLinked((l) => l.filter((x) => x.id !== p.id))
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
          <RecordPicker
            classes={{ input: c.input }}
            label="Prisoner to link"
            placeholder="Search prisoners by name…"
            disabled={busy}
            fetch={(q) => getPrisoners({ q, sort: 'name', page_size: PICKER_PAGE_SIZE })}
            exclude={linked.map((p) => p.id)}
            render={nameOf}
            onSelect={setChoice}
          />
          {choice && <span className={c.static}>{nameOf(choice)}</span>}
          <input
            className={c.input}
            aria-label="Description"
            placeholder="What the group does for them (optional)"
            value={description}
            disabled={busy}
            onChange={(e) => setDescription(e.target.value)}
          />
          <button
            type="button"
            className={c.button}
            disabled={!choice || busy}
            onClick={() => {
              const added = choice
              if (added)
                void run(async () => {
                  const text = description.trim() || null
                  await linkSupportGroup(added.id, g.id, text)
                  setLinked((l) => [...l, { ...added, PrisonerSupport: { description: text } }])
                  setChoice(null)
                  setDescription('')
                })
            }}
          >
            Link prisoner
          </button>
        </div>
        {error && <div className={c.alertErr} role="alert">{error}</div>}
      </Section>
    </div>
  )
}
