import type { ReactNode } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../hooks/useAuth'
import { useGroup } from '../../hooks/useGroup'
import { useGroupHousekeeping } from '../../hooks/useGroupHousekeeping'
import LoadState from '../ui/LoadState'

// Wraps every group admin's page (a layout route in App.tsx), so no page
// repeats these notices (group-admin-plan.md, section 3):
// - an account in no group, or a group that isn't active, gets a notice instead
//   of the page: the API lets such an account read only what the public reads,
//   and refuses every write with a 403, so the page could only fail;
// - a group admin without the group key in this session gets a notice above the
//   page, pointing to /settings/keys, except on the key and settings pages.
// Writers and superadmins pass straight through: /inbox, /threads/:id and
// /letters/new are theirs too.
//
// The record is GroupProvider's (context/GroupContext.tsx), shared with every
// page: the gate reads it rather than fetching, so its two places in App.tsx
// don't ask again when a page moves from one to the other, and the pages under
// it can count on the record being there (useGatedGroup).

/** Where the group key is set up and handed out; never told to go there. */
const KEY_PAGES = ['/settings', '/settings/keys']

function Closed({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="wrap">
      <h1>{title}</h1>
      {children}
    </div>
  )
}

function KeyNotice({ keyState }: { keyState: 'no-key' | 'not-held' }) {
  return (
    <div className="wrap">
      {/* The sentence is the live region; the link follows it, outside. */}
      <div className="stale-banner">
        <span className="stale-banner-icon" aria-hidden="true">
          ⚠
        </span>
        <span className="stale-banner-text">
          {keyState === 'no-key' ? (
            <>
              <span role="status">
                <strong>Your group has no group key yet.</strong> Until a group admin sets one up, letters can't be
                printed or written through your group, and nobody can read them here.
              </span>{' '}
              <Link to="/settings/keys">Set up the group key</Link>
            </>
          ) : (
            <>
              <span role="status">
                <strong>You don't hold your group's key yet.</strong> Until the group-owner admin hands it to you, you
                can't read your group's letters or write for its writers.
              </span>{' '}
              <Link to="/settings/keys">Group key</Link>
            </>
          )}
        </span>
      </div>
    </div>
  )
}

export default function GroupGate() {
  const { user } = useAuth()
  const { pathname } = useLocation()
  const group = useGroup()
  // Keys for keyless writers and envelopes for waiting letters, once per session (README "Latecomers").
  useGroupHousekeeping(group)
  const page = <Outlet />

  if (user?.role !== 'chapter') return page

  if (group.chapterId === null)
    return (
      <Closed title="You're not in a group yet">
        <p>
          This account is a group admin's, but it isn't part of any group, so there is nothing to manage here yet. A
          site admin adds group admins to their group.
        </p>
      </Closed>
    )

  // A 404: the API hides a group that isn't active, and unpublished, from its own admins.
  const hidden = group.error?.status === 404
  // Only the first load, or a record that couldn't be read at all: a reload keeps
  // the record on screen (GroupProvider), so moving between pages never blanks here.
  if (group.loading || (!group.group && group.error && !hidden))
    return (
      <div className="wrap">
        <LoadState state={{ data: group.group, error: group.error, loading: group.loading, reload: group.reload }} what="your group" />
      </div>
    )

  if (hidden || group.group?.accountStatus === 'pending')
    return (
      <Closed title="Your group is waiting for approval">
        <p>
          A site admin approves each new group before it can work. Until then you can read the public directory, but
          your group's letters, writers and settings stay closed, and nothing you change here could be saved.
        </p>
        <p>This page opens once a site admin activates the group.</p>
      </Closed>
    )

  if (group.group?.accountStatus === 'suspended')
    return (
      <Closed title="Your group is suspended">
        <p>
          A site admin has suspended your group. While it is suspended you can read the public directory, but your
          group's letters, writers and settings are closed, and nothing you change here could be saved.
        </p>
        <p>Only a site admin can make the group active again.</p>
      </Closed>
    )

  const path = pathname.replace(/\/+$/, '') || '/'
  return (
    <>
      {group.keyState !== 'ready' && !KEY_PAGES.includes(path) && <KeyNotice keyState={group.keyState} />}
      {page}
    </>
  )
}
