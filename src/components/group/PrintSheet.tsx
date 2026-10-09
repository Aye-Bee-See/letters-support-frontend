import { useEffect } from 'react'
import type { Attachment, Message } from '../../types'
import { footerSentence } from '../../utils/groupLetters'

// The sheet that goes inside a prison, shared by the one-letter print page
// (pages/inbox/PrintLetter.tsx) and the batch sheet (pages/inbox/PrintBatch.tsx)
// so the two cannot drift: the letter's text, the footer sentence (README
// "Reply reference") and the enclosed images, and nothing else. No QR code or
// barcode ever goes on it (group-admin-plan.md, section 3).

/** An enclosed file opened for printing: `url` is an object URL, null if it would not open. */
export interface SheetImage {
  attachment: Attachment
  url: string | null
}

/**
 * One letter's sheet. A paper letter has no text to print: the sheet is its
 * footer only, to copy onto the paper letter or enclose. `images` are the
 * letter's image attachments; those that opened are printed, each on a new page.
 */
export default function PrintSheet({ message: m, text, images }: { message: Message; text: string | null; images: SheetImage[] }) {
  return (
    <article className="print-sheet">
      {m.paper ? (
        <p className="print-sheet-empty no-print">Written on paper and handed to your group: there is no text to print.</p>
      ) : text ? (
        <div className="print-sheet-body">{text}</div>
      ) : (
        <p className="print-sheet-empty no-print">This letter has no typed text.</p>
      )}
      {m.footer && <p className="print-sheet-footer">{footerSentence(m.footer)}</p>}
      {!m.paper &&
        images.map((f) =>
          f.url ? <img key={f.attachment.id} className="print-sheet-image" src={f.url} alt={f.attachment.originalName ?? 'Enclosed image'} /> : null,
        )}
    </article>
  )
}

/**
 * While a print page is open: `printing-letter` on <body>, which the print
 * stylesheet (group-inbox.css) keys on to leave only the sheets, and the
 * sheets' 2cm margins. `@page` cannot sit under a selector, so the margins are
 * a <style> added here and removed on leaving: no other page's printing is
 * affected. Renders nothing.
 */
export function PrintPageStyle() {
  useEffect(() => {
    document.body.classList.add('printing-letter')
    const margins = document.createElement('style')
    margins.textContent = '@media print { @page { margin: 2cm; } }'
    document.head.appendChild(margins)
    return () => {
      document.body.classList.remove('printing-letter')
      margins.remove()
    }
  }, [])
  return null
}
