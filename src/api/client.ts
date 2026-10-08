import axios, { AxiosError } from 'axios'
import type { ApiEnvelope, ApiError, ApiListEnvelope, ApiProblem, ListParams, ListResult } from '../types'

// The JWT lives in memory only (never localStorage). AuthContext owns the
// session and pushes the token here so requests made outside React can use it.
let authToken: string | null = null
let onUnauthorized: (() => void) | null = null
let onTwoFactorSetupRequired: (() => void) | null = null

export const setAuthToken = (token: string | null) => {
  authToken = token
}

/** AuthContext registers this so an expired or revoked token ends the session. */
export const setUnauthorizedHandler = (handler: (() => void) | null) => {
  onUnauthorized = handler
}

/**
 * AuthContext registers this so a session that must set up two-factor sign-in
 * enters the setup flow, whenever the API first says so: a requirement switched
 * on after this session began applies to it too (README "Two-factor sign-in").
 */
export const setTwoFactorSetupRequiredHandler = (handler: (() => void) | null) => {
  onTwoFactorSetupRequired = handler
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3069'

const client = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
})

client.interceptors.request.use((config) => {
  // A request that names its own token (sign-in fetching the new account's keys
  // before the session exists) keeps it; overriding it with the current session's
  // would fetch another account's keys.
  if (authToken && !config.headers.Authorization) config.headers.Authorization = `Bearer ${authToken}`
  return config
})

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    const apiError = toApiError(error)
    // Only a request that carried a token can mean "your session is over".
    // A 401 from sign-in itself is a wrong password, handled by the form.
    if (apiError.status === 401 && authToken && onUnauthorized) onUnauthorized()
    if (
      apiError.status === 403 &&
      apiError.name === 'TwoFactorRequiredError' &&
      apiError.condition === 'setup_required' &&
      authToken &&
      onTwoFactorSetupRequired
    )
      onTwoFactorSetupRequired()
    return Promise.reject(apiError)
  },
)

/**
 * An address on the API for a plain browser request (an `<img src>`): a path
 * the API gives, such as a prisoner photo's `url`, used exactly as given and
 * put after the API's base. An absolute URL is returned unchanged.
 */
export function apiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path
  return API_BASE.replace(/\/+$/, '') + (path.startsWith('/') ? path : `/${path}`)
}

/** Normalise any failure into ApiError. Pages key behaviour on status, name and condition. */
export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (error instanceof AxiosError) {
    const body = error.response?.data as Record<string, unknown> | undefined
    const errors = Array.isArray(body?.errors) ? (body.errors as string[]) : []
    const message =
      (typeof body?.error === 'string' && body.error) ||
      (typeof body?.info === 'string' && body.info) ||
      errors[0] ||
      (error.response ? error.message : 'Could not reach the server.')
    const retryAfter = Number(error.response?.headers?.['retry-after'])
    // `ids` names the records a refusal is about (README "PUT /messaging/status/batch").
    const ids = Array.isArray(body?.ids) ? (body.ids as unknown[]).filter((id): id is number => typeof id === 'number') : null
    const problems = Array.isArray(body?.problems) ? (body.problems as ApiProblem[]) : null
    return {
      status: error.response?.status ?? 0,
      name: typeof body?.name === 'string' ? body.name : null,
      condition: typeof body?.condition === 'string' ? body.condition : null,
      errors,
      message,
      ...(Number.isFinite(retryAfter) && retryAfter > 0 ? { retryAfter } : {}),
      ...(ids ? { ids } : {}),
      ...(problems ? { problems } : {}),
    }
  }
  return {
    status: 0,
    name: null,
    condition: null,
    errors: [],
    message: error instanceof Error ? error.message : 'Unknown error',
  }
}

export function isApiError(value: unknown): value is ApiError {
  return typeof value === 'object' && value !== null && 'status' in value && 'condition' in value && 'errors' in value
}

// --- Helpers for the API's conventions --------------------------------------
// GET takes query parameters; PUT and DELETE take the id in a JSON body.
// Every success is wrapped in { data, info, success, status, name }.

/**
 * Drop undefined values; send booleans as the strings the API expects ("true").
 * Anything else (an object or array) goes as JSON, never as "[object Object]".
 */
function toQuery(params?: ListParams | Record<string, unknown>) {
  if (!params) return undefined
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    query[key] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint'
        ? String(value)
        : JSON.stringify(value)
  }
  return query
}

export async function getOne<T>(url: string, params?: Record<string, unknown>): Promise<T> {
  const response = await client.get<ApiEnvelope<T>>(url, { params: toQuery(params) })
  return response.data.data
}

export async function getList<T>(url: string, params?: ListParams): Promise<ListResult<T>> {
  const response = await client.get<ApiListEnvelope<T>>(url, { params: toQuery(params) })
  const { data, total, page, page_size } = response.data
  return { items: data, total, page, pageSize: page_size }
}

/**
 * Every row of a list, following pages (the API caps page_size at 100). For
 * directory lists expected to stay in the low hundreds, loaded whole and
 * filtered in the browser.
 */
export async function getAllPages<T>(url: string, params?: Omit<ListParams, 'page' | 'page_size'>): Promise<T[]> {
  const all: T[] = []
  for (let page = 1; ; page++) {
    const result = await getList<T>(url, { ...params, page, page_size: 100 })
    all.push(...result.items)
    if (all.length >= result.total || result.items.length === 0) return all
  }
}

export async function post<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const response = await client.post<ApiEnvelope<T>>(url, body, { headers })
  return response.data.data
}

export async function put<T>(url: string, body: unknown): Promise<T> {
  const response = await client.put<ApiEnvelope<T>>(url, body)
  return response.data.data
}

export async function del<T>(url: string, body: unknown): Promise<T> {
  const response = await client.delete<ApiEnvelope<T>>(url, { data: body })
  return response.data.data
}

export default client
