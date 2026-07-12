import 'server-only';

import { db } from '@/lib/db/client';
import { guildAuditLog } from '@/lib/db/schema/guild';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * 길드 활동 로그 액션 — 임원/시스템 민감 행동(GUILD §4) + 길드 홈 활동 피드용 핵심 이벤트.
 * 길드 홈의 "길드 로그" 섹션(getGuildActivityLog)이 이 테이블을 그대로 노출한다.
 */
export type GuildAuditAction =
  | 'kick'
  | 'transfer_leadership'
  | 'set_vice'
  | 'unset_vice'
  | 'disband'
  | 'set_join_policy'
  | 'auto_handover'
  | 'notice_edit'
  // 활동 피드 — 가입/탈퇴/레벨업/세금수금/세금분배/점령·상실.
  | 'join'
  | 'leave'
  | 'levelup'
  | 'tax_collect'
  | 'tax_distribute'
  | 'zone_capture'
  | 'zone_lost'
  // 업적 피드 — 멤버(강화 100단위·초월 개인기록 갱신(11+)·대난투 1~3위) + 길드(전투력·점령지 랭킹 1~3위).
  | 'achv_enhance'
  | 'achv_transcend'
  | 'achv_melee'
  | 'achv_guild_power_rank'
  | 'achv_guild_zone_rank';

/**
 * 길드 활동 로그 1건 기록 — 호출자 트랜잭션(tx) 안에서 액션과 원자적으로 남긴다.
 * actorUserId=null = 시스템(자동 위임·점령 정산). detail = 부가 맥락(예: { policy }, { level }, { amount }).
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
