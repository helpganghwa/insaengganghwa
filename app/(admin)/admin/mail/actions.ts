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

/** 단건 발송 — nickname / 유저 코드(#publicCode) / userId. 전부 비면 에러. */
export async function sendMailToUserAction(opts: {
  toNickname?: string;
  /** 유저 코드(publicCode, '#' 접두 허용) — 문의 스냅샷에서 복붙 발송용(2026-07-13). */
  toCode?: string;
  toUserId?: string;
  title: string;
  body: string;
  payload: MailPayload;
}): Promise<OkOne | ErrorState> {
  try {
    const adminId = await requireAdmin();
    let recipientId: string | null = null;
    // 닉네임은 특정 서버의 캐릭터를 가리킴 — 그 캐릭터의 서버로 배송해야
    // 다른 서버 우편함/지갑에 오배송되지 않는다(닉네임 전역 유일).
    let recipientServerId: number | null = null;
    if (opts.toNickname?.trim()) {
      const [r] = await db
        .select({ id: characters.userId, sid: characters.serverId })
        .from(characters)
        .where(eq(characters.nickname, opts.toNickname.trim()))
        .limit(1);
      recipientId = r?.id ?? null;
      recipientServerId = r?.sid ?? null;
    } else if (opts.toCode?.trim()) {
      // 코드 = 계정 단위(서버 불특정) — 배송 서버는 수신자의 마지막 활성 서버 폴백(하단 로직).
      const code = opts.toCode.trim().replace(/^#/, '');
      const [r] = await db
        .select({ id: profiles.id })
        .from(profiles)
        .where(sql`${profiles.publicCode} ilike ${code}`)
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
      // 닉네임 지정 시 그 캐릭터의 서버, userId 지정 시 수신자의 마지막 활성 서버.
      let deliverySid = recipientServerId;
      if (deliverySid == null) {
        const [rp] = await tx
          .select({ sid: profiles.lastServerId })
          .from(profiles)
          .where(eq(profiles.id, recipientId))
          .limit(1);
        deliverySid = rp?.sid ?? 1;
      }
      await tx.insert(mailbox).values({
        userId: recipientId,
        serverId: deliverySid,
        type: 'admin',
        title,
        body,
        senderLabel: '인생강화',
        payload,
      });
      await tx.insert(adminMailLogs).values({
        adminId,
        mode: 'one',
        recipientCount: 1,
        targetLabel: (opts.toNickname?.trim() || opts.toCode?.trim() || opts.toUserId?.trim() || '').slice(0, 200),
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
  /** 클릭 의도당 클라 UUID(0110) — 응답 유실 재클릭의 전 유저 이중 발송 방지. */
  idemKey?: string;
}): Promise<OkBroadcast | ErrorState> {
  try {
    const adminId = await requireAdmin();
    const payload = clampPayload(opts.payload);
    const title = (opts.title || '').slice(0, 100);
    const body = (opts.body || '').slice(0, 1000);
    const idemKey =
      opts.idemKey && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(opts.idemKey)
        ? opts.idemKey
        : null;
    let inserted = 0;
    let duplicate = false;
    // 단일 트랜잭션 + **단일 INSERT…SELECT**(감사 P1) — 전 유저를 앱으로 끌어와 청크 루프로
    // 왕복하면 10만 유저에 200회 왕복의 수 분짜리 tx(풀러 장시간 점유 = 검증된 장애 모드).
    // DB측 fan-out 한 문으로 왕복 1회. 실패 시 전체 롤백(재실행 이중 지급 없음)은 동일.
    await db.transaction(async (tx) => {
      // 멱등 선점(0110) — 로그를 **발송 전에** 키와 함께 선점. 같은 키 재시도(커밋 후 응답
      // 유실 → 재클릭)는 conflict로 0행 → 발송 없이 종료. 발송 실패 시 롤백되어 키도 풀린다.
      const log = await tx
        .insert(adminMailLogs)
        .values({
          adminId,
          mode: 'broadcast',
          recipientCount: 0,
          targetLabel: '전체',
          title,
          body,
          payload,
          idempotencyKey: idemKey,
        })
        .onConflictDoNothing({ target: adminMailLogs.idempotencyKey })
        .returning({ id: adminMailLogs.id });
      if (log.length === 0) {
        duplicate = true;
        return;
      }
      const rows = (await tx.execute(sql`
        insert into mailbox (user_id, server_id, type, title, body, sender_label, payload)
        select p.id, p.last_server_id, 'admin'::mailbox_type, ${title}, ${body}, '인생강화', ${JSON.stringify(payload)}::jsonb
        from profiles p
        where p.withdrawn_at is null
        returning id
      `)) as unknown as { id: string }[];
      inserted = rows.length;
      await tx
        .update(adminMailLogs)
        .set({ recipientCount: inserted })
        .where(eq(adminMailLogs.id, log[0]!.id));
    });
    if (duplicate) return { status: 'success', count: 0 };
    if (inserted === 0) return { status: 'success', count: 0 };
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
