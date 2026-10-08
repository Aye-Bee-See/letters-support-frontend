import type { Chat } from '../../types'
import { lastLetterLine } from '../../utils/groupLetters'

/** The "Last letter" cell of the Conversations and Writers tabs: an arrow for which way it went, and where it stands. */
export default function LastLetter({ chat }: { chat: Chat }) {
  const last = lastLetterLine(chat.last_message)
  if (!last) return null
  return (
    <span className={last.inbound ? 'convo-direction inbound' : 'convo-direction outbound'}>
      <span className="arrow">{last.inbound ? '←' : '→'}</span> {last.text}
    </span>
  )
}
