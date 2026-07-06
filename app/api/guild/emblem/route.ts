import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { rateLimited } from '@/lib/ratelimit';
import { actionBlock } from '@/lib/game/action-gate';
import { getActiveServerId } from '@/lib/game/servers';
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
// pixflux 재시도(최악 ~40s) + sharp + 업로드 여유 — 60s는 짧아 타임아웃-kill로 빈 행/차감 손실
// 유발(2026-06-11). 충분히 상향(생성은 이제 성공 후에만 차감/삽입이라 kill돼도 안전하지만 여유 확보).
export const maxDuration = 180;

export async function POST(req: Request) {
  const userId = await getSessionUserId();
  if (!userId) return Response.json({ status: 'error', code: 'UNAUTHENTICATED' }, { status: 401 });

  // 정지/점검 게이트 — 이 라우트는 서버 액션이 아니라 fetch 엔드포인트라 레이아웃 게이트를
  // 안 거친다. 정지 계정의 직접 POST(5,000💎 차감+AI 실호출)와 점검 중 경제 변이를 입구에서 차단.
  const blocked = await actionBlock();
  if (blocked) return Response.json({ status: 'error', code: blocked }, { status: 403 });

  // 고비용 생성(Anthropic+Pixellab 실호출) — 실패 시 캡이 안 올라 무한 재시도 가능하므로 입구에서 차단.
  if (await rateLimited(userId, 'guild')) {
    return Response.json({ status: 'error', code: 'RATE_LIMITED' }, { status: 429 });
  }

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
    await generateEmblem({ userId, serverId: await getActiveServerId(), selection });
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
