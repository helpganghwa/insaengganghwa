import 'server-only';

import { and, asc, eq, inArray } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants, type MeleeFinale } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { characters } from '@/lib/db/schema/server';
import { userProfiles } from '@/lib/db/schema/avatar';
import { parseFaceBox, type FaceBox } from '@/components/faceCrop';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type MeleeHistoryRow = {
  /** 그 회차 배틀 id — 클릭 시 결과(/melee/battle/[id])로. */
  battleId: string;
  edition: number;
  championNick: string;
  championCode: string | null;
  championAvatar: string | null;
  /** 챔피언 아바타 얼굴 박스 — 얼굴중심 크롭(없으면 폴백). */
  championFaceBox: FaceBox | null;
  championCp: number;
  participantCount: number;
};

/**
 * 역대 우승자 목록 — 발표된 배틀(날짜 오름차순=회차) + 챔피언(아바타·CP)·참가자수.
 * /melee/info 와 대기/진행중 화면(MeleeCountdown)에서 공용. 최신 회차가 위로(reverse).
 */
export async function loadMeleeHistory(serverId: number): Promise<MeleeHistoryRow[]> {
  const battles = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        pc: meleeBattles.participantCount,
        champ: meleeBattles.championUserId,
        finale: meleeBattles.finale,
      })
      .from(meleeBattles)
      .where(and(eq(meleeBattles.serverId, serverId), eq(meleeBattles.status, 'revealed')))
      .orderBy(asc(meleeBattles.battleDate)),
    3000,
    'melee.history.battles',
  ).catch(() => [] as { id: bigint; pc: number; champ: string | null; finale: MeleeFinale | null }[]);

  // 역대 우승자는 **우승컵 트로피 아바타** 우선(2026-06-04 피드백). 신규=finale.trophyAvatar,
  // 과거=roster[챔피언].avatar(박제 트로피). 트로피 미생성 배틀은 아래 live 아바타로 폴백.
  const trophyOf = new Map<string, string>();
  const trophyBoxOf = new Map<string, FaceBox | null>();
  for (const b of battles) {
    const f = b.finale;
    const t = f?.trophyAvatar ?? f?.roster?.find((r) => r.rank === 1)?.avatar ?? null;
    if (t) {
      trophyOf.set(b.id.toString(), t);
      // 재생성 트로피 이미지일 때만 트로피 전용 박스 — roster 폴백 스냅샷은 박스 없음(폴백 크롭).
      trophyBoxOf.set(
        b.id.toString(),
        f?.trophyAvatar ? ((f.trophyFaceBox as FaceBox | null) ?? null) : null,
      );
    }
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
              uid: characters.userId,
              nick: characters.nickname,
              code: profiles.publicCode,
              rotations: userProfiles.rotations,
              options: userProfiles.options,
            })
            .from(characters)
            .innerJoin(profiles, eq(profiles.id, characters.userId))
            .leftJoin(userProfiles, eq(userProfiles.id, characters.activeProfileId))
            .where(and(eq(characters.serverId, serverId), inArray(characters.userId, champIds))),
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

  const champOf = new Map<
    string,
    { nick: string; code: string | null; avatar: string | null; faceBox: FaceBox | null }
  >();
  for (const c of champRows) {
    const rot = (c.rotations as Record<string, string> | null) ?? null;
    const avatar = rot ? (rot.south ?? Object.values(rot)[0] ?? null) : null;
    const faceBox = parseFaceBox((c.options as Record<string, unknown> | null)?.faceBox);
    champOf.set(c.uid, { nick: c.nick, code: c.code, avatar, faceBox });
  }
  const cpOf = new Map(champCpRows.map((r) => [r.battleId.toString(), Number(r.cp)]));

  return battles
    .map((b, i) => {
      const c = b.champ ? champOf.get(b.champ) : undefined;
      // 우승자 닉네임은 그 회차 스냅샷(finale.roster rank 1) 우선 — 현재 닉 변경과 무관히 고정.
      const snapNick = b.finale?.roster?.find((r) => r.rank === 1)?.nickname ?? null;
      return {
        battleId: b.id.toString(),
        edition: i + 1,
        championNick: snapNick ?? c?.nick ?? '챔피언',
        championCode: c?.code ?? null,
        championAvatar: trophyOf.get(b.id.toString()) ?? c?.avatar ?? null,
        // 트로피 표시 중이면 트로피 전용 박스, 아니면(라이브 아바타) 프로필 박스.
        championFaceBox: trophyOf.has(b.id.toString())
          ? (trophyBoxOf.get(b.id.toString()) ?? null)
          : (c?.faceBox ?? null),
        championCp: cpOf.get(b.id.toString()) ?? 0,
        participantCount: b.pc,
      } satisfies MeleeHistoryRow;
    })
    .reverse(); // 최신 회차가 위로
}
