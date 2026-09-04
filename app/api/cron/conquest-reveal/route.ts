/**
 * 점령전 소유권 **정밀 자정 공개** cron(2026-09-05) — 23:57·23:58 KST에 떠서 서버 시계로 00:00:00 KST까지
 * 기다렸다가 정각에 revealConquest를 실행한다. 연대기·리플레이는 날짜 게이트(kst_day < 오늘)로 정각에
 * 열리는데 소유권·전투 결과는 자정 크론의 기동 지연(실측 16초~3분)만큼 늦어 화면이 어긋나던 문제의 해소.
 *  - 백스톱은 그대로 conquest-chronicle(00시대 5분 간격). revealConquest는 전투별 조건부 플립(published_at
 *    IS NULL)+행잠금이라 두 크론이 겹쳐도 1회만 적용되고, 방치 판정·수비 이월·연대기 생성은 백스톱이 맡는다.
 *  - 크론이 자정 이후에 떴으면 기다리지 않고 즉시 공개(현행과 같은 정확도). 창 밖(정각까지 270초 초과) 호출은 no-op.
 *  - 공개 직후 세율 재계산·월드 피드 무효화까지 같이 해, 소유권만 바뀌고 세율은 바닥값(1)인 창을 줄인다.
 * 인증: CRON_SECRET Bearer — isCronAuthorized. 하트비트는 등재하지 않는다(공개 경로의 dead-man은 백스톱 크론이 담당).
 */
import { revalidateTag } from 'next/cache';

import { isCronAuthorized } from '@/lib/auth/cron-auth';
import { revealConquest } from '@/lib/game/guild/conquest/run';
import { recalcTaxBonus } from '@/lib/game/guild/tax';
import { openServerIds } from '@/lib/game/server-list';
import { kstDateString, msUntilNextKstMidnight } from '@/lib/kst';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** 정각까지 이만큼 이상 남았으면 기다리지 않는다(창 밖 호출·오발화 보호, 함수 제한 300s 안). */
const MAX_WAIT_MS = 270_000;
/** 자정 직후 이 시간 안에 떴으면(기동 지연) 즉시 공개. 그보다 늦으면 백스톱에 맡긴다. */
const LATE_WINDOW_MS = 5 * 60_000;
/** 정각 통과 보장 여유 — 타이머 조기 발화·시계 오차 대비. */
const GUARD_MS = 150;

const kstClock = (ms: number) => new Date(ms).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour12: false });

export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return new Response('forbidden', { status: 403 });
  const firedAt = Date.now();
  const wait = msUntilNextKstMidnight(new Date(firedAt));
  // wait는 '다음 자정까지'라 자정 직후 기동은 ≈24h로 나온다 — 그 경우가 '지연 기동, 즉시 공개'.
  const lateStart = wait > 24 * 60 * 60_000 - LATE_WINDOW_MS;
  if (!lateStart && wait > MAX_WAIT_MS) {
    return Response.json({ ok: true, skipped: 'too-early', waitMs: wait, firedAt: kstClock(firedAt), kind: 'conquest-reveal' });
  }
  if (!lateStart) await new Promise((r) => setTimeout(r, wait + GUARD_MS));
  const revealAt = Date.now();
  // 전투일 = 방금 지난 KST 날짜(정각 기준 1분 전).
  const battleDay = kstDateString(new Date(revealAt - 60_000));
  const results: { serverId: number; revealed?: number; mailed?: number; error?: string }[] = [];
  for (const sid of await openServerIds()) {
    try {
      const rev = await revealConquest(sid, battleDay);
      if (rev.revealed > 0) {
        await recalcTaxBonus(sid).catch((e: unknown) => console.warn('[conquest-reveal] recalcTaxBonus', e));
        revalidateTag(`world-feed:s${sid}`, 'max');
      }
      results.push({ serverId: sid, revealed: rev.revealed, mailed: rev.mailed });
    } catch (e) {
      console.error('[conquest-reveal] server', sid, e);
      results.push({ serverId: sid, error: (e as Error).message });
    }
  }
  const ok = results.every((r) => !r.error);
  return Response.json(
    {
      ok,
      kind: 'conquest-reveal',
      battleDay,
      firedAt: kstClock(firedAt),
      revealAt: kstClock(revealAt),
      waitedMs: lateStart ? 0 : revealAt - firedAt,
      lateStart,
      results,
    },
    { status: ok ? 200 : 500 },
  );
}
