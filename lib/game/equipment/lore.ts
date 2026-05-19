import { CATALOG_ITEMS } from './catalog';

/**
 * 아이템 로어 조회 — catalog `code`(=key) → 한국어 로어 전문.
 * 게임 핵심: 아이템 차이 = 외관·도감·로어뿐(GDD §3.1).
 *
 * ⚠ **서버 전용으로만 import** 할 것. CATALOG_ITEMS는 150종×긴 lore/art 문자열로
 *   크다 — 클라이언트 컴포넌트에서 import하면 번들 비대. 클라엔 문자열만 prop 전달.
 */
const LORE = new Map(CATALOG_ITEMS.map((c) => [c.key, c.lore] as const));

export function loreByCode(code: string): string | null {
  return LORE.get(code) ?? null;
}

/** 신규 해금 티저용 — 첫 1~2문장(최대 maxLen자, 문장 경계 우선). */
export function loreTeaser(code: string, maxLen = 110): string | null {
  const full = LORE.get(code);
  if (!full) return null;
  if (full.length <= maxLen) return full;
  const cut = full.slice(0, maxLen);
  const lastStop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
  return (lastStop > 40 ? cut.slice(0, lastStop + 1) : cut.trimEnd()) + ' …';
}
