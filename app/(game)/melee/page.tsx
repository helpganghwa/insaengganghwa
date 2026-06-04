import { eq, lt, sql } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { meleeBattles } from '@/lib/db/schema/melee';
import { kstDateString, kstStartOfDay } from '@/lib/kst';
import { buildMeleeResultView } from '@/lib/game/melee/result-view';
import { loadMeleeHistory } from '@/lib/game/melee/history';

import { MeleeCountdown } from './MeleeCountdown';
import { MeleeResult } from './MeleeResult';

/**
 * /melee — 대난투 (MELEE.md). 상태별:
 *  - 발표 전(status≠revealed): 결과와 동일 크기 무대 + 보상표·역대(MeleeCountdown).
 *      대기/난투(9:00~9:45)/우승컵 전달(9:45~10:00) 타이머 1:00:00 카운트다운.
 *  - 발표 후(revealed): 고정 무대(랭킹/단일 전투) + 내 순위 + 2탭 로그(MeleeResult).
 * 결과 API는 status='revealed' 전 비공개(서버 시각 게이트). 과거 회차는 /melee/battle/[id].
 */
export default async function MeleePage() {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const battleDate = kstDateString();

  const battleRows = await withTimeout(
    db
      .select({
        id: meleeBattles.id,
        status: meleeBattles.status,
        participantCount: meleeBattles.participantCount,
        totalRounds: meleeBattles.totalRounds,
        championUserId: meleeBattles.championUserId,
        finale: meleeBattles.finale,
      })
      .from(meleeBattles)
      .where(eq(meleeBattles.battleDate, battleDate))
      .limit(1),
    3000,
    'melee.battle',
  ).catch(() => []);
  const battle = battleRows[0] ?? null;

  // KST 09:00(산출) / 09:45(난투→우승컵 전달 경계, 발표 15분 전) / 10:00(발표) 타깃(UTC instant).
  const kstMid = kstStartOfDay().getTime();
  const runAtIso = new Date(kstMid + 9 * 3_600_000).toISOString();
  const deliverAtIso = new Date(kstMid + 9 * 3_600_000 + 45 * 60_000).toISOString();
  const revealAtIso = new Date(kstMid + 10 * 3_600_000).toISOString();

  if (!battle || battle.status !== 'revealed') {
    // 회차(제N회) — 하루 1회라 날짜 순서가 곧 회차. 오늘 = 이전 배틀 수 + 1.
    const edRows = await withTimeout(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(meleeBattles)
        .where(lt(meleeBattles.battleDate, battleDate)),
      2000,
      'melee.edition',
    ).catch(() => [] as { n: number }[]);
    const edition = (edRows[0]?.n ?? 0) + 1;
    const history = await loadMeleeHistory();
    return (
      <MeleeCountdown
        edition={edition}
        runAtIso={runAtIso}
        deliverAtIso={deliverAtIso}
        revealAtIso={revealAtIso}
        participantCount={battle?.participantCount ?? null}
        history={history}
      />
    );
  }

  // ── 발표됨 — 결과 뷰(오늘/과거 공용 빌더) ──
  const view = await buildMeleeResultView({ ...battle, battleDate }, userId);
  return <MeleeResult view={view} />;
}
