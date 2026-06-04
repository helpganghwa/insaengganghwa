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
import { MeleePreviewSwitcher } from './MeleePreviewSwitcher';

/**
 * /melee — 대난투 (MELEE.md). 상태별:
 *  - 발표 전(status≠revealed): 결과와 동일 크기 무대 + 보상표·역대(MeleeCountdown).
 *  - 발표 후(revealed): 고정 무대(랭킹/단일 전투) + 내 순위 + 2탭 로그(MeleeResult).
 * 결과 API는 status='revealed' 전 비공개(서버 시각 게이트). 과거 회차는 /melee/battle/[id].
 *
 * ⚠ 임시: ?preview=before|running|tally로 대기/진행/집계 화면 강제(점검용, 곧 제거).
 */
type PreviewMode = 'before' | 'running' | 'deliver' | 'tally';

export default async function MeleePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const battleDate = kstDateString();
  const { preview } = await searchParams;

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

  // ⚠ 임시 점검용 — 모든 유저에게 플로팅 전환 노출(곧 제거).
  const previewMode: PreviewMode | null =
    preview === 'before' || preview === 'running' || preview === 'deliver' || preview === 'tally'
      ? preview
      : null;
  const switcher = <MeleePreviewSwitcher current={previewMode ?? ''} />;

  // KST 09:00(산출) / 09:30(난투→우승컵 전달 경계) / 10:00(발표) 타깃(UTC instant).
  const kstMid = kstStartOfDay().getTime();
  const runAtIso = new Date(kstMid + 9 * 3_600_000).toISOString();
  const deliverAtIso = new Date(kstMid + 9 * 3_600_000 + 30 * 60_000).toISOString();
  const revealAtIso = new Date(kstMid + 10 * 3_600_000).toISOString();

  // 회차(제N회) — 하루 1회라 날짜 순서가 곧 회차. 오늘 = 이전 배틀 수 + 1.
  async function loadEdition(): Promise<number> {
    const edRows = await withTimeout(
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(meleeBattles)
        .where(lt(meleeBattles.battleDate, battleDate)),
      2000,
      'melee.edition',
    ).catch(() => [] as { n: number }[]);
    return (edRows[0]?.n ?? 0) + 1;
  }

  // ⚠ 임시 미리보기 — 합성 시간으로 대기/진행/집계 강제 렌더.
  if (previewMode) {
    // eslint-disable-next-line react-hooks/purity -- 임시 미리보기(곧 제거): 합성 시간 기준점.
    const now = Date.now();
    const t =
      previewMode === 'before'
        ? { run: now + 3_600_000, deliver: now + 5_400_000, reveal: now + 7_200_000 } // 대기중
        : previewMode === 'running'
          ? { run: now - 900_000, deliver: now + 900_000, reveal: now + 2_700_000 } // 난투 진행 중
          : previewMode === 'deliver'
            ? { run: now - 2_700_000, deliver: now - 900_000, reveal: now + 900_000 } // 우승컵 전달 중
            : { run: now - 7_200_000, deliver: now - 5_400_000, reveal: now - 900_000 }; // 집계 중
    const [edition, history] = await Promise.all([loadEdition(), loadMeleeHistory()]);
    return (
      <>
        <MeleeCountdown
          edition={edition}
          runAtIso={new Date(t.run).toISOString()}
          deliverAtIso={new Date(t.deliver).toISOString()}
          revealAtIso={new Date(t.reveal).toISOString()}
          participantCount={battle?.participantCount ?? 1234}
          history={history}
        />
        {switcher}
      </>
    );
  }

  if (!battle || battle.status !== 'revealed') {
    const [edition, history] = await Promise.all([loadEdition(), loadMeleeHistory()]);
    return (
      <>
        <MeleeCountdown
          edition={edition}
          runAtIso={runAtIso}
          deliverAtIso={deliverAtIso}
          revealAtIso={revealAtIso}
          participantCount={battle?.participantCount ?? null}
          history={history}
        />
        {switcher}
      </>
    );
  }

  // ── 발표됨 — 결과 뷰(오늘/과거 공용 빌더) ──
  const view = await buildMeleeResultView({ ...battle, battleDate }, userId);
  return (
    <>
      <MeleeResult view={view} />
      {switcher}
    </>
  );
}
