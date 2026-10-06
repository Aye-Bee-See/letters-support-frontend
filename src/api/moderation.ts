// Site-wide block recommendations (README "Recommending a site-wide block"). A
// group can only block a writer from its own letters (groups.ts, blockWriter);
// to ask for more it recommends a site-wide block, which a superadmin decides
// (admin.ts, decideBanRecommendation).
import { getOne, post } from './client'
import type { BanRecommendation, BanRecommendationStatus } from '../types'

/**
 * POST /moderation/ban-recommendation: a group admin of an active group.
 * `reason` is required, at most 1000 characters, and only a superadmin reads
 * it: the writer is never told. A 409 BanRecommendationError (condition
 * `pending`) while the group has one waiting for this writer; a 400 for a
 * writer already banned. A superadmin gets a 403: they ban directly.
 */
export const recommendBan = (user: number, reason: string) =>
  post<BanRecommendation>('/moderation/ban-recommendation', { user, reason })

/**
 * GET /moderation/ban-recommendations, newest first, not paged. A superadmin
 * gets every group's, pending unless `status` says otherwise; a group admin
 * gets their own group's, in every state unless `status` narrows it, each with
 * the superadmin's `decisionNote` once decided.
 */
export const getBanRecommendations = (status?: BanRecommendationStatus) =>
  getOne<BanRecommendation[]>('/moderation/ban-recommendations', status ? { status } : undefined)
