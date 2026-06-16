import 'server-only';

import { and, eq } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { guilds, guildMembers, guildJoinRequests } from '@/lib/db/schema/guild';

import { GUILD_CREATE_COST_DIAMOND, GUILD_NAME_MAX_LEN, GUILD_NAME_MIN_LEN } from './balance';
import { GuildError } from './errors';

/** 공백 정규화(앞뒤 제거 + 연속 공백 1칸). */
export function normalizeGuildName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * 길드 결성 — GUILD §1. 단일 트랜잭션: 1유저1길드 검사 + 이름 검증/중복 + 10,000💎 차감 + 길드·리더 멤버 생성.
 * 문양(emblem_url)은 결성 시 런타임 생성(P4) — 일단 null(폴백). 서버 권위·멱등(PK/unique가 최종 방어).
 */
export function createGuild(input: {
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
  return db.transaction(async (tx) => {
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

    // 생성 시 본인 대기 가입신청 정리(타 길드 신청 잔존 방지).
    await tx
      .delete(guildJoinRequests)
      .where(and(eq(guildJoinRequests.userId, input.userId), eq(guildJoinRequests.serverId, input.serverId)));

    return { guildId: g!.id };
  });
}
