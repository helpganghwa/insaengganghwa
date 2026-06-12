'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { mailbox, adminMailLogs } from '@/lib/db/schema/mailbox';

export interface MailPayload {
  diamond?: number;
  boxes?: { weapon?: number; armor?: number; accessory?: number };
}

function clampPayload(p: MailPayload): MailPayload {
  const clampN = (n: number, max: number) => Math.max(0, Math.min(max, Math.floor(n || 0)));
  return {
    diamond: clampN(p.diamond ?? 0, 1_000_000_000),
    boxes: {
      weapon: clampN(p.boxes?.weapon ?? 0, 10_000),
      armor: clampN(p.boxes?.armor ?? 0, 10_000),
      accessory: clampN(p.boxes?.accessory ?? 0, 10_000),
    },
  };
}

type ErrorState = { status: 'error'; message: string };
type OkOne = { status: 'success'; count: 1 };
type OkBroadcast = { status: 'success'; count: number };

/** 단건 발송 — nickname 또는 userId. 둘 다 비면 에러. */
export async function sendMailToUserAction(opts: {
  toNickname?: string;
  toUserId?: string;
  title: string;
  body: string;
  payload: MailPayload;
}): Promise<OkOne | ErrorState> {
  try {
    const adminId = await requireAdmin();
    let recipientId: string | null = null;
    if (opts.toNickname?.trim()) {
      const [r] = await db
        .select({ id: characters.userId })
        .from(characters)
        .where(eq(characters.nickname, opts.toNickname.trim()))
        .limit(1);
      recipientId = r?.id ?? null;
    } else if (opts.toUserId?.trim()) {
      // userId도 실제 profiles에 존재하는지 확인 — 오타 UUID로 고아 우편 생성 방지.
      const id = opts.toUserId.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        return { status: 'error', message: '유효한 userId(uuid)가 아닙니다.' };
      }
      const [r] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      recipientId = r?.id ?? null;
    }
    if (!recipientId) return { status: 'error', message: '수신자를 찾을 수 없습니다.' };

    const title = (opts.title || '').slice(0, 100);
    const body = (opts.body || '').slice(0, 1000);
    const payload = clampPayload(opts.payload);
    // 우편 + 감사 로그 원자 발송.
    await db.transaction(async (tx) => {
      await tx
        .insert(mailbox)
        .values({ userId: recipientId, type: 'admin', title, body, senderLabel: '운영자', payload });
      await tx.insert(adminMailLogs).values({
        adminId,
        mode: 'one',
        recipientCount: 1,
        targetLabel: (opts.toNickname?.trim() || opts.toUserId?.trim() || '').slice(0, 200),
        title,
        body,
        payload,
      });
    });
    revalidatePath('/admin/mail');
    return { status: 'success', count: 1 };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    if (msg === 'FORBIDDEN') return { status: 'error', message: '관리자 권한이 없습니다.' };
    if (msg === 'UNAUTHENTICATED') return { status: 'error', message: '로그인이 필요합니다.' };
    console.error('[admin.mail.send]', e);
    return { status: 'error', message: '알 수 없는 오류' };
  }
}

/** 전체 broadcast — profiles 전체 fan-out. 청크 500/배치. */
export async function broadcastMailAction(opts: {
  title: string;
  body: string;
  payload: MailPayload;
}): Promise<OkBroadcast | ErrorState> {
  try {
    const adminId = await requireAdmin();
    const all = await db.select({ id: profiles.id }).from(profiles);
    if (all.length === 0) return { status: 'success', count: 0 };

    const payload = clampPayload(opts.payload);
    const title = (opts.title || '').slice(0, 100);
    const body = (opts.body || '').slice(0, 1000);
    const CHUNK = 500;
    let inserted = 0;
    // 단일 트랜잭션 — 중간 청크에서 실패하면 전체 롤백. 부분 발송 상태가 남지 않으므로
    // 재실행해도 이중 지급이 없다(원자적: 전부 또는 전무).
    await db.transaction(async (tx) => {
      for (let i = 0; i < all.length; i += CHUNK) {
        const slice = all.slice(i, i + CHUNK);
        await tx.insert(mailbox).values(
          slice.map((p) => ({
            userId: p.id,
            type: 'admin' as const,
            title,
            body,
            senderLabel: '운영자',
            payload,
          })),
        );
        inserted += slice.length;
      }
      // 감사 로그도 같은 트랜잭션 — 발송 롤백 시 로그도 롤백(거짓 기록 방지).
      await tx.insert(adminMailLogs).values({
        adminId,
        mode: 'broadcast',
        recipientCount: inserted,
        targetLabel: '전체',
        title,
        body,
        payload,
      });
    });
    revalidatePath('/admin/mail');
    return { status: 'success', count: inserted };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'UNKNOWN';
    if (msg === 'FORBIDDEN') return { status: 'error', message: '관리자 권한이 없습니다.' };
    if (msg === 'UNAUTHENTICATED') return { status: 'error', message: '로그인이 필요합니다.' };
    console.error('[admin.mail.broadcast]', e);
    return { status: 'error', message: '알 수 없는 오류' };
  }
}

/** 전체 발송 대상 수 — broadcast 발송 전 미리보기용(가입자 수). */
export async function getBroadcastRecipientCountAction(): Promise<{ count: number }> {
  await requireAdmin();
  const [row] = await db.select({ c: sql<number>`count(*)::int` }).from(profiles);
  return { count: row?.c ?? 0 };
}
