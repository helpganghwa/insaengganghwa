import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getMyMembership, getDeployBoard, getAttackableZoneIds } from '@/lib/game/guild';
import { kstDateString } from '@/lib/kst';

import { DeployBoard } from './DeployBoard';

export const dynamic = 'force-dynamic';

export default async function DeployPage() {
  const userId = await getSessionUserId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const membership = await getMyMembership(userId);
  if (!membership) redirect('/guild');

  const isOfficer = membership.role === 'leader' || membership.role === 'vice';
  const [board, attackable] = await Promise.all([
    getDeployBoard(membership.guildId),
    getAttackableZoneIds(membership.guildId),
  ]);
  const battleDayLabel = board.battleKstDay === kstDateString() ? '오늘 11:00' : '내일 11:00';

  return (
    <DeployBoard
      isOfficer={isOfficer}
      myGuildId={membership.guildId.toString()}
      battleDayLabel={battleDayLabel}
      attackableZoneIds={attackable}
      members={board.members.map((m) => ({
        userId: m.uid,
        nickname: m.nickname,
        role: m.mrole,
        depZoneId: m.dep_zone_id,
        depZoneName: m.dep_zone_name,
        depRole: m.dep_role,
        execZoneName: m.exec_zone_name,
      }))}
      zones={board.zones.map((z) => ({
        id: z.id,
        name: z.name,
        region: z.region,
        ownerGuildId: z.ownerGuildId?.toString() ?? null,
      }))}
    />
  );
}
