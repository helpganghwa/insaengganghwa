'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq, gte, isNull, lte, ne } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { safeBigInt } from '@/lib/util/id';
import { db } from '@/lib/db/client';
import { guilds, guildEmblems, guildEmblemEscrows } from '@/lib/db/schema/guild';
import { mailbox } from '@/lib/db/schema/mailbox';
import { walletAdd } from '@/lib/game/wallet';
import { generateAndStoreEmblem, markEmblemStatus } from '@/lib/game/guild/emblem';
import { isValidEmblemSelection, type EmblemSelection } from '@/lib/game/guild/emblem-vocab';

/**
 * 길드 문양 검수 액션(0131) — 아바타 검수(profile-gen)와 동일한 결정 모델.
 *  - 검토 통과(confirm): 무조치 확인 기록(미검수 배지 해소).
 *  - 리젝+환불(reject): 소프트 삭제(removed_at — 이력 보존) + 활성이면 guilds 미러 해제
 *    + 연결된 유료 예치(completed) 자동 환불 + 길드장 통지 우편.
 *  - 별도 환불: 유료 예치 단독 환불(문양은 유지).
 */

export async function adminConfirmEmblem(emblemId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(emblemId);
  if (eid === null) return { ok: false, msg: '잘못된 문양 ID입니다.' };
  const rows = await db
    .update(guildEmblems)
    .set({ adminDecision: 'confirm', adminReviewedAt: new Date() })
    .where(and(eq(guildEmblems.id, eid), isNull(guildEmblems.adminDecision)))
    .returning({ id: guildEmblems.id });
  if (rows.length === 0) return { ok: false, msg: '이미 검수된 문양입니다.' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

export async function adminRejectEmblem(emblemId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(emblemId);
  if (eid === null) return { ok: false, msg: '잘못된 문양 ID입니다.' };
  const [emblem] = await db
    .select({ id: guildEmblems.id, guildId: guildEmblems.guildId, createdAt: guildEmblems.createdAt })
    .from(guildEmblems)
    .where(eq(guildEmblems.id, eid))
    .limit(1);
  if (!emblem) return { ok: false, msg: '문양을 찾을 수 없습니다.' };
  const [g] = await db
    .select({
      id: guilds.id,
      serverId: guilds.serverId,
      leaderUserId: guilds.leaderUserId,
      activeEmblemId: guilds.activeEmblemId,
    })
    .from(guilds)
    .where(eq(guilds.id, emblem.guildId))
    .limit(1);

  const refunded = await db.transaction(async (tx) => {
    // 조건부 소프트 삭제 먼저(1회 보장) — 동시 더블클릭 시 한쪽만 후속 처리.
    const claimed = await tx
      .update(guildEmblems)
      .set({ removedAt: new Date(), adminDecision: 'reject', adminReviewedAt: new Date() })
      .where(and(eq(guildEmblems.id, eid), isNull(guildEmblems.removedAt)))
      .returning({ id: guildEmblems.id });
    if (claimed.length === 0) return null;

    // 활성 문양이었다면 보관 문양 중 최신본으로 승계, 없으면 미러 해제(무문양).
    // 승계 없이 null만 두면 재시도 크론이 대상으로 잡아 **리젝한 길드에 새 문양을 무료로
    // 자동 생성**해 준다(2026-08-06 감사). 승계하면 그 경로가 닫힌다.
    if (g && g.activeEmblemId != null && g.activeEmblemId === eid) {
      const [next] = await tx
        .select({ id: guildEmblems.id, url: guildEmblems.emblemUrl, color: guildEmblems.emblemColor })
        .from(guildEmblems)
        .where(and(eq(guildEmblems.guildId, g.id), isNull(guildEmblems.removedAt), ne(guildEmblems.id, eid)))
        .orderBy(desc(guildEmblems.createdAt))
        .limit(1);
      await tx
        .update(guilds)
        .set(
          next
            ? { activeEmblemId: next.id, emblemUrl: next.url, emblemColor: next.color, emblemStatus: 'done' }
            : { activeEmblemId: null, emblemUrl: null, emblemColor: null, emblemStatus: 'failed' },
        )
        .where(eq(guilds.id, g.id));
    }

    // 연결된 유료 예치 자동 환불 — 같은 길드, 문양 생성 직전 1시간 내 completed 최신 1건.
    // (에스크로는 생성 요청 시, 문양 행은 생성 완료 시 기록 — 수 분 간격. FK가 없어 시간 매칭.)
    let amount: bigint | null = null;
    const [esc] = await tx
      .select({
        id: guildEmblemEscrows.id,
        userId: guildEmblemEscrows.userId,
        serverId: guildEmblemEscrows.serverId,
        amount: guildEmblemEscrows.amount,
      })
      .from(guildEmblemEscrows)
      .where(
        and(
          eq(guildEmblemEscrows.guildId, emblem.guildId),
          eq(guildEmblemEscrows.status, 'completed'),
          gte(guildEmblemEscrows.createdAt, new Date(emblem.createdAt.getTime() - 3_600_000)),
          lte(guildEmblemEscrows.createdAt, new Date(emblem.createdAt.getTime() + 600_000)),
        ),
      )
      .orderBy(desc(guildEmblemEscrows.createdAt))
      .limit(1);
    if (esc) {
      const moved = await tx
        .update(guildEmblemEscrows)
        .set({ status: 'refunded', resolvedAt: new Date() })
        .where(and(eq(guildEmblemEscrows.id, esc.id), eq(guildEmblemEscrows.status, 'completed')))
        .returning({ id: guildEmblemEscrows.id });
      if (moved.length > 0) {
        await walletAdd(tx, esc.userId, esc.serverId, esc.amount);
        amount = esc.amount;
        await tx.insert(mailbox).values({
          userId: esc.userId,
          serverId: esc.serverId,
          type: 'admin',
          title: '문양 생성 다이아 환불',
          body:
            `문의 주신 길드 문양 건에 대해 ${Number(esc.amount).toLocaleString('ko-KR')}💎를 환불해 드렸습니다.\n` +
            '이용에 불편을 드려 죄송합니다. 즐거운 강화 되세요!',
          senderLabel: '운영자',
          payload: {},
        });
      }
    }

    if (g?.leaderUserId) {
      await tx.insert(mailbox).values({
        userId: g.leaderUserId,
        serverId: g.serverId,
        type: 'admin',
        title: '길드 문양 안내',
        body:
          '운영 확인에 따라 길드 문양 1개가 제거되었습니다.' +
          (amount != null ? `\n생성에 사용된 ${Number(amount).toLocaleString('ko-KR')}💎는 결제하신 분께 환불되었습니다.` : '') +
          '\n문양 관리에서 보관 중인 다른 문양을 활성화하거나 새로 생성해 주세요.\n' +
          '궁금한 점은 고객센터로 문의해 주세요.',
        senderLabel: '운영자',
        payload: {},
      });
    }
    return amount;
  });
  if (refunded === null && !(await stillRemoved(eid))) return { ok: false, msg: '이미 처리된 문양입니다.' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

async function stillRemoved(eid: bigint): Promise<boolean> {
  const [r] = await db
    .select({ removedAt: guildEmblems.removedAt })
    .from(guildEmblems)
    .where(eq(guildEmblems.id, eid))
    .limit(1);
  return r?.removedAt != null;
}

export async function adminRefundEmblemEscrow(escrowId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const eid = safeBigInt(escrowId);
  if (eid === null) return { ok: false, msg: '잘못된 예치 ID입니다.' };
  const ok = await db.transaction(async (tx) => {
    // 조건부 전이(money path) — completed일 때만 refunded로, 정확히 1회.
    const rows = await tx
      .update(guildEmblemEscrows)
      .set({ status: 'refunded', resolvedAt: new Date() })
      .where(and(eq(guildEmblemEscrows.id, eid), eq(guildEmblemEscrows.status, 'completed')))
      .returning({
        userId: guildEmblemEscrows.userId,
        serverId: guildEmblemEscrows.serverId,
        amount: guildEmblemEscrows.amount,
      });
    const r = rows[0];
    if (!r) return false;
    await walletAdd(tx, r.userId, r.serverId, r.amount);
    await tx.insert(mailbox).values({
      userId: r.userId,
      serverId: r.serverId,
      type: 'admin',
      title: '문양 생성 다이아 환불',
      body:
        `문의 주신 길드 문양 생성 건에 대해 ${Number(r.amount).toLocaleString('ko-KR')}💎를 환불해 드렸습니다.\n` +
        '이용에 불편을 드려 죄송합니다. 즐거운 강화 되세요!',
      senderLabel: '운영자',
      payload: {},
    });
    return true;
  });
  if (!ok) return { ok: false, msg: '환불 가능한 상태가 아닙니다(이미 환불됐거나 미완료 예치).' };
  revalidatePath('/admin/emblem-review');
  return { ok: true };
}

/**
 * 관리자 문양 재생성(2026-08-06) — 문양이 없는 길드에 저장된 선택값으로 즉시 다시 생성한다.
 * 유저 재시도가 막혔거나(권한자 부재·자동 재시도 소진) 운영이 직접 풀어줘야 할 때 쓴다.
 * 재시도 카운터도 0으로 되돌려 자동 재시도가 다시 붙게 한다(리셋 경로가 여기뿐이다).
 */
export async function adminRegenerateEmblem(guildId: string): Promise<{ ok: boolean; msg?: string }> {
  await requireAdmin();
  const gid = safeBigInt(guildId);
  if (gid === null) return { ok: false, msg: '잘못된 길드 ID입니다.' };
  const [g] = await db
    .select({ id: guilds.id, selection: guilds.emblemSelection, activeId: guilds.activeEmblemId })
    .from(guilds)
    .where(eq(guilds.id, gid))
    .limit(1);
  if (!g) return { ok: false, msg: '길드를 찾을 수 없습니다.' };
  if (g.activeId != null) return { ok: false, msg: '이미 활성 문양이 있습니다. 리젝 후 시도하세요.' };
  const selection = g.selection as EmblemSelection | null;
  if (!selection || !isValidEmblemSelection(selection)) {
    return { ok: false, msg: '저장된 문양 선택값이 없거나 형식이 맞지 않습니다.' };
  }

  await db.update(guilds).set({ emblemAttempts: 0, emblemStatus: 'pending' }).where(eq(guilds.id, gid));
  try {
    // 어드민 액션도 라우트 예산 안에서 돌아야 한다 — 보수적으로 45초.
    await generateAndStoreEmblem({ guildId: gid, selection, budgetMs: 45_000 });
    revalidatePath('/admin/emblem-review');
    revalidatePath('/guild');
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (e) {
    await markEmblemStatus(gid, 'failed', e);
    revalidatePath('/admin/emblem-review');
    return { ok: false, msg: `생성 실패: ${(e as Error).message.slice(0, 120)}` };
  }
}
