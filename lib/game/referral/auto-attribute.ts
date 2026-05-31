'use server';

import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { referralAttributions } from '@/lib/db/schema/social';
import { attributeReferralFromShare } from './redeem';

const COOKIE_NAME = 'pending_referral';
const FLASH_COOKIE = 'referral_flash';

/**
 * (game) 레이아웃 진입 시 호출.
 * 1. pending_referral 쿠키가 있고
 * 2. 이 사용자가 아직 귀속 안 됐으면
 * 3. shareCode(=nickname) → attribute + 보상 지급
 * 4. flash 쿠키 세팅 (UI에서 1회 toast 표시 후 클라이언트가 삭제)
 *
 * 모든 단계는 silent — 핫패스(layout)가 깨지지 않도록 try/catch로 흡수.
 */
type CookieStore = Awaited<ReturnType<typeof cookies>>;

function safeCookieSet(
  store: CookieStore,
  name: string,
  value: string,
  opts: { path: string; maxAge: number },
): void {
  try {
    store.set(name, value, opts);
  } catch (e) {
    // Server Component render phase에서는 read-only일 수 있음 — 무시.
    console.warn('[cookie.set]', name, (e as Error).message);
  }
}

export async function processPendingReferral(userId: string): Promise<void> {
  try {
    const store = await cookies();
    const shareCode = store.get(COOKIE_NAME)?.value;
    if (!shareCode) return;

    // 항상 처리 후 쿠키 삭제(성공/실패 무관) — 무한 재시도 방지.
    safeCookieSet(store, COOKIE_NAME, '', { path: '/', maxAge: 0 });

    // 이미 귀속된 유저는 skip(referral_attributions.new_user_id UNIQUE).
    const [existing] = await db
      .select({ id: referralAttributions.id })
      .from(referralAttributions)
      .where(eq(referralAttributions.newUserId, userId))
      .limit(1);
    if (existing) return;

    try {
      const r = await attributeReferralFromShare(userId, shareCode);
      if (r) {
        safeCookieSet(store, FLASH_COOKIE, encodeURIComponent(r.referrerNickname), {
          path: '/',
          maxAge: 60,
        });
      }
    } catch (e) {
      console.error('[auto-referral.attribute]', e);
    }
  } catch (e) {
    console.error('[processPendingReferral]', e);
  }
}

/** flash 쿠키 1회 읽기 + 삭제 — 가입 후 1회 안내 toast용. */
export async function consumeReferralFlash(): Promise<string | null> {
  try {
    const store = await cookies();
    const flash = store.get(FLASH_COOKIE)?.value;
    if (!flash) return null;
    safeCookieSet(store, FLASH_COOKIE, '', { path: '/', maxAge: 0 });
    return decodeURIComponent(flash);
  } catch (e) {
    console.error('[consumeReferralFlash]', e);
    return null;
  }
}
