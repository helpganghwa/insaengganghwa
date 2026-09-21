import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { guildMembers, guilds } from '@/lib/db/schema/guild';

import { GuildError } from './errors';
import { hasGuildPerm, type GuildPermKey, type GuildRole } from './permissions';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 권한 가드(0142) — 종전의 `role !== 'leader'` / `NOT_OFFICER` 하드코딩을 대체한다.
 * 길드장은 항상 통과, 부길드장은 비트마스크, 일반 길드원은 거절.
 *
 * 실패 코드는 둘로 나눈다:
 *  - NOT_IN_GUILD  : 길드 소속이 아님
 *  - NO_PERMISSION : 소속이지만 그 권한이 없음(길드원 · 권한 꺼진 부길드장)
 * 종전 NOT_LEADER/NOT_OFFICER는 "길드장만 가능"이라는 잘못된 안내를 주므로 쓰지 않는다.
 */
export async function assertGuildPerm(
  tx: Tx,
  userId: string,
  serverId: number,
  perm: GuildPermKey,
): Promise<{ guildId: bigint; role: GuildRole; permissions: number }> {
  const [m] = await tx
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      permissions: guildMembers.permissions,
    })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  if (!m) throw new GuildError('NOT_IN_GUILD');
  if (!hasGuildPerm(m.role, m.permissions, perm)) throw new GuildError('NO_PERMISSION');
  return { guildId: m.guildId, role: m.role, permissions: m.permissions };
}

/** 트랜잭션 밖에서 쓰는 판정(조회 전용 · UI 게이팅). 없으면 null. */
export async function getGuildPermState(
  userId: string,
  serverId: number,
): Promise<{ guildId: bigint; role: GuildRole; permissions: number } | null> {
  const [m] = await db
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      permissions: guildMembers.permissions,
    })
    .from(guildMembers)
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  return m ?? null;
}

/**
 * 점령지 화면 전용 — 직책·권한에 **길드의 배치 정보 공개 범위(0204)** 를 얹어 한 번에 읽는다.
 * 공개 범위를 먼저 알아야 배치 보드를 전원분으로 읽을지 본인 행만 읽을지 정할 수 있다
 * (길드 정보를 통째로 읽는 getGuild를 따로 부르지 않는다 — 요청당 왕복 최소화 §11.4).
 */
export async function getDeployViewerState(
  userId: string,
  serverId: number,
): Promise<{ guildId: bigint; role: GuildRole; permissions: number; deployVisibility: string } | null> {
  const [m] = await db
    .select({
      guildId: guildMembers.guildId,
      role: guildMembers.role,
      permissions: guildMembers.permissions,
      deployVisibility: guilds.deployVisibility,
    })
    .from(guildMembers)
    .innerJoin(guilds, eq(guilds.id, guildMembers.guildId))
    .where(and(eq(guildMembers.userId, userId), eq(guildMembers.serverId, serverId)))
    .limit(1);
  return m ?? null;
}
