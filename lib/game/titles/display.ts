import 'server-only';

import { sql } from 'drizzle-orm';

import { db } from '@/lib/db/client';

import { TITLE_BY_CODE } from './defs';
import { TITLE_SECRET_BY_CODE } from './defs.server';

/**
 * 표시용 대표 칭호 해석 — 핫패스(헤더 등)에서 쓰는 **경량** 활성 검증.
 * 규칙(TITLES.md §1): 조건부 칭호는 표시 시점에 자격을 재검증해 미자격이면 숨긴다
 * (자동 해제 UPDATE 없음 — 조건 회복 시 자동 복귀).
 *
 * 검증 비용: 영구형 0쿼리 · 집행관 0쿼리(호출부의 executorZone 재사용) ·
 * 착용형/장비상태형 1쿼리 · 해방형 1쿼리. 그 외 조건부(랭킹 등 판정 미구현)는
 * 보수적으로 숨긴다 — 아직 발견 자체가 불가능한 코드라 실사용 영향 없음.
 */
export async function resolveRepTitle(
  repCode: string | null,
  userId: string,
  serverId: number,
  executorZone: string | null,
): Promise<string | null> {
  // 대표 미지정이면 기존 UX 유지 — 집행관은 자동 표시(집행관 표시 지점 승계).
  if (!repCode) return executorZone ? 'zone_executor' : null;

  const def = TITLE_BY_CODE.get(repCode);
  if (!def) return null;
  if (def.kind !== 'conditional') return repCode;

  if (def.style.executor) return executorZone ? repCode : null;

  const secret = TITLE_SECRET_BY_CODE.get(repCode);
  // 착용형/장비 상태형 — 장착 3행 조회 1회
  if (secret?.req || ['balance_master', 'full_armed', 'star_holder'].includes(repCode)) {
    const rows = (await db.execute(sql`
      select ci.code, ue.enhance_level from user_equipment ue
      join catalog_items ci on ci.id = ue.catalog_item_id
      where ue.user_id=${userId}::uuid and ue.server_id=${serverId} and ue.equipped_slot is not null
    `)) as unknown as { code: string; enhance_level: number }[];
    const eq = new Map(rows.map((r) => [r.code, Number(r.enhance_level)]));
    if (secret?.req) return secret.req.items.every((k) => (eq.get(k) ?? -1) >= secret.req!.min) ? repCode : null;
    const lv = [...eq.values()];
    if (repCode === 'balance_master') return lv.length === 3 && lv.every((v) => v === lv[0]) && lv[0]! >= 50 ? repCode : null;
    if (repCode === 'full_armed') return lv.length === 3 && lv.every((v) => v >= 100) ? repCode : null;
    return lv.some((v) => v >= 200) ? repCode : null; // star_holder
  }

  // 해방형 — 사전계산 스냅샷 1회
  if (['lib_holder', 'lib_ten', 'champ_5', 'armory_lord'].includes(repCode)) {
    const r = (await db.execute(sql`
      select count(*) filter (where rank<=3)::int as lib,
             count(*) filter (where rank=1)::int as champ,
             count(*) filter (where rank<=3 and ci.slot='weapon')::int as w
      from codex_champions cc join catalog_items ci on ci.id=cc.catalog_item_id
      where cc.user_id=${userId}::uuid and cc.server_id=${serverId}
    `)) as unknown as { lib: number; champ: number; w: number }[];
    const m = r[0] ?? { lib: 0, champ: 0, w: 0 };
    if (repCode === 'lib_holder') return Number(m.lib) >= 3 ? repCode : null;
    if (repCode === 'lib_ten') return Number(m.lib) >= 10 ? repCode : null;
    if (repCode === 'champ_5') return Number(m.champ) >= 5 ? repCode : null;
    return Number(m.w) >= 10 ? repCode : null;
  }

  // 그 외 조건부(랭킹 등) — 판정 붙기 전까지 보수적으로 숨김
  return null;
}
