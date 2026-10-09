import RecordPicker from './RecordPicker'
import { ADDRESS_PICKER } from './recordPickerState'

// The search box and dropdown from new-letter.html's address tiles
// (`addr-search`, `addr-dropdown`, `addr-option`; pages/new-letter.css) over a
// short list already in hand (the group's writers): RecordPicker with the
// tiles' classes. The prisoner tile searches the API with RecordPicker itself.

export interface AddressOption {
  id: number
  label: string
  sub?: string
}

/** An option's content in the tiles' dropdown: the name, and a line under it. */
export function AddressOptionText({ label, sub }: { label: string; sub?: string | null }) {
  return (
    <>
      {label}
      {sub && <div className="addr-option-sub">{sub}</div>}
    </>
  )
}

export default function AddressSearch({
  options,
  onSelect,
  placeholder,
  label,
  loading = false,
}: {
  options: AddressOption[]
  onSelect: (id: number) => void
  placeholder: string
  /** What is being searched, for screen readers (the tile's heading isn't a label). */
  label: string
  /** The options are still loading: "Searching…" rather than "No matches". */
  loading?: boolean
}) {
  return (
    <RecordPicker
      classes={ADDRESS_PICKER}
      label={label}
      placeholder={placeholder}
      options={options}
      text={(o) => `${o.label} ${o.sub ?? ''}`}
      loading={loading}
      render={(o) => <AddressOptionText label={o.label} sub={o.sub} />}
      onSelect={(o) => onSelect(o.id)}
    />
  )
}
