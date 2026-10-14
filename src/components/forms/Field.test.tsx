import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './AdminFormParts'
import { Field as ClassedField } from './ClassedParts'
import RecordPicker from './RecordPicker'
import { GROUP_UI } from './uiClasses'

// A Field's hint describes its control (aria-describedby), and only its
// control: a Clear button beside a picker is not described by the picker's hint.

describe('Field', () => {
  it('links the hint to the input whose id it labels', () => {
    render(
      <Field label="Chosen name" htmlFor="f-chosenName" hint="The name they go by.">
        <input id="f-chosenName" className="form-input" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Chosen name', description: 'The name they go by.' })).toBeTruthy()
  })

  it('adds to a description the control already has', () => {
    render(
      <>
        <p id="other">Also this.</p>
        <Field label="Notes" htmlFor="f-notes" hint="Shown on the public page.">
          <textarea id="f-notes" aria-describedby="other" />
        </Field>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Notes', description: 'Also this. Shown on the public page.' })).toBeTruthy()
  })

  it('leaves a Field without a hint alone', () => {
    render(
      <Field label="Name" htmlFor="f-name">
        <input id="f-name" />
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Name' }).getAttribute('aria-describedby')).toBeNull()
  })

  it('describes the picker among several children, not the button beside it', () => {
    render(
      <ClassedField classes={GROUP_UI} label="Group to join" htmlFor="i-chapter" hint="Only an active group can take new group admins.">
        <div>
          <button type="button">Clear</button>
        </div>
        <RecordPicker id="i-chapter" label="Group" options={[]} text={() => ''} render={() => null} onSelect={() => {}} />
      </ClassedField>,
    )
    expect(screen.getByRole('combobox', { name: 'Group to join', description: 'Only an active group can take new group admins.' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Clear' }).getAttribute('aria-describedby')).toBeNull()
  })
})
