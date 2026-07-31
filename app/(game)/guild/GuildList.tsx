'use client';

import { useState } from 'react';

import { guildCapacity } from '@/lib/game/guild/balance';

import { GuildInfoModal } from './GuildInfoModal';
import {
  EmblemThumb,
  JoinPolicyBadge,
  KakaoOpenchatBadge,
  fmtNum,
  type GuildRow,
} from './guild-row';

export { EmblemThumb };
export type { GuildRow };

/**
 * 길드 행 리스트 — 목록/검색 공용(랭킹은 GuildRankingBoard가 따로 그린다).
 *
 * B-1 확정안(2026-07-30) — 가입을 **누르기 전에** 판단이 서야 한다:
 *  - 정원을 `N/cap명`으로 항상 보여주고, 찼으면 가입 버튼을 잠근다.
 *    종전엔 정원이 안 보여 신청 후 GUILD_FULL로 거절당했다.
 *  - 셋째 줄은 길드장. 길드 단위 '오늘 활동 N건'보다 승인·운영을 할 사람이
 *    누구인지가 실질 판단 기준이다(사용자 결정).
 */
export function GuildList({
  guilds,
  onJoin,
  pending,
  myRequestGuildId,
  emptyText,
}: {
  guilds: GuildRow[];
  onJoin?: (id: string) => void;
  pending?: boolean;
  myRequestGuildId?: string | null;
  emptyText?: string;
}) {
  // 길드 클릭 시 정보·소개 팝업.
  const [selected, setSelected] = useState<GuildRow | null>(null);
  if (guilds.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-700">
        {emptyText ?? '길드가 없어요.'}
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-2">
        {guilds.map((g) => {
          const cap = guildCapacity(g.level);
          const full = g.memberCount >= cap;
          return (
            <li
              key={g.id}
              className="flex items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              {/* 정보 영역 클릭 → 길드 정보·소개 팝업(가입 버튼은 형제라 별개 동작) */}
              <button
                type="button"
                onClick={() => setSelected(g)}
                className="flex min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-70"
              >
                <EmblemThumb url={g.emblemUrl} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">{g.name}</span>
                    <JoinPolicyBadge policy={g.joinPolicy} />
                    {g.hasOpenchat ? <KakaoOpenchatBadge /> : null}
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Lv.{g.level} ·{' '}
                    <span className={full ? 'font-bold text-zinc-400' : undefined}>
                      {g.memberCount}/{cap}명
                    </span>
                    {full ? ' · 정원 참' : g.zones.length > 0 ? ` · 점령 ${g.zones.length}` : ''}
                  </div>
                  {g.leaderNickname ? (
                    <div className="truncate text-[11px] text-zinc-500">
                      <span className="text-zinc-400">길드장</span>{' '}
                      <span className="font-medium text-zinc-600 dark:text-zinc-300">
                        {g.leaderNickname}
                      </span>
                    </div>
                  ) : null}
                </div>
                {/* 전투력(길드원 전투력 합) */}
                <div className="shrink-0 text-right">
                  <div className="text-[9px] leading-none text-zinc-400">전투력</div>
                  <div className="mt-0.5 text-[13px] font-bold tabular-nums text-amber-600 dark:text-amber-400">
                    {fmtNum(g.combat)}
                  </div>
                </div>
              </button>
              {onJoin ? <JoinCell guild={g} full={full} onJoin={onJoin} pending={pending} myRequestGuildId={myRequestGuildId} /> : null}
            </li>
          );
        })}
      </ul>

      {selected && <GuildInfoModal guild={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

/** 가입 셀 — 신청됨 / 정원 참(잠금) / 가입·신청. 정원 참은 눌러도 실패하므로 미리 막는다. */
function JoinCell({
  guild,
  full,
  onJoin,
  pending,
  myRequestGuildId,
}: {
  guild: GuildRow;
  full: boolean;
  onJoin: (id: string) => void;
  pending?: boolean;
  myRequestGuildId?: string | null;
}) {
  if (guild.id === myRequestGuildId) {
    return (
      <span className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800">
        신청됨
      </span>
    );
  }
  if (full) {
    return (
      <span
        className="shrink-0 rounded-full bg-zinc-100 px-3 py-1.5 text-[11px] font-bold text-zinc-400 dark:bg-zinc-800"
        title="정원이 찼습니다"
      >
        정원
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onJoin(guild.id)}
      disabled={pending}
      className="shrink-0 rounded-full bg-amber-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
    >
      {guild.joinPolicy === 'open' ? '가입' : '신청'}
    </button>
  );
}
