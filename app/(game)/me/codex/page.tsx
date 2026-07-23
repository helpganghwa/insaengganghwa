import { getActiveServerId } from '@/lib/game/servers';
import { and, eq } from 'drizzle-orm';

import { getSessionUserId } from '@/lib/auth/session';
import { db } from '@/lib/db/client';
import { withTimeout } from '@/lib/db/with-timeout';
import { userEquipment } from '@/lib/db/schema/equipment';
import { getActiveCatalog } from '@/lib/game/catalog';
import { liberatedItemRanks } from '@/lib/game/codex/ranking';
import { CodexGrid, type CodexItem } from './CodexGrid';

/** 도감 — GDD §5 / WIREFRAMES §7. 수집 + 최고 강화 표기. **보상 수령 없음**(전투력 보너스로 반영). */
export default async function CodexPage() {
  const userId = await getSessionUserId();
  const serverId = await getActiveServerId();
  if (!userId) return null;

  // 콜드 DB 커넥션 hang 시 페이지 무한 대기 방지 — 실패 시 빈 결과로 degrade(2026-05-29).
  // 카탈로그는 캐시(getActiveCatalog) — 요청마다 DB 조회 제거. user_equipment·champion만 실시간.
  const _r = await withTimeout(
    Promise.all([
      getActiveCatalog(),
      db
        .select({ catalogItemId: userEquipment.catalogItemId, max: userEquipment.maxEnhanceLevel })
        .from(userEquipment)
        .where(and(eq(userEquipment.userId, userId), eq(userEquipment.serverId, serverId))),
      liberatedItemRanks(userId, serverId),
    ]),
    3500,
    'codex.page',
  ).catch(() => null);
  const catalog = _r?.[0] ?? [];
  const codex = _r?.[1] ?? [];
  const libRanks = _r?.[2] ?? new Map<number, number>();

  const codexMap = new Map(codex.map((c) => [c.catalogItemId, c.max]));

  // 필터·정렬은 클라(CodexGrid). 서버는 전체 카탈로그 + 획득/최고강화/해방순위만 합쳐 전달.
  const items: CodexItem[] = catalog.map((c) => ({
    id: c.id,
    code: c.code,
    name: c.name,
    slot: c.slot,
    got: codexMap.has(c.id),
    max: codexMap.get(c.id) ?? null,
    rank: libRanks.get(c.id) ?? null,
  }));

  return <CodexGrid items={items} />;
}
