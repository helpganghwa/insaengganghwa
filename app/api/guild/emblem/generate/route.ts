import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

import { getSessionUserId } from '@/lib/auth/session';
import { getActiveServerId } from '@/lib/game/servers';
import { rateLimited } from '@/lib/ratelimit';
import { getGuildPermState } from '@/lib/game/guild/perm-guard';
import { hasGuildPerm } from '@/lib/game/guild/permissions';
import { getGuild } from '@/lib/game/guild/queries';
import { claimEmblemGeneration, generateAndStoreEmblem, markEmblemStatus } from '@/lib/game/guild/emblem';
import { isValidEmblemSelection, type EmblemSelection } from '@/lib/game/guild/emblem-vocab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/**
 * 문양 생성 전용 라우트(2026-08-06).
 *
 * 왜 서버 액션이 아니라 라우트인가:
 *  - 생성 실측 소요가 20~97초인데 (game) 라우트의 maxDuration은 60초다. 그 안에서 돌리면
 *    정상 생성까지 kill돼 상태가 pending으로 굳는다(스테이징 실측).
 *  - 서버 액션은 직렬 처리라 긴 작업이 라우터 내비게이션을 막는다(무한 로딩 제보).
 * 그래서 생성만 180초 예산의 독립 라우트로 떼어내고, 화면은 폴링으로 결과를 받는다.
 */
export const maxDuration = 180;

export async function POST() {
  const userId = await getSessionUserId();
  if (!userId) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (await rateLimited(userId, 'guild')) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  const serverId = await getActiveServerId();
  const m = await getGuildPermState(userId, serverId);
  if (!m) return NextResponse.json({ ok: false, error: 'not_member' }, { status: 403 });
  if (!hasGuildPerm(m.role, m.permissions, 'emblem')) {
    return NextResponse.json({ ok: false, error: 'no_perm' }, { status: 403 });
  }

  const g = await getGuild(m.guildId);
  if (!g) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  // 이미 문양이 있으면 여기서 만들지 않는다 — 교체는 문양 화면의 유료 재생성 영역.
  if (g.activeEmblemId != null) return NextResponse.json({ ok: true, already: true });
  const selection = g.emblemSelection as EmblemSelection | null;
  if (!selection || !isValidEmblemSelection(selection)) {
    return NextResponse.json({ ok: false, error: 'invalid_selection' }, { status: 400 });
  }

  // 진행 중인 생성이 있으면 겹쳐 쏘지 않는다(클라 킥 × 재시도 크론 동시 발사 방지).
  if (!(await claimEmblemGeneration(m.guildId))) {
    return NextResponse.json({ ok: true, inFlight: true });
  }

  try {
    await generateAndStoreEmblem({ guildId: m.guildId, selection, budgetMs: 150_000 });
    revalidatePath('/guild');
    revalidatePath('/', 'layout'); // 헤더(공유 레이아웃) 문양 반영
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('[guild.emblem.generate]', e);
    await markEmblemStatus(m.guildId, 'failed', e);
    revalidatePath('/guild');
    return NextResponse.json({ ok: false, error: 'generate_failed' }, { status: 500 });
  }
}
