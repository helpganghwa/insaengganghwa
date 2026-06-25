import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { guilds, guildMembers, guildJoinRequests } from '@/lib/db/schema/guild';

import { containsProfanity } from '@/lib/game/moderation/profanity';

import { GUILD_CREATE_COST_DIAMOND, GUILD_NAME_MAX_LEN, GUILD_NAME_MIN_LEN } from './balance';
import { logGuildAudit } from './audit';
import { GuildError } from './errors';

import { logWorldEvent } from '@/lib/game/world/event';

/** 허용 문자: 한글 완성형·영문·숫자만. 공백·특수문자·이모지·자모 차단(닉네임과 동일 정책). */
const GUILD_NAME_CHAR_REGEX = /^[A-Za-z0-9가-힣]+$/;

/** 앞뒤 공백 제거(내부 공백은 문자셋 검증에서 차단). */
export function normalizeGuildName(raw: string): string {
  return raw.trim();
}

/**
 * 길드 결성 — GUILD §1. 단일 트랜잭션: 1유저1길드 검사 + 이름 검증/중복 + 10,000💎 차감 + 길드·리더 멤버 생성.
 * 문양(emblem_url)은 결성 시 런타임 생성(P4) — 일단 null(폴백). 서버 권위·멱등(PK/unique가 최종 방어).
 */
export async function createGuild(input: {
  userId: string;
  serverId: number;
  name: string;
  /** 선택 톤의 UI 악센트 색(emblem_color). 문양 이미지 생성은 액션 레이어에서 best-effort. */
  emblemColor?: string | null;
}): Promise<{ guildId: bigint }> {
  const name = normalizeGuildName(input.name);
  if (name.length < GUILD_NAME_MIN_LEN || name.length > GUILD_NAME_MAX_LEN) {
    return Promise.reject(new GuildError('NAME_INVALID'));
  }
  if (!GUILD_NAME_CHAR_REGEX.test(name)) {
    return Promise.reject(new GuildError('NAME_CHARSET'));
  }
  if (containsProfanity(name)) {
    return Promise.reject(new GuildError('PROFANITY'));
  }
  const result = await db.transaction(async (tx) => {
    // 1유저 1길드 — guild_members.user_id PK가 최종 방어(동시성 시 두 번째 insert 실패).
    const [existing] = await tx
      .select({ g: guildMembers.guildId })
      .from(guildMembers)
      .where(and(eq(guildMembers.userId, input.userId), eq(guildMembers.serverId, input.serverId)))
      .for('update');
    if (existing) throw new GuildError('ALREADY_IN_GUILD');

    // 이름 중복 사전 체크(unique 제약이 최종 방어).
    const [dup] = await tx
      .select({ id: guilds.id })
      .from(guilds)
      .where(and(eq(guilds.serverId, input.serverId), eq(guilds.name, name)))
      .limit(1);
    if (dup) throw new GuildError('NAME_TAKEN');

    // 💎 차감(조건부, 서버별 지갑).
    const paid = await walletTrySpend(tx, input.userId, input.serverId, GUILD_CREATE_COST_DIAMOND);
    if (!paid) throw new GuildError('INSUFFICIENT_DIAMOND');

    // 길드 + 리더 멤버.
    const [g] = await tx
      .insert(guilds)
      .values({ name, serverId: input.serverId, leaderUserId: input.userId, emblemColor: input.emblemColor ?? null })
      .returning({ id: guilds.id });
    await tx
      .insert(guildMembers)
      .values({ userId: input.userId, serverId: input.serverId, guildId: g!.id, role: 'leader' });
    // 활동 로그 첫 줄 — 결성(가입의 특수 케이스, detail.founder로 문구 구분).
    await logGuildAudit(tx, {
      serverId: input.serverId,
      guildId: g!.id,
      actorUserId: input.userId,
      action: 'join',
      detail: { founder: true },
    });

    // 생성 시 본인 대기 가입신청 정리(타 길드 신청 잔존 방지).
    await tx
      .delete(guildJoinRequests)
      .where(and(eq(guildJoinRequests.userId, input.userId), eq(guildJoinRequests.serverId, input.serverId)));

    return { guildId: g!.id };
  });

  // 월드 피드 — 길드 결성(전체 노출, best-effort, 트랜잭션 밖). 실패해도 결성엔 영향 없음.
  await logWorldEvent(input.serverId, 'guild_create', { guildName: name }, {
    actorUserId: input.userId,
    guildId: result.guildId,
  });
  return result;
}
