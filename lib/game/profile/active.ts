import 'server-only';

import { and, eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { userProfiles } from '@/lib/db/schema/avatar';
import { characters } from '@/lib/db/schema/server';
import { markChallengeEvent } from '@/lib/game/challenges/events';

type Dbx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 대표(active) 아바타 설정 — 아바타 선택 화면과 월드보스 추천 장착(장비+아바타 한 번에, 10-12)이 같은 규칙을 쓴다.
 * 아바타는 서버별 자산이라 그 서버 것만(다른 서버 아바타를 대표로 다는 교차 설정 차단). 본인 소유가 아니면 false.
 * `dbx`에 트랜잭션을 주면 그 안에서 실행한다(장비 장착과 한 번에 커밋, 10-14).
 */
export async function activateProfile(userId: string, serverId: number, profileId: string, dbx: Dbx = db): Promise<boolean> {
  const [row] = await dbx
    .select({ id: userProfiles.id })
    .from(userProfiles)
    .where(and(eq(userProfiles.id, profileId), eq(userProfiles.userId, userId), eq(userProfiles.serverId, serverId)))
    .limit(1);
  if (!row) return false;
  await dbx
    .update(characters)
    .set({
      activeProfileId: profileId,
      // 칭호 이력(0166) — 대표가 **실제로 바뀔 때만** 유지 시작 리셋(같은 아바타 재선택은 무시).
      // UPDATE의 우변 컬럼 참조는 변경 전 값이라 이 비교가 정확하다.
      activeProfileSince: sql`case when ${characters.activeProfileId} is distinct from ${profileId}::uuid
        then now() else ${characters.activeProfileSince} end`,
    })
    .where(and(eq(characters.userId, userId), eq(characters.serverId, serverId)));
  // 도전 과제(0118) — 아바타 변경 마킹(멱등·best-effort).
  await markChallengeEvent(dbx, userId, serverId, 'avatar_change');
  return true;
}
