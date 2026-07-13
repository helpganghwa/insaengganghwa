import 'server-only';

import { and, eq, lt, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { suggestNickname } from '@/lib/game/server-select';

/**
 * 미접속 닉네임 회수 — 90일 이상 미접속 캐릭터의 닉네임을 기본형('대장장이'+난수)으로 초기화.
 * 닉네임이 전 캐릭터 전역 유일(SERVER.md §1)이라 이탈 계정의 좋은 닉네임 영구 점유를 방지.
 *
 * - 판정: coalesce(last_seen_at, created_at) < now() - 90일 (생성만 하고 이탈한 계정 커버)
 * - 이미 기본형(^대장장이[0-9a-z]{4}$)이면 스킵 — 불필요한 변경 방지
 * - nickname_changed_count = 0 리셋 — 본인 의사가 아닌 변경이므로 복귀 시 첫 닉변 무료 유지
 * - 통지 우편 1통(기존 닉네임 명시) — 복귀 시 어리둥절하지 않게
 * - 변경 UPDATE의 WHERE에 미접속 조건 재확인 — 크론 도중 접속(last_seen 갱신) 경쟁 시 no-op
 */
const INACTIVE_DAYS = 90;
/** 회당 처리 상한 — 폭주 방지(일일 크론이라 밀려도 다음 날 이어서 처리). */
const BATCH_LIMIT = 50;
/** 닉네임 유니크 충돌(23505) 시 재추첨 횟수 — 36⁴≈168만 조합이라 사실상 1회로 충분. */
const RENAME_RETRIES = 5;

const inactiveCond = lt(
  sql`coalesce(${characters.lastSeenAt}, ${characters.createdAt})`,
  sql`now() - interval '${sql.raw(String(INACTIVE_DAYS))} days'`,
);

export async function reclaimInactiveNicknames(): Promise<{ reclaimed: number; failed: number }> {
  const targets = await db
    .select({ userId: characters.userId, serverId: characters.serverId, nickname: characters.nickname })
    .from(characters)
    .where(
      and(
        inactiveCond,
        // 기본형은 스킵 — SQL 정규식(~)로 필터. notIlike 미사용: 패턴이 접두가 아니라 정확형이라 regex가 정직.
        sql`${characters.nickname} !~ '^대장장이[0-9a-z]{4}$'`,
      ),
    )
    .orderBy(sql`coalesce(${characters.lastSeenAt}, ${characters.createdAt})`)
    .limit(BATCH_LIMIT);

  let reclaimed = 0;
  let failed = 0;
  for (const t of targets) {
    // 건별 격리 — 한 건 실패(유니크 소진 등)가 뒤 건을 막지 않게.
    try {
      let outcome: 'reclaimed' | 'skipped' | null = null;
      for (let i = 0; i < RENAME_RETRIES && outcome === null; i++) {
        const fresh = suggestNickname();
        try {
          outcome = await db.transaction(async (tx) => {
            const rows = await tx
              .update(characters)
              .set({ nickname: fresh, nicknameChangedCount: 0 })
              .where(
                and(
                  eq(characters.userId, t.userId),
                  eq(characters.serverId, t.serverId),
                  inactiveCond, // 경쟁 방어 — 크론 도중 접속했으면 no-op
                ),
              )
              .returning({ userId: characters.userId });
            if (rows.length === 0) return 'skipped'; // 그새 접속 — 회수 취소(우편 없음)
            await tx.insert(mailbox).values({
              userId: t.userId,
              serverId: t.serverId,
              type: 'notice',
              title: '오래 자리를 비워 닉네임이 초기화되었어요',
              body: `${INACTIVE_DAYS}일 이상 접속하지 않아 닉네임 '${t.nickname}'이(가) '${fresh}'(으)로 초기화되었어요. 돌아오셨다면 닉네임 변경 1회를 무료로 쓸 수 있어요.`,
              senderLabel: '시스템',
              payload: {},
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });
            console.log(`[nickname-reclaim] ${t.userId}@s${t.serverId} '${t.nickname}' → '${fresh}'`);
            return 'reclaimed';
          });
        } catch (e) {
          // 유니크 충돌(23505)만 재추첨, 그 외는 건 실패로.
          const code = (e as { code?: string })?.code;
          if (code !== '23505') throw e;
        }
      }
      if (outcome === 'reclaimed') reclaimed++;
      else if (outcome === null) {
        failed++;
        console.error(`[nickname-reclaim] ${t.userId}@s${t.serverId} 재추첨 ${RENAME_RETRIES}회 소진`);
      }
    } catch (e) {
      failed++;
      console.error(`[nickname-reclaim] ${t.userId}@s${t.serverId} 실패`, (e as Error).message);
    }
  }
  return { reclaimed, failed };
}
