import { describe, expect, it } from 'vitest'
import type { ApiError, MailRule } from '../types'
import { ruleRefusal } from './mailRules'

const SENTENCE = 'The API’s own sentence, not stable.'
const refusal = (over: Partial<ApiError>): ApiError => ({ status: 409, name: null, condition: null, errors: [], message: SENTENCE, ...over })
const rule = (id: number, tag: string, label: string, retired = false) => ({ id, tag, label, retired, category: 'content', description: null }) as MailRule
const rules = [rule(1, 'english_only', 'English only'), rule(2, 'no_polaroids', 'No polaroids', true)]

describe('ruleRefusal', () => {
  it('names the rule a DuplicateRuleError duplicates, by its id (API #212)', () => {
    expect(ruleRefusal(refusal({ name: 'DuplicateRuleError', ids: [1] }), rules)).toBe(
      'The master list already says this as “English only” (english_only). Use that one, or word this one differently.',
    )
    expect(ruleRefusal(refusal({ name: 'DuplicateRuleError', ids: [2] }), rules)).toMatch(/“No polaroids” \(no_polaroids\), which is retired\. Restore that one/)
  })

  it('says so plainly when the duplicated rule isn’t in the list on screen', () => {
    for (const ids of [[99], undefined]) {
      const text = ruleRefusal(refusal({ name: 'DuplicateRuleError', ids }), rules)
      expect(text).toMatch(/^The master list already says this in other words\. Reload the page/)
      expect(text).not.toContain(SENTENCE)
    }
  })

  it('counts the facilities a RuleInUseError lists, with no second request', () => {
    expect(ruleRefusal(refusal({ name: 'RuleInUseError', ids: [3, 8, 12] }), rules, rules[0])).toBe(
      '3 facilities carry this rule, so it can’t be deleted. Retire it instead: it stays where it is, and can’t be added to another facility.',
    )
    expect(ruleRefusal(refusal({ name: 'RuleInUseError', ids: [3] }), rules, rules[1])).toMatch(/^1 facility carries this rule, so it can’t be deleted\. It is retired already/)
    expect(ruleRefusal(refusal({ name: 'RuleInUseError' }), rules, rules[0])).toMatch(/^Facilities carry this rule/)
  })

  it('words a tag change and a 403 by name and status', () => {
    expect(ruleRefusal(refusal({ name: 'RuleTagError' }), rules)).toMatch(/^A rule’s tag never changes/)
    expect(ruleRefusal(refusal({ status: 403, name: 'AuthorizationError' }), rules)).toMatch(/^Only a site admin/)
  })
})
