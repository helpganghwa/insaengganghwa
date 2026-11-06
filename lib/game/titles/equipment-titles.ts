import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';
import { refreshTitlesMetric } from '@/lib/game/leaderboard/incremental';

import { TITLE_SECRETS } from './defs.server';
import { judgeCache } from './judge-cache';

/**
 * 장비 칭호 즉시 확인(2026-11-06 업데이트 18 후속, 보리 #661cxqjm 문의) — 장비 칭호(아이템 발동 285종 + 장비 상태 3종)는
 * 조건이 '지금 장착한 장비와 그 강화 단계'뿐이라 장착 1쿼리로 판단된다. 종전엔 칭호 화면을 열 때(discoverTitles)만 판정해서,
 * 조합을 바꿔 끼우고 칭호 화면을 열지 않으면 그 조합은 영영 기록되지 않았다(10-02 보리: 50분간 장착 150회, 판정 1회).
 * 이제 장착을 바꾸거나 장착 중인 장비의 단계가 바뀌면 바로 이 함수가 발견 원장에 적는다(알림 없음 — 다른 칭호처럼 NEW 표시만).
 * 판정 규칙은 judge.activeConditionals와 같은 equipmentTitleCodes 하나를 쓴다(두 경로가 어긋나지 않게).
 */

/** 장착 상태(카탈로그 key → 강화 단계)에서 지금 조건을 채운 장비 칭호 코드 — 순수 함수. */
export function equipmentTitleCodes(eq: ReadonlyMap<string, number>): string[] {
  const out: string[] = [];
  for (const t of TITLE_SECRETS) {
    if (t.req && t.req.items.every((k) => (eq.get(k) ?? -1) >= t.req!.min)) out.push(t.code);
  }
  const lvls = [...eq.values()];
  if (lvls.length === 3 && lvls.every((v) => v === lvls[0]) && lvls[0]! >= 50) out.push('balance_master');
  if (lvls.length === 3 && lvls.every((v) => v >= 100)) out.push('full_armed');
  if (lvls.some((v) => v >= 200)) out.push('star_holder');
  return out;
}

/** 장착 중인 장비 — 카탈로그 key → 강화 단계(카탈로그 조인 1쿼리). */
async function equippedKeyLevels(userId: string, serverId: number): Promise<Map<string, number>> {
  const rows = (await db.execute(sql`
    select ci.code, ue.enhance_level from user_equipment ue
    join catalog_items ci on ci.id = ue.catalog_item_id
    where ue.user_id = ${userId}::uuid and ue.server_id = ${serverId} and ue.equipped_slot is not null
  `)) as unknown as { code: string; enhance_level: number }[];
  return new Map(rows.map((r) => [r.code, Number(r.enhance_level)]));
}

/**
 * 장착 변경·장착 장비 단계 변경 직후 호출(응답 뒤 after()). 조건을 채운 장비 칭호를 원장에 적고(이미 있으면 그대로),
 * 새로 적힌 게 있으면 칭호 랭킹 값을 갱신한다. 칭호 화면 판정 캐시도 비워, 바로 열어도 새 장착 상태로 다시 본다.
 * best-effort — 실패해도 장착·강화 결과는 그대로이고, 칭호 화면 판정이 백스톱이다.
 */
export async function grantEquipmentTitles(userId: string, serverId: number): Promise<void> {
  try {
    judgeCache.delete(`${userId}:${serverId}`);
    const codes = equipmentTitleCodes(await equippedKeyLevels(userId, serverId));
    if (!codes.length) return;
    const rows = (await db.execute(sql`
      insert into user_titles (user_id, server_id, title_code)
      select ${userId}::uuid, ${serverId}, unnest(array[${sql.join(codes.map((c) => sql`${c}`), sql`, `)}]::text[])
      where exists (select 1 from characters where user_id = ${userId}::uuid and server_id = ${serverId})
        -- 닫힌 서버 자산 동결(10-12 결정 ⑤) — 닫힌 서버 장비를 해제하는 요청이 와도 그 서버 원장에 새로 적지 않는다.
        and not exists (select 1 from servers where id = ${serverId} and status = 'closed')
      on conflict (user_id, server_id, title_code) do nothing
      returning title_code
    `)) as unknown as { title_code: string }[];
    if (rows.length) {
      judgeCache.delete(`${userId}:${serverId}`);
      await refreshTitlesMetric(userId, serverId);
    }
  } catch (e) {
    console.warn('[titles.equip] 장비 칭호 확인 실패', userId, serverId, (e as Error).message);
  }
}
