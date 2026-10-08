import { describe, expect, it } from 'vitest'
import type { ApiError, LetterFooter, MailRule, Message } from '../types'
import { batchDeclineRules, declineReasonForWriter, declineText, returnReasonText, shareRefusal, footerSentence, heldPrintQuestion, heldReasonShort, heldReasonText, lettersNamed, queueFilter, statusRefusal, writerInSentence, writerLabel } from './groupLetters'

const footer = (over: Partial<LetterFooter> = {}): LetterFooter => ({
  name: 'James Hollow',
  anonymous: false,
  careOf: { id: 3, name: 'PDX ABC' },
  reference: '4827-1935-8',
  replySheetAllowed: false,
  ...over,
})

const error = (over: Partial<ApiError>): ApiError => ({ status: 409, name: 'LetterStatusError', condition: null, errors: [], message: '', ...over })

describe('footerSentence', () => {
  it('says the name, the group and the reference (README "Reply reference")', () => {
    expect(footerSentence(footer())).toBe(
      'Write back to James Hollow, c/o PDX ABC. Reference 4827-1935-8: please write this number at the top of your reply.',
    )
  })

  it('leaves the reference out where the facility refuses numbers', () => {
    expect(footerSentence(footer({ reference: null }))).toBe('Write back to James Hollow, c/o PDX ABC.')
  })

  it('names the group only for the anonymous writer', () => {
    expect(footerSentence(footer({ name: null, anonymous: true }))).toBe(
      'Write back to PDX ABC. Reference 4827-1935-8: please write this number at the top of your reply.',
    )
    expect(footerSentence(footer({ name: null, anonymous: true, reference: null }))).toBe('Write back to PDX ABC.')
  })
})

describe('held reasons', () => {
  it('words the four known reasons, and an unknown one is still held', () => {
    expect(heldReasonText('writer_blocked')).toContain('blocked')
    expect(heldReasonText('prisoner_free')).toContain('released')
    expect(heldReasonText('choose_relay')).toContain('choose')
    expect(heldReasonText('reseal_needed')).toContain('send it again')
    expect(heldReasonText('something_new')).toBe('On hold')
    expect(heldReasonShort('something_new')).toBe('Held')
    expect(heldReasonText(null)).toBeNull()
  })

  it('says your group blocked the writer only when the letter is this group’s', () => {
    expect(heldReasonText('writer_blocked', { ours: true, name: 'PDX ABC' })).toBe('On hold: your group blocked this writer')
    expect(heldReasonText('writer_blocked', { ours: false, name: 'Bay ABC' })).toBe('On hold: Bay ABC blocked this writer')
    expect(heldReasonText('writer_blocked', { ours: false, name: null })).toBe('On hold: the group that mails it blocked this writer')
    expect(heldReasonText('choose_relay', { ours: false, name: 'Bay ABC' })).toBe(heldReasonText('choose_relay'))
  })
})

describe('reasons as the writer reads them', () => {
  it('finishes the writer’s sentences from the same maps the forms use', () => {
    expect(declineReasonForWriter('content')).toBe('it was judged inappropriate or unsafe to send')
    expect(declineReasonForWriter('facility_rule')).toBe('it would break one of the facility’s mail rules')
    expect(declineReasonForWriter('something_new')).toBe('of something else')
    expect(declineReasonForWriter(null)).toBe('of something else')
    expect(returnReasonText('unknown')).toBe('Nothing says why')
  })
})

describe('queueFilter', () => {
  it('falls back to the queue', () => {
    expect(queueFilter('held')).toMatchObject({ status: 'queued', held: true })
    expect(queueFilter('declined').label).toBe('Not sent')
    expect(queueFilter(null).key).toBe('queued')
  })
})

describe('declineText', () => {
  it('quotes the rule label kept with the letter', () => {
    expect(declineText({ declineReason: 'facility_rule', declineRuleLabel: 'Handwritten letters only' })).toContain('“Handwritten letters only”')
    expect(declineText({ declineReason: 'facility_rule', declineRuleLabel: null })).not.toContain('“')
    expect(declineText({ declineReason: 'content', declineRuleLabel: null })).toContain('unsafe')
  })
})

describe('writerLabel', () => {
  it('prefers the pen name and says Anonymous for the group’s anonymous writer', () => {
    expect(writerLabel({ penName: 'Hollow', name: 'James', username: 'j' })).toBe('Hollow')
    expect(writerLabel({ penName: null, name: 'James', username: 'j' })).toBe('James')
    expect(writerLabel({ name: 'Test Chapter anonymous', anonymousForChapter: 1 })).toBe('Anonymous')
  })

  it('falls back to the username, then to the fallback', () => {
    expect(writerLabel({ penName: '', name: null, username: 'j' })).toBe('j')
    expect(writerLabel(null)).toBe('Unknown writer')
    expect(writerLabel(null, 'A writer whose account is gone')).toBe('A writer whose account is gone')
  })

  it('reads the anonymous flag of a reference lookup or a writer search', () => {
    expect(writerLabel({ penName: null, name: 'PDX anonymous', anonymous: true })).toBe('Anonymous')
    expect(writerLabel({ penName: 'Hollow', name: null, anonymous: false })).toBe('Hollow')
  })
})

describe('writerInSentence', () => {
  it('names the anonymous writer as the group’s, so no sentence reads “Anonymous’s”', () => {
    expect(writerInSentence({ name: 'Test Chapter anonymous', anonymousForChapter: 1 })).toBe('the group’s anonymous writer')
    expect(writerInSentence({ penName: null, name: null, anonymous: true })).toBe('the group’s anonymous writer')
  })

  it('otherwise names the writer as writerLabel does, and “this writer” when there is none', () => {
    expect(writerInSentence({ penName: 'Hollow', name: 'James', username: 'j' })).toBe('Hollow')
    expect(writerInSentence(null)).toBe('this writer')
    expect(writerInSentence({ penName: null, name: null, anonymous: false }, 'writer 7')).toBe('writer 7')
  })
})

describe('batch refusals (README "PUT /messaging/status/batch")', () => {
  const ids = [41, 42, 43]

  it('takes the letters from `ids`, among those asked for, and not from the sentence', () => {
    expect(lettersNamed({ message: 'Letter 42: a printed letter cannot move to printed.', ids: [42] }, ids)).toEqual([42])
    expect(lettersNamed({ message: 'Message 41, 43 not found', ids: [41, 43] }, ids)).toEqual([41, 43])
    expect(lettersNamed({ message: 'Letter 41 is wrong', ids: [] }, ids)).toEqual([])
    expect(lettersNamed({ message: '', ids: [99] }, ids)).toEqual([])
  })

  it('takes the letters of a facility_rule decline from problems[0].params.ids', () => {
    const problems = [{ field: 'rule', code: 'not_eligible', params: { ids: [43] } }]
    expect(lettersNamed({ message: 'The facility of letter 41 has no mail rule', problems }, ids)).toEqual([43])
  })

  it('reads the sentence only when the API sent no ids (an older API)', () => {
    expect(lettersNamed({ message: 'Letter 42: a printed letter cannot move to printed.' }, ids)).toEqual([42])
    expect(lettersNamed({ message: 'Chapter 3 is not active' }, [41])).toEqual([])
  })

  it('words letter_status.not_allowed, naming the letter from ids', () => {
    const refusal = error({ condition: 'not_allowed', ids: [42], message: 'Letter 41: nothing to do with it.' })
    expect(statusRefusal(refusal, ids, 'printed')).toMatch(/^Letter 42 can’t be marked printed/)
    expect(statusRefusal(refusal, ids, 'printed')).toContain('Nothing was marked')
    expect(statusRefusal(refusal, [42], 'printed')).not.toContain('Nothing was marked')
  })

  it('words letter_held.<heldReason> by the hold, and an unknown hold as a hold', () => {
    const held = (condition: string) => statusRefusal(error({ name: 'LetterHeldError', condition, ids: [41] }), ids, 'printed')
    expect(held('writer_blocked')).toMatch(/^Letter 41 is on hold: your group blocked this writer\. Printing a held letter has to be confirmed/)
    expect(held('prisoner_free')).toContain('the prisoner has been released')
    expect(held('choose_relay')).toContain('choose which group')
    expect(held('reseal_needed')).toContain('send it again')
    expect(held('something_new')).toMatch(/^Letter 41 is on hold\. Printing/)
  })

  it('words authorization.not_yours apart from a group that cannot act', () => {
    expect(statusRefusal(error({ status: 403, name: 'AuthorizationError', condition: 'not_yours', ids: [41, 42] }), ids, 'mailed')).toMatch(
      /^Letters 41 and 42 aren’t your group’s/,
    )
    expect(statusRefusal(error({ status: 403, name: 'AuthorizationError', message: 'Your group is suspended (3).' }), ids, 'mailed')).toMatch(
      /^Your group can’t do this right now: only an active group can/,
    )
  })

  it('words not_found and changed_meanwhile, naming the letters', () => {
    expect(statusRefusal(error({ status: 404, name: 'NotFoundError', ids: [43] }), ids, 'printed')).toMatch(/^Letter 43 is gone/)
    expect(statusRefusal(error({ condition: 'changed_meanwhile', ids: [41] }), ids, 'mailed')).toMatch(/^Letter 41 was changed by someone else/)
  })

  it('words a facility_rule decline naming a rule the facility lacks', () => {
    const problems = [{ field: 'rule', code: 'not_eligible', params: { ids: [42] } }]
    expect(statusRefusal(error({ status: 400, name: null, problems }), ids, 'declined')).toMatch(/^The facility of letter 42 doesn’t list that rule/)
  })

  it('says one of the letters when nothing names one', () => {
    expect(statusRefusal(error({ status: 409, ids: [] }), ids, 'printed')).toMatch(/^One of the letters/)
    expect(statusRefusal(error({ status: 0 }), ids, 'printed')).toContain('Couldn’t reach the server')
  })
})

describe('batchDeclineRules (README "Declined letters")', () => {
  const rule = (tag: string, retired = false): MailRule => ({ id: tag.length, tag, category: 'format' as MailRule['category'], label: tag, description: null, retired })
  const at = (prison: number | null, rules: MailRule[] = []) =>
    ({ prisoner_details: { prison, prison_details: prison === null ? null : { id: prison, mail_rule_details: rules } } }) as unknown as Pick<Message, 'prisoner_details'>

  it('offers the facility’s current rules when every letter is at one facility', () => {
    const rules = [rule('handwritten_only'), rule('no_cards', true)]
    expect(batchDeclineRules([at(7, rules), at(7, rules)]).rules.map((r) => r.tag)).toEqual(['handwritten_only'])
  })

  it('offers no rule across facilities, or for a letter with none, and says why', () => {
    const across = batchDeclineRules([at(7, [rule('handwritten_only')]), at(8, [rule('handwritten_only')])])
    expect(across.rules).toEqual([])
    expect(across.why).toContain('different facilities')
    expect(batchDeclineRules([at(7, [rule('a')]), at(null)]).why).toContain('no facility')
    expect(batchDeclineRules([at(7)]).why).toContain('no mail rules')
  })
})

describe('shareRefusal (POST /messaging/envelope)', () => {
  it('retries a first KeyVersionError and says so on a second', () => {
    const rotated = error({ name: 'KeyVersionError' })
    expect(shareRefusal(rotated, 'PDX ABC', false)).toBe('retry')
    expect(shareRefusal(rotated, 'PDX ABC', true)).toEqual({ kind: 'error', text: expect.stringContaining('changed its key again') })
  })

  it('reads an EnvelopeError as already shared, and any other 409 as a refusal', () => {
    expect(shareRefusal(error({ name: 'EnvelopeError' }), 'PDX ABC', false)).toEqual({ kind: 'done', text: 'PDX ABC can already read this letter.' })
    expect(shareRefusal(error({ name: 'EncryptionModeError' }), 'PDX ABC', true)).toEqual({ kind: 'error', text: expect.stringContaining('(409)') })
  })
})

describe('heldPrintQuestion', () => {
  it('names the hold before printing a held letter', () => {
    expect(heldPrintQuestion('prisoner_free')).toBe('This letter is on hold: the prisoner has been released, so it may never reach them. Print it anyway?')
    expect(heldPrintQuestion('something_new')).toBe('This letter is on hold. Print it anyway?')
    expect(heldPrintQuestion(null)).toBeNull()
  })
})
