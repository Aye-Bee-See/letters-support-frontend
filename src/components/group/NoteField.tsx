import { NOTE_LIMIT } from '../../utils/groupLetters'

// The note that goes with a return or a decline (README "Letter lifecycle"): at
// most 200 characters, shown to the writer, and never encrypted, in any mode.
// The form says so (group-admin-plan.md, section 3).

export default function NoteField({ id, value, onChange, hint }: { id: string; value: string; onChange: (v: string) => void; hint: string }) {
  return (
    <>
      <label htmlFor={id}>Note to the writer (optional)</label>
      <textarea id={id} aria-describedby={`${id}-hint`} value={value} maxLength={NOTE_LIMIT} onChange={(e) => onChange(e.target.value)} />
      <p className="letter-action-hint" id={`${id}-hint`}>
        {value.length}/{NOTE_LIMIT}. The writer reads this note, and it is <strong>not encrypted</strong>: {hint}
      </p>
    </>
  )
}
