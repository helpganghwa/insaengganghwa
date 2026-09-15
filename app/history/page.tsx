import { loadHistoryIndex } from '@/lib/game/history/loaders';
import { assetUrl } from '@/lib/asset-versions';

import { HistoryPlayer } from './HistoryPlayer';

export const dynamic = 'force-dynamic';

/**
 * 역사 재생 메인(2026-09-16, 시안 v2 01) — 첫날부터 최신 공개일까지 하루씩 지도를 이어 재생한다.
 * `?s=서버`(기본 1) · `?day=YYYY-MM-DD`(그날부터 시작). 데이터는 역사 DB 스코프(스테이징=프로덕션 읽기 전용).
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const s = Number(typeof sp.s === 'string' ? sp.s : '1');
  const serverId = Number.isInteger(s) && s >= 1 && s <= 99 ? s : 1;
  const startDay = typeof sp.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(sp.day) ? sp.day : null;
  const index = await loadHistoryIndex(serverId).catch((e) => {
    console.error('[history.index]', (e as Error).message);
    return null;
  });
  if (!index || index.days.length === 0) {
    return (
      <main className="mx-auto max-w-[1100px] px-4 py-16 text-center text-stone-400">
        <p className="text-[15px] font-bold text-stone-200">아직 기록된 역사가 없습니다.</p>
        <p className="mt-1 text-[12.5px]">첫 점령전이 끝나면 자정에 첫 기록이 열립니다.</p>
      </main>
    );
  }
  return <HistoryPlayer index={index} mapSrc={assetUrl('/sprites/guild/worldmap.png')} startDay={startDay} />;
}
