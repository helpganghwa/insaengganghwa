import { NextResponse } from 'next/server';

import { loadHistoryDay } from '@/lib/game/history/loaders';

export const dynamic = 'force-dynamic';

/**
 * 역사 페이지 하루치(2026-09-16) — 공개 GET. 지나간 날은 불변이라 CDN 10분 캐시 + 하루 stale.
 * 운영자 검수 수정은 최대 10분 뒤 반영(사용자 결정: 갱신은 검수 후, 실시간 불필요).
 */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const serverId = Number(u.searchParams.get('s') ?? '1');
  const day = u.searchParams.get('day') ?? '';
  if (!Number.isInteger(serverId) || serverId < 1 || serverId > 99 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const data = await loadHistoryDay(serverId, day).catch((e) => {
    console.error('[history.day]', (e as Error).message);
    return null;
  });
  if (!data) return NextResponse.json({ error: 'not found' }, { status: 404, headers: { 'Cache-Control': 'public, s-maxage=60' } });
  return NextResponse.json(data, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=86400' } });
}
