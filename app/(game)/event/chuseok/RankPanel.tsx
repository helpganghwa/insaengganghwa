'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildEmblemImg } from '@/components/GuildEmblemImg';
import { hasRarityBorder, rarityBorderStyle } from '@/components/RarityFrame';
import { TranscendSprite } from '@/components/TranscendSprite';
import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { TitleTag } from '@/components/TitleTag';
import { assetUrl } from '@/lib/asset-versions';
import { CHUSEOK_RANK_LIMIT, CHUSEOK_RANK_REWARDS, contestTitlesFor } from '@/lib/game/chuseok/config';
import type { BoardItem, BoardRow, ContestBoard } from '@/lib/game/chuseok/contest';
import { spritePath } from '@/lib/game/equipment/sprite-manifest';

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

/** 등수별 배경 틴트·숫자색 — 대난투 순위 행과 같은 규칙(금·은·동, 내 행은 앰버). */
function rankTint(rank: number, me: boolean): string {
  if (rank === 1) return 'from-amber-400/35 via-amber-500/10';
  if (rank === 2) return 'from-slate-300/30 via-slate-300/8';
  if (rank === 3) return 'from-orange-600/30 via-orange-700/8';
  return me ? 'from-amber-500/25 via-amber-500/5' : 'from-zinc-400/10 via-transparent';
}
function rankAccent(rank: number, me: boolean): { text: string } {
  if (rank === 1) return { text: 'text-amber-200' };
  if (rank === 2) return { text: 'text-slate-100' };
  if (rank === 3) return { text: 'text-orange-200' };
  return me ? { text: 'text-amber-300' } : { text: 'text-zinc-300' };
}

/**
 * 순위 한 줄 — 대난투 순위 행과 같은 구성(우측 얼굴 배경 + 좌→우 그라데이션, 1~3등 메달). 순위 오른쪽에 장비 타일
 * (초월 테두리 + 단계, 1~3등은 해방 애니), 닉네임 옆엔 길드 문양만, 그 오른쪽에 대표 칭호(채팅 행과 같은 배치). 구분선 없음. 내 행은 '나' 배지 대신 단색 앰버 테두리(2026-09-23) —
 * 목록 테두리를 행이 나눠 갖고(첫 행 상단·끝 행 하단·양옆), 내 행은 네 변 모두 앰버, 바로 위 행은 하단선을 비워 이중선을 막는다.
 * 링크 없음(2026-09-23).
 */
function Row({ r, item }: { r: BoardRow; item: BoardItem }) {
  const medal = r.rank <= 3 ? ['🥇', '🥈', '🥉'][r.rank - 1] : null;
  const accent = rankAccent(r.rank, r.me);
  const at = fmtTime(r.reachedAt);
  return (
    <li
      data-me={r.me ? '' : undefined}
      className={`relative flex h-[56px] items-center overflow-hidden border-x border-b px-3 first:rounded-t-xl first:border-t last:rounded-b-xl [&:has(+[data-me])]:border-b-0 ${r.me ? 'border-t border-amber-400' : 'border-zinc-800'}`}
    >
      {r.avatar ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.avatar} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full" style={meleeFaceCropStyle(r.faceBox)} />
        </div>
      ) : null}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${rankTint(r.rank, r.me)} to-transparent`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950 to-transparent" />
      <div className="relative z-10 flex w-full items-center gap-2.5">
        <span className={`w-7 shrink-0 text-center font-mono text-[14px] font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${accent.text}`}>{medal ?? r.rank}</span>
        {/* 장비 타일 — 순위 바로 오른쪽(2026-09-23). 길드원 목록과 같은 표시, 1~3등은 championRank로 후광·해방 애니. */}
        <span
          className={`relative flex h-[44px] w-[44px] shrink-0 items-center justify-center overflow-hidden rounded-md border p-0.5 ${
            hasRarityBorder(r.transcend) ? '' : 'border-zinc-600'
          }`}
          style={rarityBorderStyle(r.transcend)}
        >
          <TranscendSprite code={item.code} slot={item.slot} level={r.transcend} championRank={r.rank <= 3 ? r.rank : null} size={38} frameless />
          <span className="absolute bottom-0 right-0 z-10 rounded-tl bg-black/70 px-1 text-[10px] font-extrabold leading-tight text-amber-300">+{n(r.level)}</span>
        </span>
        {/* 글자 칸은 오른쪽 얼굴 배경(w-36) 안쪽까지만 — 긴 닉네임+칭호가 얼굴 위로 올라가 잘리지 않게(2026-09-23 감사). */}
        <div className="min-w-0 max-w-[calc(100%-5.5rem)] flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="max-w-[9rem] shrink-0 truncate text-[12.5px] font-extrabold text-zinc-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{r.nickname}</span>
            {r.guildEmblemUrl ? <GuildEmblemImg src={r.guildEmblemUrl} size={12} className="shrink-0 self-center" /> : null}
            <span className="min-w-0 truncate">
              <TitleTag code={r.titleCode} executorZone={r.executorZone} executorZoneRegion={r.executorZoneRegion} still className="text-[9.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
            </span>
          </div>
          {at ? <div className="truncate text-[9.5px] tabular-nums text-zinc-400 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">{at} 도달</div> : null}
        </div>
      </div>
    </li>
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
 * 강화 순위 세그먼트 — 장비 칩 6개(그림 + 내 등수) → 장비 머리글(그림·이름·[보상 보기]) →
 * 1~10등(대난투식 행: 메달·배경 아바타·길드 마크·칭호·단계·도달 시각, 2026-09-23) → 화면 아래 고정된 내 자리 줄.
 * 보상표는 공통 팝업. 마감 뒤에는 정산 결과(확정)를 그대로 보여 준다(10/3까지).
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
      <ol className="overflow-hidden rounded-xl bg-zinc-900">
        {item.rows.length === 0 ? (
          <li className="rounded-xl border border-zinc-800 px-3 py-6 text-center text-[12px] text-zinc-500">아직 아무도 없어요. 이 장비를 강화하면 순위에 올라요.</li>
        ) : (
          item.rows.map((r) => <Row key={r.rank} r={r} item={item} />)
        )}
      </ol>
      {board.phase === 'claim' ? (
        <p className="mt-2 text-[11px] text-zinc-500">{board.settled ? '순위 보상은 우편함으로 보냈고, 칭호는 바로 드렸어요.' : '10월 1일에 순위 보상은 우편으로, 칭호는 바로 드려요.'}</p>
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

      {sheet ? <RewardSheet item={item} onClose={() => setSheet(false)} /> : null}
    </div>
  );
}

/** 순위별 보상 팝업 — 공통 팝업(헤더 · 표 카드 · 닫기). 내 순위 표시 없음, 칭호는 실제 이름으로(2026-09-23). */
function RewardSheet({ item, onClose }: { item: BoardItem; onClose: () => void }) {
  const tierLabel = (t: { from: number; to: number }) => (t.from === t.to ? `${t.from}등` : `${t.from}~${t.to}등`);
  return (
    <ModalShell onClose={onClose} label="순위별 보상">
      <ModalLayout
        title="순위별 보상"
        subtitle="장비 6종마다 따로 드려요. 칭호는 1등을 하면 2, 3등을, 2등을 하면 3등까지 모두 지급돼요."
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
                const td = 'whitespace-nowrap border-b border-zinc-800 px-1.5 py-[7px]';
                // 그 등수의 칭호(1등=만월/모란 …). 아래 등수 칭호까지 함께 받는 규칙은 부제에.
                const titleCode = t.from <= 3 ? contestTitlesFor(item.set, t.from)[0] : null;
                return (
                  <tr key={t.from}>
                    <td className={td}>{tierLabel(t)}</td>
                    <td className={td}>💎 {n(t.diamond)}</td>
                    <td className={td}>📦 {n(t.boxes)}</td>
                    <td className={`${td} text-[11.5px]`}>{titleCode ? <TitleTag code={titleCode} /> : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
