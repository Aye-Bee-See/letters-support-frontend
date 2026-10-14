import { describe, expect, it } from 'vitest'
import { serviceLabel } from './groups'

describe('serviceLabel', () => {
  it('words a known service, lower case or capitalised', () => {
    expect(serviceLabel('letter_writing_nights')).toBe('letter writing nights')
    expect(serviceLabel('letter_writing_nights', true)).toBe('Letter writing nights')
  })

  it('shows a service this client does not know as its key rather than throwing', () => {
    expect(serviceLabel('prison_visits')).toBe('prison_visits')
    expect(serviceLabel('prison_visits', true)).toBe('Prison_visits')
  })
})
