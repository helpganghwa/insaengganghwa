/**
 * 우편함 수령 — SCHEMA §7. 레이드 정산·프로필 검토 결과·비동기 보상 지급.
 */
export { claimMail, claimAllMail, MailError } from './claim';
export type { MailPayload, ClaimResult } from './claim';
export { ensureDailyMail } from './daily';
export { ensurePremiumDailyMail } from './premium-daily';
