import { AxiosError, AxiosHeaders, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'

// The API, faked at the network edge: an axios adapter that answers from a
// table of (method, path, params) instead of sending anything. The client's own
// interceptors, toApiError and wrappers (getOne, getList, post) still run.
// src/test/setup.ts puts it on src/api/client.ts's instance for every DOM test;
// a Node test can do the same with `client.defaults.adapter = fakeApi.adapter`.

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'

/** One request as the fake API saw it. */
export interface FakeRequest {
  method: Method
  /** The path as the client asked for it, without the base URL. */
  path: string
  /** Query parameters as sent (strings, after the client's toQuery). */
  params: Record<string, string>
  /** The JSON body, parsed; undefined for none. */
  body: unknown
  /** The Authorization header sent, if any. */
  authorization: string | null
}

/** A whole HTTP answer: status, body and headers, used as given. */
export class FakeResponse {
  readonly status: number
  readonly body: unknown
  readonly headers: Record<string, string>
  constructor(status: number, body: unknown, headers: Record<string, string> = {}) {
    this.status = status
    this.body = body
    this.headers = headers
  }
}

/** No answer at all: the request never reached the server (status 0). */
export class FakeNetworkError {}

type Handler = (request: FakeRequest) => unknown
type Answer = unknown

interface Route {
  method: Method
  path: string | RegExp
  params?: Record<string, string>
  answer: Handler
  once: boolean
}

/** Answers for the fake API. Any other value is the `data` of a 200 envelope. */
export const reply = {
  /** The API's success envelope around `data`. */
  ok: (data: unknown, status = 200) => new FakeResponse(status, { data, info: null, success: true, status: 'OK', name: null }),
  /** A list envelope, as the API's list endpoints answer. */
  list: (items: unknown[], { total = items.length, page = 1, pageSize = 100 } = {}) =>
    new FakeResponse(200, { data: items, total, page, page_size: pageSize, success: true }),
  /** A refusal: the API's error body (`name`, `condition`, `errors`, `error`), and any headers. */
  error: (status: number, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
    new FakeResponse(status, { success: false, ...body }, headers),
  /** The server could not be reached. */
  network: () => new FakeNetworkError(),
}

function matches(route: Route, request: FakeRequest): boolean {
  if (route.method !== request.method) return false
  if (typeof route.path === 'string' ? route.path !== request.path : !route.path.test(request.path)) return false
  return Object.entries(route.params ?? {}).every(([key, value]) => request.params[key] === value)
}

function toRequest(config: InternalAxiosRequestConfig): FakeRequest {
  const params: Record<string, string> = {}
  for (const [key, value] of Object.entries((config.params ?? {}) as Record<string, unknown>)) {
    if (value !== undefined) params[key] = typeof value === 'string' ? value : JSON.stringify(value)
  }
  let body: unknown = config.data
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      // Not JSON: kept as sent.
    }
  }
  const authorization = AxiosHeaders.from(config.headers).get('Authorization')
  return {
    method: (config.method ?? 'get').toUpperCase() as Method,
    path: config.url ?? '',
    params,
    body,
    authorization: typeof authorization === 'string' ? authorization : null,
  }
}

function createFakeApi() {
  let routes: Route[] = []
  const calls: FakeRequest[] = []
  const unanswered: FakeRequest[] = []

  const add = (method: Method, path: string | RegExp, answer: Answer, options: { params?: Record<string, string>; once?: boolean } = {}) => {
    const handler: Handler = typeof answer === 'function' ? (answer as Handler) : () => answer
    // The latest wins, so a test can override what a helper set up.
    routes.unshift({ method, path, params: options.params, answer: handler, once: options.once ?? false })
  }

  async function adapter(config: InternalAxiosRequestConfig): Promise<AxiosResponse> {
    const request = toRequest(config)
    calls.push(request)
    const route = routes.find((r) => matches(r, request))
    if (!route) {
      unanswered.push(request)
      throw new AxiosError(`fakeApi: nothing answers ${request.method} ${request.path}`, AxiosError.ERR_NETWORK, config)
    }
    if (route.once) routes = routes.filter((r) => r !== route)
    const answer: unknown = await route.answer(request)
    if (answer instanceof FakeNetworkError) throw new AxiosError('Network Error', AxiosError.ERR_NETWORK, config)
    const response = answer instanceof FakeResponse ? answer : reply.ok(answer)
    const axiosResponse: AxiosResponse = {
      data: response.body,
      status: response.status,
      statusText: String(response.status),
      headers: AxiosHeaders.from(response.headers),
      config,
    }
    if (response.status >= 200 && response.status < 300) return axiosResponse
    throw new AxiosError(
      `Request failed with status code ${response.status}`,
      response.status >= 500 ? AxiosError.ERR_BAD_RESPONSE : AxiosError.ERR_BAD_REQUEST,
      config,
      null,
      axiosResponse,
    )
  }

  return {
    adapter,
    /**
     * Answer `method path` (a string, or a RegExp over the path) with `answer`:
     * a value (the `data` of a 200 envelope), a `reply.*` answer, or a function
     * of the request returning either (or a promise of one). `params` narrows it
     * to requests with those query parameters. The latest route added wins.
     */
    on: (method: Method, path: string | RegExp, answer: Answer, options?: { params?: Record<string, string> }) =>
      add(method, path, answer, options),
    /** As `on`, for the next matching request only. */
    once: (method: Method, path: string | RegExp, answer: Answer, options?: { params?: Record<string, string> }) =>
      add(method, path, answer, { ...options, once: true }),
    /** Every request made, in order. */
    calls,
    /** Requests nothing answered (each failed as a network error). */
    unanswered,
    /** The requests made to `method path`. */
    callsTo: (method: Method, path: string | RegExp) =>
      calls.filter((c) => c.method === method && (typeof path === 'string' ? c.path === path : path.test(c.path))),
    /** Forget every route and every call. */
    reset: () => {
      routes = []
      calls.length = 0
      unanswered.length = 0
    },
  }
}

export const fakeApi = createFakeApi()
