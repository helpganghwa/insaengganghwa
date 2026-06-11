import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { guilds, guildMembers } from '@/lib/db/schema/guild';

import type { ConquestFinale } from './simulate';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ConquestBattleRow = {
  id: bigint;
  battleKstDay: string;
  zoneId: number;
  zoneName: string;
  zoneRegion: string;
  winnerGuildId: bigint | null;
  winnerName: string | null;
  winnerEmblemUrl: string | null;
  finale: unknown;
};

export type ConquestFighter = {
  userId: string;
  nickname: string;
  guildId: string;
  guildName: string;
  effCp: number;
  rank: number;
  avatar: string;
  /** 불변 공개 코드 — 아바타/이름 클릭 시 /u/<code> 프로필 상세(없으면 null). */
  publicCode: string | null;
  kills: number;
  survives: number;
  isMe: boolean;
};

export type ConquestGuildSummary = {
  guildId: string;
  guildName: string;
  /** 길드 문양 URL — 로그·무대에서 공수 표시(없으면 null). */
  emblemUrl: string | null;
  memberCount: number;
  survivors: number;
  kills: number;
  isWinner: boolean;
};

export type ConquestBattleView = {
  battleId: string;
  kstDay: string;
  zoneName: string;
  zoneRegion: string;
  winner: { guildId: string; name: string; emblemUrl: string | null } | null;
  /** 조회 유저의 현재 길드 id('우리 길드' 필터용, 없으면 null). */
  myGuildId: string | null;
  participantCount: number;
  guildCount: number;
  rounds: number;
  guilds: ConquestGuildSummary[];
  roster: ConquestFighter[];
  events: [number, number, number, number][];
};

/**
 * 점령 전투(conquest_battles) 1건 + 조회 유저 → 상세 전투 기록 뷰.
 * 아바타·길드별 요약(생존/킬)·전투 단위(공격/방어 성공)를 finale.events에서 set-based 집계.
 * 대난투(buildMeleeResultView)와 동일한 톤의 상세 리플레이를 점령전에 제공.
 */
export async function buildConquestBattleView(
  row: ConquestBattleRow,
  userId: string,
): Promise<ConquestBattleView> {
  const finale = (row.finale as ConquestFinale) ?? { roster: [], events: [] };
  const { roster, events } = finale;

  // 조회 유저의 현재 길드 — '우리 길드' 필터(내가 직접 출전 안 해도 우리 길드 전투를 본다).
  const [mg] = await withTimeout(
    db.select({ gid: guildMembers.guildId }).from(guildMembers).where(eq(guildMembers.userId, userId)).limit(1),
    2000,
    'conquest.myGuild',
  ).catch(() => []);
  const myGuildId = mg?.gid != null ? mg.gid.toString() : null;

  // 로스터 아바타(uuid만 조회) — 유저가 설정한 방향 우선, 없으면 south.
  const rosterIds = roster.map((r) => r.userId).filter((id) => UUID_RE.test(id));
  const avatarOf = new Map<string, string>();
  const codeOf = new Map<string, string>();
  if (rosterIds.length > 0) {
    const av = await withTimeout(
      db
        .select({
          uid: profiles.id,
          code: profiles.publicCode,
          rotations: userProfiles.rotations,
          dir: userProfiles.activeDirection,
        })
        .from(profiles)
        .innerJoin(userProfiles, eq(userProfiles.id, profiles.activeProfileId))
        .where(inArray(profiles.id, rosterIds)),
      3000,
      'conquest.avatars',
    ).catch(() => []);
    for (const a of av) {
      const rot = a.rotations as Record<string, string>;
      const url = (a.dir ? rot[a.dir] : undefined) ?? rot.south;
      if (url) avatarOf.set(a.uid, url);
      if (a.code) codeOf.set(a.uid, a.code);
    }
  }
  const dft = (i: number) =>
    i % 2 === 0 ? '/sprites/default/male/south.png' : '/sprites/default/female/south.png';

  // 공격 성공(킬)·방어 성공(피격 후 생존) — 리플레이와 동일 소스(events).
  const kills = new Array(roster.length).fill(0);
  const survives = new Array(roster.length).fill(0);
  for (const [a, t, , hpAfter] of events) {
    if (hpAfter <= 0) {
      if (roster[a]) kills[a]++;
    } else {
      if (roster[t]) survives[t]++;
    }
  }

  const fighters: ConquestFighter[] = roster.map((r, i) => ({
    userId: r.userId,
    nickname: r.nickname,
    guildId: r.guildId,
    guildName: r.guildName,
    effCp: r.effCp,
    rank: r.rank,
    avatar: avatarOf.get(r.userId) ?? dft(i),
    publicCode: codeOf.get(r.userId) ?? null,
    kills: kills[i],
    survives: survives[i],
    isMe: r.userId === userId,
  }));

  // 길드별 요약 — 등장 순서(색 배정 순서)와 일치. 생존 = 최종 hp>0 추정(rank로는 알 수 없어
  // events 폴드로 산출), 킬 = 길드원 킬 합.
  // 최종 생존 여부: events 전체 폴드 후 hp>0.
  const finalDead = new Array(roster.length).fill(false);
  for (const [, t, , hpAfter] of events) {
    if (hpAfter <= 0) finalDead[t] = true;
  }
  const winnerGuildId = row.winnerGuildId != null ? row.winnerGuildId.toString() : null;
  const gmap = new Map<string, ConquestGuildSummary>();
  roster.forEach((r, i) => {
    let g = gmap.get(r.guildId);
    if (!g) {
      g = {
        guildId: r.guildId,
        guildName: r.guildName,
        emblemUrl: null,
        memberCount: 0,
        survivors: 0,
        kills: 0,
        isWinner: r.guildId === winnerGuildId,
      };
      gmap.set(r.guildId, g);
    }
    g.memberCount++;
    g.kills += kills[i];
    if (!finalDead[i]) g.survivors++;
  });

  // 길드 문양 — 참전 길드들의 emblemUrl 조회(로그·무대 공수 표시용).
  const guildIds = [...gmap.keys()].filter((id) => /^\d+$/.test(id)).map((id) => BigInt(id));
  if (guildIds.length > 0) {
    const emb = await withTimeout(
      db.select({ id: guilds.id, emblemUrl: guilds.emblemUrl }).from(guilds).where(inArray(guilds.id, guildIds)),
      2000,
      'conquest.guildEmblems',
    ).catch(() => []);
    for (const e of emb) {
      const g = gmap.get(e.id.toString());
      if (g) g.emblemUrl = e.emblemUrl;
    }
  }

  // 승자 길드 먼저, 그다음 생존자 수 desc.
  const guildList = [...gmap.values()].sort(
    (a, b) => Number(b.isWinner) - Number(a.isWinner) || b.survivors - a.survivors,
  );

  return {
    battleId: row.id.toString(),
    kstDay: row.battleKstDay,
    zoneName: row.zoneName,
    zoneRegion: row.zoneRegion,
    winner: winnerGuildId
      ? { guildId: winnerGuildId, name: row.winnerName ?? '???', emblemUrl: row.winnerEmblemUrl }
      : null,
    myGuildId,
    participantCount: roster.length,
    guildCount: gmap.size,
    rounds: events.length,
    guilds: guildList,
    roster: fighters,
    events,
  };
}
