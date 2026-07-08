import 'server-only';

import { and, count, eq, inArray, lt, or } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { profileGenerationJobs } from '@/lib/db/schema/avatar';
import { PROFILE_GEN_SLOT_MINUTES } from '@/lib/game/balance';
import { profileGenConcurrency } from './pixellab-keys';

export type ProfileQueueInfo = {
  /** 내 활성 잡 상태. */
  status: 'queued' | 'starting' | 'downloading' | 'ai_reviewing';
  createdAt: string; // ISO
  /** 대기열 내 자리(1-indexed). 이미 생성 중이면 0. */
  position: number;
  /** 완료까지 예상(분, 보수적). */
  etaMinutes: number;
  /** true = 슬롯이 가득 차 실제로 대기 중(웨이브≥1). false = 곧/이미 생성 시작. */
  waiting: boolean;
};

const ACTIVE = ['queued', 'starting', 'downloading', 'ai_reviewing'] as const;

/**
 * 내 활성 아바타 생성 잡의 대기열 위치·ETA. 유저당 활성 1건(UNIQUE)이라 최대 1건.
 *  - 생성 중(starting/downloading/ai_reviewing): position=0, eta=남은 생성시간.
 *  - 대기(queued): position=나보다 앞선 queued 수+1, eta=시작 대기(웨이브)+내 생성.
 * 슬롯 회전(SLOT_MINUTES)·동시성(CONCURRENCY) 기반 근사(prod 실측 상수).
 */
/**
 * 이 유저가 이 서버에서 **성공한 커스텀 아바타 생성 이력**이 있는지 — 첫생성 50% 할인 판정용.
 * 성공 신호 = jobs.status='accepted'(정상 검토 통과) OR adminDecision='grant'(어드민 지급) —
 * 둘 다 잡에 append-only라 아바타를 삭제해도 남는다(현재 보유수 기반 판정의 '삭제→재할인' 우회 차단).
 */
export async function hasGeneratedCustomAvatar(userId: string, serverId: number): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(profileGenerationJobs)
    .where(
      and(
        eq(profileGenerationJobs.userId, userId),
        eq(profileGenerationJobs.serverId, serverId),
        or(
          eq(profileGenerationJobs.status, 'accepted'),
          eq(profileGenerationJobs.adminDecision, 'grant'),
        ),
      ),
    );
  return (row?.n ?? 0) > 0;
}

export async function getMyProfileQueueInfo(
  userId: string,
  serverId: number,
): Promise<ProfileQueueInfo | null> {
  const [job] = await db
    .select({ status: profileGenerationJobs.status, createdAt: profileGenerationJobs.createdAt })
    .from(profileGenerationJobs)
    .where(
      and(
        eq(profileGenerationJobs.userId, userId),
        eq(profileGenerationJobs.serverId, serverId),
        inArray(profileGenerationJobs.status, [...ACTIVE]),
      ),
    )
    .limit(1);
  if (!job) return null;

  // 쿼리가 ACTIVE로 필터해 실제론 활성 4종 중 하나(TS는 enum 전체로 봄 → 좁힘).
  const status = job.status as ProfileQueueInfo['status'];
  const createdAt = job.createdAt ?? new Date();
  const elapsedMin = Math.max(0, (Date.now() - createdAt.getTime()) / 60_000);

  // 생성 중 — 남은 생성시간(최소 1분). ai_reviewing은 거의 완료라 1분.
  if (status !== 'queued') {
    const remain =
      status === 'ai_reviewing' ? 1 : Math.max(1, Math.ceil(PROFILE_GEN_SLOT_MINUTES - elapsedMin));
    return { status, createdAt: createdAt.toISOString(), position: 0, etaMinutes: remain, waiting: false };
  }

  // 대기 — 활성(starting+downloading) 수와 나보다 앞선 queued 수로 시작 웨이브 계산.
  const cap = profileGenConcurrency();
  const [inflightRow, aheadRow] = await Promise.all([
    db
      .select({ n: count() })
      .from(profileGenerationJobs)
      .where(inArray(profileGenerationJobs.status, ['starting', 'downloading'])),
    db
      .select({ n: count() })
      .from(profileGenerationJobs)
      .where(and(eq(profileGenerationJobs.status, 'queued'), lt(profileGenerationJobs.createdAt, createdAt))),
  ]);
  const inflight = Number(inflightRow[0]?.n ?? 0);
  const queuedAhead = Number(aheadRow[0]?.n ?? 0);
  const position = queuedAhead + 1;

  const freeNow = Math.max(0, cap - inflight);
  const needBeforeStart = queuedAhead + 1; // 나 포함
  const startWaves = needBeforeStart <= freeNow ? 0 : Math.ceil((needBeforeStart - freeNow) / cap);
  const etaMinutes = startWaves * PROFILE_GEN_SLOT_MINUTES + PROFILE_GEN_SLOT_MINUTES;

  // 슬롯 여유가 있어 다음 드레인에 바로 시작할 경우(startWaves 0)는 '대기'로 표기하지 않음.
  return { status: 'queued', createdAt: createdAt.toISOString(), position, etaMinutes, waiting: startWaves >= 1 };
}
