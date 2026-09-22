'use client';

import { useMemo, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { CHUSEOK_RANK_LIMIT, CHUSEOK_RANK_REWARDS, rankRewardFor } from '@/lib/game/chuseok/config';
import type { BoardItem, ContestBoard } from '@/lib/game/chuseok/contest';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

const n = (v: number) => v.toLocaleString('ko-KR');
/** 칩용 짧은 이름(6칸에 들어가야 한다). */
const SHORT: Record<string, string> = {
  chuseok_moon_wand: '달그림자 완드',
  chuseok_rabbit_pestle: '절굿공이',
  chuseok_jade_hanbok: '옥색 한복',
  chuseok_rabbit_suit: '토끼 옷',
  chuseok_bok_pouch: '복주머니',
  chuseok_rabbit_ears: '토끼 귀',
};
const shortName = (code: string, name: string) => SHORT[code] ?? name;
const fmtTime = (iso: string | null) => {
  if (!iso) return '';
  const d = new Date(iso);
  const k = new Date(d.getTime() + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
};

/**
 * 순위 세그먼트 — 아이템 칩 6개 → 그 아이템의 1~10등(행마다 보상) → 내 자리 줄("다음 보상 구간까지 +N").
 * 보상표는 공통 팝업. 마감 뒤에는 정산 결과(확정)를 그대로 보여 준다(10/3까지).
 */
export function RankPanel({ board }: { board: ContestBoard }) {
  const [sel, setSel] = useState(board.items[0]?.code ?? '');
  const [sheet, setSheet] = useState(false);
  const item = useMemo(() => board.items.find((i) => i.code === sel) ?? board.items[0], [board.items, sel]);
  const live = board.phase === 'accrue';
  if (!item) return null;

  // 다음 보상 구간까지 필요한 단계 — 그 구간 마지막 등수 행의 단계 + 1(같은 단계면 먼저 도달한 쪽이 앞서므로 넘어야 한다).
  const mine = item.mine;
  let nextLine: string | null = null;
  if (mine && live) {
    if (mine.rank === 1) nextLine = '지금 1등';
    else {
      const target = mine.nextTierEnd ?? CHUSEOK_RANK_LIMIT;
      const targetRow = item.rows.find((r) => r.rank === target);
      const need = targetRow ? Math.max(1, targetRow.level - mine.level + 1) : null;
      nextLine = need != null ? `${target}등까지 +${n(need)}` : `${target}등까지`;
    }
  }

  return (
    <div className="mt-3">
      {board.phase === 'before' ? <p className="mb-2 text-[11px] text-zinc-500">대회가 시작되면 순위가 표시돼요.</p> : null}
      {/* 아이템 칩 */}
      <div className="grid grid-cols-6 gap-1.5">
        {board.items.map((it) => {
          const on = it.code === item.code;
          const src = spritePath(it.code);
          return (
            <button
              key={it.code}
              type="button"
              onClick={() => setSel(it.code)}
              className={`flex flex-col items-center rounded-xl border px-0 pb-1 pt-1.5 ${on ? 'border-amber-500 bg-[#241c0c]' : 'border-zinc-800 bg-zinc-900'}`}
              aria-pressed={on}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={assetUrl(src)} alt="" aria-hidden width={28} height={28} draggable={false} style={{ imageRendering: 'pixelated' }} />
              ) : (
                <span className="text-lg">🎁</span>
              )}
              <small className={`mt-0.5 max-w-full truncate px-0.5 text-[9.5px] ${on ? 'text-amber-200' : 'text-zinc-400'}`}>{shortName(it.code, it.name)}</small>
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <b className="text-[13px]">
          {item.name} <span className="ml-1 text-[11px] font-medium text-zinc-500">참가 {n(item.participants)}명</span>
        </b>
        <button type="button" onClick={() => setSheet(true)} className="text-[11px] text-amber-300 underline underline-offset-2">
          순위별 보상
        </button>
      </div>

      {/* 순위표 */}
      <div className="mt-2 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {item.rows.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-zinc-500">아직 아무도 없어요. 이 장비를 강화하면 순위에 올라요.</p>
        ) : (
          item.rows.map((r) => {
            const rw = rankRewardFor(r.rank);
            return (
              <div
                key={r.rank}
                className={`flex h-11 items-center gap-2.5 border-b border-zinc-800 px-3 last:border-b-0 ${r.me ? 'bg-amber-500/10' : ''} ${r.rank <= 3 ? 'text-amber-100' : ''}`}
              >
                <span className={`w-5 font-mono text-[12px] tabular-nums ${r.rank <= 3 ? 'font-bold text-amber-300' : 'text-zinc-400'}`}>{r.rank}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px]">
                  {r.nickname}
                  {r.me ? <span className="ml-1 text-[10px] text-amber-300">나</span> : null}
                </span>
                <span className="font-mono text-[12.5px] tabular-nums">+{n(r.level)}</span>
                <span className="w-[74px] text-right text-[10px] tabular-nums text-zinc-500">{fmtTime(r.reachedAt)}</span>
                <span className="w-[86px] text-right text-[10px] tabular-nums text-zinc-400">{rw ? `💎${n(rw.diamond)} 📦${rw.boxes}` : ''}</span>
              </div>
            );
          })
        )}
      </div>

      {/* 내 자리 */}
      {mine ? (
        <div className="mt-2.5 flex items-center gap-2.5 rounded-xl border border-amber-500/60 bg-zinc-900 px-3 py-2.5">
          <span className="font-mono text-[13px] font-bold tabular-nums text-amber-300">{mine.rank}등</span>
          <span className="min-w-0 flex-1 text-[12px]">
            내 순위 · +{n(mine.level)}
            {nextLine ? <span className="ml-2 text-amber-200">{'· '}{nextLine}</span> : null}
          </span>
          <span className="text-[11px] tabular-nums text-zinc-300">{mine.reward ? `💎${n(mine.reward.diamond)} 📦${mine.reward.boxes}` : '보상 없음'}</span>
        </div>
      ) : board.phase !== 'before' ? (
        <p className="mt-2.5 text-[11px] text-zinc-500">이 장비를 갖고 있으면 순위에 올라요. 보급 상자에서 얻을 수 있어요.</p>
      ) : null}

      {sheet ? <RewardSheet item={item} onClose={() => setSheet(false)} /> : null}
    </div>
  );
}

function RewardSheet({ item, onClose }: { item: BoardItem; onClose: () => void }) {
  const mine = item.mine;
  return (
    <ModalShell onClose={onClose} label="순위별 보상" className="w-[320px] rounded-2xl bg-zinc-950 p-4">
      <h2 className="text-center text-[14px] font-extrabold">순위별 보상</h2>
      <p className="mt-0.5 text-center text-[11px] text-zinc-500">장비마다 따로 줍니다. 상자는 세 부위에 같은 수로 나뉘어요.</p>
      <table className="mt-3 w-full text-[12px]">
        <tbody>
          {CHUSEOK_RANK_REWARDS.map((t) => {
            const on = mine && mine.rank >= t.from && mine.rank <= t.to;
            return (
              <tr key={t.from} className={`border-b border-zinc-800 ${on ? 'bg-amber-500/10 text-amber-100' : ''}`}>
                <td className="py-1.5 pr-2 font-bold">{t.from === t.to ? `${t.from}등` : `${t.from}~${t.to}등`}</td>
                <td className="py-1.5 text-right font-mono tabular-nums">💎{n(t.diamond)}</td>
                <td className="py-1.5 pl-3 text-right font-mono tabular-nums">📦{t.boxes}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-3 rounded-lg border border-amber-500/60 px-3 py-2 text-[12px]">
        {mine ? (
          mine.reward ? (
            <>
              <b>지금 내 순위로 받는 보상</b> · {mine.rank}등
              <div className="mt-0.5 font-mono tabular-nums text-amber-200">
                💎{n(mine.reward.diamond)} · 📦{mine.reward.boxes}
              </div>
            </>
          ) : (
            <>
              <b>지금 {mine.rank}등</b> · 10등 안에 들면 보상을 받아요
            </>
          )
        ) : (
          <>이 장비를 갖고 있으면 순위에 올라요</>
        )}
      </div>
      <button type="button" onClick={onClose} className="mt-3 w-full rounded-xl bg-zinc-800 py-2.5 text-[12.5px] font-bold text-zinc-200">
        닫기
      </button>
    </ModalShell>
  );
}
