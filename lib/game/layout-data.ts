import 'server-only';

import { pgGuard } from '@/lib/db/guarded';
import { periodKey } from '@/lib/game/shop/period';

/**
 * (game) 셸(헤더·하단 네비)에 필요한 최소 데이터.
 * 콜드/hang 시에도 셸이 즉시 200으로 나가도록, 이 로더는 layout에서 await하지 않고
 * Suspense 경계 안에서 소비한다(2026-05-28). 절대 throw 안 함 — 실패 시 기본값.
 */
export interface LayoutData {
  nickname: string;
  diamond: bigint;
  hasUnreadMail: boolean;
  hasCompletedEnhance: boolean;
  /** 상점 무료 수령 가능(빨간점) — daily/weekly/monthly/signup 중 하나라도 미수령. */
  hasShopFree: boolean;
  /** 친구 받은 요청 있음(프로필 탭 빨간점). */
  hasFriendRequest: boolean;
  /** 헤더 머리 아이콘용 — 활성 프로필 south rotation URL. 없으면 null(폴백 아이콘). */
  profileSouth: string | null;
}

const DEFAULTS: LayoutData = {
  nickname: '플레이어',
  diamond: 0n,
  hasUnreadMail: false,
  hasCompletedEnhance: false,
  hasShopFree: false,
  hasFriendRequest: false,
  profileSouth: null,
};

/**
 * 프로필(닉네임·다이아) + 우편 미수령 dot + 강화완료 dot을 단일 왕복(Promise.all)으로.
 * 4s 가드 + catch — 콜드 DB 커넥션이 max:1 풀에서 hang해도 기본값으로 graceful degrade.
 */
export async function loadLayoutData(userId: string): Promise<LayoutData> {
  try {
    // 상점 무료 주기키(KST) — 슬롯별 현재 주기. claim row가 이 키면 이미 수령.
    const dailyK = periodKey('daily');
    const weeklyK = periodKey('weekly');
    const monthlyK = periodKey('monthly');
    // pgGuard: 타임아웃 시 쿼리 취소 → 풀 커넥션 즉시 회수(모든 페이지가 호출하는 핫패스).
    const [profileRows, mailRows, enhRows, freeRows, friendReqRows] = await Promise.all([
      pgGuard(
        (sql) => sql`
          select p.nickname, p.diamond, up.rotations
          from profiles p
          left join user_profiles up on up.id = p.active_profile_id
          where p.id = ${userId}::uuid
          limit 1`,
        4000,
        'layout.profile',
      ),
      pgGuard(
        (sql) => sql`
          select 1 from mailbox
          where user_id = ${userId}::uuid
            and claimed_at is null
            and (expires_at is null or expires_at > now())
          limit 1`,
        4000,
        'layout.mail',
      ),
      pgGuard(
        (sql) => sql`
          select count(*)::int as n from enhancement_jobs
          where user_id = ${userId}::uuid and status = 'running' and complete_at <= now()`,
        4000,
        'layout.enhance',
      ),
      // 4슬롯 중 현재 주기로 이미 받은 수. 4 미만이면 받을 수 있는 무료 존재.
      pgGuard(
        (sql) => sql`
          select count(*)::int as n from shop_free_claims
          where user_id = ${userId}::uuid
            and (
              (slot = 'daily' and period_key = ${dailyK}) or
              (slot = 'weekly' and period_key = ${weeklyK}) or
              (slot = 'monthly' and period_key = ${monthlyK}) or
              (slot = 'signup' and period_key = 'once')
            )`,
        4000,
        'layout.shopfree',
      ),
      // 친구 받은 요청 존재 여부.
      pgGuard(
        (sql) => sql`
          select 1 from friend_links
          where addressee_id = ${userId}::uuid and status = 'pending'
          limit 1`,
        4000,
        'layout.friendreq',
      ),
    ]);
    const p = profileRows[0] as
      | { nickname?: string; diamond?: string | number | bigint; rotations?: unknown }
      | undefined;
    // rotations(jsonb)는 postgres.js 기본 파서가 객체로 파싱하나, 문자열일 경우 방어적 파싱.
    let rot = p?.rotations as Record<string, string> | string | null | undefined;
    if (typeof rot === 'string') {
      try {
        rot = JSON.parse(rot) as Record<string, string>;
      } catch {
        rot = null;
      }
    }
    return {
      nickname: p?.nickname ?? '플레이어',
      diamond: p?.diamond != null ? BigInt(p.diamond as string) : 0n,
      hasUnreadMail: mailRows.length > 0,
      hasCompletedEnhance: Number((enhRows[0] as { n?: number | string } | undefined)?.n ?? 0) > 0,
      hasShopFree: Number((freeRows[0] as { n?: number | string } | undefined)?.n ?? 0) < 4,
      hasFriendRequest: friendReqRows.length > 0,
      profileSouth: (rot as Record<string, string> | null)?.south ?? null,
    };
  } catch (e) {
    console.warn('[layout] data load failed — defaults', (e as Error).message);
    return DEFAULTS;
  }
}
