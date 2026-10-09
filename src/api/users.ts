// Accounts, for a site admin (README "Users"). Every call here is a 403 for
// anyone else; the /admin routes are behind RequireAdmin. Letters are never
// part of an account record, and nothing here can read one.
import { getList, getOne } from './client'
import type { ListParams, User, UserRole } from '../types'

export interface UserListParams extends ListParams {
  role?: UserRole
}

/** GET /auth/users: by `role`, and `q` over username, email and name; oldest first. */
export const getUsers = (params?: UserListParams) => getList<User>('/auth/users', params)

/** GET /auth/user?id= */
export const getUser = (id: number) => getOne<User>('/auth/user', { id })
