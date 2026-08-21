import 'server-only';

import { and, eq, ne, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { characters } from '@/lib/db/schema/server';
import { guildMembers, zones, guildBattleDeployments } from '@/lib/db/schema/guild';

import { GuildError } from '../errors';
import { hasGuildPerm } from '../permissions';
import { assertResident } from '../residence';
import { nextBattleKstDay, isConquestLocked } from './schedule';

/**
 * actor가 zone 소유 길드에서 executor 권한을 갖는지 검증하고 소유 길드 id 반환.
 * 집행관 지정은 세금 수금권을 함께 주는 자산급 액션이라 2026-07-10에 길드장 전속으로 올렸으나,
 * 개인별 권한(0142)으로 되돌린다 — 기본은 꺼져 있고 길드장이 켜 줘야 한다(문의 #106·#107).
 */
export async function assertLeaderOfZoneOwner(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  actorUserId: string,
  zoneId: number,
): Promise<{ guildId: bigint; serverId: number; zoneName: string }> {
  // 존 소유 길드를 먼저 잠그고, actor 멤버십을 (user, guild)로 앵커 — 길드가 서버에 묶여
  // 서버 식별이 내재됨(SERVER.md P5: 다서버에서도 정확). 1집행관 가드 스코프용으로 serverId도 반환(감사 G-01).
  // zoneName은 활동 로그 detail(zone) 기록용 — 피드가 이름으로 렌더.
  const [z] = await tx
    .select({ ownerGuildId: zones.ownerGuildId, serverId: zones.serverId, name: zones.name })
    .from(zones)
    .where(eq(zones.id, zoneId))
    .for('update');
  if (!z) throw new GuildError('ZONE_NOT_FOUND');
  if (z.ownerGuildId == null) throw new GuildError('FORBIDDEN');

  const [m] = await tx
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      permissions: guildMembers.permissions,
    })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, actorUserId), eq(guildMembers.guildId, z.ownerGuildId)))
    .limit(1);
  if (!m) throw new GuildError('FORBIDDEN'); // 자기 길드 소유 구역 아님
  // 멤버십을 (user, guild)로 앵커했으므로 권한 가드를 다시 조회하지 않고 여기서 직접 판정한다.
  if (!hasGuildPerm(m.role, m.permissions, 'executor')) throw new GuildError('NO_PERMISSION');
  return { guildId: m.guildId, serverId: z.serverId, zoneName: z.name };
}

/**
 * 집행관 지정 — GUILD §5.8⑦. executor 권한자가 길드원 1명을 그 구역 집행관으로.
 *  - 대상은 같은 길드원 + **그 구역 거주자**여야 하고, 이미 다른 구역 집행관이면 거부(1유저 1집행관).
 *  - 집행관은 자동 방어로 슬롯 점유 → 대상의 다음 전투 배치는 제거.
 */
export async function setZoneExecutor(input: {
  actorUserId: string;
  zoneId: number;
  targetUserId: string;
}): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도(23:00~01:00) 잠금
  await db.transaction(async (tx) => {
    const { guildId, serverId } = await assertLeaderOfZoneOwner(tx, input.actorUserId, input.zoneId);

    // 물러나는 기존 집행관 — 교체로 자동 방어가 사라지므로 아래에서 일반 수비 배치로 복원
    // (2026-07-21 문의 #36: 복원이 없어 교체된 집행관이 수비에서 완전히 빠지던 버그).
    const [cur] = await tx
      .select({ executorUserId: zones.executorUserId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    const prevExecutor = cur?.executorUserId ?? null;

    const [target] = await tx
      .select({ guildId: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.targetUserId), eq(guildMembers.guildId, guildId)))
      .limit(1);
    if (!target) throw new GuildError('TARGET_NOT_IN_GUILD');
    // 이동·거주 필수(0139) — 집행관은 그 구역 상주 방어자다. UI는 수비 배치자만 후보로 보여줘
    // 자연히 통과하지만, 액션 직접 호출로 비거주자를 세우는 우회를 서버에서 막는다.
    await assertResident(tx, input.targetUserId, serverId, input.zoneId);

    // 1유저 1집행관 — **같은 서버** 다른 구역 집행관이면 거부(감사 G-01: serverId 누락 시 타 서버
    // 집행관까지 잡아 정상 크로스서버 유저를 오차단). 먼저 해제 필요.
    const [other] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(
        and(
          eq(zones.executorUserId, input.targetUserId),
          eq(zones.serverId, serverId),
          ne(zones.id, input.zoneId),
        ),
      )
      .limit(1);
    if (other) throw new GuildError('TARGET_ALREADY_EXECUTOR');

    await tx.update(zones).set({ executorUserId: input.targetUserId }).where(eq(zones.id, input.zoneId));
    // 칭호 이력(0166) — 역임 구역 누적(중복 없음). tour_lord(서로 다른 3구역 역임) 판정 근거.
    await tx
      .update(characters)
      .set({
        executorZoneHistory: sql`case when ${characters.executorZoneHistory} ? ${String(input.zoneId)}
          then ${characters.executorZoneHistory}
          else ${characters.executorZoneHistory} || to_jsonb(${String(input.zoneId)}::text) end`,
      })
      .where(and(eq(characters.userId, input.targetUserId), eq(characters.serverId, serverId)));

    // 집행관은 자동 방어 — 다음 전투의 일반 배치 제거(슬롯 점유 일원화).
    await tx
      .delete(guildBattleDeployments)
      .where(
        and(
          eq(guildBattleDeployments.userId, input.targetUserId),
          eq(guildBattleDeployments.guildId, guildId),
          eq(guildBattleDeployments.battleKstDay, nextBattleKstDay()),
        ),
      );

    // 물러난 집행관을 이 구역 일반 수비로 복원 — 자동 방어만 잃고 수비 자체는 유지되게.
    if (prevExecutor && prevExecutor !== input.targetUserId) {
      await restoreAsDefender(tx, { userId: prevExecutor, guildId, serverId, zoneId: input.zoneId });
    }
  });
}

/**
 * 물러난 집행관의 수비 복원(2026-07-21 문의 #36) — 집행관 교체·해제 시 자동 방어가 사라지므로
 * 같은 구역 일반 수비 배치(defend)를 넣어준다. 본인이 그 사이 다른 배치를 했으면 그쪽을
 * 존중(유저·일 유니크 onConflictDoNothing) — 덮어쓰지 않는다. 탈퇴자는 멤버십 검사로 제외.
 */
async function restoreAsDefender(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { userId: string; guildId: bigint; serverId: number; zoneId: number },
): Promise<void> {
  const [m] = await tx
    .select({ userId: guildMembers.userId })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.guildId, input.guildId)))
    .limit(1);
  if (!m) return; // 이미 길드를 떠난 계정 — 복원 대상 아님
  await tx
    .insert(guildBattleDeployments)
    .values({
      serverId: input.serverId,
      battleKstDay: nextBattleKstDay(),
      userId: input.userId,
      guildId: input.guildId,
      zoneId: input.zoneId,
      role: 'defend',
    })
    .onConflictDoNothing();
}

/** 집행관 해제 — 소유 길드 길드장. 구역을 집행관 공석으로(자동 방어·수금 중단).
 *  해제된 인원은 같은 구역 일반 수비로 복원(교체와 동일 — 수비에서 통째로 빠지지 않게). */
export async function clearZoneExecutor(input: { actorUserId: string; zoneId: number }): Promise<void> {
  if (isConquestLocked()) throw new GuildError('BATTLE_IN_PROGRESS'); // 정산·공개 윈도 잠금
  await db.transaction(async (tx) => {
    const { guildId, serverId } = await assertLeaderOfZoneOwner(tx, input.actorUserId, input.zoneId);
    const [cur] = await tx
      .select({ executorUserId: zones.executorUserId })
      .from(zones)
      .where(eq(zones.id, input.zoneId))
      .limit(1);
    await tx.update(zones).set({ executorUserId: null }).where(eq(zones.id, input.zoneId));
    if (cur?.executorUserId) {
      await restoreAsDefender(tx, { userId: cur.executorUserId, guildId, serverId, zoneId: input.zoneId });
    }
  });
}
