import { describe, expect, it } from 'vitest'
import { matchLocal, moveActive, offered, pickerStatus, PICKER_PAGE_SIZE } from './recordPickerState'

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }))

describe('offered', () => {
  it('leaves out excluded ids', () => {
    expect(offered(rows(4), [2, 4]).map((r) => r.id)).toEqual([1, 3])
  })
  it('offers everything with nothing excluded', () => {
    expect(offered(rows(3), null)).toHaveLength(3)
    expect(offered(rows(3), [])).toHaveLength(3)
  })
})

describe('matchLocal', () => {
  const options = [
    { id: 1, label: 'Anonymously' },
    { id: 2, label: 'Ana Writer' },
    { id: 3, label: 'Bo' },
  ]
  it('lists every option for a blank query', () => {
    expect(matchLocal(options, (o) => o.label, '  ')).toEqual({ q: '', items: options, total: 3 })
  })
  it('matches case-insensitively, trimmed', () => {
    const answer = matchLocal(options, (o) => o.label, ' ANA ')
    expect(answer.q).toBe('ANA')
    expect(answer.items.map((o) => o.id)).toEqual([2])
  })
  it('keeps one page and counts the rest', () => {
    const many = rows(30).map((r) => ({ ...r, label: r.name }))
    const answer = matchLocal(many, (o) => o.label, 'row')
    expect(answer.items).toHaveLength(PICKER_PAGE_SIZE)
    expect(answer.total).toBe(30)
  })
})

describe('pickerStatus', () => {
  const answer = (q: string, n: number, total = n) => ({ q, items: rows(n), total })

  it('asks for text before searching the API', () => {
    expect(pickerStatus({ query: ' ', answer: null, shown: 0 })).toBe('Type to search')
  })
  it('says it is searching until the answer for this query is in', () => {
    expect(pickerStatus({ query: 'smi', answer: null, shown: 0 })).toBe('Searching…')
    expect(pickerStatus({ query: 'smit', answer: answer('smi', 3), shown: 0 })).toBe('Searching…')
  })
  it('says when nothing matches, or everything matching is excluded', () => {
    expect(pickerStatus({ query: 'zz', answer: answer('zz', 0), shown: 0 })).toBe('No matches')
    expect(pickerStatus({ query: 'ab', answer: answer('ab', 2), shown: 0 })).toBe('No matches')
  })
  it('says to keep typing when more match than one page', () => {
    expect(pickerStatus({ query: 'a', answer: answer('a', 20, 57), shown: 20 })).toBe('More than 20 match; keep typing')
  })
  it('says nothing when the matches are all shown', () => {
    expect(pickerStatus({ query: 'a', answer: answer('a', 5), shown: 5 })).toBeNull()
  })
  it('reports a failed search for this query only', () => {
    const failed = { q: 'smi', message: 'Could not reach the server.' }
    expect(pickerStatus({ query: 'smi', answer: null, failed, shown: 0 })).toMatch(/Could not reach the server/)
    expect(pickerStatus({ query: 'smit', answer: null, failed, shown: 0 })).toBe('Searching…')
  })
  it('lists local options for a blank query, unless they are still loading', () => {
    expect(pickerStatus({ query: '', answer: answer('', 3), shown: 3, browse: true })).toBeNull()
    expect(pickerStatus({ query: '', answer: answer('', 0), shown: 0, browse: true, loading: true })).toBe('Searching…')
  })
})

describe('moveActive', () => {
  it('starts at the first row from none, either way', () => {
    expect(moveActive(-1, 1, 5)).toBe(0)
    expect(moveActive(-1, -1, 5)).toBe(0)
  })
  it('moves and holds at the ends', () => {
    expect(moveActive(2, 1, 5)).toBe(3)
    expect(moveActive(4, 1, 5)).toBe(4)
    expect(moveActive(0, -1, 5)).toBe(0)
  })
  it('has nothing to highlight in an empty list', () => {
    expect(moveActive(-1, 1, 0)).toBe(-1)
  })
})
