import 'server-only';

import { aggregateConquestDay } from '@/lib/game/guild/conquest/chronicle';

import { grantTitleCodes } from './event-grants';
import { soloFeatTitle } from './moment-rules';

/**
 * 점령전 결과 공개 뒤(공개 크론 conquest-reveal·백스톱 conquest-chronicle) — 혈혈단신·최후의 보루. 23시 결과는 자정 공개 전까지 비밀이라
 * 공개가 끝난 뒤에만 부른다(칭호로 결과가 먼저 새지 않게). 같은 날을 다시 불러도 PK로 한 번만.
 */
export async function grantConquestSoloTitles(serverId: number, battleDay: string): Promise<number> {
  const summary = await aggregateConquestDay(battleDay, serverId);
  let n = 0;
  for (const f of summary.soloFeats) {
    // 한 사람 실패가 뒤 사람을 막지 않게 — 멱등(PK)이라 소급 스크립트로 다시 채워도 안전.
    try {
      await grantTitleCodes(f.userId, serverId, [soloFeatTitle(f.kind)]);
      n += 1;
    } catch (e) {
      console.warn('[titles] 단신 활약 칭호 지급 실패', serverId, battleDay, f.userId, e);
    }
  }
  return n;
}
