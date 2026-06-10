'use client';

export type GuildRow = {
  id: string;
  name: string;
  level: number;
  memberCount: number;
  emblemUrl: string | null;
  emblemColor: string | null;
};

export function EmblemThumb({ url }: { url: string | null }) {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt="" aria-hidden className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      ) : null}
    </div>
  );
}

/** 길드 행 리스트 — 랭킹/검색/홈 랭킹탭 공용. onJoin 있으면 가입/신청 버튼 노출. */
export function GuildList({
  guilds,
  showRank,
  onJoin,
  pending,
  myRequestGuildId,
  emptyText,
}: {
  guilds: GuildRow[];
  showRank?: boolean;
  onJoin?: (id: string) => void;
  pending?: boolean;
  myRequestGuildId?: string | null;
  emptyText?: string;
}) {
  if (guilds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
        {emptyText ?? '길드가 없습니다.'}
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {guilds.map((g, i) => (
        <li
          key={g.id}
          className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
        >
          {showRank && (
            <span className="w-5 shrink-0 text-center text-xs font-bold tabular-nums text-zinc-400">
              {i + 1}
            </span>
          )}
          <EmblemThumb url={g.emblemUrl} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{g.name}</div>
            <div className="text-[11px] text-zinc-500">
              Lv.{g.level} · {g.memberCount}명
            </div>
          </div>
          {onJoin &&
            (g.id === myRequestGuildId ? (
              <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
                신청됨
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onJoin(g.id)}
                disabled={pending}
                className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
              >
                가입
              </button>
            ))}
        </li>
      ))}
    </ul>
  );
}
