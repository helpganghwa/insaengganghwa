/**
 * 길드 문양 최초 생성 재시도 cron — 10분 주기.
 *
 * 배경(2026-07-04, SECOND 길드): 결성 시 문양 생성이 after() best-effort 1회뿐이라
 * pixflux 장애(25s 타임아웃 ×4 키교대) 시 길드가 영구 무문양이 됨. 결성 때 저장한
 * emblem_selection(0101)으로 활성 문양이 생길 때까지 재시도한다.
 *
 * 대상: active_emblem_id IS NULL + emblem_selection 보유 + 시도 상한 미달.
 * 상한(12회 = 재시도 ~2시간)은 무한 pixflux 과금 방지 — 도달 시 로그로 수동 개입 신호.
 *
 * 시간 예산: 한 틱은 LOOP_BUDGET_MS 안에서 처리할 수 있는 만큼만 돌고 나머지는 다음 틱으로
 * 넘긴다. 길드당 예산 × BATCH로 상한을 지키려 하면 BATCH를 올리는 순간 산술이 조용히 깨진다 —
 * 실제로 '회당 1길드' 전제로 잡아 둔 120s 예산이 BATCH 3과 만나 최악 360s > maxDuration 180s가
 * 됐고, 주석만 1길드라고 적혀 있어 드러나지 않았다(2026-08-11). 벽시계 하나가 상한을 지키게 두면
 * 처리량(BATCH)을 조정해도 이 구멍이 다시 열리지 않는다.
 */
import { revalidatePath } from 'next/cache';
import { and, eq, isNotNull, isNull, lt, sql } from 'drizzle-orm';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { beatCron } from '@/lib/cron/heartbeat';
import { db } from '@/lib/db/client';
import { guilds } from '@/lib/db/schema/guild';
import {
  claimEmblemGeneration,
  generateAndStoreEmblem,
  markEmblemStatus,
  reconcileStuckEmblemEscrows,
} from '@/lib/game/guild/emblem';
import { mailbox } from '@/lib/db/schema/mailbox';
import type { EmblemSelection } from '@/lib/game/guild/emblem-vocab';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 300s — 아래 예산의 최악 합보다 커야 한다. 루프 마감 180s + 마감 직전 시작한 생성의 초과분
// (프롬프트 AI ~24s + 진행 중 pixflux 시도 30s + 백오프·후처리 ~11s ≒ 65s) ≒ 245s에 에스크로
// reconcile·마무리를 더해도 상한 안이다. 10분 주기라 다음 틱과 겹칠 여지도 없다.
export const maxDuration = 300;

const MAX_ATTEMPTS = 12;
/** 1회 처리 길드 수 — 10분 주기라 시간당 18건. 이전 1건(시간당 6)은 결성 러시에서 백로그가 안 빠졌다. */
const BATCH = 3;
/** 이 틱 전체(에스크로 reconcile 포함)에 허용한 벽시계 — 실제 상한을 지키는 유일한 값. */
const LOOP_BUDGET_MS = 180_000;
/** 길드 1건에 줄 수 있는 최대 예산 — 실측 성공 소요 20~97s 위(2026-08-06). */
const EMBLEM_BUDGET_MS = 120_000;
/** 남은 시간이 이보다 적으면 다음 길드는 다음 틱으로 — 못 끝낼 생성으로 시도 횟수만 태우지 않는다. */
const MIN_SLICE_MS = 60_000;

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  const t0 = Date.now();

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
    await beatCron('guild-emblem-retry'); // 대상 없음도 정상 실행 — 에스크로 reconcile은 돌았다
    return Response.json({ ok: true, retried: 0, escrowRefunded, kind: 'guild-emblem-retry' });
  }

  let ok = 0;
  let tried = 0;
  for (const g of targets) {
    // 남은 벽시계로 이번 길드를 돌릴지 결정 — 남은 건은 10분 뒤 틱이 이어받는다(대상 조건이
    // 그대로라 자동 재선정). 여기서 끊지 않으면 함수가 강제 종료돼 말미의 beatCron이
    // 미도달하고 dead-man이 오탐한다(mail-expire 2026-08-11과 같은 부류).
    const left = LOOP_BUDGET_MS - (Date.now() - t0);
    if (left < MIN_SLICE_MS) {
      console.log(`[guild-emblem-retry] 시간 예산 소진 — ${targets.length - tried}건은 다음 틱으로`);
      break;
    }
    tried++;
    // 진행 중인 생성(유저가 방금 킥한 것 등)과 겹치지 않게 클레임을 먼저 잡는다.
    if (!(await claimEmblemGeneration(g.id))) continue;
    // 시도 카운트를 생성 전에 선증가 — 생성 도중 함수가 죽어도 같은 길드로 무한 루프하지 않는다.
    await db
      .update(guilds)
      .set({ emblemAttempts: sql`${guilds.emblemAttempts} + 1` })
      .where(sql`${guilds.id} = ${g.id}`);

    try {
      // 남은 벽시계를 넘지 않는 선에서만 예산을 준다 — 앞 길드가 오래 끌었으면 뒷 길드는
      // 짧은 예산으로 돌고, 그마저 부족하면 위에서 이미 다음 틱으로 넘겼다.
      await generateAndStoreEmblem({
        guildId: g.id,
        selection: g.selection as EmblemSelection,
        budgetMs: Math.min(EMBLEM_BUDGET_MS, left),
      });
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
  await beatCron('guild-emblem-retry');
  return Response.json({ ok: true, retried: tried, success: ok, escrowRefunded });
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
    senderLabel: '인생강화',
    payload: {},
  });
}
