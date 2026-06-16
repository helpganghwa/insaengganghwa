import 'server-only';

import { and, eq, gte } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { zones, guildBattleDeployments } from '@/lib/db/schema/guild';

import { nextBattleKstDay } from './schedule';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 이탈(탈퇴·추방) 시 점령전 역할 정리 — 잔류 집행관/배치 익스플로잇 차단(GUILD §5.4·§5.7).
 *  - 집행관 공석화: 그 유저가 집행관인 구역의 executor 해제. 안 하면 이탈자가 옛 길드 구역의
 *    ×3 자동방어를 계속 제공하고, 세수 10% 수금 권한도 유지된다(비길드원이 길드 세수 탈취).
 *  - 미정산 배치 삭제: 아직 안 끝난 전투일(>= nextBattleKstDay) 배치 제거 — 옛 길드 유닛으로
 *    참전하는 것 방지. 이미 정산된 과거 배치는 연대기 이력용으로 보존(1유저 1일 1배치라 대상은 최대 1행).
 *
 * 해산(disband) 경로는 guilds 삭제 cascade(배치) + zones 중립화(executor)로 이미 정리되므로 호출 불필요.
 */
export async function clearConquestRoleOnExit(tx: Tx, userId: string, serverId: number): Promise<void> {
  await tx
    .update(zones)
    .set({ executorUserId: null })
    .where(and(eq(zones.executorUserId, userId), eq(zones.serverId, serverId)));
  await tx
    .delete(guildBattleDeployments)
    .where(
      and(
        eq(guildBattleDeployments.userId, userId),
        eq(guildBattleDeployments.serverId, serverId),
        gte(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
      ),
    );
}
