import 'server-only';

import { and, eq, gt, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { enhancementJobs } from '@/lib/db/schema/enhance';
import { mailbox } from '@/lib/db/schema/mailbox';
import { profiles } from '@/lib/db/schema/profiles';
import { withTimeout } from '@/lib/db/with-timeout';

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
}

const DEFAULTS: LayoutData = {
  nickname: '플레이어',
  diamond: 0n,
  hasUnreadMail: false,
  hasCompletedEnhance: false,
};

/**
 * 프로필(닉네임·다이아) + 우편 미수령 dot + 강화완료 dot을 단일 왕복(Promise.all)으로.
 * 4s 가드 + catch — 콜드 DB 커넥션이 max:1 풀에서 hang해도 기본값으로 graceful degrade.
 */
export async function loadLayoutData(userId: string): Promise<LayoutData> {
  try {
    const [profileRow, mailRow, enhanceRow] = await withTimeout(
      Promise.all([
        db
          .select({ nickname: profiles.nickname, diamond: profiles.diamond })
          .from(profiles)
          .where(eq(profiles.id, userId))
          .limit(1),
        db
          .select({ id: mailbox.id })
          .from(mailbox)
          .where(
            and(
              eq(mailbox.userId, userId),
              isNull(mailbox.claimedAt),
              or(isNull(mailbox.expiresAt), gt(mailbox.expiresAt, sql`now()`)),
            ),
          )
          .limit(1),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(enhancementJobs)
          .where(
            and(
              eq(enhancementJobs.userId, userId),
              eq(enhancementJobs.status, 'running'),
              lte(enhancementJobs.completeAt, sql`now()`),
            ),
          ),
      ]),
      4000,
      'layout.data',
    );
    return {
      nickname: profileRow[0]?.nickname ?? '플레이어',
      diamond: profileRow[0]?.diamond ?? 0n,
      hasUnreadMail: mailRow.length > 0,
      hasCompletedEnhance: (enhanceRow[0]?.n ?? 0) > 0,
    };
  } catch (e) {
    console.warn('[layout] data load failed — defaults', (e as Error).message);
    return DEFAULTS;
  }
}
