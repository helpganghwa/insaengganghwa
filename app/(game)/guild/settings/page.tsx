import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import {
  getGuild,
  getGuildEmblems,
  getGuildHubStatus,
  getGuildVices,
  getJoinRequests,
} from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { guildCapacity } from '@/lib/game/guild/balance';

import { GuildSettings } from './GuildSettings';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/**
 * 길드 관리 허브(C-3) — 요약 + 타일. 각 항목은 전용 화면으로 나가 있다.
 * 화면 게이팅은 역할이 아니라 **권한**(0142) — 길드장이 열어준 부길드장도 같은 타일을 본다.
 */
export default async function GuildSettingsPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const m = await withTimeout(getGuildPermState(userId, serverId), DB_GUARD_MS, 'guild.hub.membership');
  if (!m) redirect('/guild');
  if (m.role === 'member') redirect('/guild');

  const can = {
    notice: hasGuildPerm(m.role, m.permissions, 'notice'),
    intro: hasGuildPerm(m.role, m.permissions, 'intro'),
    openchat: hasGuildPerm(m.role, m.permissions, 'openchat'),
    joinReview: hasGuildPerm(m.role, m.permissions, 'joinReview'),
    taxDistribute: hasGuildPerm(m.role, m.permissions, 'taxDistribute'),
    emblem: hasGuildPerm(m.role, m.permissions, 'emblem'),
  };

  // 타일 뱃지·수치용 최소 조회만 — 목록 자체는 각 상세 화면이 읽는다.
  // 신청자 목록은 권한자에게만 세고, 문양 개수도 권한이 있을 때만 읽는다.
  const [guild, hub, vices, requests, emblems] = await Promise.all([
    withTimeout(getGuild(m.guildId), DB_GUARD_MS, 'guild.hub.guild'),
    withTimeout(getGuildHubStatus(m.guildId, serverId), DB_GUARD_MS, 'guild.hub.status'),
    withTimeout(getGuildVices(m.guildId), DB_GUARD_MS, 'guild.hub.vices'),
    can.joinReview
      ? withTimeout(getJoinRequests(m.guildId), DB_GUARD_MS, 'guild.hub.requests')
      : Promise.resolve([]),
    can.emblem
      ? withTimeout(getGuildEmblems(m.guildId), DB_GUARD_MS, 'guild.hub.emblems')
      : Promise.resolve([]),
  ]);
  if (!guild) redirect('/guild');

  return (
    <GuildSettings
      myRole={m.role}
      can={can}
      view={{
        name: guild.name,
        level: guild.level,
        xp: Number(guild.xp),
        emblemUrl: guild.emblemUrl,
        memberCount: guild.memberCount,
        capacity: guildCapacity(guild.level),
        viceCount: vices.length,
        emblemCount: emblems.length,
        taxPool: guild.taxPoolDiamond.toString(),
        joinRequestCount: guild.joinPolicy === 'approval' ? requests.length : 0,
        ...hub,
      }}
    />
  );
}
