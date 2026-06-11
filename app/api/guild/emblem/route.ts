import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { generateEmblem } from '@/lib/game/guild';
import { isValidEmblemSelection, type EmblemSelection } from '@/lib/game/guild/emblem-vocab';
import { GuildError } from '@/lib/game/guild/errors';

/**
 * 문양 생성(POST) — 라우트 핸들러로 분리. 클라가 fetch로 호출(서버 액션 트랜지션 밖)해서
 * pixflux 생성(수초~수십초)이 라우터를 막지 않게 함(앱 멈춤 방지). 길드장·5,000💎·최대 보유는
 * generateEmblem이 검증·차감·환불.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ status: 'error', code: 'UNAUTHENTICATED' }, { status: 401 });

  let selection: EmblemSelection | undefined;
  try {
    selection = (await req.json())?.selection;
  } catch {
    return Response.json({ status: 'error', code: 'UNKNOWN' }, { status: 400 });
  }
  if (!selection || !isValidEmblemSelection(selection)) {
    return Response.json({ status: 'error', code: 'EMBLEM_INVALID' }, { status: 400 });
  }

  try {
    await generateEmblem({ userId, selection });
    revalidatePath('/guild');
    revalidatePath('/guild/settings');
    revalidatePath('/', 'layout'); // 헤더(공유 레이아웃) 활성 문양 반영
    return Response.json({ status: 'success' });
  } catch (e) {
    const code = e instanceof GuildError ? e.code : 'UNKNOWN';
    console.error('[guild.emblem.generate]', e);
    return Response.json({ status: 'error', code }, { status: 400 });
  }
}
