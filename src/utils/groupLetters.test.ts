import { describe, expect, it } from 'vitest'
import type { ApiError, LetterFooter, MailRule, Message } from '../types'
import { batchDeclineRules, declineText, shareRefusal, footerSentence, heldPrintQuestion, heldReasonShort, heldReasonText, lettersNamed, queueFilter, statusRefusal, writerLabel } from './groupLetters'

const footer = (over: Partial<LetterFooter> = {}): LetterFooter => ({
  name: 'James Hollow',
  anonymous: false,
  careOf: { id: 3, name: 'PDX ABC' },
  reference: '4827-1935-6',
  replySheetAllowed: false,
  ...over,
})

const error = (over: Partial<ApiError>): ApiError => ({ status: 409, name: 'LetterStatusError', condition: null, errors: [], message: '', ...over })

describe('footerSentence', () => {
  it('says the name, the group and the reference (README "Reply reference")', () => {
    expect(footerSentence(footer())).toBe(
      'Write back to James Hollow, c/o PDX ABC. Reference 4827-1935-6: please write this number at the top of your reply.',
    )
  })

  it('leaves the reference out where the facility refuses numbers', () => {
    expect(footerSentence(footer({ reference: null }))).toBe('Write back to James Hollow, c/o PDX ABC.')
  })

  it('names the group only for the anonymous writer', () => {
    expect(footerSentence(footer({ name: null, anonymous: true }))).toBe(
      'Write back to PDX ABC. Reference 4827-1935-6: please write this number at the top of your reply.',
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
})

describe('batch refusals (README "PUT /messaging/status/batch")', () => {
  it('finds the letters the sentence names, among those asked for', () => {
    expect(lettersNamed({ message: 'Letter 42: a printed letter cannot move to printed.' }, [41, 42, 43])).toEqual([42])
    expect(lettersNamed({ message: 'Message 41, 43 not found' }, [41, 42, 43])).toEqual([41, 43])
    expect(lettersNamed({ message: 'Chapter 3 is not active' }, [41])).toEqual([])
  })

  it('words the refusal from status, name and condition, naming the letter', () => {
    const ids = [41, 42]
    expect(statusRefusal(error({ message: 'Letter 42: a mailed letter cannot move to printed.' }), ids, 'printed')).toMatch(/^Letter 42 can’t be marked printed/)
    expect(statusRefusal(error({ name: 'LetterHeldError', message: 'Letter 41: this letter is held (prisoner_free).' }), ids, 'printed')).toMatch(/^Letter 41 is on hold/)
    expect(
      statusRefusal(error({ condition: 'changed_meanwhile', message: 'Letter 41 was changed by someone else meanwhile; nothing was moved.' }), ids, 'mailed'),
    ).toContain('someone else')
    expect(statusRefusal(error({ status: 403, name: 'ForbiddenError', message: 'Only the relay group (letter 41, 42).' }), ids, 'mailed')).toMatch(
      /^Letters 41 and 42 aren’t your group’s/,
    )
    expect(statusRefusal(error({ status: 404, name: 'NotFoundError', message: 'Message 42 not found' }), ids, 'printed')).toMatch(/^Letter 42 is gone/)
    expect(statusRefusal(error({ status: 409, message: '' }), ids, 'printed')).toContain('Nothing was marked')
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
