'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { assetUrl } from '@/lib/asset-versions';
import {
  CHECKIN_CALENDAR,
  CHECKIN_COMPLETE_BONUS_DIAMOND,
  CHECKIN_CYCLE_DAYS,
  nextCheckinDay1Indexed,
  type CheckinReward,
} from '@/lib/game/balance';
import { useResourceToast, type HeaderReward } from '@/components/ResourceToast';

import { claimCheckinAction } from './checkin/actions';

/**
 * 출석 자동 팝업(2026-07-22, /checkin 페이지 대체 — 최종 v9 사양, 데모 협의 확정).
 * - A안 셀(일차/아이콘/수량 3단) 6+1 구성, 마일스톤 약화 강조, 지난 칸도 N일 표기
 * - 헤더 = 구 출석 페이지 히어로(황실 아카데미) 배경 재활용
 * - 수령 = 낙관적 시퀀스: 오늘 셀이 FLIP으로 보드 영역만 덮으며 확장(좌 64/우 150 고정
 *   2열 — 타이핑에도 밀림 0) → 펄스 링·샤인 스윕·팝업 미세 킥 → 수량 카운트업(착지 펀치)
 *   → 초록 정착 + 수령 완료 → 명언 타이핑. 실패 시 롤백 + 에러.
 * - 자동 닫기 없음: 받기 버튼이 닫기로 변신(동일 크기), 수령 후 배경 클릭 닫기 허용.
 * - 28일째는 칸 보상 + 완주 보너스 합계 표기·동시 지급. prefers-reduced-motion이면 연출
 *   생략(즉시 완료 상태).
 */

const fmt = (n: number) => n.toLocaleString('ko-KR');
const kstDay = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const SLOT_KO = { weapon: '무기', armor: '방어구', accessory: '장신구' } as const;
const SLOT_ICON = { weapon: '⚔️', armor: '🛡️', accessory: '💍' } as const;
const QUOTES = [
  '“꾸준함이 최고의 강화다.”',
  '“쇠는 두드릴수록 단단해진다.”',
  '“기다림은 배신하지 않는다.”',
  '“기다린 만큼 확률은 차오른다.”',
  '“인생은 유지만 해도 성공이다.”',
  '“모루 위에 요행은 없다.”',
  '“오늘은 왠지 성공할 것 같다.”',
  '“녹은 쉬는 칼에 슨다.”',
  '“망치질은 거짓말하지 않는다.”',
  '“불꽃은 견디는 자의 것이다.”',
  '“불티가 모여 검이 된다.”',
  '“인내심이 곧 전투력이다.”',
];

/** 홈 상주 게이트 — 미수령 시 팝업 + KST 자정 롤오버 감지(타이머·탭 복귀 → refresh). */
export function CheckinPopupGate({ unclaimed, dayProgress }: { unclaimed: boolean; dayProgress: number }) {
  const router = useRouter();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const arm = () => {
      const now = Date.now();
      const kstMs = now + 9 * 3600_000;
      const nextMidnight = (Math.floor(kstMs / 86_400_000) + 1) * 86_400_000 - 9 * 3600_000;
      timer = setTimeout(() => {
        router.refresh();
        arm();
      }, nextMidnight - now + 5_000);
    };
    arm();
    const mountedDay = kstDay();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && kstDay() !== mountedDay) router.refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [router]);
  if (!unclaimed) return null;
  return <CheckinPopup dayProgress={dayProgress} />;
}

function rewardIcon(r: CheckinReward): string {
  if (r.kind === 'supply_set') return '🎁';
  if (r.kind === 'supply') return SLOT_ICON[r.slot];
  return '💎';
}

/** 확장 화면 상세 보상명(사용자 확정 — 부위 명시). */
function detailName(r: CheckinReward, day: number): string {
  if (r.kind === 'supply') return `${SLOT_KO[r.slot]} 보급 상자`;
  if (r.kind === 'supply_set') return `무기·방어구·장신구 각 ${r.perSlot}개`;
  return day === CHECKIN_CYCLE_DAYS ? `완주 보너스 💎${fmt(CHECKIN_COMPLETE_BONUS_DIAMOND)} 포함` : '다이아';
}

/** 확장 화면 큰 수치 — 카운트업 목표값(28일 다이아는 완주 보너스 합계). */
function bigTotal(r: CheckinReward, day: number): number {
  if (r.kind === 'supply') return r.count;
  if (r.kind === 'supply_set') return r.perSlot * 3;
  return r.amount + (day === CHECKIN_CYCLE_DAYS ? CHECKIN_COMPLETE_BONUS_DIAMOND : 0);
}

/** CTA 라벨 — 다이아는 라벨에 💎 포함이라 아이콘 생략, 28일은 합계. */
function ctaLabel(r: CheckinReward, day: number): string {
  if (r.kind === 'diamond') return `💎${fmt(bigTotal(r, day))} 받기`;
  if (r.kind === 'supply') return `${SLOT_ICON[r.slot]} 보급 상자 ${r.count}개 받기`;
  return `🎁 보급 상자 ${r.perSlot * 3}개 받기`;
}

function rewardToasts(r: CheckinReward, bonus: number): HeaderReward[] {
  const rows: HeaderReward[] =
    r.kind === 'diamond'
      ? [{ icon: '💎', amount: r.amount }]
      : r.kind === 'supply'
        ? [{ icon: SLOT_ICON[r.slot], amount: r.count }]
        : (['weapon', 'armor', 'accessory'] as const).map((s) => ({ icon: SLOT_ICON[s], amount: r.perSlot }));
  if (bonus > 0) {
    const dia = rows.find((x) => x.icon === '💎');
    if (dia) dia.amount += bonus;
    else rows.push({ icon: '💎', amount: bonus });
  }
  return rows;
}

export function CheckinPopup({ dayProgress }: { dayProgress: number }) {
  const router = useRouter();
  const { showHeaderToast } = useResourceToast();
  const [closed, setClosed] = useState(false);
  const [fxOn, setFxOn] = useState(false); // 낙관 시퀀스 시작됨(버튼=닫기·배경 닫기 허용)
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  const panelRef = useRef<HTMLDivElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  const countRef = useRef<HTMLElement | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const placeholderRef = useRef<HTMLDivElement | null>(null);
  const claimingRef = useRef(false);

  const day = nextCheckinDay1Indexed(dayProgress); // 오늘 받을 칸(1~28)
  const week = Math.ceil(day / 7);
  const mileDay = week * 7;
  const mileReward = CHECKIN_CALENDAR[mileDay - 1]!;
  const mileLabel =
    mileReward.kind === 'diamond'
      ? `💎${fmt(mileReward.amount)}`
      : `보급 상자 ${(mileReward as { perSlot: number }).perSlot * 3}개`;
  const today = CHECKIN_CALENDAR[day - 1]!;
  const total = bigTotal(today, day);
  const weekDays = Array.from({ length: 7 }, (_, i) => (week - 1) * 7 + i + 1);
  const filled = fxOn ? day : day - 1; // 게이지 — 수령 순간 오늘 몫이 차오름

  useEffect(() => {
    const t = timersRef.current;
    return () => t.forEach(clearTimeout);
  }, []);

  if (closed) return null;

  const after = (ms: number, f: () => void) => timersRef.current.push(setTimeout(f, ms));
  const closePopup = () => {
    timersRef.current.forEach(clearTimeout);
    setClosed(true);
    router.refresh(); // 헤더 다이아·도전과제·배너 갱신
  };

  /** 확장 FLIP + 프리미엄 시퀀스(낙관) — 데모 v9와 동일 리듬. */
  const runFx = () => {
    const zone = zoneRef.current;
    const board = boardRef.current;
    const cell = todayRef.current;
    if (!zone || !board || !cell) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const kids = Array.from(cell.querySelectorAll<HTMLElement>('.ck-flip'));
    const zr = zone.getBoundingClientRect();
    const br = board.getBoundingClientRect();
    const cr = cell.getBoundingClientRect();

    // placeholder — 그리드 자리 유지(다른 칸이 밀리지 않게)
    const ph = document.createElement('div');
    ph.style.height = `${cr.height}px`;
    if (day % 7 === 0) ph.style.gridColumn = '1 / -1';
    cell.after(ph);
    placeholderRef.current = ph;

    cell.classList.add('ck-fx');
    Object.assign(cell.style, {
      top: `${cr.top - zr.top}px`,
      left: `${cr.left - zr.left}px`,
      width: `${cr.width}px`,
      height: `${cr.height}px`,
    });
    const target = {
      top: `${br.top - zr.top}px`,
      left: `${br.left - zr.left}px`,
      width: `${br.width}px`,
      height: `${br.height}px`,
    };

    if (reduced) {
      // 모션 최소화 — 즉시 완료 상태
      Object.assign(cell.style, target, { transition: 'none' });
      zone.classList.add('ck-covered');
      cell.classList.add('ck-settle');
      cell.querySelectorAll('.ck-name, .ck-tip, .ck-done').forEach((el) => el.classList.add('ck-on'));
      if (countRef.current) countRef.current.textContent = fmt(total);
      const tip = cell.querySelector('.ck-tip');
      if (tip) tip.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
      return;
    }

    const first = kids.map((k) => k.getBoundingClientRect());
    requestAnimationFrame(() => {
      Object.assign(cell.style, target);
      requestAnimationFrame(() => {
        const last = kids.map((k) => k.getBoundingClientRect());
        kids.forEach((k, i) => {
          const dx = first[i]!.left + first[i]!.width / 2 - (last[i]!.left + last[i]!.width / 2);
          const dy = first[i]!.top + first[i]!.height / 2 - (last[i]!.top + last[i]!.height / 2);
          const sc = first[i]!.height / last[i]!.height;
          k.style.transition = 'none';
          k.style.transform = `translate(${dx}px, ${dy}px) scale(${sc})`;
          requestAnimationFrame(() => {
            k.style.transition = 'transform .55s cubic-bezier(.2,.9,.3,1)';
            k.style.transform = 'none';
          });
        });
      });
      zone.classList.add('ck-covered');
    });

    // 스포트라이트 — 연출 중 주변 딤(정착 시 복귀)
    zone.classList.add('ck-spot');
    panelRef.current?.querySelectorAll('.ck-dimable').forEach((el) => el.classList.add('ck-dimmed'));

    // 확장이 멎는 순간: 펄스 링 + 샤인 스윕 + 팝업 미세 킥
    after(550, () => {
      const ring = document.createElement('div');
      ring.className = 'ck-ring';
      Object.assign(ring.style, target);
      zone.appendChild(ring);
      requestAnimationFrame(() => ring.classList.add('ck-go'));
      after(800, () => ring.remove());
      cell.classList.add('ck-shine');
      panelRef.current?.classList.add('ck-kick');
      after(320, () => panelRef.current?.classList.remove('ck-kick'));
    });
    after(500, () => cell.querySelector('.ck-name')?.classList.add('ck-on'));
    // 수량 카운트업(0.65s~) + 착지 펀치
    after(650, () => {
      const T = 600;
      const t0 = performance.now();
      const tick = (now: number) => {
        const p = Math.min(1, (now - t0) / T);
        if (countRef.current) countRef.current.textContent = fmt(Math.round(total * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(tick);
        else {
          const q = cell.querySelector('.ck-q');
          q?.classList.add('ck-land');
          after(350, () => q?.classList.remove('ck-land'));
        }
      };
      if (countRef.current) countRef.current.textContent = '0';
      requestAnimationFrame(tick);
    });
    // 초록 정착 + 수령 완료 + 스포트라이트 해제
    after(1400, () => {
      cell.classList.add('ck-settle');
      cell.querySelector('.ck-done')?.classList.add('ck-on');
      zone.classList.remove('ck-spot');
      panelRef.current?.querySelectorAll('.ck-dimable').forEach((el) => el.classList.remove('ck-dimmed'));
    });
    // 명언 타이핑(커서 없음)
    after(1600, () => {
      const tip = todayRef.current?.querySelector('.ck-tip');
      if (!tip) return;
      tip.classList.add('ck-on');
      const text = QUOTES[Math.floor(Math.random() * QUOTES.length)]!;
      let i = 0;
      const type = () => {
        tip.textContent = text.slice(0, i);
        if (i <= text.length) {
          i += 1;
          timersRef.current.push(setTimeout(type, 50));
        }
      };
      type();
    });
  };

  /** 낙관 롤백 — 서버 실패 시 확장 해제·원상 복구. */
  const rollbackFx = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    const zone = zoneRef.current;
    const cell = todayRef.current;
    zone?.classList.remove('ck-covered', 'ck-spot');
    zone?.querySelectorAll('.ck-ring').forEach((el) => el.remove());
    panelRef.current?.querySelectorAll('.ck-dimable').forEach((el) => el.classList.remove('ck-dimmed'));
    if (cell) {
      cell.classList.remove('ck-fx', 'ck-settle', 'ck-shine');
      cell.removeAttribute('style');
      cell.querySelectorAll<HTMLElement>('.ck-flip').forEach((k) => k.removeAttribute('style'));
      cell.querySelectorAll('.ck-name, .ck-tip, .ck-done').forEach((el) => el.classList.remove('ck-on'));
      const tip = cell.querySelector('.ck-tip');
      if (tip) tip.textContent = '';
    }
    if (countRef.current) countRef.current.textContent = fmt(total);
    placeholderRef.current?.remove();
    placeholderRef.current = null;
    setFxOn(false);
  };

  const claim = () => {
    if (fxOn) {
      closePopup();
      return;
    }
    if (claimingRef.current) return;
    claimingRef.current = true;
    setError(null);
    setFxOn(true); // 낙관 — 응답 대기 없이 연출 시작(버튼=닫기 즉시 전환)
    const t0 = Date.now();
    runFx();
    startTransition(async () => {
      const res = await claimCheckinAction();
      claimingRef.current = false;
      const elapsed = Date.now() - t0;
      if (res.status === 'success') {
        after(Math.max(0, 1100 - elapsed), () =>
          showHeaderToast({
            title: `출석 ${day}일째 보상 획득!`,
            rewards: rewardToasts(res.result.reward, res.result.completeBonusDiamond),
          }),
        );
      } else if (res.code === 'CHECKIN_ALREADY_CLAIMED') {
        closePopup(); // 다른 탭/기기에서 이미 수령 — 조용히 동기화
      } else {
        rollbackFx();
        setError(res.message);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-5 backdrop-blur-sm"
      onClick={fxOn ? closePopup : undefined} // 배경 클릭 닫기 — 수령 후에만(강제 수령 유지)
    >
      {/* 연출 전용 CSS — FLIP 그리드·키프레임(ck- 프리픽스, 팝업 스코프) */}
      <style>{`
        .ck-zone .ck-fade { transition:opacity .25s ease .55s; }
        .ck-zone.ck-covered .ck-fade { opacity:0; }
        .ck-fx { position:absolute; z-index:5; display:grid !important; padding:0 !important; row-gap:2px; column-gap:10px;
          grid-template-areas:"d name" "ic q" "ic tip" "ic done"; grid-template-columns:64px 150px;
          justify-content:center; align-content:center; align-items:center; overflow:hidden; box-shadow:none !important;
          transition:top .55s cubic-bezier(.2,.9,.3,1), left .55s cubic-bezier(.2,.9,.3,1), width .55s cubic-bezier(.2,.9,.3,1), height .55s cubic-bezier(.2,.9,.3,1), border-radius .55s ease, background .5s ease, border-color .5s ease; }
        .ck-fx.ck-settle { border-color:#34d399 !important; background:#04382c !important; color:#a7f3d0 !important; }
        .ck-fx .ck-d { grid-area:d; justify-self:center; height:13px; font-size:9px; }
        .ck-fx .ck-ic { grid-area:ic; justify-self:center; font-size:34px !important; line-height:1; filter:drop-shadow(0 4px 10px rgba(0,0,0,.5)); }
        .ck-fx .ck-q { grid-area:q; justify-self:start; font-size:15px !important; }
        .ck-fx .ck-name, .ck-fx .ck-tip, .ck-fx .ck-done { display:block; justify-self:start; opacity:0; transition:opacity .4s ease; }
        .ck-fx .ck-name { grid-area:name; height:14px; font-size:9.5px; font-weight:800; letter-spacing:.08em; color:#fbbf24; }
        .ck-fx .ck-tip { grid-area:tip; height:15px; font-size:10.5px; color:#fcd34d; letter-spacing:.03em; font-style:italic; }
        .ck-fx .ck-done { grid-area:done; height:14px; font-size:10px; font-weight:800; color:#6ee7b7; }
        .ck-fx .ck-on { opacity:1 !important; }
        .ck-fx::after { content:""; position:absolute; top:-30%; bottom:-30%; width:36%; left:-50%;
          background:linear-gradient(105deg, transparent, rgba(255,236,179,.28) 45%, rgba(255,255,255,.42) 50%, rgba(255,236,179,.28) 55%, transparent);
          transform:skewX(-18deg); opacity:0; pointer-events:none; }
        .ck-fx.ck-shine::after { animation:ck-shine-sweep .8s ease-out both; }
        @keyframes ck-shine-sweep { 0% { left:-50%; opacity:0; } 15% { opacity:1; } 100% { left:120%; opacity:0; } }
        .ck-ring { position:absolute; z-index:4; border:1.5px solid #fbbf24; border-radius:14px; opacity:0; pointer-events:none; }
        .ck-ring.ck-go { animation:ck-ring-out .7s ease-out both; }
        @keyframes ck-ring-out { 0% { transform:scale(1); opacity:.8; } 100% { transform:scale(1.12); opacity:0; } }
        .ck-q.ck-land { animation:ck-num-land .3s cubic-bezier(.3,1.8,.5,1); }
        @keyframes ck-num-land { 0% { transform:scale(1.3); } 100% { transform:scale(1); } }
        .ck-zone .ck-gauge, .ck-dimable { transition:opacity .4s ease; }
        .ck-zone.ck-spot .ck-gauge { opacity:.35; }
        .ck-dimable.ck-dimmed { opacity:.35; }
        .ck-kick { animation:ck-modal-kick .28s cubic-bezier(.3,1.6,.5,1); }
        @keyframes ck-modal-kick { 0% { transform:scale(1); } 40% { transform:scale(1.015); } 100% { transform:scale(1); } }
        .ck-name, .ck-tip, .ck-done { display:none; }
        .ck-flip { will-change:transform; }
      `}</style>

      <div
        ref={panelRef}
        className="relative w-full max-w-[340px] overflow-hidden rounded-2xl border border-amber-800/70 bg-zinc-900 shadow-2xl shadow-black/60"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 배경 — 황실 아카데미가 팝업 전체에 깔리고 아래로 갈수록 어두워지는 그라데이션(사용자 확정) */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/checkin/academy.png')}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-top"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/30 via-zinc-950/90 via-35% to-zinc-950/95" />

        <div className="ck-dimable relative z-10 flex h-14 flex-col items-center justify-center">
          <p className="text-pixel-outline text-sm font-extrabold text-white">출석 {day}일째</p>
          <p className="text-pixel-outline text-[10px] font-bold text-amber-100/90">{week}주 차</p>
        </div>

        <div className="relative z-10 p-4 pt-1.5">
          <div ref={zoneRef} className="ck-zone relative">
            {/* 출석판 — A안(일차/아이콘/수량 3단) 6+1, 지난 칸도 N일 표기 */}
            <div ref={boardRef} className="grid grid-cols-6 gap-x-1 gap-y-2">
              {weekDays.map((d) => {
                const r = CHECKIN_CALENDAR[d - 1]!;
                const isToday = d === day;
                const past = d < day;
                const mile = d % 7 === 0;
                const stateCls = isToday
                  ? 'border-amber-400 bg-amber-950 text-amber-200 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                  : past
                    ? 'border-zinc-800/80 bg-zinc-950/90 text-zinc-600'
                    : mile
                      ? 'border-violet-800/50 bg-violet-950/40 text-zinc-300'
                      : 'border-zinc-700/60 bg-zinc-800/90 text-zinc-400';
                const dayLabel = isToday ? '오늘' : `${d}일`;
                const fadeCls = isToday ? '' : ' ck-fade';
                const extras = isToday ? (
                  <>
                    <span className="ck-name">{detailName(r, d)}</span>
                    <span className="ck-tip" />
                    <span className="ck-done">수령 완료</span>
                  </>
                ) : null;
                const qNode =
                  r.kind === 'diamond' ? (
                    <>
                      ×<b ref={isToday ? countRef : undefined}>{fmt(bigTotal(r, d))}</b>
                    </>
                  ) : r.kind === 'supply' ? (
                    <>
                      ×<b ref={isToday ? countRef : undefined}>{r.count}</b>
                    </>
                  ) : (
                    <>
                      보급 상자 ×<b ref={isToday ? countRef : undefined}>{r.perSlot * 3}</b>
                    </>
                  );
                const doneBadge = past ? (
                  <span className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border border-emerald-600 bg-emerald-950 text-[8px] font-extrabold text-emerald-400">
                    ✓
                  </span>
                ) : null;
                if (mile) {
                  return (
                    <div
                      key={d}
                      ref={isToday ? todayRef : undefined}
                      className={`relative col-span-6 flex items-center justify-center gap-2 rounded-xl border py-3${fadeCls} ${stateCls}`}
                    >
                      {doneBadge}
                      <span className="ck-d ck-flip text-[9px] font-bold opacity-80">{dayLabel}</span>
                      <span className="ck-ic ck-flip text-[15px] leading-none">{rewardIcon(r)}</span>
                      <span className="ck-q ck-flip text-[11px] font-extrabold tabular-nums">{qNode}</span>
                      {extras}
                    </div>
                  );
                }
                return (
                  <div
                    key={d}
                    ref={isToday ? todayRef : undefined}
                    className={`relative flex flex-col items-center gap-0.5 rounded-xl border py-1.5${fadeCls} ${stateCls}`}
                  >
                    {doneBadge}
                    <span className="ck-d ck-flip text-[9px] font-bold opacity-75">{dayLabel}</span>
                    <span className="ck-ic ck-flip text-base leading-none">{rewardIcon(r)}</span>
                    <span className="ck-q ck-flip text-[10px] font-extrabold tabular-nums">{qNode}</span>
                    {extras}
                  </div>
                );
              })}
            </div>

            {/* 게이지 — 다음 큰 보상 + 완주 보너스(항상 노출), 수령 시 차오름 */}
            <div className="mt-3 space-y-2">
              <div className="ck-gauge">
                <div className="flex items-baseline justify-between text-[10px] text-zinc-400">
                  <span>
                    다음 큰 보상 <b className="text-amber-300">{mileLabel}</b>
                  </span>
                  <span className="tabular-nums">
                    {filled} / {mileDay}일
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-500 to-amber-400 transition-[width] duration-[1100ms] ease-out"
                    style={{ width: `${Math.round((filled / mileDay) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="ck-gauge">
                <div className="flex items-baseline justify-between text-[10px] text-zinc-400">
                  <span>
                    28일 완주 보너스 <b className="text-amber-300">💎{fmt(CHECKIN_COMPLETE_BONUS_DIAMOND)}</b>
                  </span>
                  <span className="tabular-nums">
                    {filled} / {CHECKIN_CYCLE_DAYS}일
                  </span>
                </div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-300 transition-[width] duration-[1100ms] ease-out"
                    style={{ width: `${Math.round((filled / CHECKIN_CYCLE_DAYS) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CTA — 받기 ↔ 닫기(동일 크기, 레이아웃 시프트 0) */}
          <button
            type="button"
            onClick={claim}
            className={`mt-3.5 flex h-10 w-full items-center justify-center rounded-xl border text-sm font-extrabold transition-colors ${
              fxOn
                ? 'border-zinc-700 bg-zinc-800 text-zinc-300 active:bg-zinc-700'
                : 'border-transparent bg-gradient-to-b from-amber-400 to-amber-600 text-amber-950 active:opacity-90'
            }`}
          >
            {fxOn ? '닫기' : ctaLabel(today, day)}
          </button>

          {error ? <p className="mt-2 text-center text-[11px] text-red-400">{error}</p> : null}
        </div>
      </div>
    </div>
  );
}
