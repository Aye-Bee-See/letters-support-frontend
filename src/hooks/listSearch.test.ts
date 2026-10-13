import { describe, expect, it } from 'vitest'
import { listSearch } from './useListParams'

describe('listSearch', () => {
  const params = new URLSearchParams('q=smi&country=Chile&page=3')

  it('adds a filter and keeps the others, back on page 1', () => {
    expect(listSearch(params, { status: 'free' })).toBe('?q=smi&country=Chile&status=free')
  })
  it('clears a filter with an empty value', () => {
    expect(listSearch(params, { country: undefined })).toBe('?q=smi')
  })
  it('keeps the rest when paging', () => {
    expect(listSearch(params, { page: '4' })).toBe('?q=smi&country=Chile&page=4')
  })
  it('is empty when nothing is left', () => {
    expect(listSearch(new URLSearchParams('country=Chile'), { country: undefined })).toBe('')
  })
})
