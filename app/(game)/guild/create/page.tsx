import { redirect } from 'next/navigation';
import { getActiveServerId } from '@/lib/game/servers';

import { getSessionUserId } from '@/lib/auth/session';
import { getMyMembership } from '@/lib/game/guild';

import { CreateGuildForm } from './CreateGuildForm';

export const dynamic = 'force-dynamic';

export default async function CreateGuildPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) {
    return <div className="px-4 py-8 text-center text-sm text-zinc-500">로그인이 필요합니다.</div>;
  }
  // 이미 길드 소속이면 생성 불가 — 길드 홈으로.
  const membership = await getMyMembership(userId, serverId);
  if (membership) redirect('/guild');

  return <CreateGuildForm />;
}
