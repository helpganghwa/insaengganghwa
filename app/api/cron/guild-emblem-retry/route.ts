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
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { db } from '@/lib/db/client';
import { guilds } from '@/lib/db/schema/guild';
import { generateAndStoreEmblem, markEmblemStatus, reconcileStuckEmblemEscrows } from '@/lib/game/guild/emblem';
import { mailbox } from '@/lib/db/schema/mailbox';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

const MAX_ATTEMPTS = 12;
/** 1회 처리 길드 수 — 10분 주기라 시간당 18건. 이전 1건(시간당 6)은 결성 러시에서 백로그가 안 빠졌다. */
const BATCH = 3;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });

  // 유료 재생성 에스크로 reconcile — 예치 후 함수 사망으로 pending에 남은 다이아를 환불(6분+ 경과분).
  // best-effort — 실패해도 최초 생성 재시도는 계속 진행.
  const escrowRefunded = await reconcileStuckEmblemEscrows().catch((e) => {
    console.error('[guild-emblem-retry] escrow reconcile 실패', (e as Error).message);
    return 0;
  });
  if (escrowRefunded > 0) console.log(`[guild-emblem-retry] 미해소 에스크로 ${escrowRefunded}건 환불`);

  // 시도 적은 순 → 오래된 순(2026-08-06). createdAt 단독 정렬은 영구 실패 길드가 큐를 선점해
  // 신규 길드가 상한 12회를 다 소진할 때까지 밀렸다. 시도 횟수를 1순위로 두면 신규가 먼저 돈다.
  const targets = await db
    .select({ id: guilds.id, selection: guilds.emblemSelection, attempts: guilds.emblemAttempts })
    .from(guilds)
    .where(
      and(
        isNull(guilds.activeEmblemId),
        isNotNull(guilds.emblemSelection),
        lt(guilds.emblemAttempts, MAX_ATTEMPTS),
      ),
    )
    .orderBy(guilds.emblemAttempts, guilds.createdAt)
    .limit(BATCH);

  if (targets.length === 0) {
    return Response.json({ ok: true, retried: 0, escrowRefunded, kind: 'guild-emblem-retry' });
  }

  let ok = 0;
  for (const g of targets) {
    // 시도 카운트를 생성 전에 선증가 — 생성 도중 함수가 죽어도 같은 길드로 무한 루프하지 않는다.
    await db
      .update(guilds)
      .set({
        emblemAttempts: sql`${guilds.emblemAttempts} + 1`,
        emblemStatus: 'pending',
        emblemPendingAt: new Date(),
      })
      .where(sql`${guilds.id} = ${g.id}`);

    try {
      await generateAndStoreEmblem({ guildId: g.id, selection: g.selection as EmblemSelection });
      ok++;
      console.log(`[guild-emblem-retry] guild ${g.id} 문양 생성 성공 (attempt ${g.attempts + 1})`);
    } catch (e) {
      const last = g.attempts + 1 >= MAX_ATTEMPTS;
      await markEmblemStatus(g.id, 'failed', e);
      console.error(
        `[guild-emblem-retry] guild ${g.id} 실패 (attempt ${g.attempts + 1}/${MAX_ATTEMPTS})${last ? ' — 상한 도달' : ''}`,
        (e as Error).message,
      );
      // 상한 도달 = 자동 복구 불가. 길드장에게 조합 변경을 안내한다(선택 조합이 품질 검사에
      // 계속 걸리는 경우가 있어, 재시도보다 조합 변경이 실질 해법이다).
      if (last) await notifyEmblemExhausted(g.id).catch(() => {});
    }
  }
  if (ok > 0) {
    revalidatePath('/guild');
    revalidatePath('/', 'layout'); // 헤더 문양 반영
  }
  return Response.json({ ok: true, retried: targets.length, success: ok, escrowRefunded });
}

/** 재시도 소진 안내 우편 — 길드장 앞. 중복 발송은 상한 도달 1회뿐이라 멱등 처리 불필요. */
async function notifyEmblemExhausted(guildId: bigint): Promise<void> {
  const [g] = await db
    .select({ name: guilds.name, serverId: guilds.serverId, leader: guilds.leaderUserId })
    .from(guilds)
    .where(eq(guilds.id, guildId))
    .limit(1);
  if (!g?.leader) return;
  await db.insert(mailbox).values({
    userId: g.leader,
    serverId: g.serverId,
    type: 'guild',
    title: '길드 문양을 만들지 못했어요',
    body:
      `'${g.name}' 길드의 문양 만들기가 계속 실패했어요.\n` +
      `지금 고른 모양·색 조합으로는 잘 만들어지지 않는 경우가 있어요.\n` +
      `길드 > 문양 만들기에서 다른 조합으로 다시 시도해 주세요. 첫 문양은 그대로 무료예요.`,
    senderLabel: '시스템',
    payload: {},
  });
}
