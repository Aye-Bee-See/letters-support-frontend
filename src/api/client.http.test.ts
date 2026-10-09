import { AxiosError } from 'axios'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { fakeApi, later, reply } from '../test/fakeApi'
import client, {
  del,
  getAllPages,
  getOne,
  isApiError,
  post,
  PUBLIC,
  setAuthToken,
  setTwoFactorSetupRequiredHandler,
  setUnauthorizedHandler,
  toApiError,
} from './client'

// The client as requests go through it, in Node with no DOM: axios's adapter is
// the fake API (src/test/fakeApi.ts), so the interceptors, toApiError and the
// wrappers run as they do in the app. client.test.ts has the two pure decisions.

beforeAll(() => {
  client.defaults.adapter = fakeApi.adapter
})

afterEach(() => {
  fakeApi.reset()
  setAuthToken(null)
  setUnauthorizedHandler(null)
  setTwoFactorSetupRequiredHandler(null)
})

/** The ApiError a request to `path` is refused with, after the client's interceptor. */
async function refusal(path = '/thing') {
  return getOne(path).then(
    () => {
      throw new Error('expected a refusal')
    },
    (err: unknown) => err,
  )
}

describe('every failure becomes one shape', () => {
  it('a 400 about fields: errors, problems, and the first error as the message', async () => {
    const problems = [{ field: 'name', problem: 'required' }]
    fakeApi.on('GET', '/thing', reply.error(400, { name: 'ValidationError', errors: ['Name is required.', 'Too long.'], problems }))
    expect(await refusal()).toEqual({
      status: 400,
      name: 'ValidationError',
      condition: null,
      errors: ['Name is required.', 'Too long.'],
      message: 'Name is required.',
      problems,
    })
  })

  it('a 409 with its name and condition, `error` as the message', async () => {
    fakeApi.on('GET', '/thing', reply.error(409, { name: 'TwoFactorPolicyError', condition: 'own_first', error: 'Set up your own first.' }))
    expect(await refusal()).toMatchObject({ status: 409, name: 'TwoFactorPolicyError', condition: 'own_first', errors: [], message: 'Set up your own first.' })
  })

  it('`info` when there is no `error`; axios’s own message when there is neither', async () => {
    fakeApi.on('GET', '/info', reply.error(403, { info: 'Not yours.' }))
    expect(await refusal('/info')).toMatchObject({ status: 403, message: 'Not yours.' })
    fakeApi.on('GET', '/bare', reply.error(500))
    expect(await refusal('/bare')).toMatchObject({ status: 500, name: null, message: 'Request failed with status code 500' })
  })

  it('a 429 carries Retry-After in seconds; a missing, zero or unreadable one is left out', async () => {
    fakeApi.on('GET', '/limited', reply.error(429, { name: 'RateLimitError' }, { 'Retry-After': '120' }))
    expect(await refusal('/limited')).toMatchObject({ status: 429, retryAfter: 120 })
    for (const header of [{}, { 'Retry-After': '0' }, { 'Retry-After': 'soon' }] as Record<string, string>[]) {
      fakeApi.on('GET', '/limited', reply.error(429, {}, header))
      expect(await refusal('/limited')).not.toHaveProperty('retryAfter')
    }
  })

  it('`ids` keeps only the numbers', async () => {
    fakeApi.on('GET', '/batch', reply.error(403, { ids: [3, '4', 5, null] }))
    expect(await refusal('/batch')).toMatchObject({ ids: [3, 5] })
    fakeApi.on('GET', '/batch', reply.error(403, {}))
    expect(await refusal('/batch')).not.toHaveProperty('ids')
  })

  it('status 0 when the server can’t be reached', async () => {
    fakeApi.on('GET', '/thing', reply.network())
    expect(await refusal()).toEqual({ status: 0, name: null, condition: null, errors: [], message: 'Could not reach the server.' })
  })

  it('anything else: status 0 with its message, and an ApiError unchanged', () => {
    expect(toApiError(new Error('boom'))).toEqual({ status: 0, name: null, condition: null, errors: [], message: 'boom' })
    expect(toApiError('a string')).toMatchObject({ status: 0, message: 'Unknown error' })
    const already = { status: 404, name: 'NotFoundError', condition: null, errors: [], message: 'Not found' }
    expect(toApiError(already)).toBe(already)
    expect(isApiError(already)).toBe(true)
    expect(isApiError(new AxiosError('x'))).toBe(false)
  })
})

describe('which token goes, and which 401 ends the session (#48)', () => {
  it('a request carries the session’s token; a public one goes without; one naming its own keeps it', async () => {
    fakeApi.on('GET', '/thing', {})
    setAuthToken('session')
    await getOne('/thing')
    await getOne('/thing', undefined, PUBLIC)
    await client.get('/thing', { headers: { Authorization: 'Bearer new-account' } })
    expect(fakeApi.calls.map((c) => c.authorization)).toEqual(['Bearer session', null, 'Bearer new-account'])
  })

  it('without a session, nothing goes', async () => {
    fakeApi.on('GET', '/thing', {})
    await getOne('/thing')
    expect(fakeApi.calls[0].authorization).toBeNull()
  })

  it('a 401 to the session’s own token ends it', async () => {
    const ended = vi.fn()
    setUnauthorizedHandler(ended)
    setAuthToken('session')
    fakeApi.on('GET', '/thing', reply.error(401, { name: 'AuthenticationError' }))
    expect(await refusal()).toMatchObject({ status: 401 })
    expect(ended).toHaveBeenCalledOnce()
  })

  it('a 401 to a public call, or to a token named for another account, does not', async () => {
    const ended = vi.fn()
    setUnauthorizedHandler(ended)
    setAuthToken('session')
    fakeApi.on('POST', '/auth/login', reply.error(401, { name: 'AuthenticationError' }))
    fakeApi.on('GET', '/auth/keys', reply.error(401, { name: 'AuthenticationError' }))
    await expect(post('/auth/login', { username: 'sam' }, undefined, PUBLIC)).rejects.toMatchObject({ status: 401 })
    await expect(client.get('/auth/keys', { headers: { Authorization: 'Bearer new-account' } })).rejects.toMatchObject({ status: 401 })
    expect(ended).not.toHaveBeenCalled()
  })

  it('a 401 to a token this session has since replaced (a password change) does not', async () => {
    const ended = vi.fn()
    setUnauthorizedHandler(ended)
    setAuthToken('before')
    const answer = later()
    fakeApi.on('GET', '/thing', answer.answer)
    const pending = refusal()
    await vi.waitFor(() => expect(fakeApi.calls).toHaveLength(1))
    setAuthToken('after')
    answer.resolve(reply.error(401, { name: 'AuthenticationError' }))
    expect(await pending).toMatchObject({ status: 401 })
    expect(fakeApi.calls[0].authorization).toBe('Bearer before')
    expect(ended).not.toHaveBeenCalled()
  })

  it('a 401 with no session, or no handler, ends nothing and still refuses', async () => {
    const ended = vi.fn()
    setUnauthorizedHandler(ended)
    fakeApi.on('GET', '/thing', reply.error(401))
    expect(await refusal()).toMatchObject({ status: 401 })
    setUnauthorizedHandler(null)
    setAuthToken('session')
    expect(await refusal()).toMatchObject({ status: 401 })
    expect(ended).not.toHaveBeenCalled()
  })
})

describe('two-factor sign-in must be set up first', () => {
  const setupRequired = reply.error(403, { name: 'TwoFactorRequiredError', condition: 'setup_required' })

  it('a session told so enters the set-up flow', async () => {
    const setUp = vi.fn()
    setTwoFactorSetupRequiredHandler(setUp)
    setAuthToken('session')
    fakeApi.on('GET', '/thing', setupRequired)
    expect(await refusal()).toMatchObject({ status: 403, condition: 'setup_required' })
    expect(setUp).toHaveBeenCalledOnce()
  })

  it('not without a session, nor for another two-factor refusal or another 403', async () => {
    const setUp = vi.fn()
    setTwoFactorSetupRequiredHandler(setUp)
    fakeApi.on('GET', '/thing', setupRequired)
    await refusal()
    setAuthToken('session')
    fakeApi.on('GET', '/thing', reply.error(403, { name: 'TwoFactorRequiredError', condition: 'code_required' }))
    await refusal()
    fakeApi.on('GET', '/thing', reply.error(403, { name: 'ForbiddenError', condition: 'setup_required' }))
    await refusal()
    expect(setUp).not.toHaveBeenCalled()
  })
})

describe('query parameters', () => {
  it('booleans as "true"/"false", numbers as strings, nested values as JSON; undefined, null and empty dropped', async () => {
    fakeApi.on('GET', '/thing', {})
    await getOne('/thing', {
      full: true,
      archived: false,
      id: 7,
      q: 'smith',
      gone: undefined,
      none: null,
      empty: '',
      tags: ['a', 'b'],
      where: { status: 'active' },
    })
    expect(fakeApi.calls[0].params).toEqual({
      full: 'true',
      archived: 'false',
      id: '7',
      q: 'smith',
      tags: '["a","b"]',
      where: '{"status":"active"}',
    })
  })

  it('a request with none sends none', async () => {
    fakeApi.on('GET', '/thing', {})
    await getOne('/thing')
    expect(fakeApi.calls[0].params).toEqual({})
  })
})

describe('the wrappers', () => {
  it('getOne and post answer the envelope’s data; del sends its body', async () => {
    fakeApi.on('GET', '/thing', { id: 1 })
    fakeApi.on('POST', '/thing', (request: { body: unknown }) => ({ echoed: request.body }))
    fakeApi.on('DELETE', '/thing', { deleted: true })
    expect(await getOne('/thing')).toEqual({ id: 1 })
    expect(await post('/thing', { a: 1 })).toEqual({ echoed: { a: 1 } })
    expect(await del('/thing', { id: 9 })).toEqual({ deleted: true })
    expect(fakeApi.callsTo('DELETE', '/thing')[0].body).toEqual({ id: 9 })
  })

  it('getAllPages follows pages of 100 and stops at the total', async () => {
    const rows = Array.from({ length: 250 }, (_, i) => ({ id: i + 1 }))
    fakeApi.on('GET', '/rows', (request: { params: Record<string, string> }) => {
      const page = Number(request.params.page)
      return reply.list(rows.slice((page - 1) * 100, page * 100), { total: rows.length, page })
    })
    const all = await getAllPages<{ id: number }>('/rows', { status: 'active' })
    expect(all).toEqual(rows)
    expect(fakeApi.calls.map((c) => c.params)).toEqual([
      { status: 'active', page: '1', page_size: '100' },
      { status: 'active', page: '2', page_size: '100' },
      { status: 'active', page: '3', page_size: '100' },
    ])
  })

  it('getAllPages stops at an empty page even when the total says more, and asks once for an empty list', async () => {
    fakeApi.on('GET', '/rows', (request: { params: Record<string, string> }) =>
      request.params.page === '1' ? reply.list([{ id: 1 }], { total: 500 }) : reply.list([], { total: 500 }),
    )
    expect(await getAllPages('/rows')).toEqual([{ id: 1 }])
    expect(fakeApi.calls).toHaveLength(2)

    fakeApi.reset()
    fakeApi.on('GET', '/rows', reply.list([], { total: 0 }))
    expect(await getAllPages('/rows')).toEqual([])
    expect(fakeApi.calls).toHaveLength(1)
  })
})
