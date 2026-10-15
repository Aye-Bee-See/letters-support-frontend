import type { ApiError, MailRule } from '../types'
import { commonRefusal, otherRefusal } from './refusals'

// The master list of mail rules, as the site admin's page words it
// (pages/admin/MailRules.tsx; README "Changing the master list (admin)").

/** A rule by its label and tag: “No photos” (no_photos). */
export const ruleName = (r: Pick<MailRule, 'label' | 'tag'>) => `“${r.label}” (${r.tag})`

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/**
 * The words for a 409 RuleInUseError: how many facilities carry the rule (the
 * length of `ids`, API #212), and that it should be retired instead. Without
 * `ids` the sentence still stands.
 */
function inUse(ids: number[] | undefined, retired: boolean): string {
  const carriers = ids && ids.length > 0 ? `${plural(ids.length, 'facility carries', 'facilities carry')} this rule` : 'Facilities carry this rule'
  const retiring = 'it stays where it is, and can’t be added to another facility.'
  return `${carriers}, so it can’t be deleted. ${retired ? `It is retired already: ${retiring}` : `Retire it instead: ${retiring}`}`
}

/**
 * Every refusal on the page, from status, name and condition (README "Errors"); never the API's sentence.
 * A 409 DuplicateRuleError names the rule it duplicates by id in `ids` (API #212), looked up in the list on
 * screen; a RuleInUseError lists the facilities that carry the rule in `ids`. `rule`: the rule acted on, if any.
 */
export function ruleRefusal(error: ApiError, rules: MailRule[], rule?: Pick<MailRule, 'retired'>): string {
  if (error.status === 403) return 'Only a site admin can change the master list, and the server didn’t take this account as one. Sign in again and try once more.'
  if (error.status === 409 && error.name === 'DuplicateRuleError') {
    const existing = rules.find((r) => r.id === error.ids?.[0])
    if (!existing) return 'The master list already says this in other words. Reload the page to see it, then use that rule or word this one differently.'
    return existing.retired
      ? `The master list already says this as ${ruleName(existing)}, which is retired. Restore that one, or word this one differently.`
      : `The master list already says this as ${ruleName(existing)}. Use that one, or word this one differently.`
  }
  if (error.status === 409 && error.name === 'RuleTagError') return 'A rule’s tag never changes. Retire this rule and add a new one with the tag you want.'
  if (error.status === 409 && error.name === 'RuleInUseError') return inUse(error.ids, rule?.retired ?? false)
  return commonRefusal(error) ?? otherRefusal(error)
}
