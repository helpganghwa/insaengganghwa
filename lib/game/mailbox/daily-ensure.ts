import 'server-only';

import { withTimeout, DbTimeoutError } from '@/lib/db/with-timeout';
import { ensureCbtCarryover } from '@/lib/game/cbt/grant';
import { kstDateString } from '@/lib/kst';

import { ensureDailyMail } from './daily';
import { ensurePremiumDailyMailAll } from './premium-daily';

/**
 * 일일 지급 보장(일일 보급·CBT 이월·성장 프리미엄 오늘 몫) — 응답 뒤(after) 공용 실행기(2026-11-06 업데이트 18).
 *
 * 종전엔 게임 레이아웃이 렌더될 때만 돌았다. 업데이트 18에서 수동 강화 수령(재렌더 제거)·대난투 발표 대기 폴링
 * (refresh → 상태 JSON)이 레이아웃을 다시 그리지 않게 되면서, 한 화면을 KST 자정 넘어 열어 둔 유저가 지급받을
 * 기회가 줄었다. 그래서 그 자리(수령 액션·대난투 상태 라우트)에서도 같은 지급을 같은 스로틀로 시도한다. 전부 멱등(PK).
 *
 * 스로틀:
 *  - 일일 보급·CBT 이월: 유저·서버·KST일 단위 인스턴스 마크(종전 레이아웃 그대로) — 에러 없이 끝난 경우에만 마크.
 *  - 프리미엄: 레이아웃은 셸 쿼리의 premiumDue(오늘 몫 남음)로 거른다(판정 실패 null이면 시도). 레이아웃 밖 호출처는
 *    premiumDue가 없으므로 유저·KST일 단위 인스턴스 마크로 거른다 — 하루 중 구매로 바뀌는 경우는 레이아웃이 맡는다.
 */
const dailyEnsured = new Map<string, number>();
const premiumEnsured = new Map<string, number>();

function prune(m: Map<string, number>) {
  if (m.size < 10_000) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [k, at] of m) if (at < cutoff) m.delete(k);
}

type PremiumGate =
  /** 레이아웃 — 셸 쿼리의 premiumDue. 실패·판정 불가는 null로 넘긴다(그때는 시도). */
  | { kind: 'due'; due: () => Promise<boolean | null> }
  /** 레이아웃 밖(수령 액션·대난투 상태) — 유저·KST일 인스턴스 마크. */
  | { kind: 'daily-mark' };

export async function ensureDailyGrants(userId: string, serverId: number, premium: PremiumGate): Promise<void> {
  const day = kstDateString();
  // 1) 일일 보급·CBT 이월 먼저 — 셸 데이터(premiumDue)를 기다리느라 늦어지거나 그 실패에 끌려가지 않게.
  const ensureKey = `${userId}:${serverId}:${day}`;
  if (!dailyEnsured.has(ensureKey)) {
    let allOk = true;
    await withTimeout(ensureDailyMail(userId, serverId), 2000, 'daily.dailyMail').catch((e) => {
      allOk = false;
      if (!(e instanceof DbTimeoutError)) console.warn('[daily-ensure] dailyMail error', e);
    });
    // CBT 보상 이월 — 실운영에서 1회 지급(멱등). CBT/스냅샷 전엔 테이블이 비어 no-op.
    await withTimeout(ensureCbtCarryover(userId, serverId), 3000, 'daily.cbtCarryover').catch((e) => {
      allOk = false;
      if (!(e instanceof DbTimeoutError)) console.warn('[daily-ensure] cbtCarryover error', e);
    });
    if (allOk) {
      prune(dailyEnsured);
      dailyEnsured.set(ensureKey, Date.now());
    }
  }

  // 2) 성장 프리미엄 오늘 몫 — 산 서버마다(10-12 결정).
  let run: boolean;
  const premiumKey = `${userId}:${day}`;
  if (premium.kind === 'due') {
    // 셸 데이터를 못 받았으면(예외) 판정 불가로 보고 시도한다 — 누락보다 쿼리 1개가 낫다.
    const due = await premium.due().catch(() => null);
    run = due !== false;
  } else {
    run = !premiumEnsured.has(premiumKey);
  }
  if (!run) return;
  let ok = true;
  await withTimeout(ensurePremiumDailyMailAll(userId), 2500, 'daily.premiumDaily').catch((e) => {
    ok = false;
    if (!(e instanceof DbTimeoutError)) console.warn('[daily-ensure] premiumDaily error', e);
  });
  if (ok && premium.kind === 'daily-mark') {
    prune(premiumEnsured);
    premiumEnsured.set(premiumKey, Date.now());
  }
}
