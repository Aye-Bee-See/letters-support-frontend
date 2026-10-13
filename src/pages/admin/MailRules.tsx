import { useState } from 'react'
import { createMailRule, deleteMailRule, getFacilities, getMailRules, updateMailRule } from '../../api/facilities'
import { Field, Section } from '../../components/forms/AdminFormParts'
import { useApi } from '../../hooks/useApi'
import type { ApiError, MailRule, MailRuleCategory, MailRuleList } from '../../types'
import { categoryLabel } from '../../utils/facilities'
import { commonRefusal, otherRefusal } from '../../utils/refusals'

// The master list of mail rules (README "Mail rules" > "Changing the master
// list (admin)"): every facility's rules are links into it, so new wording
// shows on every facility at once. GET /prison/mail-rules?retired=true lists it
// with the retired rules; POST, PUT and DELETE /prison/mail-rule add, reword,
// recategorise, retire, restore and delete. A tag never changes, because
// clients key translations and icons on it. A rule carries no value of its
// own: the three that do (page limit, photo limit, languages) are typed fields
// on each facility, listed here read-only, as are the pairs that conflict.

const TAG = /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/

/**
 * The words of a tag or label, order and plurals aside, as the API compares
 * them for its look-alike check (MailRule.lookalike): used only to name the
 * rule a 409 DuplicateRuleError is about, which the refusal's sentence does
 * but its name and condition can't.
 */
const fingerprint = (text: string) =>
  text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word))
    .sort()
    .join(' ')

function lookalike(rules: MailRule[], words: string[], exceptId?: number): MailRule | null {
  const wanted = new Set(words.filter(Boolean).map(fingerprint))
  return rules.find((r) => r.id !== exceptId && (wanted.has(fingerprint(r.tag)) || wanted.has(fingerprint(r.label)))) ?? null
}

const named = (r: MailRule) => `“${r.label}” (${r.tag})`

/** Every refusal on this page, from status, name and condition (README "Errors"); never the API's sentence. */
function ruleRefusal(error: ApiError, rules: MailRule[], words: string[], exceptId?: number): string {
  if (error.status === 403) return 'Only a site admin can change the master list, and the server didn’t take this account as one. Sign in again and try once more.'
  if (error.status === 409 && error.name === 'DuplicateRuleError') {
    const existing = lookalike(rules, words, exceptId)
    if (!existing) return 'The master list already says this in other words. Reload the page to see it, then use that rule or word this one differently.'
    return existing.retired
      ? `The master list already says this as ${named(existing)}, which is retired. Restore that one, or word this one differently.`
      : `The master list already says this as ${named(existing)}. Use that one, or word this one differently.`
  }
  if (error.status === 409 && error.name === 'RuleTagError') return 'A rule’s tag never changes. Retire this rule and add a new one with the tag you want.'
  return commonRefusal(error) ?? otherRefusal(error)
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

export default function MailRules() {
  // Staff get the retired rules too, flagged, to restore one.
  const list = useApi(() => getMailRules(true), [], { keepPrevious: true })
  const [notice, setNotice] = useState<string | null>(null)

  const data = list.data
  const rules = data?.rules ?? []
  const retired = rules.filter((r) => r.retired).length

  const changed = (text: string) => {
    setNotice(text)
    list.reload()
  }

  return (
    <>
      <title>Mail rules · Admin · letters.support</title>
      <div className="admin-topbar">
        <span className="topbar-title">Mail rules</span>
        <span className="topbar-right">{data && `${rules.length - retired} in use${retired ? `, ${retired} retired` : ''}`}</span>
      </div>

      <div className="admin-content">
        <p className="dash-note">
          The one list every facility’s mail rules come from. A facility holds a link to a rule, not a copy, so rewording a rule changes it on every
          facility at once. A rule’s tag never changes: the apps key their translations and icons on it. A rule that facilities carry can’t be deleted;
          retire it instead, and it stays on those facilities but can’t be added to others.
        </p>

        {list.loading && <p className="dash-note">Loading the mail rules…</p>}
        {list.error && (
          <div className="admin-alert admin-alert-err" role="alert">
            Couldn’t load the mail rules ({commonRefusal(list.error) ?? `the server refused, ${list.error.status}`}).{' '}
            <button type="button" className="a-btn a-btn-sm" onClick={list.reload}>
              Try again
            </button>
          </div>
        )}
        {/* Sticky below the sticky topbar (inline: admin.css has no rule for it) so the word on an action far down the list is seen where it was taken. */}
        {notice && (
          <div className="admin-alert admin-alert-ok" role="status" style={{ position: 'sticky', top: '3rem', zIndex: 1 }}>
            {notice}
          </div>
        )}

        {data && (
          <>
            <AddRule list={data} onAdded={(r) => changed(`Added ${named(r)}. Facilities can carry it now.`)} onEdit={() => setNotice(null)} />

            {data.categories.map((category) => (
              <CategoryTable
                key={category}
                category={category}
                list={data}
                rules={rules.filter((r) => r.category === category)}
                onChanged={changed}
                onEdit={() => setNotice(null)}
              />
            ))}

            <Parameters list={data} />
            <Conflicts list={data} />
          </>
        )}
      </div>
    </>
  )
}

function AddRule({ list, onAdded, onEdit }: { list: MailRuleList; onAdded: (rule: MailRule) => void; onEdit: () => void }) {
  const [tag, setTag] = useState('')
  const [category, setCategory] = useState<MailRuleCategory | ''>('')
  const [label, setLabel] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function problem(): string | null {
    const t = tag.trim()
    if (t.length < 3 || t.length > 40) return 'The tag must be 3 to 40 characters.'
    if (!TAG.test(t)) return 'The tag must be lower_snake_case: lower-case letters and digits in words joined by _, starting with a letter.'
    if (list.rules.some((r) => r.tag === t)) return `The tag ${t} is taken. Choose another.`
    if (!category) return 'Choose a category.'
    const l = label.trim()
    if (l.length < 3 || l.length > 80) return 'The label must be 3 to 80 characters.'
    return null
  }

  async function add() {
    const p = problem()
    if (p) return setError(p)
    setBusy(true)
    setError(null)
    try {
      const rule = await createMailRule({
        tag: tag.trim(),
        category: category as MailRuleCategory,
        label: label.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      setTag('')
      setCategory('')
      setLabel('')
      setDescription('')
      onAdded(rule)
    } catch (err) {
      setError(ruleRefusal(err as ApiError, list.rules, [tag.trim(), label.trim()]))
    } finally {
      setBusy(false)
    }
  }

  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setError(null)
    onEdit()
  }

  return (
    <form
      className="admin-form"
      onSubmit={(e) => {
        e.preventDefault()
        if (!busy) void add()
      }}
    >
      <Section title="Add a rule">
        <div className="form-row">
          <Field label="Tag" htmlFor="rule-tag" hint="lower_snake_case, 3 to 40 characters, e.g. no_crayon. It can never be changed.">
            <input id="rule-tag" className="form-input" value={tag} maxLength={40} disabled={busy} onChange={(e) => edit(setTag)(e.target.value)} />
          </Field>
          <Field label="Category" htmlFor="rule-category">
            <select
              id="rule-category"
              className="form-select"
              value={category}
              disabled={busy}
              onChange={(e) => edit(setCategory)(e.target.value as MailRuleCategory | '')}
            >
              <option value="">Choose…</option>
              {list.categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Label" htmlFor="rule-label" hint="3 to 80 characters, as a facility page shows it: “No crayon”.">
          <input id="rule-label" className="form-input" value={label} maxLength={80} disabled={busy} onChange={(e) => edit(setLabel)(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="rule-description" hint="Optional. What the rule means for a writer, in a sentence or two.">
          <textarea
            id="rule-description"
            className="form-textarea short"
            rows={2}
            value={description}
            disabled={busy}
            onChange={(e) => edit(setDescription)(e.target.value)}
          />
        </Field>
        <p className="form-hint">
          A rule is yes or no. A limit with a number or a list (pages, photos, languages) is a field on each facility, not a rule: see “Values set on each
          facility” below.
        </p>
        {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}
        <div className="queue-item-actions">
          <button type="submit" className="a-btn a-btn-primary a-btn-sm" disabled={busy || !tag.trim() || !label.trim() || !category}>
            {busy ? 'Adding…' : 'Add rule'}
          </button>
        </div>
      </Section>
    </form>
  )
}

interface TableProps {
  category: MailRuleCategory
  list: MailRuleList
  rules: MailRule[]
  onChanged: (notice: string) => void
  onEdit: () => void
}

function CategoryTable({ category, list, rules, onChanged, onEdit }: TableProps) {
  return (
    <section className="admin-table-wrap" style={{ marginTop: '1.25rem' }}>
      <div className="admin-table-toolbar">
        <span className="admin-table-toolbar-title">{categoryLabel(category)}</span>
        <span className="list-sub">{plural(rules.length, 'rule', 'rules')}</span>
      </div>
      {rules.length === 0 ? (
        <p className="dash-note">No rules in this category.</p>
      ) : (
        <table className="admin-table">
          <thead>
            <tr>
              <th>Tag</th>
              <th>Rule</th>
              <th>Status</th>
              <th>
                <span className="visually-hidden">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => (
              <RuleRow key={rule.id} rule={rule} list={list} onChanged={onChanged} onEdit={onEdit} />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

function RuleRow({ rule, list, onChanged, onEdit }: { rule: MailRule; list: MailRuleList; onChanged: (notice: string) => void; onEdit: () => void }) {
  const [editing, setEditing] = useState(false)
  const [label, setLabel] = useState(rule.label)
  const [category, setCategory] = useState<MailRuleCategory>(rule.category)
  const [description, setDescription] = useState(rule.description ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const startEditing = () => {
    setLabel(rule.label)
    setCategory(rule.category)
    setDescription(rule.description ?? '')
    setError(null)
    setEditing(true)
    onEdit()
  }

  async function run(action: () => Promise<string>, words: string[] = []) {
    setBusy(true)
    setError(null)
    onEdit()
    try {
      const notice = await action()
      setEditing(false)
      onChanged(notice)
    } catch (err) {
      const e = err as ApiError
      if (e.status === 409 && e.name === 'RuleInUseError') setError(await inUse(rule))
      else setError(ruleRefusal(e, list.rules, words, rule.id))
    } finally {
      setBusy(false)
    }
  }

  function save() {
    const l = label.trim()
    if (l.length < 3 || l.length > 80) return setError('The label must be 3 to 80 characters.')
    const changes = {
      ...(l !== rule.label ? { label: l } : {}),
      ...(category !== rule.category ? { category } : {}),
      ...(description.trim() !== (rule.description ?? '').trim() ? { description: description.trim() || null } : {}),
    }
    if (Object.keys(changes).length === 0) return setEditing(false)
    void run(async () => {
      const updated = await updateMailRule(rule.id, changes)
      return `Saved ${named(updated)}. ${updated.prisons > 0 ? `The new wording shows on the ${plural(updated.prisons, 'facility', 'facilities')} that carry it.` : 'No facility carries it yet.'}`
    }, [l])
  }

  const retire = (retired: boolean) =>
    run(async () => {
      const updated = await updateMailRule(rule.id, { retired })
      if (!retired) return `Restored ${named(updated)}: facilities can be given it again.`
      return `Retired ${named(updated)}. ${
        updated.prisons > 0
          ? `It stays on the ${plural(updated.prisons, 'facility', 'facilities')} that carry it, and can’t be added to others.`
          : 'No facility carries it, so it can be deleted now if it isn’t wanted at all.'
      }`
    })

  const remove = () => {
    if (!window.confirm(`Delete ${named(rule)} from the master list? This can’t be undone. A rule that facilities carry can’t be deleted; retire it instead.`))
      return
    void run(async () => {
      await deleteMailRule(rule.id)
      return `Deleted ${named(rule)}.`
    })
  }

  return (
    <>
      <tr>
        <td>
          <code className="dash-code">{rule.tag}</code>
        </td>
        <td>
          <div className="list-name">{rule.label}</div>
          {rule.description && <div className="list-sub">{rule.description}</div>}
        </td>
        <td>{rule.retired ? <span className="badge badge-pending">Retired</span> : <span className="badge badge-published">Offered</span>}</td>
        <td className="dash-nowrap">
          {!editing && (
            <span style={{ display: 'inline-flex', gap: '0.4rem' }}>
              <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={startEditing}>
                Edit
              </button>
              <button type="button" className="a-btn a-btn-sm" disabled={busy} onClick={() => void retire(!rule.retired)}>
                {rule.retired ? 'Restore' : 'Retire'}
              </button>
              <button type="button" className="a-btn a-btn-danger a-btn-sm" disabled={busy} onClick={remove}>
                Delete
              </button>
            </span>
          )}
        </td>
      </tr>
      {(editing || error) && (
        <tr>
          <td colSpan={4}>
            {editing && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  if (!busy) save()
                }}
              >
                <div className="form-row">
                  <Field label="Label" htmlFor={`label-${rule.id}`}>
                    <input
                      id={`label-${rule.id}`}
                      className="form-input"
                      value={label}
                      maxLength={80}
                      disabled={busy}
                      onChange={(e) => setLabel(e.target.value)}
                    />
                  </Field>
                  <Field label="Category" htmlFor={`category-${rule.id}`}>
                    <select
                      id={`category-${rule.id}`}
                      className="form-select"
                      value={category}
                      disabled={busy}
                      onChange={(e) => setCategory(e.target.value as MailRuleCategory)}
                    >
                      {list.categories.map((c) => (
                        <option key={c} value={c}>
                          {categoryLabel(c)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Description" htmlFor={`description-${rule.id}`}>
                  <textarea
                    id={`description-${rule.id}`}
                    className="form-textarea short"
                    rows={2}
                    value={description}
                    disabled={busy}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </Field>
                <p className="form-hint">The tag, {rule.tag}, stays as it is. New wording shows on every facility that carries the rule.</p>
                <div className="queue-item-actions">
                  <button type="submit" className="a-btn a-btn-primary a-btn-sm" disabled={busy}>
                    {busy ? 'Saving…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    className="a-btn a-btn-sm"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false)
                      setError(null)
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
            {error && <div className="admin-alert admin-alert-err" role="alert">{error}</div>}
          </td>
        </tr>
      )}
    </>
  )
}

/**
 * The words for a 409 RuleInUseError: how many facilities carry the rule
 * (GET /prison/prisons?mailRule=, the total of a one-row page), and that it
 * should be retired instead. The count is a second request; without it the
 * sentence still stands.
 */
async function inUse(rule: MailRule): Promise<string> {
  let carriers = 'Facilities carry this rule'
  try {
    const { total } = await getFacilities({ mailRule: rule.tag, page_size: 1 })
    if (total > 0) carriers = `${plural(total, 'facility carries', 'facilities carry')} this rule`
  } catch {
    // The count is a courtesy; the refusal is worded without it.
  }
  const retiring = 'it stays where it is, and can’t be added to another facility.'
  return `${carriers}, so it can’t be deleted. ${rule.retired ? `It is retired already: ${retiring}` : `Retire it instead: ${retiring}`}`
}

/** The three values a facility carries beside its rules (README "Mail rules"): set on each facility's own page. */
function Parameters({ list }: { list: MailRuleList }) {
  const entries = Object.entries(list.parameters)
  if (entries.length === 0) return null
  return (
    <section className="admin-table-wrap" style={{ marginTop: '1.25rem' }}>
      <div className="admin-table-toolbar">
        <span className="admin-table-toolbar-title">Values set on each facility</span>
      </div>
      <p className="dash-note">Rules that carry a number or a list are fields on each facility’s own page, not rules on this list. Read only here.</p>
      <table className="admin-table">
        <thead>
          <tr>
            <th>Field</th>
            <th>What it holds</th>
            <th>Meaning</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([key, p]) => (
            <tr key={key}>
              <td>
                <div className="list-name">{p.label}</div>
                <code className="dash-code">{key}</code>
              </td>
              <td>
                {p.type === 'integer' ? `A whole number${p.minimum !== undefined ? `, at least ${p.minimum}` : ''}` : p.type === 'array' ? `A list: ${p.items ?? 'values'}` : p.type}
              </td>
              <td>{p.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/** Pairs of rules no facility may carry together. Fixed in the API; read only. */
function Conflicts({ list }: { list: MailRuleList }) {
  const label = (tag: string) => list.rules.find((r) => r.tag === tag)?.label
  return (
    <section className="admin-table-wrap" style={{ marginTop: '1.25rem' }}>
      <div className="admin-table-toolbar">
        <span className="admin-table-toolbar-title">Rules that conflict</span>
      </div>
      <p className="dash-note">A facility can’t carry both rules of a pair. The pairs are fixed in the API; read only here.</p>
      {list.conflicts.length === 0 ? (
        <p className="dash-note">None.</p>
      ) : (
        <table className="admin-table">
          <tbody>
            {list.conflicts.map(([a, b]) => (
              <tr key={`${a}-${b}`}>
                <td>
                  {label(a) ?? a} <code className="dash-code">{a}</code>
                </td>
                <td>and</td>
                <td>
                  {label(b) ?? b} <code className="dash-code">{b}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
