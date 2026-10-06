import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { issueClaimToken, revokeClaimToken } from '../../api/writers'
import { toApiError } from '../../api/client'
import LoadState from '../../components/ui/LoadState'
import { createClaimToken, unlockManagedWriterKey, type Keypair } from '../../crypto'
import { describeWriterError, giveWriterKeys, isAnonymousWriter, writerLabel } from '../../groups/writers'
import { useAuth } from '../../hooks/useAuth'
import { useGroup } from '../../hooks/useGroup'
import { useLeaveGuard } from '../../hooks/useLeaveGuard'
import { useManagedWriter } from '../../hooks/useManagedWriter'
import type { Writer } from '../../types'

// Markup and classes from solidarity-site/handoff.html (pages/handoff.css).
// Handing a managed writer their account (README "Managed writers", "Managed
// writers and claiming"): the group's browser opens the writer's private key
// with the group key, locks it under a new claim token, and sends only the
// token's hash and the locked key (POST /auth/writer/token). The token is shown
// here once and never again: the server never learns it.

const dateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** The claim page with the token in it (src/pages/auth/Claim.tsx reads `token`). */
const claimLink = (token: string) => `${window.location.origin}/claim?token=${encodeURIComponent(token)}`

export default function Handoff() {
  const id = Number(useParams().id) || null
  const { groupKeypair } = useAuth()
  const { chapterId, keyState, keyVersion } = useGroup()
  const { writer, missing, loading, error, reload } = useManagedWriter(id)
  const [issued, setIssued] = useState<{ token: string; expiresAt: string } | null>(null)
  // Leaving loses the token on screen for good: ask first, for an in-app link as for closing the tab.
  useLeaveGuard(issued !== null, 'The claim token on this page is shown only now. Leave without copying it?')
  const [busy, setBusy] = useState<'issue' | 'revoke' | null>(null)
  const [problem, setProblem] = useState<string | null>(null)

  if (!writer) {
    return (
      <div className="handoff-wrap">
        <div className="handoff-inner">
          <Link to="/inbox?tab=writers" className="handoff-back">
            ← Your writers
          </Link>
          <h1 className="handoff-title">Hand off account</h1>
          {missing ? (
            <p className="handoff-writer-name">
              This writer is no longer one of your group's: they may have claimed their account already, or been deleted.
            </p>
          ) : (
            <LoadState state={{ data: writer, error, loading, reload }} what="this writer" />
          )}
        </div>
      </div>
    )
  }

  const name = writerLabel(writer)
  const anonymous = isAnonymousWriter(writer)
  const ready = keyState === 'ready' && groupKeypair !== null && chapterId !== null

  /** The writer's keypair: opened from the group's sealed copy, or made now for a writer who has none. */
  async function writerKeypair(w: Writer, group: Keypair, groupId: number): Promise<Keypair> {
    if (!w.publicKey) return giveWriterKeys(w.id, groupId, { publicKey: group.publicKey, keyVersion })
    if (!w.orgWrappedPrivateKey) throw new Error('Your group doesn’t hold a copy of this writer’s key, so it can’t be handed on.')
    try {
      return await unlockManagedWriterKey({ orgWrappedPrivateKey: w.orgWrappedPrivateKey, publicKey: w.publicKey }, group)
    } catch {
      throw new Error('This writer’s key is locked with a newer group key than the one open here. Sign in again, then hand off.')
    }
  }

  async function issue() {
    if (!ready || !writer || !groupKeypair || chapterId === null || busy) return
    setBusy('issue')
    setProblem(null)
    try {
      const keypair = await writerKeypair(writer, groupKeypair, chapterId)
      const material = await createClaimToken(keypair.privateKey)
      const answer = await issueClaimToken(writer.id, material.fields)
      setIssued({ token: material.token, expiresAt: answer.expiresAt })
    } catch (err) {
      setProblem(describeWriterError(err))
      // A writer given keys just now has them even if the token failed: the next try opens those.
      if (!writer.publicKey) reload()
    } finally {
      setBusy(null)
    }
  }

  async function revoke() {
    if (!writer || busy) return
    setBusy('revoke')
    setProblem(null)
    try {
      await revokeClaimToken(writer.id)
      reload()
    } catch (err) {
      // A 404: there was no live token (it expired, or someone revoked it first).
      if (toApiError(err).status === 404) reload()
      else setProblem(describeWriterError(err))
    } finally {
      setBusy(null)
    }
  }

  function done() {
    setIssued(null)
    reload()
  }

  return (
    <div className="handoff-wrap">
      <div className="handoff-inner">
        <Link to="/inbox?tab=writers" className="handoff-back">
          ← Your writers
        </Link>
        <h1 className="handoff-title">Hand off account</h1>
        <p className="handoff-writer-name">
          {name}
          {writer.penName && writer.name ? ` · ${writer.name}` : ''}
        </p>

        {anonymous ? (
          <div className="handoff-explainer">
            <p>
              <strong>The anonymous writer can never be handed off.</strong> It is shared by everyone your group writes for
              anonymously; whoever took it would own all of their letters, and receive the next ones.
            </p>
            <p>
              When someone who wrote anonymously wants an account of their own, <Link to="/writers/new">add a writer</Link> for
              them, write their next letters as that writer, and hand that account over. Their earlier anonymous letters stay
              with your group.
            </p>
          </div>
        ) : (
          <>
            <div className="handoff-explainer">
              <p>
                A claim token lets {name} take this account as their own: they choose a username and a password on the claim
                page, and keep their letters and replies so far.
              </p>
              <ul>
                <li>
                  <strong>Once they claim it, your group loses the account and its threads.</strong> You can no longer read them,
                  write as {name}, or record their replies. Letters your group mails for them still come through your queue.
                </li>
                <li>The token works once, until the date shown with it. Making a new one stops the old one.</li>
                <li>
                  Anyone holding the token can take the account. Give it to {name} in person, or through a channel you both already
                  trust. Nothing is sent by email.
                </li>
              </ul>
            </div>

            {!writer.publicKey && !issued && (
              <div className="pending-banner" role="status">
                <span>
                  <strong>{name} has no keys yet</strong> (the account was made before letters were encrypted). Making the token
                  gives them keys first, locked with your group's key; their earlier letters are then sealed to them too.
                </span>
              </div>
            )}

            {issued ? (
              <TokenShown token={issued.token} expiresAt={issued.expiresAt} name={name} onDone={done} />
            ) : !ready ? (
              <div className="pending-banner" role="status">
                <span>
                  <strong>Handing off needs the group key.</strong> {name}'s key is locked with it, and only opens in the browser
                  of a group admin who holds it.
                </span>
              </div>
            ) : (
              <>
                {writer.claimToken && (
                  <div className="pending-banner" role="status">
                    <span>
                      <strong>A claim token is out</strong>, valid until {dateTime(writer.claimToken.expiresAt)}. It isn't shown
                      again; if it was lost, make a new one, or revoke it.
                    </span>
                  </div>
                )}
                <div className="handoff-actions">
                  <button type="button" className="handoff-generate-btn" disabled={busy !== null} onClick={() => void issue()}>
                    {busy === 'issue'
                      ? 'Making the token…'
                      : writer.claimToken
                        ? 'Make a new token'
                        : writer.publicKey
                          ? 'Make a claim token'
                          : 'Give keys and make a claim token'}
                  </button>
                  {writer.claimToken && (
                    <button type="button" className="token-regenerate" disabled={busy !== null} onClick={() => void revoke()}>
                      {busy === 'revoke' ? 'Revoking…' : 'Revoke the token'}
                    </button>
                  )}
                </div>
              </>
            )}

            {problem && (
              <p className="handoff-error" role="alert">
                {problem}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** The token, once: copy buttons for it and for the claim link, the expiry, and "I've copied it". */
function TokenShown({ token, expiresAt, name, onDone }: { token: string; expiresAt: string; name: string; onDone: () => void }) {
  const [copy, setCopy] = useState<'idle' | 'token' | 'link' | 'failed'>('idle')
  const link = claimLink(token)

  async function copyText(text: string, what: 'token' | 'link') {
    try {
      // Undefined outside a secure context (the dev server over the LAN), and refused
      // without permission: either way the token on screen still works.
      if (!navigator.clipboard) throw new Error('No clipboard')
      await navigator.clipboard.writeText(text)
      setCopy(what)
    } catch {
      setCopy('failed')
    }
  }

  return (
    <div className="token-display is-visible" role="status">
      <div className="token-warning">
        <strong>This token is shown only now.</strong> Copy it or write it down before you leave this page: your group can't
        see it again, only make a new one.
      </div>
      <div className="token-box">
        <span className="token-value">{token}</span>
        <button type="button" className={copy === 'token' ? 'token-copy-btn copied' : 'token-copy-btn'} onClick={() => void copyText(token, 'token')}>
          {copy === 'token' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <div className="token-link-row">
        <span className="token-link-value">{link}</span>
        <button type="button" className={copy === 'link' ? 'token-copy-btn copied' : 'token-copy-btn'} onClick={() => void copyText(link, 'link')}>
          {copy === 'link' ? 'Copied' : 'Copy link'}
        </button>
      </div>
      {copy === 'failed' && (
        <div className="token-warning">This browser didn't allow copying. Select the token or the link above and copy it by hand, or write it down.</div>
      )}
      <div className="token-meta">
        <div className="token-meta-item">
          <span className="token-meta-label">For</span>
          <span>{name}</span>
        </div>
        <div className="token-meta-item">
          <span className="token-meta-label">Valid until</span>
          <span>{dateTime(expiresAt)}</span>
        </div>
      </div>
      <div className="token-instructions">
        <p>
          <strong>The link</strong> opens the claim page with the token filled in. <strong>Without the link</strong>, {name} goes to{' '}
          {window.location.host}/claim and types the token; capitals and dashes don't matter.
        </p>
      </div>
      <div>
        <button type="button" className="handoff-generate-btn" onClick={onDone}>
          I've copied it
        </button>
      </div>
    </div>
  )
}
