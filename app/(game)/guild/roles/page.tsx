import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuildVices, getMyMembership, getGuild } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';

import { VicePermissionsBoard } from './VicePermissionsBoard';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/**
 * 부길드장 권한 — 길드장이 부길드장 개인별로 아홉 가지를 켜고 끈다(0142).
 *
 * 접근:
 *  - 길드장 : 편집
 *  - 부길드장 : **자기 권한만 읽기 전용** — "내가 무엇을 할 수 있는지 모른다"는 문의(#107)에
 *    대한 답이다. 남의 권한은 보이지 않는다.
 *  - 일반 길드원 : 길드 홈으로
 */
export default async function GuildRolesPage() {
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
  if (membership.role === 'member') redirect('/guild');

  const isLeader = membership.role === 'leader';
  const [guild, vices, mine] = await Promise.all([
    withTimeout(getGuild(membership.guildId), DB_GUARD_MS, 'guild.roles.guild'),
    isLeader
      ? withTimeout(getGuildVices(membership.guildId), DB_GUARD_MS, 'guild.roles.vices')
      : Promise.resolve([]),
    isLeader ? Promise.resolve(null) : getGuildPermState(userId, serverId),
  ]);

  // 부길드장 자신 — 자기 한 줄만 넘겨 읽기 전용으로 렌더.
  const rows = isLeader
    ? vices.map((v) => ({
        userId: v.userId,
        nickname: v.nickname ?? '플레이어',
        permissions: v.permissions,
        avatar: v.avatar,
      }))
    : [
        {
          userId,
          nickname: '나',
          permissions: mine?.permissions ?? 0,
          avatar: null as string | null,
        },
      ];

  return (
    <VicePermissionsBoard
      guildName={guild?.name ?? '길드'}
      editable={isLeader}
      vices={rows}
    />
  );
}
