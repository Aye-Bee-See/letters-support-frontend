// Class names for the parts shared between a site admin's page and a group
// admin's (the link panels in components/group, the invitation parts in
// components/invitations). admin.css is loaded only under /admin (see
// AdminLayout), so a group admin's page can't use its names: the shared parts
// take one of these two sets instead. ADMIN_UI reproduces the admin pages'
// markup exactly; GROUP_UI names the classes in pages/org-settings.css. The
// pager (components/ui/Pager) has its own three sets at the end, the public
// directory pages being the third.

import type { CSSProperties } from 'react'

export interface UiClasses {
  /** A panel holding one titled section (a link panel, the invite form). */
  panel: string
  /** The section's heading and the block under it. */
  heading: string
  body: string
  /** A row of fields side by side; one field; its label and hint. */
  row: string
  field: string
  label: string
  hint: string
  /** A line of plain text in a form ("None linked."). */
  static: string
  input: string
  select: string
  /** A checkbox or radio with its words. */
  check: string
  /** A list of linked records, one per line with its buttons; the add row under it. */
  list: string
  listName: string
  listSub: string
  addRow: string
  /** Buttons: ordinary small, small and dangerous, the main one of a form. */
  button: string
  dangerButton: string
  primaryButton: string
  /** The row of buttons closing a form. */
  footer: string
  alertOk: string
  alertWarn: string
  alertErr: string
  /** Added to an alert that stands on its own above a form or table. */
  formError: string
  table: string
  /** A table cell that should not wrap; the cell of buttons. */
  nowrap: string
  actions: string
  /** Gone, expired: a line to read as stale. */
  stale: string
  /** Read by screen readers only. */
  srOnly: string
  /** A state badge: `badge` plus one of the three tones. */
  badge: string
  badgeGood: string
  badgeWait: string
  badgeBad: string
  /** The invite form's panel, and its row of kind radios. */
  invitePanel: string
  kindGroup: string
  /** A token shown once: the notice around it, a row of value and copy button, the code and the link. */
  tokenNotice: string
  tokenRow: string
  tokenCode: string
  tokenLink: string
  copyButton: string
  /** A button that reads as a link, inside a hint. */
  linkButton: string
}

export const ADMIN_UI: UiClasses = {
  panel: 'admin-form relay-panel',
  heading: 'admin-form-header',
  body: 'admin-form-body',
  row: 'form-row',
  field: 'form-group',
  label: 'form-label',
  hint: 'form-hint',
  static: 'form-static',
  input: 'form-input',
  select: 'form-select',
  check: 'queue-check',
  list: 'relay-list',
  listName: 'list-name',
  listSub: 'list-sub',
  addRow: 'relay-add',
  button: 'a-btn a-btn-sm',
  dangerButton: 'a-btn a-btn-danger a-btn-sm',
  primaryButton: 'a-btn a-btn-primary',
  footer: 'admin-form-footer',
  alertOk: 'admin-alert admin-alert-ok',
  alertWarn: 'admin-alert admin-alert-warn',
  alertErr: 'admin-alert admin-alert-err',
  formError: 'form-error',
  table: 'admin-table',
  nowrap: 'dash-nowrap',
  actions: 'actions',
  stale: 'list-stale',
  srOnly: 'visually-hidden',
  badge: 'badge',
  badgeGood: 'badge-published',
  badgeWait: 'badge-draft',
  badgeBad: 'badge-pending',
  invitePanel: 'admin-form invite-form',
  kindGroup: 'invite-kind',
  tokenNotice: 'admin-alert admin-alert-ok token-notice',
  tokenRow: 'token-row',
  tokenCode: 'token-code',
  tokenLink: 'token-link',
  copyButton: 'a-btn a-btn-sm',
  linkButton: 'link-button',
}

export const GROUP_UI: UiClasses = {
  panel: 'settings-section',
  heading: 'settings-section-heading',
  body: 'settings-form',
  row: 'settings-row',
  field: 'settings-field',
  label: 'settings-label',
  hint: 'settings-hint',
  static: 'settings-static',
  input: 'settings-input',
  select: 'settings-input',
  check: 'service-check',
  list: 'settings-list',
  listName: 'settings-list-name',
  listSub: 'settings-sub',
  addRow: 'settings-add-row',
  button: 'settings-btn',
  dangerButton: 'settings-btn settings-btn-danger',
  primaryButton: 'settings-save-btn',
  footer: 'settings-save-row',
  alertOk: 'settings-alert settings-alert-ok',
  alertWarn: 'settings-alert settings-alert-warn',
  alertErr: 'settings-alert settings-alert-err',
  formError: 'settings-alert-block',
  table: 'settings-table',
  nowrap: 'settings-nowrap',
  actions: 'settings-actions',
  stale: 'settings-stale',
  srOnly: 'settings-sr-only',
  badge: 'settings-badge',
  badgeGood: 'settings-badge-good',
  badgeWait: 'settings-badge-wait',
  badgeBad: 'settings-badge-bad',
  invitePanel: 'settings-section',
  kindGroup: 'settings-kind',
  // The dark code box of pages/handoff.css, where a claim token is shown once.
  tokenNotice: 'settings-token-notice',
  tokenRow: 'token-box',
  tokenCode: 'token-value',
  tokenLink: 'token-value settings-token-link',
  copyButton: 'token-copy-btn',
  linkButton: 'settings-link-button',
}

/** The pager under a list (components/ui/Pager): its row, its buttons and its "Page 2 of 5". */
export interface PagerClasses {
  nav?: string
  navStyle?: CSSProperties
  button: string
  /** Added to a disabled button (Previous on the first page, Next on the last). */
  disabledStyle?: CSSProperties
  text?: string
  textStyle?: CSSProperties
}

/** The admin lists (admin.css). */
export const ADMIN_PAGER: PagerClasses = { nav: 'queue-pager', button: 'a-btn a-btn-sm' }

/** The public directory pages: style.css's .filter-chip and .results-count, the rest inline. */
export const PUBLIC_PAGER: PagerClasses = {
  navStyle: { display: 'flex', gap: '0.75rem', alignItems: 'center', justifyContent: 'center', padding: '1.5rem 0 0' },
  button: 'filter-chip',
  disabledStyle: { opacity: 0.4, cursor: 'default' },
  text: 'results-count',
  textStyle: { marginLeft: 0 },
}

/** A group admin's settings pages (pages/org-settings.css). */
export const GROUP_PAGER: PagerClasses = { nav: 'settings-add-row', navStyle: { marginTop: '1rem' }, button: 'settings-btn', text: 'settings-sub' }
