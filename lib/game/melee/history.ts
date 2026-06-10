import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';
import { getGuildBriefsByUsers } from '@/lib/game/guild';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeleeHistoryRow = {
  /** 그 회차 배틀 id — 클릭 시 결과(/melee/battle/[id])로. */
  battleId: string;
  edition: number;
  championNick: string;
  championCode: string | null;
  championAvatar: string | null;
  championCp: number;
  participantCount: number;
  /** 우승자 닉네임 옆 길드 문양(미소속/생성중이면 null). */
  championGuildEmblemUrl: string | null;
};

/**
 * 역대 우승자 목록 — 발표된 배틀(날짜 오름차순=회차) + 챔피언(아바타·CP)·참가자수.
 * /melee/info 와 대기/진행중 화면(MeleeCountdown)에서 공용. 최신 회차가 위로(reverse).
 */
export async function loadMeleeHistory(): Promise<MeleeHistoryRow[]> {
  const battles = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        pc: meleeBattles.participantCount,
        champ: meleeBattles.championUserId,
        finale: meleeBattles.finale,
      })
      .from(meleeBattles)
      .where(eq(meleeBattles.status, 'revealed'))
      .orderBy(asc(meleeBattles.battleDate)),
    3000,
    'melee.history.battles',
  ).catch(() => [] as { id: bigint; pc: number; champ: string | null; finale: MeleeFinale | null }[]);

  // 역대 우승자는 **우승컵 트로피 아바타** 우선(2026-06-04 피드백). 신규=finale.trophyAvatar,
  // 과거=roster[챔피언].avatar(박제 트로피). 트로피 미생성 배틀은 아래 live 아바타로 폴백.
  const trophyOf = new Map<string, string>();
  for (const b of battles) {
    const f = b.finale;
    const t = f?.trophyAvatar ?? f?.roster?.find((r) => r.rank === 1)?.avatar ?? null;
    if (t) trophyOf.set(b.id.toString(), t);
  }

  if (battles.length === 0) return [];

  const ids = battles.map((b) => b.id);
  const champIds = battles
    .map((b) => b.champ)
    .filter((c): c is string => !!c && UUID_RE.test(c));

  const [champRows, champCpRows] = await Promise.all([
    champIds.length
      ? withTimeout(
          db
            .select({
              uid: profiles.id,
              nick: profiles.nickname,
              code: profiles.publicCode,
              rotations: userProfiles.rotations,
              dir: userProfiles.activeDirection,
            })
            .from(profiles)
            .leftJoin(userProfiles, eq(userProfiles.id, profiles.activeProfileId))
            .where(inArray(profiles.id, champIds)),
          3000,
          'melee.history.champ',
        ).catch(() => [])
      : Promise.resolve([]),
    withTimeout(
      db
        .select({ battleId: meleeParticipants.battleId, cp: meleeParticipants.cpSnapshot })
        .from(meleeParticipants)
        .where(and(inArray(meleeParticipants.battleId, ids), eq(meleeParticipants.finalRank, 1))),
      3000,
      'melee.history.champcp',
    ).catch(() => []),
  ]);

  const champOf = new Map<string, { nick: string; code: string | null; avatar: string | null }>();
  for (const c of champRows) {
    const rot = (c.rotations as Record<string, string> | null) ?? null;
    const avatar = rot ? rot.south ?? (c.dir ? rot[c.dir] ?? null : null) : null;
    champOf.set(c.uid, { nick: c.nick, code: c.code, avatar });
  }
  const cpOf = new Map(champCpRows.map((r) => [r.battleId.toString(), Number(r.cp)]));
  // 우승자 길드 문양 — finale 스냅샷(그 시점 마크) 우선. 스냅샷 도입 이전 배틀만 live 폴백.
  const champSnapGuild = new Map<string, string | null>(); // battleId → 스냅샷 문양
  const legacyChampIds: string[] = [];
  for (const b of battles) {
    const champRoster = b.finale?.roster?.find((r) => r.rank === 1);
    if (champRoster && 'guildEmblemUrl' in champRoster) {
      champSnapGuild.set(b.id.toString(), champRoster.guildEmblemUrl ?? null);
    } else if (b.champ && UUID_RE.test(b.champ)) {
      legacyChampIds.push(b.champ);
    }
  }
  const champGuild = legacyChampIds.length
    ? await getGuildBriefsByUsers(legacyChampIds).catch(
        () => new Map<string, { emblemUrl: string | null; name: string }>(),
      )
    : new Map<string, { emblemUrl: string | null; name: string }>();

  return battles
    .map((b, i) => {
      const c = b.champ ? champOf.get(b.champ) : undefined;
      return {
        battleId: b.id.toString(),
        edition: i + 1,
        championNick: c?.nick ?? '챔피언',
        championCode: c?.code ?? null,
        championAvatar: trophyOf.get(b.id.toString()) ?? c?.avatar ?? null,
        championCp: cpOf.get(b.id.toString()) ?? 0,
        participantCount: b.pc,
        championGuildEmblemUrl: champSnapGuild.has(b.id.toString())
          ? champSnapGuild.get(b.id.toString())!
          : b.champ
            ? (champGuild.get(b.champ)?.emblemUrl ?? null)
            : null,
      } satisfies MeleeHistoryRow;
    })
    .reverse(); // 최신 회차가 위로
}
