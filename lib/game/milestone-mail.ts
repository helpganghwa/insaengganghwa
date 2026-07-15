import 'server-only';

import { db } from '@/lib/db/client';
import { mailbox } from '@/lib/db/schema/mailbox';

/**
 * 이정표 보상 우편 — 월드 로그 발화 기준과 1:1(2026-07-15 사용자 확정): 피드에 뜨는 것 =
 * 우편이 오는 것. 발화 지점(claimMilestone·강화 개인최초 100단위·초월 개인최고 갱신)이
 * 이미 정확히 1회를 보장하므로 여기선 발송만 한다(중복 방지 자체 로직 없음 — 호출부 계약).
 * best-effort: 실패해도 본 액션(강화 정산·보급 개봉·랭킹 갱신)은 성공 유지.
 *
 * 문구는 반복 달성 시 단계가 오를수록 세지는 사다리(사용자 확정) — 구간 매핑, 최고 구간 유지.
 */

export type MilestoneMailMetric = 'enhance' | 'sum' | 'combat' | 'raid' | 'melee' | 'transcend';

// 발신 '인생강화' + type 'admin' — 카드가 "인생강화 ✓"(인증 배지)로 표시되는 특별 우편
// (2026-07-15 사용자 확정: '보상' 배지 대신). admin 타입 의도적 재사용(별도 enum 불필요).
const SENDER = '인생강화';

/** 전투력 축약 한글 표기 — milestone.ts와 동일 규칙(10만/100만/1000만/1억). */
function koreanCount(v: number): string {
  if (v >= 100_000_000 && v % 100_000_000 === 0) return `${v / 100_000_000}억`;
  if (v >= 10_000 && v % 10_000 === 0) return `${(v / 10_000).toLocaleString('ko-KR')}만`;
  return v.toLocaleString('ko-KR');
}

/** 구간 매핑 — thresholds 중 milestone 이하의 최대 구간 문구(최고 구간 유지). */
function tier(pairs: [number, string][], milestone: number): string {
  let out = pairs[0]![1];
  for (const [th, text] of pairs) if (milestone >= th) out = text;
  return out;
}

function diamondReward(metric: MilestoneMailMetric, milestone: number): number {
  switch (metric) {
    case 'enhance': // 이정표×5 (+100=500, +200=1,000 …)
      return (milestone / 100) * 500;
    case 'sum':
      return 500;
    case 'combat':
      return tierNum(
        [
          [100_000, 1_000],
          [1_000_000, 5_000],
          [10_000_000, 20_000],
          [100_000_000, 100_000],
        ],
        milestone,
      );
    case 'raid':
      return 2_000;
    case 'melee':
      return 10_000;
    case 'transcend': // 상자 보상(아래 boxes) — 다이아 없음.
      return 0;
  }
}

function tierNum(pairs: [number, number][], milestone: number): number {
  let out = pairs[0]![1];
  for (const [th, v] of pairs) if (milestone >= th) out = v;
  return out;
}

function composeTitle(metric: MilestoneMailMetric, m: number): string {
  switch (metric) {
    case 'enhance':
      return `강화 +${m.toLocaleString('ko-KR')} 달성`;
    case 'sum':
      return `합산 강화 +${m.toLocaleString('ko-KR')} 달성`;
    case 'combat':
      return `전투력 ${koreanCount(m)} 돌파`;
    case 'raid':
      return `레이드 처치 ${m.toLocaleString('ko-KR')}회 달성`;
    case 'melee':
      return `대난투 통산 ${m}승 달성`;
    case 'transcend':
      return `초월 +${m} 달성`;
  }
}

function composeBody(metric: MilestoneMailMetric, m: number): string {
  switch (metric) {
    case 'enhance':
      return tier(
        [
          [100, '망치질이 첫 번째 벽을 넘었습니다. 다음 백 번도 응원합니다.'],
          [200, `+200 — 이 높이를 아는 대장장이는 많지 않습니다.`],
          [300, `+300. 당신의 망치 소리가 서버의 기준이 됩니다.`],
          [400, '이 높이부터는 지도가 없습니다. 망치가 길을 만듭니다.'],
        ],
        m,
      );
    case 'sum':
      return tier(
        [
          [1_000, '꾸준함이 형태를 갖추기 시작했습니다.'],
          [2_000, '쌓인 망치질이 산이 되어 갑니다.'],
          [3_000, '이쯤이면 습관이 아니라 신념입니다.'],
          [5_000, '이 총합 앞에서는 긴 말이 필요 없습니다.'],
          [10_000, '당신의 일지가 곧 이 서버 강화의 역사입니다.'],
        ],
        m,
      );
    case 'combat':
      return tier(
        [
          [100_000, '이름이 알려지기 시작했습니다.'],
          [1_000_000, '이제 아무도 당신을 가볍게 보지 못합니다.'],
          [10_000_000, '서버가 당신을 기준으로 움직입니다.'],
          [100_000_000, '전설은 이렇게 기록됩니다.'],
        ],
        m,
      );
    case 'raid':
      return tier(
        [
          [100, '보스들 사이에 소문이 돌기 시작했습니다.'],
          [200, '보스들이 당신의 이름을 알아봅니다.'],
          [300, '이제 보스들이 당신을 두려워합니다.'],
        ],
        m,
      );
    case 'melee':
      return tier(
        [
          [10, '왕좌가 낯설지 않은 얼굴입니다.'],
          [20, '대난투가 당신의 이름 앞에 조용해집니다.'],
          [30, '대난투 — 그 왕좌의 주인입니다.'],
        ],
        m,
      );
    case 'transcend':
      return tier(
        [
          [11, '평범함에서 또 한 걸음 멀어졌습니다.'],
          [13, '이 단계의 장비를 본 사람은 드뭅니다.'],
          [16, '장비가 전설의 영역에 들어섰습니다.'],
        ],
        m,
      );
  }
}

/** 이정표 보상 우편 발송 — 호출부가 1회 발화를 보장(워터마크/개인최초 게이트). */
export async function sendMilestoneMail(
  userId: string,
  serverId: number,
  metric: MilestoneMailMetric,
  milestone: number,
): Promise<void> {
  try {
    const diamond = diamondReward(metric, milestone);
    const payload =
      metric === 'transcend'
        ? { boxes: { weapon: 10, armor: 10, accessory: 10 } } // 상자 30 — 다음 초월 재료 순환
        : { diamond };
    if (metric !== 'transcend' && diamond <= 0) return;
    await db.insert(mailbox).values({
      userId,
      serverId,
      type: 'admin',
      title: composeTitle(metric, milestone),
      body: composeBody(metric, milestone),
      senderLabel: SENDER,
      payload,
    });
  } catch {
    // best-effort — 우편 실패가 본 액션을 막지 않는다.
  }
}
