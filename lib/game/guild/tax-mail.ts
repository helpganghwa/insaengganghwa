import { josa } from 'josa';

import type { GuildRole } from './permissions';

/**
 * 세금 분배 우편 본문 — 분배한 사람의 **실제 직책**으로 적는다.
 * 분배 권한(taxDistribute)은 부길드장에게 위임할 수 있는데 본문이 '길드장 ○○님이'로 고정돼 있어,
 * 부길드장이 나눠도 길드장이 나눈 것처럼 찍혔다(2026-09-21 재검수). 닉네임을 못 읽으면 직책만 적는다.
 */
export function taxMailBody(guildName: string, role: GuildRole, nick: string | null, amount: bigint): string {
  const title = role === 'leader' ? '길드장' : '부길드장';
  const who = nick ? `${title} ${nick}님이` : josa(`${title}#{이}`);
  return josa(`${guildName} ${who} 세금 💎${amount.toLocaleString('ko-KR')}#{을} 분배했습니다.`);
}
