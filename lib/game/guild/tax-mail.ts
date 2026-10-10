import { josa } from 'josa';

import type { GuildRole } from './permissions';

/** 상자 부위별 개수 — 세금 상자(월드보스 전리품)를 나눌 때 한 사람 몫의 부위 배분. */
export type BoxParts = { weapon: number; armor: number; accessory: number };

/**
 * 세금 분배 우편 본문 — 분배한 사람의 **실제 직책**으로 적는다.
 * 분배 권한(taxDistribute)은 부길드장에게 위임할 수 있는데 본문이 '길드장 ○○님이'로 고정돼 있어,
 * 부길드장이 나눠도 길드장이 나눈 것처럼 찍혔다(2026-09-21 재검수). 닉네임을 못 읽으면 직책만 적는다.
 * 상자가 섞이면(10-11 통합) 💎 뒤에 부위별 개수를 ⚔️🛡️💍로 적는다 — 다른 보상 우편의 부위 표기와 같다.
 */
export function taxMailBody(guildName: string, role: GuildRole, nick: string | null, amount: bigint, boxes?: BoxParts | null): string {
  const title = role === 'leader' ? '길드장' : '부길드장';
  const who = nick ? `${title} ${nick}님이` : josa(`${title}#{이}`);
  const items = [
    amount > 0n ? `💎${amount.toLocaleString('ko-KR')}` : '',
    boxes && boxes.weapon > 0 ? `⚔️무기 ${boxes.weapon}` : '',
    boxes && boxes.armor > 0 ? `🛡️방어구 ${boxes.armor}` : '',
    boxes && boxes.accessory > 0 ? `💍장신구 ${boxes.accessory}` : '',
  ].filter(Boolean);
  return josa(`${guildName} ${who} 세금#{을} 분배했습니다. ${items.join(' · ')}`);
}
