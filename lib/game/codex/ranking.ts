import 'server-only';

import { cache } from 'react';
import { and, eq, inArray, sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { userEquipment } from '@/lib/db/schema/equipment';
import { getGuildBriefsByUsers } from '@/lib/game/guild/badge';

/**
 * 아이템별 강화 랭킹 / 챔피언 — BALANCE §3.3 / SCHEMA §2.3 / WIREFRAMES §7.2.
 *
 * catalog_item 1개당 순위: `max_enhance_level` DESC → `max_enhance_reached_at` ASC
 * (먼저 달성) → `user_id` ASC(완전 결정성). **확률 없음**(§33 비대상).
 * 챔피언 = 1위, 단 `max_enhance_level ≥ 1`(+0뿐이면 챔피언/순위 없음).
 */
const TOP = 10;

export type ItemRankEntry = {
  userId: string;
  nickname: string;
  /** 불변 공개 코드 — /u 링크 식별자. */
  publicCode: string;
  maxLevel: number;
  rank: number;
  /** 대표 프로필 이미지 URL(없으면 null) — 닉네임 왼쪽 아바타. */
  profileImg?: string | null;
  /** 길드 문양 URL(미소속/생성중이면 null) — 닉네임 아래 노출용. */
  guildEmblemUrl?: string | null;
  /** 길드명(미소속이면 null) — 닉네임 아래 노출용. */
  guildName?: string | null;
};

/** 해당 아이템 Top10 (강화 ≥ 1만, 동률은 먼저 달성 순). */
export async function getItemTop10(catalogItemId: number, serverId: number): Promise<ItemRankEntry[]> {
  const rows = await db
    .select({
      userId: userEquipment.userId,
      nickname: characters.nickname,
      publicCode: profiles.publicCode,
      maxLevel: userEquipment.maxEnhanceLevel,
    })
    .from(userEquipment)
    .innerJoin(profiles, eq(profiles.id, userEquipment.userId))
    .innerJoin(
      characters,
      and(eq(characters.userId, userEquipment.userId), eq(characters.serverId, serverId)),
    )
    .where(
      and(
        eq(userEquipment.serverId, serverId),
        eq(userEquipment.catalogItemId, catalogItemId),
        sql`${userEquipment.maxEnhanceLevel} > 0`,
      ),
    )
    .orderBy(
      sql`${userEquipment.maxEnhanceLevel} desc, ${userEquipment.maxEnhanceReachedAt} asc, ${userEquipment.userId} asc`,
    )
    .limit(TOP);
  const base = rows.map((r, i) => ({ ...r, rank: i + 1 }));
  return attachItemRankProfiles(serverId, base);
}

/**
 * Top10에 대표 프로필 이미지 + 길드 brief를 batch로 붙임(랭킹 페이지와 동일 패턴).
 * 실패해도 순위는 그대로 반환(이미지/문양만 빠짐) — 도감 응답 보장.
 */
async function attachItemRankProfiles(
  serverId: number,
  entries: ItemRankEntry[],
): Promise<ItemRankEntry[]> {
  if (entries.length === 0) return entries;
  const userIds = entries.map((e) => e.userId);
  // 아바타: characters.active_profile_id → user_profiles.rotations[activeDirection].
  let imgMap = new Map<string, string | null>();
  try {
    const rows = await withTimeout(
      db
        .select({
          userId: characters.userId,
          rotations: userProfiles.rotations,
          activeDirection: userProfiles.activeDirection,
        })
        .from(characters)
        .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
        .where(and(eq(characters.serverId, serverId), inArray(characters.userId, userIds))),
      3000,
      'codex.itemRank.profiles',
    );
    imgMap = new Map(
      rows.map((r) => {
        const rot = r.rotations as Record<string, string> | null;
        const img = rot && r.activeDirection ? (rot[r.activeDirection] ?? null) : null;
        return [r.userId, img] as const;
      }),
    );
  } catch {
    // 콜드/hang → 이미지 없이 순위만.
  }
  // 길드 문양 + 길드명 batch(실패해도 순위는 반환).
  let guildMap = new Map<string, { emblemUrl: string | null; name: string }>();
  try {
    guildMap = await getGuildBriefsByUsers(userIds, serverId);
  } catch {
    // 무시 — 문양 없이 진행.
  }
  return entries.map((e) => ({
    ...e,
    profileImg: imgMap.get(e.userId) ?? null,
    guildEmblemUrl: guildMap.get(e.userId)?.emblemUrl ?? null,
    guildName: guildMap.get(e.userId)?.name ?? null,
  }));
}

/**
 * 해방 아이템 — 한 유저가 아이템별 강화랭킹 **1~3위**인 catalog_item → 등수(1·2·3) 맵.
 * 앞선 사람 수 < 3이면 해방(rank = ahead+1). 추후 등수별 이펙트 차등 적용용.
 * champion(1위)도 여기 rank=1로 포함. 타임아웃 가드 동일(빈 맵 폴백).
 */
export const liberatedItemRanks = cache(async (userId: string, serverId: number): Promise<Map<number, number>> => {
  try {
    const rows = (await withTimeout(
      db.execute(sql`
        select uc.catalog_item_id as cid,
          (select count(*) from user_equipment o
           where o.catalog_item_id = uc.catalog_item_id
             and o.server_id = ${serverId}
             and (
               o.max_enhance_level > uc.max_enhance_level
               or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at < uc.max_enhance_reached_at)
               or (o.max_enhance_level = uc.max_enhance_level and o.max_enhance_reached_at = uc.max_enhance_reached_at and o.user_id < uc.user_id)
             )
          )::int as ahead
        from user_equipment uc
        where uc.user_id = ${userId}::uuid and uc.server_id = ${serverId} and uc.max_enhance_level > 0
      `),
      3000,
      'liberatedItemRanks',
    )) as unknown as { cid: number; ahead: number }[];
    const m = new Map<number, number>();
    for (const r of rows) {
      const ahead = Number(r.ahead);
      if (ahead < 3) m.set(Number(r.cid), ahead + 1);
    }
    return m;
  } catch (e) {
    if (e instanceof DbTimeoutError) {
      console.warn('[liberatedItemRanks] timeout — empty fallback');
      return new Map();
    }
    throw e;
  }
});
