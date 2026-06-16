import 'server-only';

import { db } from '@/lib/db/client';
import { guildAuditLog } from '@/lib/db/schema/guild';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** 감사 대상 액션 — 임원/시스템 민감 행동(GUILD §4). */
export type GuildAuditAction =
  | 'kick'
  | 'transfer_leadership'
  | 'set_vice'
  | 'unset_vice'
  | 'disband'
  | 'set_join_policy'
  | 'auto_handover';

/**
 * 길드 감사 로그 1건 기록 — 호출자 트랜잭션(tx) 안에서 액션과 원자적으로 남긴다(기록 전용, 조회 UI 없음).
 * actorUserId=null = 시스템(자동 위임). detail = 부가 맥락(예: { policy }, { from }).
 */
export async function logGuildAudit(
  tx: Tx,
  e: {
    serverId: number;
    guildId: bigint;
    actorUserId: string | null;
    action: GuildAuditAction;
    targetUserId?: string | null;
    detail?: Record<string, unknown> | null;
  },
): Promise<void> {
  await tx.insert(guildAuditLog).values({
    serverId: e.serverId,
    guildId: e.guildId,
    actorUserId: e.actorUserId ?? null,
    action: e.action,
    targetUserId: e.targetUserId ?? null,
    detail: e.detail ?? null,
  });
}
