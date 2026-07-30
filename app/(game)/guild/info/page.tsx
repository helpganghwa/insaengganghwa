import { redirect } from 'next/navigation';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { withTimeout } from '@/lib/db/with-timeout';
import { getGuild } from '@/lib/game/guild';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';

import { GuildInfoEditor } from './GuildInfoEditor';

const DB_GUARD_MS = 4000;
export const dynamic = 'force-dynamic';

/**
 * 길드 정보 — 공지 · 소개 · 오픈채팅. 세 값의 권한이 각각 따로다(0142).
 * 하나라도 권한이 있으면 진입하고, 없는 필드는 읽기 전용으로 사유를 밝힌다.
 */
export default async function GuildInfoPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  const m = await withTimeout(getGuildPermState(userId, serverId), DB_GUARD_MS, 'guild.info.membership');
  if (!m) redirect('/guild');

  const can = {
    notice: hasGuildPerm(m.role, m.permissions, 'notice'),
    intro: hasGuildPerm(m.role, m.permissions, 'intro'),
    openchat: hasGuildPerm(m.role, m.permissions, 'openchat'),
  };
  // 셋 다 없으면 볼 이유가 없다 — 길드 홈에서 이미 공지를 읽을 수 있다.
  if (!can.notice && !can.intro && !can.openchat) redirect('/guild');

  const guild = await withTimeout(getGuild(m.guildId), DB_GUARD_MS, 'guild.info.guild');
  if (!guild) redirect('/guild');

  return (
    <GuildInfoEditor
      guildName={guild.name}
      can={can}
      initial={{
        notice: guild.notice ?? '',
        intro: guild.intro ?? '',
        openchat: guild.openchatUrl ?? '',
      }}
    />
  );
}
