import 'server-only';

import { eq, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { referralAttributions } from '@/lib/db/schema/social';
import { sendPushToUser } from '@/lib/push/send';
import { INVITE_BOX_PER_REFERRAL, INVITE_DIAMOND_PER_REFERRAL } from './stats';

export class ReferralError extends Error {
  constructor(
    public code:
      | 'INVALID_CODE'
      | 'SELF_REFERRAL'
      | 'ALREADY_REDEEMED'
      | 'PROFILE_NOT_FOUND',
  ) {
    super(code);
    this.name = 'ReferralError';
  }
}

/**
 * 카카오 공유 링크 → 가입 귀속 + referrer 우편함 적재 + 푸시 알림.
 *
 * 변경(2026-05-31 사용자 결정):
 * - 이전: profiles.diamond + userSupplyBoxes에 직접 가산(자동 수령).
 * - 현재: mailbox에 type='reward' row 적재 → 사용자가 우편함에서 명시적 수령.
 *   referrer는 신규 가입 즉시 push 알림으로 인지.
 *
 * - shareCode = referrer 공개 코드(신규) 또는 닉네임(레거시 링크 하위호환).
 * - 보상 조건 = **링크 클릭 → 그 이후 회원가입 완료**. clickedAtMs(클릭 시각)보다 늦게
 *   생성된 계정만 귀속(기존 유저가 링크를 타도 보상 없음). clickedAtMs 없으면(레거시 쿠키)
 *   "최근 7일 내 가입" 폴백.
 * - 멱등: referral_attributions(new_user_id UNIQUE) — 두 번째 호출 ALREADY_REDEEMED.
 * - 단일 트랜잭션(attribute row + mailbox row + rewarded=true), 푸시는 tx 밖.
 */
// 쿠키(함수 서버 시계)와 createdAt(DB 시계) 간 오차 허용폭 — 정상 신규는 클릭 후 가입이라
// createdAt ≥ clickedAt이지만, 시계 스큐로 살짝 빠르게 보일 수 있어 5분 버퍼.
const SIGNUP_SKEW_MS = 5 * 60 * 1000;
const LEGACY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 레거시 쿠키 폴백: 7일(쿠키 TTL) 내 가입만.

export async function attributeReferralFromShare(
  newUserId: string,
  shareCode: string,
  clickedAtMs?: number,
): Promise<{ referrerNickname: string } | null> {
  // 1. tx — attribute + mailbox 적재.
  const result = await db.transaction(async (tx) => {
    // 닉네임은 전 캐릭터 전역 유일(characters) — 코드(profiles)와 함께 매칭.
    const [referrer] = await tx
      .select({ id: profiles.id, nickname: characters.nickname, lastServerId: profiles.lastServerId })
      .from(profiles)
      .innerJoin(characters, eq(characters.userId, profiles.id))
      .where(or(eq(profiles.publicCode, shareCode), eq(characters.nickname, shareCode)))
      .limit(1);
    if (!referrer) return null;

    if (referrer.id === newUserId) {
      throw new ReferralError('SELF_REFERRAL');
    }

    // 신규 가입 가드 — 가입 전환(클릭 후 생성된 계정)만 보상. 기존 계정이 링크를 타면 skip.
    const [acct] = await tx
      .select({ createdAt: profiles.createdAt })
      .from(profiles)
      .where(eq(profiles.id, newUserId))
      .limit(1);
    if (!acct) return null;
    const createdMs = acct.createdAt.getTime();
    const isNewSignup =
      clickedAtMs != null
        ? createdMs >= clickedAtMs - SIGNUP_SKEW_MS
        : createdMs >= Date.now() - LEGACY_MAX_AGE_MS;
    if (!isNewSignup) return null; // 기존 유저 — 보상 없음.

    // 신규 가입자 nickname — 알림·우편함 메시지에 표시.
    const [newUser] = await tx
      .select({ nickname: characters.nickname })
      .from(characters)
      .where(eq(characters.userId, newUserId))
      .limit(1);
    const newUserNickname = newUser?.nickname ?? '친구';

    try {
      await tx.insert(referralAttributions).values({
        referrerUserId: referrer.id,
        newUserId,
        shareCode,
        rewarded: false,
      });
    } catch (e) {
      // UNIQUE(new_user_id) 위반(23505)만 '이미 사용'으로 — 일시 DB 오류를 ALREADY_REDEEMED로
      // 오인해 정당한 추천 보상이 조용히 유실되던 문제 방지(감사 LOW). 그 외는 rethrow.
      if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === '23505') {
        throw new ReferralError('ALREADY_REDEEMED');
      }
      throw e;
    }

    // mailbox row — referrer가 명시적 수령. claim 시 다이아 + 슬롯별 상자 가산.
    // 상자는 3슬롯 균등 분배 — 상수에서 파생(payload 하드코딩 드리프트 방지).
    // 보상 메일은 추천인의 활성 서버 우편함으로(SERVER.md 경계규칙 4).
    const invitePerSlot = INVITE_BOX_PER_REFERRAL / 3;
    await tx.insert(mailbox).values({
      userId: referrer.id,
      serverId: referrer.lastServerId,
      type: 'reward',
      title: '친구 초대 보상',
      body: `${newUserNickname}님이 내 카카오톡 공유로 가입했어요. 보상을 받아주세요!`,
      senderLabel: '시스템',
      payload: {
        diamond: INVITE_DIAMOND_PER_REFERRAL,
        boxes: { weapon: invitePerSlot, armor: invitePerSlot, accessory: invitePerSlot },
      },
    });

    await tx
      .update(referralAttributions)
      .set({ rewarded: true })
      .where(eq(referralAttributions.newUserId, newUserId));

    return { referrerId: referrer.id, referrerNickname: referrer.nickname, newUserNickname };
  });
  if (!result) return null;

  // 2. push 알림 — referrer에게 즉시 발송(tx 밖, best-effort).
  try {
    await sendPushToUser(result.referrerId, {
      title: '친구 초대 보상',
      body: `${result.newUserNickname}님이 가입했어요! 💎 ${INVITE_DIAMOND_PER_REFERRAL} + 📦 ${INVITE_BOX_PER_REFERRAL}개 받기`,
      url: '/mail',
      tag: 'referral',
      category: 'referral',
    });
  } catch (e) {
    console.error('[referral.push]', e);
  }

  return { referrerNickname: result.referrerNickname };
}
