import type { Metadata } from 'next';

import { EmblemChain } from '@/components/EmblemChain';
import { loadHistoryIndex, parseHistoryServerId } from '@/lib/game/history/loaders';
import { SERIF } from '@/app/wiki/theme';

import { ComingSoonBook } from '../ComingSoonBook';

export const dynamic = 'force-dynamic';

/**
 * 역사 위키 · 길드(2026-09-18) — 준비 중. 오른쪽 면에 역사에 이름을 올린 길드의 깃발을 등장 순으로 옅게 건다(실제 이름·색·문양).
 * 내용이 없어 검색 색인은 막는다.
 */
export const metadata: Metadata = {
  title: '길드',
  robots: { index: false, follow: true },
};

const SHOWN = 8;

export default async function HistoryGuildsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // 서버는 쿼리스트링으로만 구분한다(2026-09-21 ⑦) — 종전에는 1서버가 박혀 있어
  // `?s=2`로 들어와도 1서버 길드 깃발이 떴다.
  const serverId = parseHistoryServerId((await searchParams).s);
  const index = await loadHistoryIndex(serverId).catch(() => null);
  const all = index
    ? Object.entries(index.guildsById)
        .map(([id, g]) => ({
          id: Number(id),
          name: g.namesFrom.at(-1)?.[1] ?? g.name,
          color: g.color ?? '#9a917f',
          first: g.namesFrom[0]?.[0] ?? 0,
          urls: [
            ...new Set([
              ...(g.emblemUrl ? [g.emblemUrl] : []),
              ...(index.emblemHistory[Number(id)] ?? []),
            ]),
          ],
        }))
        .sort((a, b) => a.first - b.first || a.id - b.id)
    : [];
  const banners = all.slice(0, SHOWN);
  return (
    <ComingSoonBook
      title="길드"
      lead="결성부터 오늘까지, 길드마다 걸어온 길을 모으고 있습니다."
      caption={all.length > 0 ? `지금까지 역사에 이름을 올린 길드 ${all.length}곳` : undefined}
      gallery={
        <div className="grid grid-cols-4 gap-x-3 gap-y-6">
          {banners.map((g) => (
            <div key={g.id} className="flex min-w-0 flex-col items-center">
              <i className="block h-[3px] w-[46px] rounded-full bg-[#6d6455]" />
              <div
                className="relative h-[62px] w-[38px]"
                style={{
                  background: `linear-gradient(to bottom, rgba(0,0,0,.14), transparent 22%), ${g.color}`,
                  clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 80%, 0 100%)',
                  filter: 'saturate(.6) sepia(.2)',
                }}
              >
                <EmblemChain
                  urls={g.urls}
                  className="absolute top-2.5 left-1/2 h-5 w-5 -translate-x-1/2"
                />
              </div>
              <span className="mt-1.5 max-w-full truncate text-[10.5px] font-bold" style={SERIF}>
                {g.name}
              </span>
            </div>
          ))}
          {Array.from({ length: Math.max(0, 4 - banners.length) }, (_, i) => (
            <div key={`e${i}`} className="flex flex-col items-center">
              <i className="block h-[3px] w-[46px] rounded-full bg-[#b8ae9a]" />
              <div className="h-[62px] w-[38px] border border-dashed border-[#c9bfa9]" />
            </div>
          ))}
        </div>
      }
    />
  );
}
