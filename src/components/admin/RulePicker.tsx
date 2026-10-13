import type { MailRuleList } from '../../types'
import { categoryLabel } from '../../utils/facilities'

interface Props {
  list: MailRuleList
  /** The rules the facility has now; none for a new one. */
  held?: Set<string>
  selected: Set<string>
  disabled: boolean
  onToggle: (tag: string) => void
}

/**
 * The master list of mail rules by category, for the site admin's facility
 * forms (pages/admin/NewFacility.tsx, EditFacility.tsx). A retired rule appears
 * only if the facility already has it: it can be kept or removed, but the API
 * refuses to add one.
 */
export default function RulePicker({ list, held, selected, disabled, onToggle }: Props) {
  return (
    <div className="rule-picker">
      {list.categories.map((category) => {
        const inCategory = list.rules.filter((r) => r.category === category && (!r.retired || held?.has(r.tag)))
        if (!inCategory.length) return null
        return (
          <fieldset key={category} className="rule-group">
            <legend className="form-hint">{categoryLabel(category)}</legend>
            {inCategory.map((rule) => (
              <label key={rule.tag} className="queue-check" title={rule.description ?? undefined}>
                <input type="checkbox" checked={selected.has(rule.tag)} disabled={disabled} onChange={() => onToggle(rule.tag)} />
                {rule.label}
                {rule.retired && <span className="list-sub"> (retired)</span>}
              </label>
            ))}
          </fieldset>
        )
      })}
    </div>
  )
}
