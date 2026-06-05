'use server';

import { revalidatePath } from 'next/cache';
import { eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { profiles } from '@/lib/db/schema/profiles';
import { mailbox } from '@/lib/db/schema/mailbox';

/** 어드민 가드 — is_admin true가 아니면 throw. */
async function requireAdmin(): Promise<string> {
  const userId = await getSessionUserId();
  if (!userId) throw new Error('UNAUTHENTICATED');
  const [p] = await db
    .select({ isAdmin: profiles.isAdmin })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (!p?.isAdmin) throw new Error('FORBIDDEN');
  return userId;
}

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
    await requireAdmin();
    let recipientId: string | null = null;
    if (opts.toNickname?.trim()) {
      const [r] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(eq(profiles.nickname, opts.toNickname.trim()))
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

    await db.insert(mailbox).values({
      userId: recipientId,
      type: 'admin',
      title: (opts.title || '').slice(0, 100),
      body: (opts.body || '').slice(0, 1000),
      senderLabel: '운영자',
      payload: clampPayload(opts.payload),
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
    await requireAdmin();
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
