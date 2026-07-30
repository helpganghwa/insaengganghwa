import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuildVices, getMyMembership, getGuild } from '@/lib/game/guild';
import { VicePermissionsBoard } from './VicePermissionsBoard';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/**
 * 부길드장 권한 — 길드장이 부길드장 개인별로 아홉 가지를 켜고 끈다(0142).
 *
 * 접근은 **길드장 전속**이다(2026-07-30 사용자 결정) — 권한은 길드장만 관리하고 조회한다.
 * 종전엔 부길드장이 자기 권한을 읽기 전용으로 볼 수 있었으나(문의 #107 대응) 그 경로를 닫았다.
 * 부길드장·길드원 모두 길드 홈으로 돌린다.
 */
export default async function GuildRolesPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await withTimeout(
    getMyMembership(userId, serverId),
    DB_GUARD_MS,
    'guild.roles.membership',
  );
  if (!membership) redirect('/guild');
  if (membership.role !== 'leader') redirect('/guild');

  const [guild, vices] = await Promise.all([
    withTimeout(getGuild(membership.guildId), DB_GUARD_MS, 'guild.roles.guild'),
    withTimeout(getGuildVices(membership.guildId), DB_GUARD_MS, 'guild.roles.vices'),
  ]);

  const rows = vices.map((v) => ({
    userId: v.userId,
    nickname: v.nickname ?? '플레이어',
    permissions: v.permissions,
    avatar: v.avatar,
  }));

  // 길드원 화면 ⋯ → '권한 설정'으로 들어올 때 그 사람을 바로 연다(?u=userId).
  const sp = await searchParams;
  const initialSelected = rows.some((r) => r.userId === sp.u) ? sp.u! : null;

  return (
    <VicePermissionsBoard
      guildName={guild?.name ?? '길드'}
      vices={rows}
      initialSelected={initialSelected}
    />
  );
}
