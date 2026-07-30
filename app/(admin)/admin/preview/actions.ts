'use server';

import { revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/require-admin';
import { db } from '@/lib/db/client';
import { guilds, worldChronicle, zones } from '@/lib/db/schema/guild';

type Result = { status: 'success' } | { status: 'error'; message: string };

/**
 * 어드민이 손으로 넣거나 고친 2필드 마커에 불변 id 부착(0141) — 생성 경로(enrichMarkers)와 동일
 * 규칙. 없으면 이름 기반 레거시로 저장돼, 막아둔 동명 재사용 오귀속이 수정 경로로 되살아난다.
 * 길드는 현존 매핑 실패 시 0(해산 센티널), 구역은 매핑 실패 시 그대로(표시 전용).
 */
async function attachMarkerIds(serverId: number, s: string): Promise<string> {
  const [guildRows, zoneRows] = await Promise.all([
    db.select({ id: guilds.id, name: guilds.name }).from(guilds).where(eq(guilds.serverId, serverId)),
    db.select({ id: zones.id, name: zones.name }).from(zones).where(eq(zones.serverId, serverId)),
  ]);
  const gid = new Map(guildRows.map((g) => [g.name, Number(g.id)]));
  const zid = new Map(zoneRows.map((z) => [z.name, z.id]));
  return s
    .replace(/\{g\|([^}|]+)\}/g, (_m, n: string) => `{g|${n.trim()}|${gid.get(n.trim()) ?? 0}}`)
    .replace(/\{z\|([^}|]+)\}/g, (m, n: string) => {
      const id = zid.get(n.trim());
      return id != null ? `{z|${n.trim()}|${id}}` : m;
    });
}

/**
 * 연대기 수정 — 자정 공개 전 검수 창(23:05~24:00)에서 헤드라인/본문 교정.
 * 공개 후 수정도 허용(월드 화면은 매 조회 DB 읽기 — 즉시 반영).
 */
export async function updateChronicleAction(input: {
  serverId: number;
  kstDay: string; // 'YYYY-MM-DD'
  headline: string;
  todayText: string;
}): Promise<Result> {
  try {
    await requireAdmin();
    const headline = await attachMarkerIds(input.serverId, input.headline.trim().slice(0, 200));
    const todayText = await attachMarkerIds(input.serverId, input.todayText.trim().slice(0, 4000));
    // 헤드라인은 빈 값이 정상(큰 사건 없는 날 = '') — 빈 헤드라인 날에 본문 수정 저장이
    // 항상 거부되던 버그(07-17 검수 수정 미반영 사건). 본문만 필수.
    if (!todayText) return { status: 'error', message: '본문을 입력하세요.' };
    const rows = await db
      .update(worldChronicle)
      .set({ headline, todayText })
      .where(
        and(
          eq(worldChronicle.serverId, input.serverId),
          eq(worldChronicle.kstDay, input.kstDay),
        ),
      )
      .returning({ kstDay: worldChronicle.kstDay });
    if (rows.length === 0) return { status: 'error', message: '해당 일자 연대기가 없습니다.' };
    revalidatePath('/admin/preview');
    revalidatePath('/guild/map');
    return { status: 'success' };
  } catch (e) {
    console.error('[admin.preview] chronicle update', (e as Error).message);
    return { status: 'error', message: '저장 중 오류가 발생했습니다.' };
  }
}

