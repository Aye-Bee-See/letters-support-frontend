import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllPrisoners, linkSupportGroup, unlinkSupportGroup } from '../../api/prisoners'
import { useApi } from '../../hooks/useApi'
import type { Chapter, Prisoner } from '../../types'
import { displayName } from '../../utils/prisoners'
import { Section } from '../forms/ClassedParts'
import type { UiClasses } from '../forms/uiClasses'
import { linkRefusal, useLinkAction } from './useLinkAction'

// The prisoners a group supports, each with a short public description: PUT and
// DELETE /prisoner/support (README "PUT /prisoner/support and DELETE
// /prisoner/support"). A site admin links any group; a group admin their own
// active group (README "What each role can do"). Changes apply at once.

type Supported = Prisoner & { PrisonerSupport?: { description: string | null } }

interface Props {
  group: Chapter
  classes: UiClasses
  /** Where a prisoner's name links: their admin edit page, or their public page. */
  linkTo: (prisoner: Prisoner) => string
}

export default function SupportedPrisonersPanel({ group: g, classes: c, linkTo }: Props) {
  const prisoners = useApi(() => getAllPrisoners({ sort: 'name' }), [])
  const [linked, setLinked] = useState<Supported[]>(() => g.supported_prisoners ?? [])
  const [choice, setChoice] = useState('')
  const [description, setDescription] = useState('')
  const { busy, error, run } = useLinkAction(linkRefusal)
  const available = (prisoners.data ?? []).filter((p) => !linked.some((l) => l.id === p.id))

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
          <select className={c.select} aria-label="Prisoner to link" value={choice} disabled={busy || !prisoners.data} onChange={(e) => setChoice(e.target.value)}>
            <option value="">{prisoners.data ? 'Choose a prisoner…' : prisoners.error ? 'Couldn’t load the prisoners' : 'Loading prisoners…'}</option>
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {displayName(p)}
                {p.recordStatus && p.recordStatus !== 'published' ? ` [${p.recordStatus}]` : ''}
              </option>
            ))}
          </select>
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
            onClick={() =>
              void run(async () => {
                const text = description.trim() || null
                await linkSupportGroup(Number(choice), g.id, text)
                const added = prisoners.data?.find((p) => String(p.id) === choice)
                if (added) setLinked((l) => [...l, { ...added, PrisonerSupport: { description: text } }])
                setChoice('')
                setDescription('')
              })
            }
          >
            Link prisoner
          </button>
        </div>
        {error && <div className={c.alertErr}>{error}</div>}
      </Section>
    </div>
  )
}
