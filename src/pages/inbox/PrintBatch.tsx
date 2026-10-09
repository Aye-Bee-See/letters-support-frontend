import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { toApiError } from '../../api/client'
import { getAttachments, getMessage, setLetterStatusBatch } from '../../api/letters'
import PrintSheet, { PrintPageStyle, type SheetImage } from '../../components/group/PrintSheet'
import { useAuth } from '../../hooks/useAuth'
import { useGroup } from '../../hooks/useGroup'
import { openAttachment, openLetter, type LetterReader } from '../../letters/open'
import type { Message, Prison } from '../../types'
import { heldReasonShort, heldReasonText, statusRefusal, writerLabel } from '../../utils/groupLetters'
import { oldKeyText } from '../../utils/letters'
import { displayName } from '../../utils/prisoners'

// The print-batch sheet for letter nights (web audit 8 Oct, section 6 "For
// group admins"), at /letters/print-batch?ids=41,42,43 from the queue's
// selection. Every letter is read with full=true and opened with the group key
// (src/letters/open.ts), in the order the queue listed them, and printed each on
// its own page: the same PrintSheet as the one-letter page, so the text, the
// footer sentence and the enclosed images, and nothing else (no QR code or
// barcode: group-admin-plan.md, section 3). On screen each sheet has a cover
// line (prisoner, facility, writer); in print only the sheets remain
// (group-inbox.css, `printing-letter`).
//
// A letter that won't open, or can't be printed as it stands, is skipped with
// a notice and not marked. A held letter is printed only on purpose (README
// "Moved and freed"): `release` in the address names the held letters the
// group admin already confirmed in the queue; any other is asked about before
// printing. Mark all printed then uses PUT /messaging/status/batch, with
// `release: true` only for the held letters that were confirmed.

/** The batch endpoint's limit (README "PUT /messaging/status/batch"). */
const MAX_LETTERS = 200

/** How many letters are fetched and opened at once. */
const AT_ONCE = 4

const idList = (value: string | null): number[] => [
  ...new Set(
    (value ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0),
  ),
]

type Item =
  | { id: number; state: 'ready'; message: Message; text: string | null; images: SheetImage[] }
  | { id: number; state: 'skipped'; message: Message | null; why: string }

/** Read, check and open one letter for the batch; never throws. Object URLs made are pushed to `urls`. */
async function prepare(id: number, reader: LetterReader, chapterId: number, urls: string[]): Promise<Item> {
  let message: Message
  try {
    message = await getMessage(id, true)
  } catch (err) {
    const e = toApiError(err)
    const why = e.status === 404 ? 'it is gone: the writer may have deleted it' : e.status === 403 ? 'it isn’t your group’s to print' : 'it couldn’t be loaded'
    return { id, state: 'skipped', message: null, why }
  }
  const skip = (why: string): Item => ({ id, state: 'skipped', message, why })
  if (message.relayChapter !== chapterId) return skip('another group mails it now')
  if (message.status !== 'queued') return skip(`it is ${message.status === 'declined' ? 'marked not sent' : `already ${message.status}`}`)
  const opened = await openLetter(message, reader)
  if (opened.state === 'waiting') return skip('your group holds no copy of its key')
  if (opened.state === 'old-key') return skip(`it was ${oldKeyText(opened.sealedWith, opened.holding).short.toLowerCase()}`)
  if (opened.state === 'unreadable') return skip('it couldn’t be opened with your group’s key')

  let images: SheetImage[] = []
  if (!message.paper) {
    try {
      const rows = (await getAttachments(id)).filter((a) => a.mimeType.startsWith('image/'))
      images = await Promise.all(
        rows.map(async (attachment) => {
          try {
            const url = URL.createObjectURL(await openAttachment(attachment, opened.contentKey))
            urls.push(url)
            return { attachment, url }
          } catch {
            return { attachment, url: null }
          }
        }),
      )
    } catch {
      return skip('its enclosed files couldn’t be listed')
    }
    // Printing it without its enclosure and marking it printed would lose the image.
    if (images.some((f) => !f.url)) return skip('an enclosed image wouldn’t open')
  }
  return { id, state: 'ready', message, text: opened.text, images }
}

/** Every letter, prepared a few at a time, in the order asked. */
async function prepareAll(ids: number[], reader: LetterReader, chapterId: number, urls: string[], onProgress: (done: number) => void) {
  const items: Item[] = new Array(ids.length)
  let next = 0
  let done = 0
  const worker = async () => {
    while (next < ids.length) {
      const i = next++
      items[i] = await prepare(ids[i], reader, chapterId, urls)
      onProgress(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, ids.length) }, worker))
  return items
}

const lettersWord = (n: number) => (n === 1 ? '1 letter' : `${n} letters`)

function Cover({ m }: { m: Message }) {
  const prisoner = m.prisoner_details
  const prison = (prisoner?.prison_details ?? null) as Prison | null
  const held = m.status === 'queued' ? heldReasonShort(m.heldReason) : null
  return (
    <div className="print-batch-cover no-print">
      <strong>{prisoner ? displayName(prisoner) : 'Prisoner not in the directory'}</strong>
      {' · '}
      {prison?.prisonName ?? 'No facility listed'}
      {' · '}
      Writer: {writerLabel(m.user_details)}
      {' · '}
      <Link to={`/letters/${m.id}/print`}>Letter {m.id}</Link>
      {held && <span className="print-batch-held"> · {held}</span>}
    </div>
  )
}

/** Keyed on the address, so another batch starts again: nothing printed, confirmed or marked yet. */
export default function PrintBatch() {
  const [params] = useSearchParams()
  return <Batch key={params.toString()} params={params} />
}

function Batch({ params }: { params: URLSearchParams }) {
  const askedIds = idList(params.get('ids'))
  const ids = askedIds.slice(0, MAX_LETTERS)
  const idsKey = ids.join(',')
  const { user, keypair, groupKeypair, keys } = useAuth()
  const group = useGroup()
  const ready = group.keyState === 'ready' && !!keypair && !!groupKeypair && !!user && group.chapterId !== null

  const [items, setItems] = useState<{ key: string; list: Item[] } | null>(null)
  const [progress, setProgress] = useState(0)
  // Held letters the group admin chose to print: those confirmed in the queue, and any confirmed here.
  const [confirmed, setConfirmed] = useState<Set<number>>(() => new Set(idList(params.get('release'))))
  const [printed, setPrinted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'done' | 'error'; text: string } | null>(null)
  const [marked, setMarked] = useState(false)

  useEffect(() => {
    if (!ready || ids.length === 0) return
    let live = true
    const urls: string[] = []
    const reader: LetterReader = {
      userId: user!.id,
      keypair: keypair!,
      chapterId: group.chapterId,
      groupKeypair,
      groupKeyVersion: keys?.orgKey?.keyVersion ?? null,
    }
    void prepareAll(ids, reader, group.chapterId!, urls, (n) => live && setProgress(n)).then((list) => live && setItems({ key: idsKey, list }))
    return () => {
      live = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // The letters are read once per set of ids and key; `ids` is new on every render, `idsKey` is not.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, ready, user?.id, group.chapterId])

  const list = items?.key === idsKey ? items.list : null
  const sheets = (list ?? []).filter((i): i is Extract<Item, { state: 'ready' }> => i.state === 'ready')
  const skipped = (list ?? []).filter((i): i is Extract<Item, { state: 'skipped' }> => i.state === 'skipped')
  const held = sheets.filter((i) => i.message.heldReason)
  const unconfirmed = held.filter((i) => !confirmed.has(i.id))

  function print() {
    if (unconfirmed.length > 0) {
      const lines = unconfirmed.map((i) => `Letter ${i.id}: ${(heldReasonText(i.message.heldReason) ?? 'On hold').replace(/^On hold:?\s*/, '')}`)
      const question = `${unconfirmed.length === 1 ? 'This letter is' : `These ${unconfirmed.length} letters are`} on hold, and may never reach the person:\n\n${lines.join('\n')}\n\nPrint ${unconfirmed.length === 1 ? 'it' : 'them'} anyway?`
      if (!window.confirm(question)) return
      setConfirmed((s) => new Set([...s, ...unconfirmed.map((i) => i.id)]))
    }
    setPrinted(true)
    window.print()
  }

  async function markAll() {
    const plain = sheets.filter((i) => !i.message.heldReason).map((i) => i.id)
    const release = held.filter((i) => confirmed.has(i.id)).map((i) => i.id)
    setBusy(true)
    setNotice(null)
    let count = 0
    try {
      // Held letters go in a request of their own: `release: true` is for them only.
      if (plain.length > 0) count += (await setLetterStatusBatch(plain, { status: 'printed' })).count
      try {
        if (release.length > 0) count += (await setLetterStatusBatch(release, { status: 'printed', release: true })).count
      } catch (err) {
        const before = count > 0 ? `${lettersWord(count)} marked printed; the held ones weren’t. ` : ''
        setNotice({ kind: 'error', text: before + statusRefusal(toApiError(err), release, 'printed') })
        if (count > 0) setMarked(true)
        return
      }
      setMarked(true)
      setNotice({ kind: 'done', text: `${lettersWord(count)} marked printed.` })
    } catch (err) {
      setNotice({ kind: 'error', text: statusRefusal(toApiError(err), plain, 'printed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-wrap">
      <PrintPageStyle />
      <main className="thread-main print-batch">
        <div className="thread-header no-print">
          <Link to="/inbox?tab=print&filter=queued" className="thread-back">
            ← Back to the queue
          </Link>
          <h1 className="thread-title">Print a batch</h1>
          <div className="thread-meta">
            <span>
              {list ? `${lettersWord(sheets.length)} to print` : ids.length > 0 && ready ? `Opening ${progress} of ${ids.length}…` : ''}
              {list && skipped.length > 0 ? `, ${skipped.length} left out` : ''}
            </span>
          </div>
        </div>

        {ids.length === 0 && <div className="group-message no-print">No letters chosen. Select letters in the queue and choose Print selected.</div>}
        {askedIds.length > MAX_LETTERS && (
          <div className="group-message is-error no-print">Only the first {MAX_LETTERS} letters are here: that is the most that can be marked at once.</div>
        )}
        {!ready && ids.length > 0 && (
          <div className="group-message no-print">
            {group.keyState === 'no-key'
              ? 'These letters can’t be opened until a group admin sets up your group key.'
              : 'These letters can’t be opened until the group-owner admin hands you the group key.'}{' '}
            <Link to="/settings/keys">Group key</Link>
          </div>
        )}

        {skipped.length > 0 && (
          <div className="group-message is-error no-print" role="alert">
            <p>
              Left out of this batch, and not marked: {skipped.length === 1 ? 'open it' : 'open each'} from the queue to see where{' '}
              {skipped.length === 1 ? 'it stands' : 'they stand'}.
            </p>
            <ul className="print-batch-skipped">
              {skipped.map((i) => (
                <li key={i.id}>
                  <Link to={`/letters/${i.id}/print`}>Letter {i.id}</Link>
                  {i.message?.prisoner_details ? ` to ${displayName(i.message.prisoner_details)}` : ''}: {i.why}.
                </li>
              ))}
            </ul>
          </div>
        )}

        {notice && (
          <div className={notice.kind === 'error' ? 'group-message is-error no-print' : 'group-message is-done no-print'} role={notice.kind === 'error' ? 'alert' : 'status'}>
            {notice.text}{' '}
            {marked && <Link to="/inbox?tab=print&filter=printed">See the printed letters</Link>}
          </div>
        )}

        {sheets.length > 0 && (
          <div className="print-toolbar no-print">
            <button type="button" className="btn btn-sm btn-primary" onClick={print} disabled={marked}>
              Print {lettersWord(sheets.length)}
            </button>
            {printed && !marked && (
              <button type="button" className="btn btn-sm" onClick={() => void markAll()} disabled={busy}>
                {busy ? 'Marking…' : 'Mark all printed'}
              </button>
            )}
            <span>
              {marked
                ? 'These letters are marked printed.'
                : printed
                  ? 'Once every sheet has come out of the printer, mark them printed together.'
                  : 'Each letter starts a new page: its text, its footer and the enclosed images, nothing else.'}
            </span>
          </div>
        )}
        {unconfirmed.length > 0 && !printed && (
          <div className="group-message is-error no-print">
            {unconfirmed.length === 1 ? 'One letter here is' : `${unconfirmed.length} letters here are`} on hold. Printing has to be confirmed.
          </div>
        )}

        {sheets.map((i) => (
          <section key={i.id} className="print-batch-item">
            <Cover m={i.message} />
            <PrintSheet message={i.message} text={i.text} images={i.images} />
          </section>
        ))}
      </main>
    </div>
  )
}
