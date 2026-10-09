// The plain parts of RecordPicker (RecordPicker.tsx): what to offer, what the
// line under the box says, and how the arrow keys move.

/** How many matches a picker asks the API for and shows: one page. */
export const PICKER_PAGE_SIZE = 20

/** Wait this long after typing before searching (as useSearchBox does). */
export const PICKER_DELAY_MS = 300

/** Class names for a picker's parts. Without them, the parts are styled inline. */
export interface PickerClasses {
  input?: string
  dropdown?: string
  /** The dropdown while it is open. */
  dropdownOpen?: string
  option?: string
}

/** The new-letter address tiles' search and dropdown (pages/new-letter.css). */
export const ADDRESS_PICKER: PickerClasses = {
  input: 'addr-search',
  dropdown: 'addr-dropdown',
  dropdownOpen: 'addr-dropdown is-open',
  option: 'addr-option',
}

/** One search's answer: the first page of matches for `q`, and how many match in all. */
export interface PickerAnswer<T> {
  q: string
  items: T[]
  total: number
}

/** The rows to offer: the answer's, less those excluded (already linked, the record itself). */
export function offered<T extends { id: number }>(items: T[], exclude?: Iterable<number> | null): T[] {
  if (!exclude) return items
  const skip = new Set(exclude)
  return skip.size ? items.filter((row) => !skip.has(row.id)) : items
}

/**
 * Local options matching the query, as an answer: every option for a blank
 * query, otherwise those whose text contains it (case-insensitive).
 */
export function matchLocal<T>(options: T[], text: (row: T) => string, query: string, pageSize = PICKER_PAGE_SIZE): PickerAnswer<T> {
  const q = query.trim().toLowerCase()
  const found = q ? options.filter((row) => text(row).toLowerCase().includes(q)) : options
  return { q: query.trim(), items: found.slice(0, pageSize), total: found.length }
}

/**
 * The line under the box, or null when the matches speak for themselves.
 * `browse`: a blank query lists the first matches rather than asking for text.
 * `shown` is how many rows are on offer after exclusions.
 */
export function pickerStatus<T>({
  query,
  answer,
  failed,
  shown,
  browse = false,
  loading = false,
}: {
  query: string
  answer: PickerAnswer<T> | null
  /** The query whose search failed, and why. */
  failed?: { q: string; message: string } | null
  shown: number
  browse?: boolean
  /** Local options still loading. */
  loading?: boolean
}): string | null {
  const q = query.trim()
  if (!q && !browse) return 'Type to search'
  if (failed && failed.q === q) return `Couldn’t search (${failed.message}). Type again to retry.`
  if (loading || !answer || answer.q !== q) return 'Searching…'
  if (shown === 0) return 'No matches'
  if (answer.total > answer.items.length) return `More than ${answer.items.length} match; keep typing`
  return null
}

/** The highlighted row after an arrow key: from none, Down and Up both start at the first; the ends hold. */
export function moveActive(current: number, step: 1 | -1, count: number): number {
  if (count === 0) return -1
  if (current < 0) return 0
  return Math.min(Math.max(current + step, 0), count - 1)
}
