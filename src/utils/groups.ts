import type { Chapter, ChapterService } from '../types'

// Display helpers for group (chapter) records.

/** Service keys in words, lower case as the prototype's tags ("letter writing nights"). */
export const SERVICE_LABELS: Record<ChapterService, string> = {
  letter_collection: 'letter collection',
  letter_writing_nights: 'letter writing nights',
  domestic_mailing: 'domestic mailing',
  international_mailing: 'international mailing',
  international_relay: 'international relay',
  translation_assistance: 'translation assistance',
  legal_support: 'legal support',
  book_programs: 'book programs',
}

/** "Portland, OR — United States" */
export function groupLocation(g: Pick<Chapter, 'subregion' | 'country'>): string {
  return [g.subregion, g.country].filter(Boolean).join(' — ')
}

/** Gathers letters (network role collecting or both). */
export const collectsLetters = (g: Pick<Chapter, 'networkRole'>) => g.networkRole === 'collecting' || g.networkRole === 'both'

/** Prints and mails (network role relay or both). */
export const relaysMail = (g: Pick<Chapter, 'networkRole'>) => g.networkRole === 'relay' || g.networkRole === 'both'
