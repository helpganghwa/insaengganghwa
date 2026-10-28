'use client';

import { useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import { useDiamondActions } from '@/components/DiamondContext';
import { ModalShell } from '@/components/ModalShell';
import { ModalLayout, ModalButton } from '@/components/ModalLayout';
import { ZoomSafeInput } from '@/components/ui/ZoomSafeField';
import { parseMemberRank, type MemberRank } from '@/lib/game/guild/rank';

import { distributeTaxManualAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Role = 'leader' | 'vice' | 'member';
export type DistributeMember = {
  userId: string;
  nickname: string;
  role: Role;
  /** 길드원 등급(1~3, 길드장·부길드장은 무시) — 배지는 badgeOf로 길드장 · 부길드장 · R1~R3. */
  rank: number;
  /** 누적 기여도(= 길드 XP 기여). */
  contribution: number;
  /** 오늘(KST) 기부로 얻은 기여 — 분배 판단의 실제 기준(문의 #91). */
  todayDonation: number;
};

// 등급 배지(10-26 건의) — 길드원도 R1~R3을 보여 등급별로 나눠 주기 쉽게. 길드장·부길드장은 이름만(R5·R4 생략,
// 2026-10-28 결정), R1~R3은 서로 살짝 다른 색으로 한눈에 구분(R3 보라 · R2 초록 · R1 회색).
const RANK_BADGE_CLS: Record<MemberRank, string> = {
  3: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  2: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  1: 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-300',
};
function badgeOf(role: Role, rank: number): { label: string; cls: string } {
  if (role === 'leader') return { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' };
  if (role === 'vice') return { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' };
  const r = parseMemberRank(rank);
  return { label: `R${r}`, cls: RANK_BADGE_CLS[r] };
}

/** 배분 방식 — 고르면 전원 💎·📦가 자동으로 채워진다. */
type Mode = 'equal' | 'contribution' | 'today' | 'manual';
const MODES: { key: Mode; label: string }[] = [
  { key: 'equal', label: '균등' },
  { key: 'contribution', label: '기여 비례' },
  { key: 'today', label: '오늘 기부자' },
  { key: 'manual', label: '직접' },
];

type Share = { amount: number; boxes: number };
const fmt = (n: number) => n.toLocaleString('ko-KR');
/** 💎·📦를 한 줄로 — 0인 쪽은 뺀다(둘 다 0이면 '0'). */
const pair = (d: number, b: number) => [d > 0 ? `💎${fmt(d)}` : '', b > 0 ? `📦${fmt(b)}` : ''].filter(Boolean).join(' · ') || '0';

/**
 * 세금 분배(T1-a 확정안 + 10-11 상자 통합) — 방식을 고르면 💎·📦가 함께 채워지고, 목록에서 **바로 숫자 입력**.
 * 월드보스 전리품 상자는 세금 📦에 쌓여 💎와 같은 화면·같은 방식·한 번의 지급으로 나눈다(상자 전용 줄·팝업은 없앴다).
 * 📦는 1개 단위(부위 배분은 서버: 3의 배수는 부위 균등, 나머지 1~2개는 무작위 부위). 💎·📦 칸은 세금이 0이어도 늘 보인다(0은 흐리게).
 *
 * 종전 화면의 문제:
 *  - 길드원 전원(최대 50명)에게 입력란이 하나씩 — 대부분 0으로 남는다.
 *  - 배분 방식이 '균등' 하나뿐인데, 실제로 하는 일은 "기여한 사람에게 비례해서"다.
 *  - 판단 기준인 기여도·오늘 기부액이 이 화면에 없어 구성원 화면과 왕복해야 했다(문의 #91).
 */
export function DistributeBoard({
  myUserId,
  pool: poolStr,
  poolBoxes = 0,
  members,
}: {
  myUserId: string;
  pool: string;
  /** 세금 상자(월드보스 전리품). */
  poolBoxes?: number;
  members: DistributeMember[];
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const { optimisticAdjust } = useDiamondActions();
  const [pending, start] = useTransition();
  const pool = Number(poolStr);

  const [mode, setMode] = useState<Mode>('contribution');
  /** 사용자가 직접 고친 값만 담는다 — 방식이 준 값과 구분해 재계산 시 유지. amount·boxes 따로 덮어쓴다. */
  const [override, setOverride] = useState<Record<string, Partial<Share>>>({});
  const [expandZero, setExpandZero] = useState(false);
  const [payAsk, setPayAsk] = useState(false);

  /** 방식별 기본 배분(💎·📦 같은 비율, 내림) — override가 있으면 그 값이 이긴다. */
  const shares = useMemo(() => {
    const base: Record<string, Share> = {};
    const fill = (weightOf: (m: DistributeMember) => number) => {
      const total = members.reduce((n, m) => n + weightOf(m), 0);
      if (total <= 0) return;
      for (const m of members) {
        const w = weightOf(m);
        base[m.userId] = { amount: Math.floor((pool * w) / total), boxes: Math.floor((poolBoxes * w) / total) };
      }
    };
    if (mode === 'equal') fill(() => 1);
    else if (mode === 'contribution') fill((m) => m.contribution);
    else if (mode === 'today') fill((m) => m.todayDonation);
    // manual = 전부 0에서 시작. override는 항상 위에 얹는다.
    const out: Record<string, Share> = {};
    for (const m of members) {
      const b = base[m.userId] ?? { amount: 0, boxes: 0 };
      const o = override[m.userId];
      out[m.userId] = { amount: Math.max(0, o?.amount ?? b.amount), boxes: Math.max(0, o?.boxes ?? b.boxes) };
    }
    return out;
  }, [mode, members, pool, poolBoxes, override]);

  const shareOf = (userId: string): Share => shares[userId] ?? { amount: 0, boxes: 0 };
  const total = members.reduce((n, m) => n + shareOf(m.userId).amount, 0);
  const totalBoxes = members.reduce((n, m) => n + shareOf(m.userId).boxes, 0);
  const remaining = pool - total;
  const remainingBoxes = poolBoxes - totalBoxes;
  const over = total > pool || totalBoxes > poolBoxes;

  /** 분배 대상(💎 또는 📦 > 0) + 기여가 있는 사람은 항상 노출 — 나머지는 접는다(Set 판정, 2026-08-07 렌더 감사). */
  const { shown, hidden } = useMemo(() => {
    const s = members.filter((m) => {
      const sh = shares[m.userId];
      return (sh && (sh.amount > 0 || sh.boxes > 0)) || m.contribution > 0 || m.userId in override;
    });
    const set = new Set(s.map((m) => m.userId));
    return { shown: s, hidden: members.filter((m) => !set.has(m.userId)) };
  }, [members, shares, override]);
  const visible = expandZero ? members : shown;

  const parseN = (raw: string) => Math.max(0, Math.floor(Number(raw.replace(/[^0-9]/g, '')) || 0));
  const setAmt = (userId: string, raw: string) => setOverride((o) => ({ ...o, [userId]: { ...o[userId], amount: parseN(raw) } }));
  const setBox = (userId: string, raw: string) => setOverride((o) => ({ ...o, [userId]: { ...o[userId], boxes: parseN(raw) } }));

  /** 남은 💎·📦 전부를 이 사람에게 몰아준다 — 비례 계산의 나머지를 터는 용도. */
  const giveRest = (userId: string) => {
    const cur = shareOf(userId);
    setOverride((o) => ({ ...o, [userId]: { amount: Math.max(0, remaining) + cur.amount, boxes: Math.max(0, remainingBoxes) + cur.boxes } }));
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    setOverride({}); // 방식을 바꾸면 손댄 값도 초기화 — 섞이면 결과를 설명할 수 없다.
  };

  const payload = members
    .map((m) => ({ userId: m.userId, amount: shareOf(m.userId).amount, boxes: shareOf(m.userId).boxes }))
    .filter((x) => x.amount > 0 || x.boxes > 0);
  const canPay = (total > 0 || totalBoxes > 0) && !over && !pending;
  const hasRest = remaining > 0 || remainingBoxes > 0;

  const pay = () => {
    if (!canPay) return;
    setPayAsk(false);
    const mine = payload.find((p) => p.userId === myUserId)?.amount ?? 0;
    if (mine > 0) optimisticAdjust(BigInt(mine));
    start(async () => {
      const r = await distributeTaxManualAction(payload).catch(() => null);
      if (!r || r.status !== 'success') {
        if (mine > 0) optimisticAdjust(BigInt(-mine));
        showError(r?.code ? guildErrMsg(r.code) : '전송에 실패했어요. 다시 시도해 주세요.');
        return;
      }
      showHeaderToast({ title: `${payload.length}명에게 분배 완료`, detail: pair(total, totalBoxes) });
      setOverride({});
      // router.refresh() 제거(2026-08-20, §11.7) — distributeTaxManualAction
      // revalidatePath('/guild/distribute')가 응답 재렌더로 커버.
    });
  };

  return (
    <section className="mt-3">
      {/* 분배 가능 세금 — 💎와 📦를 한 줄에(A안). 0인 쪽은 흐리게 두되 칸은 남긴다. */}
      <div className="rounded-xl border border-amber-500/40 bg-amber-50/50 px-3 py-2.5 dark:border-amber-500/30 dark:bg-amber-500/[0.06]">
        <p className="text-[10px] font-bold tracking-wide text-zinc-400">분배 가능 세금</p>
        <p className="flex items-baseline gap-3 text-xl font-extrabold tabular-nums">
          <span className={pool > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-400/70'}>💎{fmt(pool)}</span>
          <span className={poolBoxes > 0 ? 'text-sky-600 dark:text-sky-400' : 'text-zinc-400/70'}>📦{fmt(poolBoxes)}</span>
        </p>
      </div>

      {/* 배분 방식 — 고르면 💎·📦가 자동으로 채워진다. */}
      <div className="mt-2.5 flex gap-1 rounded-xl bg-zinc-100 p-1 dark:bg-zinc-900">
        {MODES.map((m) => (
          <button
            key={m.key}
            type="button"
            onClick={() => changeMode(m.key)}
            disabled={pending}
            className={`flex-1 rounded-lg py-1.5 text-[11.5px] font-bold transition disabled:opacity-50 ${
              mode === m.key ? 'bg-white text-amber-600 shadow-sm dark:bg-zinc-950 dark:text-amber-400' : 'text-zinc-500'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {/* 분배 목록 — 💎·📦를 그 자리에서 입력. */}
      <ul className="mt-2 rounded-xl border border-zinc-200 bg-white px-3 dark:border-zinc-800 dark:bg-zinc-950">
        {visible.map((m) => {
          const badge = badgeOf(m.role, m.rank);
          const sh = shareOf(m.userId);
          return (
            <li key={m.userId} className="flex items-center gap-2 border-b border-zinc-100 py-2 last:border-b-0 dark:border-zinc-900">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[12.5px] font-semibold">{m.nickname}</span>
                  <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>{badge.label}</span>
                  {m.userId === myUserId ? <span className="shrink-0 text-[9px] font-bold text-zinc-400">나</span> : null}
                </div>
                <div className="mt-0.5 text-[10.5px] text-zinc-500">
                  기여 <b className="tabular-nums text-zinc-700 dark:text-zinc-300">{fmt(m.contribution)}</b>
                  {' · '}
                  {m.todayDonation > 0 ? (
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">오늘 {fmt(m.todayDonation)}</span>
                  ) : (
                    <span className="text-zinc-400">오늘 미기부</span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="text-[11px] text-zinc-400">💎</span>
                <ZoomSafeInput
                  inputMode="numeric"
                  value={sh.amount > 0 ? String(sh.amount) : ''}
                  onChange={(e) => setAmt(m.userId, e.target.value)}
                  placeholder="0"
                  disabled={pending}
                  wrapClassName="h-[30px] w-[66px] shrink-0"
                  className={`rounded-lg border bg-white px-1.5 text-right tabular-nums outline-none focus:border-amber-500 dark:bg-zinc-900 ${
                    sh.amount > 0 ? 'border-amber-400 dark:border-amber-500/60' : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                />
                <span className="text-[11px] text-zinc-400">📦</span>
                <ZoomSafeInput
                  inputMode="numeric"
                  value={sh.boxes > 0 ? String(sh.boxes) : ''}
                  onChange={(e) => setBox(m.userId, e.target.value)}
                  placeholder="0"
                  disabled={pending}
                  wrapClassName="h-[30px] w-[44px] shrink-0"
                  className={`rounded-lg border bg-white px-1.5 text-right tabular-nums outline-none focus:border-sky-500 dark:bg-zinc-900 ${
                    sh.boxes > 0 ? 'border-sky-400 dark:border-sky-500/60' : 'border-zinc-300 dark:border-zinc-700'
                  }`}
                />
                {hasRest ? (
                  <button
                    type="button"
                    onClick={() => giveRest(m.userId)}
                    disabled={pending}
                    aria-label={`${m.nickname}에게 남은 💎·📦 전부`}
                    className="min-h-8 rounded-md px-1 py-0.5 text-[9.5px] font-bold text-amber-600 disabled:opacity-40 dark:text-amber-400"
                  >
                    +잔여
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}

        {/* 기여 0 · 몫 0인 인원은 한 줄로 접는다 — 50명이 전부 펼쳐질 이유가 없다. */}
        {!expandZero && hidden.length > 0 ? (
          <li className="border-t border-zinc-100 py-2 dark:border-zinc-900">
            <button type="button" onClick={() => setExpandZero(true)} className="flex w-full items-center justify-between gap-2 text-left">
              <span className="text-[12px] font-semibold text-zinc-500">기여 0 · {hidden.length}명</span>
              <span className="text-[10.5px] text-zinc-400">펼쳐서 직접 주기 ⌄</span>
            </button>
          </li>
        ) : null}
      </ul>

      {/* 합계 */}
      <div className="mt-2.5 flex items-center justify-between gap-2 px-1 text-[12px]">
        <span className="min-w-0 truncate text-zinc-500">
          배분 <b className="tabular-nums text-zinc-700 dark:text-zinc-200">{pair(total, totalBoxes)}</b>
          <span className="ml-1 text-zinc-400">· {payload.length}명</span>
        </span>
        <span className={`shrink-0 ${over ? 'font-bold text-red-500' : 'text-zinc-500'}`}>
          {over ? '초과' : '남김'} <b className="tabular-nums">{over ? pair(Math.max(0, -remaining), Math.max(0, -remainingBoxes)) : pair(remaining, remainingBoxes)}</b>
        </span>
      </div>

      <button type="button" onClick={() => setPayAsk(true)} disabled={!canPay} className="mt-2 w-full rounded-xl bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-40">
        {over ? '세금을 넘었어요' : total > 0 || totalBoxes > 0 ? `${pair(total, totalBoxes)} 지급 · ${payload.length}명` : '지급'}
      </button>

      {/* 지급 확인 — 세금이 한 번에 빠져나간다. 수령인·💎·📦를 되읽어 준다. */}
      {payAsk && (
        <ModalShell onClose={() => setPayAsk(false)} onSubmit={pay} label="세금 분배 확인">
          <ModalLayout
            title="세금을 분배할까요?"
            subtitle={
              <>
                <span className="font-bold text-zinc-600 dark:text-zinc-300">{payload.length}명</span>
                <span className="mx-1 text-zinc-400">·</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">총 {pair(total, totalBoxes)}</span>
              </>
            }
            maxBodyClass="max-h-[46vh]"
            footer={
              <>
                <ModalButton tone="ghost" onClick={() => setPayAsk(false)} disabled={pending}>
                  취소
                </ModalButton>
                <ModalButton tone="primary" onClick={pay} disabled={pending}>
                  지급
                </ModalButton>
              </>
            }
          >
            <ul className="space-y-1">
              {payload.map((p) => {
                const m = members.find((x) => x.userId === p.userId)!;
                return (
                  <li key={p.userId} className="flex items-center justify-between gap-2 text-[12.5px]">
                    <span className="truncate text-zinc-600 dark:text-zinc-300">
                      {m.nickname}
                      <span className={`ml-1 rounded-full px-1.5 py-0 text-[9px] font-bold ${badgeOf(m.role, m.rank).cls}`}>{badgeOf(m.role, m.rank).label}</span>
                      {p.userId === myUserId ? <span className="ml-1 text-[10px] font-bold text-amber-500">나</span> : null}
                    </span>
                    <span className="shrink-0 font-mono font-bold tabular-nums">{pair(p.amount, p.boxes)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 border-t border-zinc-200 pt-2 text-[11px] text-zinc-500 dark:border-zinc-700">
              지급 후 남는 세금 {pair(remaining, remainingBoxes)} · 되돌릴 수 없어요.
            </p>
          </ModalLayout>
        </ModalShell>
      )}
    </section>
  );
}
