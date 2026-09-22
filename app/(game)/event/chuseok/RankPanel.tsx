'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { assetUrl } from '@/lib/asset-versions';
import { CHUSEOK_RANK_LIMIT, CHUSEOK_RANK_REWARDS, rankRewardFor } from '@/lib/game/chuseok/config';
import type { BoardItem, BoardRow, ContestBoard } from '@/lib/game/chuseok/contest';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';
import { profileHref } from '@/lib/game/profile/href';

const n = (v: number) => v.toLocaleString('ko-KR');
const fmtTime = (iso: string | null) => {
  if (!iso) return '';
  const k = new Date(Date.parse(iso) + 9 * 3600 * 1000);
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, '0')}:${String(k.getUTCMinutes()).padStart(2, '0')}`;
};

function ItemImg({ code, size }: { code: string; size: number }) {
  const src = spritePath(code);
  if (!src) return <span style={{ width: size, height: size }} className="grid place-items-center text-lg">🎁</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={assetUrl(src)} alt="" aria-hidden width={size} height={size} draggable={false} className="flex-none" style={{ imageRendering: 'pixelated' }} />;
}

/** 순위 행 아바타 — 활성 프로필 정면(랭킹 4위~ 목록과 같은 표시). 없으면 첫 글자. */
function Avatar({ row }: { row: BoardRow }) {
  return (
    <span className="grid h-[34px] w-[34px] flex-none place-items-center overflow-hidden rounded-lg bg-zinc-800 text-[13px] font-bold text-zinc-300">
      {row.img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.img} loading="lazy" decoding="async" alt="" aria-hidden draggable={false} className="h-full w-full object-contain" style={{ imageRendering: 'pixelated' }} />
      ) : (
        (row.me ? '나' : row.nickname).slice(0, 1)
      )}
    </span>
  );
}

/**
 * 다음 보상 구간까지 남은 단계 — 그 구간 마지막 등수의 단계 + 1(같은 단계면 먼저 도달한 쪽이 앞서므로
 * 넘어야 한다). 10등 밖이면 "10등까지", 안이면 다음 구간(5등·3등·…)까지. 1등은 '지금 1등'.
 */
function nextLineFor(item: BoardItem, live: boolean): string | null {
  const mine = item.mine;
  if (!mine) return null;
  if (!live) return `최종 ${mine.rank}등`;
  if (mine.rank === 1) return '지금 1등';
  const target = mine.nextTierEnd ?? CHUSEOK_RANK_LIMIT;
  const targetRow = item.rows.find((r) => r.rank === target);
  const need = targetRow ? Math.max(1, targetRow.level - mine.level + 1) : null;
  return need != null ? `${target}등까지 +${n(need)}` : `${target}등까지`;
}

/**
 * 순위 세그먼트(시안 현황판) — 장비 칩 6개(그림 + 내 등수) → 장비 머리글(그림·이름·[보상 보기]) →
 * 1~10등 표(아바타·닉네임·도달 시각·단계·보상) → 화면 아래 고정된 내 자리 줄([강화하러 가기]).
 * 보상표는 공통 팝업(ModalShell + ModalLayout). 마감 뒤에는 정산 결과(확정)를 그대로 보여 준다(10/3까지).
 */
export function RankPanel({ board }: { board: ContestBoard }) {
  const [sel, setSel] = useState(board.items[0]?.code ?? '');
  const [sheet, setSheet] = useState(false);
  const item = useMemo(() => board.items.find((i) => i.code === sel) ?? board.items[0], [board.items, sel]);
  const live = board.phase === 'accrue';
  if (!item) return null;
  const mine = item.mine;
  const nextLine = nextLineFor(item, live);

  return (
    <div className="mt-3">
      {board.phase === 'before' ? <p className="mb-2 text-[11px] text-zinc-500">대회가 시작되면 순위가 표시돼요.</p> : null}

      {/* 장비 칩 — 선택이자 내 순위 요약 */}
      <div className="grid grid-cols-6 gap-1.5">
        {board.items.map((it) => {
          const on = it.code === item.code;
          return (
            <button
              key={it.code}
              type="button"
              onClick={() => setSel(it.code)}
              aria-pressed={on}
              aria-label={it.name}
              className={`flex flex-col items-center gap-px rounded-[10px] border pb-1 pt-[5px] ${on ? 'border-amber-500 bg-[#241c0c]' : 'border-zinc-800 bg-zinc-900'}`}
            >
              <ItemImg code={it.code} size={40} />
              <em className={`text-[10.5px] not-italic tabular-nums ${on ? 'font-bold text-amber-300' : 'text-zinc-400'}`}>
                {board.phase === 'before' ? ' ' : it.mine ? `${it.mine.rank}등` : '없음'}
              </em>
            </button>
          );
        })}
      </div>

      {/* 장비 머리글 */}
      <div className="mb-2 mt-3 flex items-center gap-2.5">
        <ItemImg code={item.code} size={44} />
        <div className="min-w-0 flex-1">
          <b className="block text-[14.5px]">{item.name}</b>
        </div>
        <button type="button" onClick={() => setSheet(true)} className="flex-none rounded-full border border-amber-900 px-2.5 py-1 text-[11px] font-bold text-amber-300 active:opacity-80">
          보상 보기
        </button>
      </div>

      {/* 1~10등 */}
      <ol className="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900">
        {item.rows.length === 0 ? (
          <li className="px-3 py-6 text-center text-[12px] text-zinc-500">아직 아무도 없어요. 이 장비를 강화하면 순위에 올라요.</li>
        ) : (
          item.rows.map((r) => {
            const rw = rankRewardFor(r.rank);
            const at = fmtTime(r.reachedAt);
            const inner = (
              <>
                  <span className={`w-6 flex-none text-center font-mono text-[13px] tabular-nums ${r.rank <= 3 ? 'font-bold text-amber-300' : 'text-zinc-400'}`}>{r.rank}</span>
                  <Avatar row={r} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-[13.5px] font-semibold">{r.me ? '나' : r.nickname}</b>
                    <span className="text-[10.5px] tabular-nums text-zinc-400">{at ? `${at} 도달` : ' '}</span>
                  </span>
                  <span className="flex flex-none flex-col text-right">
                    <b className="font-mono text-[14px] tabular-nums text-amber-200">+{n(r.level)}</b>
                    {rw ? <span className="text-[10px] tabular-nums text-zinc-400">💎{n(rw.diamond)} · 📦{n(rw.boxes)}</span> : null}
                  </span>
              </>
            );
            const cls = `flex h-[52px] items-center gap-2.5 border-b border-zinc-800 px-3 ${r.me ? 'bg-[#2a1f0a]' : ''}`;
            // 행을 누르면 프로필로(랭킹 화면과 같은 동선, 2026-09-23 UX 점검) — 공개 코드가 없으면(탈퇴 등) 일반 행.
            return (
              <li key={r.rank} className="last:[&>*]:border-b-0">
                {r.publicCode ? (
                  <Link prefetch={false} href={profileHref(r.publicCode, board.serverId)} className={`${cls} active:bg-zinc-800/60`}>
                    {inner}
                  </Link>
                ) : (
                  <div className={cls}>{inner}</div>
                )}
              </li>
            );
          })
        )}
      </ol>
      {board.phase === 'claim' ? (
        <p className="mt-2 text-[11px] text-zinc-500">{board.settled ? '순위 보상과 칭호는 우편함으로 보냈어요.' : '순위 보상과 칭호는 10월 1일 정산 뒤 우편으로 드려요.'}</p>
      ) : null}

      {/* 내 자리 — 목록을 스크롤해도 화면 아래(채팅 미니바 위)에 붙는다 */}
      {board.phase !== 'before' ? (
        <div className="sticky z-20 mt-2.5" style={{ bottom: 'calc(var(--chat-dock-h, 0px) + 8px)' }}>
          {mine ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-amber-500/60 bg-[#0c0c0e] px-3 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.55)]">
              <span className="w-6 flex-none text-center font-mono text-[13px] font-bold tabular-nums text-amber-300">{mine.rank}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-[13.5px] font-semibold">나</b>
                {nextLine ? <span className="text-[10.5px] tabular-nums text-amber-300">{nextLine}</span> : null}
              </span>
              <span className="flex flex-none flex-col text-right">
                <b className="font-mono text-[14px] tabular-nums text-amber-200">+{n(mine.level)}</b>
                {!live && mine.reward ? <span className="text-[10px] tabular-nums text-zinc-400">💎{n(mine.reward.diamond)} · 📦{n(mine.reward.boxes)}</span> : null}
              </span>
              {live ? (
                <Link prefetch={false} href="/enhance" className="flex-none rounded-[9px] bg-amber-600 px-2.5 py-[7px] text-[11.5px] font-extrabold text-white active:opacity-90">
                  강화하러 가기
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center rounded-xl border border-zinc-700 bg-[#0c0c0e] px-3 py-2.5 shadow-[0_6px_20px_rgba(0,0,0,0.55)]">
              <b className="text-[13px] font-medium text-zinc-400">아직 이 장비가 없어요</b>
            </div>
          )}
        </div>
      ) : null}

      {sheet ? <RewardSheet item={item} live={live} nextLine={nextLine} onClose={() => setSheet(false)} /> : null}
    </div>
  );
}

/** 순위별 보상 팝업 — 공통 팝업(헤더 · 표 카드 · 닫기). 내 구간 행 강조 + 아래 '지금 내 순위로 받는 보상' 줄. */
function RewardSheet({ item, live, nextLine, onClose }: { item: BoardItem; live: boolean; nextLine: string | null; onClose: () => void }) {
  const mine = item.mine;
  const tierLabel = (t: { from: number; to: number }) => (t.from === t.to ? `${t.from}등` : `${t.from}~${t.to}등`);
  return (
    <ModalShell onClose={onClose} label="순위별 보상">
      <ModalLayout
        title="순위별 보상"
        subtitle="장비 6종마다 따로 드려요. 여러 장비에서 순위에 들면 모두 받아요."
        bodyPad="sm"
        footer={
          <ModalButton tone="neutral" onClick={onClose}>
            닫기
          </ModalButton>
        }
      >
        <div className="px-2 pb-1 pt-1">
          <table className="w-full border-collapse text-[12.5px] tabular-nums">
            <thead>
              <tr>
                {['순위', '다이아', '상자', '칭호'].map((h) => (
                  <th key={h} className="border-b border-zinc-700 px-1.5 py-1 text-left text-[10.5px] font-semibold text-zinc-400">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHUSEOK_RANK_REWARDS.map((t) => {
                const on = !!mine && mine.rank >= t.from && mine.rank <= t.to;
                const td = `whitespace-nowrap border-b border-zinc-800 px-1.5 py-[7px] ${on ? 'bg-[#2a1f0a] text-amber-200' : ''}`;
                return (
                  <tr key={t.from}>
                    <td className={`${td} rounded-l-lg`}>{tierLabel(t)}</td>
                    <td className={td}>💎 {n(t.diamond)}</td>
                    <td className={td}>📦 {n(t.boxes)}</td>
                    <td className={`${td} rounded-r-lg text-[11.5px] text-amber-300`}>{t.from <= 3 ? '한정 칭호' : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2.5 flex items-center gap-2.5 rounded-[10px] border border-amber-500/60 bg-[#0c0c0e] px-2.5 py-2">
            {mine ? (
              <>
                <span className="w-6 flex-none text-center font-mono text-[13px] font-bold tabular-nums text-amber-300">{mine.rank}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-[12.5px]">{live ? '지금 내 순위로 받는 보상' : '최종 순위로 받는 보상'}</b>
                  {live && nextLine ? <span className="text-[10.5px] tabular-nums text-amber-300">{nextLine}</span> : null}
                </span>
                <span className="flex flex-none flex-col text-right">
                  {mine.reward ? (
                    <>
                      <b className="font-mono text-[13px] tabular-nums text-amber-200">💎 {n(mine.reward.diamond)}</b>
                      <span className="text-[10px] tabular-nums text-zinc-400">📦 {n(mine.reward.boxes)}</span>
                    </>
                  ) : (
                    <span className="text-[11px] text-zinc-400">{live ? '10등 안에 들면 받아요' : '보상 없음'}</span>
                  )}
                </span>
              </>
            ) : (
              <span className="text-[12px] text-zinc-400">이 장비를 갖고 있으면 순위에 올라요</span>
            )}
          </div>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
