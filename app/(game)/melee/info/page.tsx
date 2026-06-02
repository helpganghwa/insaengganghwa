import { and, asc, eq, inArray } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles, meleeParticipants } from '@/lib/db/schema/melee';
import { profiles } from '@/lib/db/schema/profiles';
import { userProfiles } from '@/lib/db/schema/avatar';

import { MeleeInfo, type MeleeHistoryRow } from '../MeleeInfo';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * /melee/info — 대난투 정보(보상 테이블 + 역대 우승자). MELEE §6.
 * 회차(제N회)는 날짜 순서로 파생(하루 1회). 역대: 회차·챔피언(아바타·CP)·참가자·그날 내 순위.
 */
export default async function MeleeInfoPage() {
  const userId = await getSessionUserId();
  if (!userId) return null;

  // 발표된 배틀 — 날짜 오름차순(회차 = index+1). 콜드 hang 가드.
  const battles = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        pc: meleeBattles.participantCount,
        champ: meleeBattles.championUserId,
      })
      .from(meleeBattles)
      .where(eq(meleeBattles.status, 'revealed'))
      .orderBy(asc(meleeBattles.battleDate)),
    3000,
    'melee.info.battles',
  ).catch(() => [] as { id: bigint; pc: number; champ: string | null }[]);

  let history: MeleeHistoryRow[] = [];
  if (battles.length > 0) {
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
            'melee.info.champ',
          ).catch(() => [])
        : Promise.resolve([]),
      withTimeout(
        db
          .select({ battleId: meleeParticipants.battleId, cp: meleeParticipants.cpSnapshot })
          .from(meleeParticipants)
          .where(and(inArray(meleeParticipants.battleId, ids), eq(meleeParticipants.finalRank, 1))),
        3000,
        'melee.info.champcp',
      ).catch(() => []),
    ]);

    const champOf = new Map<string, { nick: string; code: string | null; avatar: string | null }>();
    for (const c of champRows) {
      const rot = (c.rotations as Record<string, string> | null) ?? null;
      const avatar = rot ? rot.south ?? (c.dir ? rot[c.dir] ?? null : null) : null;
      champOf.set(c.uid, { nick: c.nick, code: c.code, avatar });
    }
    const cpOf = new Map(champCpRows.map((r) => [r.battleId.toString(), Number(r.cp)]));

    history = battles
      .map((b, i) => {
        const c = b.champ ? champOf.get(b.champ) : undefined;
        return {
          edition: i + 1,
          championNick: c?.nick ?? '챔피언',
          championCode: c?.code ?? null,
          championAvatar: c?.avatar ?? null,
          championCp: cpOf.get(b.id.toString()) ?? 0,
          participantCount: b.pc,
        } satisfies MeleeHistoryRow;
      })
      .reverse(); // 최신 회차가 위로
  }

  return <MeleeInfo history={history} />;
}
