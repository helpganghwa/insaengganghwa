import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { isNicknameTaken } from '@/lib/db/errors';
import { characters } from '@/lib/db/schema/server';
import { mailbox } from '@/lib/db/schema/mailbox';
import { suggestNickname } from '@/lib/game/server-select';

/**
 * 미접속 닉네임 회수 — 90일 이상 미접속 **계정**의 닉네임을 기본형('대장장이'+난수)으로 초기화.
 * 이름은 사람에게 붙으므로(0207) 회수도 사람 단위다.
 *
 * ⚠ 2026-09-21(⑪) 계정 단위로 전환. 종전에는 캐릭터마다 따로 판정해서, 2서버만 하는 사람의
 *   1서버 닉이 초기화됐다 — 정작 그 이름은 본인이 2서버에서 계속 쓰고 있어 **남에게 풀리지도
 *   않는다**. 회수 목적은 달성하지 못한 채 같은 사람의 이름만 서버마다 갈라지는 결과였다.
 *
 * - 판정: 그 계정 **모든 캐릭터**의 max(coalesce(last_seen_at, created_at)) < now() - 90일
 * - 이미 전부 기본형(^대장장이[0-9a-z]{4}$)이면 스킵 — 불필요한 변경 방지
 * - 회수 시 그 계정의 **전 서버 캐릭터를 같은 새 이름으로** 통일(0207이 허용)
 * - nickname_changed_count = 0 리셋 — 본인 의사가 아닌 변경이므로 복귀 시 첫 닉변 무료 유지
 * - 통지 우편 1통(마지막 접속 서버 우편함, 기존 닉네임 명시) — 복귀 시 어리둥절하지 않게
 * - 변경 UPDATE의 WHERE에 미접속 조건 재확인 — 크론 도중 접속(last_seen 갱신) 경쟁 시 no-op
 */
const INACTIVE_DAYS = 90;
/** 회당 처리 상한 — 폭주 방지(일일 크론이라 밀려도 다음 날 이어서 처리). */
const BATCH_LIMIT = 50;
/** 닉네임 충돌(23505·23P01) 시 재추첨 횟수 — 36⁴≈168만 조합이라 사실상 1회로 충분. */
const RENAME_RETRIES = 5;
/** 자동 생성 기본형 — 이 모양이면 회수할 이유가 없다. */
const DEFAULT_NICK_RE = "'^대장장이[0-9a-z]{4}$'";

type Target = { userId: string; nicknames: string; mailServerId: number };

export async function reclaimInactiveNicknames(): Promise<{ reclaimed: number; failed: number }> {
  // 계정 단위 후보 — 전 서버 통틀어 마지막 활동이 기준보다 오래됐고, 기본형이 아닌 이름이 하나라도 있는 계정.
  // 우편함은 마지막 접속 서버로(그 서버에 캐릭터가 없으면 가장 낮은 서버).
  const targets = (await db.execute(sql`
    select c.user_id::text as "userId",
           string_agg(distinct c.nickname, ', ' order by c.nickname) as nicknames,
           coalesce(
             max(c.server_id) filter (where c.server_id = p.last_server_id),
             min(c.server_id)
           )::int as "mailServerId"
      from characters c
      join profiles p on p.id = c.user_id
     group by c.user_id
    having max(coalesce(c.last_seen_at, c.created_at)) < now() - interval '${sql.raw(String(INACTIVE_DAYS))} days'
       and bool_or(c.nickname !~ ${sql.raw(DEFAULT_NICK_RE)})
     order by max(coalesce(c.last_seen_at, c.created_at))
     limit ${BATCH_LIMIT}
  `)) as unknown as Target[];

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
            // 경쟁 방어 — 이 계정의 어느 캐릭터든 그새 접속했으면 통째로 취소(우편 없음).
            const live = (await tx.execute(sql`
              select 1 from characters
               where user_id = ${t.userId}::uuid
                 and coalesce(last_seen_at, created_at) >= now() - interval '${sql.raw(String(INACTIVE_DAYS))} days'
               limit 1
            `)) as unknown as unknown[];
            if (live.length > 0) return 'skipped';

            const rows = await tx
              .update(characters)
              .set({ nickname: fresh, nicknameChangedCount: 0 })
              .where(eq(characters.userId, t.userId))
              .returning({ serverId: characters.serverId });
            if (rows.length === 0) return 'skipped';

            await tx.insert(mailbox).values({
              userId: t.userId,
              serverId: t.mailServerId,
              type: 'notice',
              title: '오래 자리를 비워 닉네임이 초기화되었어요',
              body: `${INACTIVE_DAYS}일 이상 접속하지 않아 닉네임 '${t.nicknames}'이(가) '${fresh}'(으)로 초기화되었어요. 돌아오셨다면 닉네임 변경 1회를 무료로 쓸 수 있어요.`,
              senderLabel: '인생강화',
              payload: {},
              expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            });
            console.log(`[nickname-reclaim] ${t.userId} '${t.nicknames}' → '${fresh}' (서버 ${rows.length}곳)`);
            return 'reclaimed';
          });
        } catch (e) {
          // 이름 충돌만 재추첨, 그 외는 건 실패로. 0207 이후 23P01(소유 제약)도 같은 뜻이다.
          if (!isNicknameTaken(e)) throw e;
        }
      }
      if (outcome === 'reclaimed') reclaimed++;
      else if (outcome === null) {
        failed++;
        console.error(`[nickname-reclaim] ${t.userId} 재추첨 ${RENAME_RETRIES}회 소진`);
      }
    } catch (e) {
      failed++;
      console.error(`[nickname-reclaim] ${t.userId} 실패`, (e as Error).message);
    }
  }
  return { reclaimed, failed };
}
