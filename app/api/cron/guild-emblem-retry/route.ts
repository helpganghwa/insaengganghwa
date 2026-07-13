/**
 * 길드 문양 최초 생성 재시도 cron — 10분 주기.
 *
 * 배경(2026-07-04, SECOND 길드): 결성 시 문양 생성이 after() best-effort 1회뿐이라
 * pixflux 장애(25s 타임아웃 ×4 키교대) 시 길드가 영구 무문양이 됨. 결성 때 저장한
 * emblem_selection(0101)으로 활성 문양이 생길 때까지 재시도한다.
 *
 * 대상: active_emblem_id IS NULL + emblem_selection 보유 + 시도 상한 미달.
 * 상한(12회 = 재시도 ~2시간)은 무한 pixflux 과금 방지 — 도달 시 로그로 수동 개입 신호.
 * 회당 1길드만(pixflux 4회 재시도 시 최악 ~100s) — maxDuration 안에서 안전.
 */
import { revalidatePath } from 'next/cache';
import { and, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { guilds } from '@/lib/db/schema/guild';
import { generateAndStoreEmblem, reconcileStuckEmblemEscrows } from '@/lib/game/guild/emblem';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_ATTEMPTS = 12;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // 유료 재생성 에스크로 reconcile — 예치 후 함수 사망으로 pending에 남은 다이아를 환불(6분+ 경과분).
  // best-effort — 실패해도 최초 생성 재시도는 계속 진행.
  const escrowRefunded = await reconcileStuckEmblemEscrows().catch((e) => {
    console.error('[guild-emblem-retry] escrow reconcile 실패', (e as Error).message);
    return 0;
  });
  if (escrowRefunded > 0) console.log(`[guild-emblem-retry] 미해소 에스크로 ${escrowRefunded}건 환불`);

  const [g] = await db
    .select({ id: guilds.id, selection: guilds.emblemSelection, attempts: guilds.emblemAttempts })
    .from(guilds)
    .where(
      and(
        isNull(guilds.activeEmblemId),
        isNotNull(guilds.emblemSelection),
        lt(guilds.emblemAttempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(guilds.createdAt)
    .limit(1);

  if (!g) return Response.json({ ok: true, retried: 0, escrowRefunded, kind: 'guild-emblem-retry' });

  // 시도 카운트를 생성 전에 선증가 — 생성 도중 함수가 죽어도 같은 길드로 무한 루프하지 않는다.
  await db
    .update(guilds)
    .set({ emblemAttempts: sql`${guilds.emblemAttempts} + 1` })
    .where(sql`${guilds.id} = ${g.id}`);

  try {
    await generateAndStoreEmblem({ guildId: g.id, selection: g.selection as EmblemSelection });
    revalidatePath('/guild');
    revalidatePath('/', 'layout'); // 헤더 문양 반영
    console.log(`[guild-emblem-retry] guild ${g.id} 문양 생성 성공 (attempt ${g.attempts + 1})`);
    return Response.json({ ok: true, retried: 1, guildId: String(g.id), success: true });
  } catch (e) {
    const last = g.attempts + 1 >= MAX_ATTEMPTS;
    console.error(
      `[guild-emblem-retry] guild ${g.id} 실패 (attempt ${g.attempts + 1}/${MAX_ATTEMPTS})${last ? ' — 상한 도달, 수동 개입 필요' : ''}`,
      (e as Error).message,
    );
    return Response.json({ ok: true, retried: 1, guildId: String(g.id), success: false });
  }
}
