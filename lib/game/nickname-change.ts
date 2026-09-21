import 'server-only';

import { sql } from 'drizzle-orm';

import type { db } from '@/lib/db/client';
import { walletTrySpend } from '@/lib/game/wallet';
import { NICKNAME_CHANGE_COST_DIAMOND } from '@/lib/game/balance';

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type NicknameChangeOutcome =
  | { ok: true; changedCount: number; diamondLeft: string; charged: number }
  | { ok: false; reason: 'NO_CHARACTER' | 'INSUFFICIENT' };

/**
 * 닉네임 변경의 트랜잭션 본문 — 행 잠금 → 비용 산정(첫 변경 무료) → **지갑 헬퍼 경유 차감** →
 * 닉네임 갱신. 서버 액션(app/(game)/me/actions.ts)에서 호출한다.
 *
 * 액션 안에 인라인으로 두지 않고 떼어 낸 이유는 테스트다. 액션은 세션을 요구해 직접 부를 수
 * 없어서, 인라인이면 "차감이 원장을 지나는가"를 검증할 방법이 없다(헬퍼를 테스트가 직접 부르면
 * 액션이 그 헬퍼를 쓰는지는 확인되지 않는다). 여기로 빼면 테스트가 같은 코드를 실행한다.
 *
 * 차감은 반드시 walletTrySpend를 지나야 한다 — 예전엔 단일 CTE가 characters.diamond를 직접
 * 깎아 diamond_ledger에 아무 흔적이 없었고, 원장을 근거로 삼는 집계가 그만큼 과소 집계됐다
 * (LedgerReason 'nickname_change'는 선언만 있고 호출부가 없던 상태, 2026-08-12 재검증).
 *
 * 닉네임 중복은 마지막 UPDATE에서 DB가 막고 호출부가 받는다 — 같은 트랜잭션이라 차감도 함께
 * 롤백된다. 0207부터 두 가지다: 같은 서버 안 중복은 23505(characters_server_nickname_uq),
 * **다른 사람이 쓰는 이름**은 23P01(characters_nickname_owner_excl). 호출부는 `isNicknameTaken`.
 *
 * ⚠ 앱에서 사전 중복 검사를 하지 않는다 — 그래서 **다른 서버에서 쓰는 내 이름으로 바꾸는 것은
 * 그대로 된다**(0207이 같은 계정은 허용). 새 서버는 임의 닉으로 시작하고, 원하면 닉네임 변경으로
 * 본래 이름을 가져오는 흐름(2026-09-21 사용자 확정).
 */
export async function applyNicknameChange(
  tx: Tx,
  userId: string,
  serverId: number,
  next: string,
): Promise<NicknameChangeOutcome> {
  const [cur] = (await tx.execute(sql`
    select nickname_changed_count as cnt from characters
    where user_id = ${userId}::uuid and server_id = ${serverId}
    for update
  `)) as unknown as { cnt: number }[];
  if (!cur) return { ok: false, reason: 'NO_CHARACTER' };

  const charged = Number(cur.cnt) === 0 ? 0 : NICKNAME_CHANGE_COST_DIAMOND;
  if (charged > 0) {
    const paid = await walletTrySpend(tx, userId, serverId, charged, 'nickname_change');
    if (!paid) return { ok: false, reason: 'INSUFFICIENT' };
  }

  const [upd] = (await tx.execute(sql`
    update characters
    set nickname = ${next}, nickname_changed_count = nickname_changed_count + 1
    where user_id = ${userId}::uuid and server_id = ${serverId}
    returning nickname_changed_count as cnt, diamond::text as diamond
  `)) as unknown as { cnt: number; diamond: string }[];
  return { ok: true, changedCount: Number(upd!.cnt), diamondLeft: upd!.diamond, charged };
}
