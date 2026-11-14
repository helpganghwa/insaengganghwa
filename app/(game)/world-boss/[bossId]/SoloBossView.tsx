'use client';

/**
 * 개인 월드보스(그림자 거미 여왕, 0253) 화면 — 시안 v6(11-13 사용자 승인) 그대로.
 * 첫 화면 = 순위표(10위 + 내 줄) · 도전 준비(내 장비 탑 규칙·부위 비율) · 전투(서버가 10타를 한 번에 저장, 공격 버튼으로 하나씩 공개) · 결과 카드.
 * 참가자 수는 어디에도 보이지 않는다. 운영자 소환 사실도 쓰지 않는다.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { josa } from 'josa';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';

import { ExtraBuyButton } from '@/components/ExtraBuyButton';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { meleeFaceCropStyle, type FaceBox } from '@/components/faceCrop';
import { TitleTag } from '@/components/TitleTag';
import { BackFab } from '@/components/BackNav';
import { GuildBadge } from '@/components/GuildBadge';
import { ModalShell } from '@/components/ModalShell';
import { assetUrl } from '@/lib/asset-versions';
import { Ticker } from '@/components/Ticker';
import { useResourceToast } from '@/components/ResourceToast';
import * as haptic from '@/lib/game/haptic';
import { sounds } from '@/lib/game/sound';
import { modalHistory } from '@/lib/ui/modal-history';
import {
  SOLO_PATTERN_LABEL,
  SOLO_RANK_REWARDS,
  soloPhaseBonus,
  soloPhaseFor,
  rollSoloRun,
  soloRankReward,
  soloRunScore,
  soloShareOf,
  soloSharePct,
  soloShareReward,
  SOLO_JOIN_REWARD,
  SOLO_SHARE_POOL,
  type SoloHit,
  type SoloSlot,
} from '@/lib/game/world-boss/solo';
import type { SoloDetail } from '@/lib/game/world-boss/solo-types';

import { soloEquipAction, soloEquipBestAction, soloPickAvatarAction, soloRunAction } from '../actions';

export type SoloFx = { idle: string; crouch: string; climb: string; bind: string; expose: string; webshot: string; webnet: string };
type Run = Awaited<ReturnType<typeof soloRunAction>> extends infer R ? (R extends { status: 'success'; run: infer X } ? X : never) : never;

const PIX = { imageRendering: 'pixelated' as const };
const SLOTS: SoloSlot[] = ['weapon', 'armor', 'accessory'];
const SLOT_KO: Record<SoloSlot, string> = { weapon: '무기', armor: '방어구', accessory: '장신구' };
const MEDAL = ['🥇', '🥈', '🥉'];
const n = (v: number) => v.toLocaleString('ko-KR');
/** 억·만 표기(64.6만 · 120만 · 1억 800만). */
function man(v: number): string {
  if (v >= 1e8) {
    const m = Math.floor((v % 1e8) / 1e4);
    return `${Math.floor(v / 1e8)}억${m ? ` ${n(m)}만` : ''}`;
  }
  if (v >= 1e4) {
    const x = v / 1e4;
    return `${(x < 100 ? Math.round(x * 10) / 10 : Math.floor(x)).toLocaleString('ko-KR')}만`;
  }
  return n(v);
}
const rewardText = (r: { diamond: number; boxes: number }) => `💎${n(r.diamond)} 📦${n(r.boxes)}`;
/** 숫자 롤링 — from에서 to까지 ms 동안 감속하며 올라간다(공격 화면 '이번 피해', 11-13 사용자). 새로 굴리면 앞 굴림은 멈춘다. */
const rolling = new WeakMap<Element, number>();
function rollNumber(el: HTMLElement, from: number, to: number, ms: number) {
  const prev = rolling.get(el);
  if (prev) cancelAnimationFrame(prev);
  if (ms <= 0 || from === to) {
    el.textContent = n(to);
    return;
  }
  let t0 = 0;
  const step = (t: number) => {
    if (!t0) t0 = t;
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = n(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))));
    if (k < 1) rolling.set(el, requestAnimationFrame(step));
    else rolling.delete(el);
  };
  rolling.set(el, requestAnimationFrame(step));
}
const PATTERN_TONE: Record<string, string> = { crouch: 'text-sky-300', weapon: 'text-violet-300', armor: 'text-violet-300', accessory: 'text-violet-300', dodge: 'text-slate-300', expose: 'text-rose-300' };

/** 채팅 미니바 위에 떠 있는 버튼 줄(11-13 사용자) — 길드 생성 버튼과 같은 자리 계산(--chat-dock-h). 아래 빈칸이 내용이 가려지지 않게 받친다. */
function FloatingBar({ children }: { children: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="h-24" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-10 mx-auto max-w-[390px]">
        <div className="bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent px-3 pt-6 pb-[calc(env(safe-area-inset-bottom)+72px+var(--chat-dock-h,0px))]">
          <div className="pointer-events-auto flex h-12 gap-2 [&>*]:shadow-[0_6px_18px_rgba(0,0,0,.55)]">{children}</div>
        </div>
      </div>
    </>
  );
}

function PrimaryButton({ children, className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} className={`flex-1 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 text-[14px] font-black text-violet-50 shadow-[0_2px_10px_rgba(0,0,0,.4)] active:scale-[.97] disabled:cursor-not-allowed disabled:from-slate-700 disabled:to-slate-800 disabled:text-slate-400 disabled:active:scale-100 ${className}`}>
      {children}
    </button>
  );
}
function SecondaryButton({ children, className = '', ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...p} className={`flex-1 rounded-xl border border-violet-400/40 bg-slate-950 text-[13px] font-extrabold text-slate-200 disabled:text-slate-500 ${className}`}>
      {children}
    </button>
  );
}

type SoloMe = NonNullable<SoloDetail['me']>;
/** 탑 규칙으로 이 아바타(keys) 기준 부위마다 가장 센 요구 장비 — 낙관적 화면용(서버 soloLoadoutForAvatar와 같은 규칙). 요구 장비가 없는 부위는 지금 장착을 ×0으로 둔다. */
function loadoutWith(me: SoloMe, keys: Partial<Record<SoloSlot, string>> | null) {
  const pieces = SLOTS.flatMap((slot): SoloMe['pieces'] => {
    let best: (typeof me.requiredItems)[number] | null = null;
    let bestV = -1;
    for (const it of me.requiredItems) {
      if (it.slot !== slot) continue;
      const v = it.cp * (keys && keys[slot] === it.key ? 2 : 1);
      if (v > bestV || (v === bestV && it.equipped)) {
        best = it;
        bestV = v;
      }
    }
    if (best) {
      const mult: 0 | 1 | 2 = keys && keys[slot] === best.key ? 2 : 1;
      return [{ slot, key: best.key, name: best.name, level: best.level, transcend: best.transcend, cp: best.cp, mult, score: best.cp * mult, src: best.src }];
    }
    const cur = me.pieces.find((x) => x.slot === slot);
    return cur ? [{ ...cur, mult: 0 as const, score: 0 }] : [];
  });
  const power = { weapon: 0, armor: 0, accessory: 0 };
  for (const p of pieces) power[p.slot] += p.score;
  return { pieces, power, total: power.weapon + power.armor + power.accessory };
}
/** 추천 장착 — 보유 아바타 전부(+ 지금 대표가 기본이면 '그대로') 중 가장 센 조합. */
function bestOverall(me: SoloMe) {
  const customs = me.avatars.filter((a) => a.keys);
  const cands: { id: string | null; keys: Partial<Record<SoloSlot, string>> | null }[] = customs.some((a) => a.active) ? customs : [{ id: null, keys: null }, ...customs];
  let top: { id: string | null; keys: Partial<Record<SoloSlot, string>> | null; lo: ReturnType<typeof loadoutWith> } | null = null;
  for (const c of cands) {
    const lo = loadoutWith(me, c.keys);
    if (!top || lo.total > top.lo.total) top = { ...c, lo };
  }
  return top!;
}
/** 장착·아바타가 바뀐 뒤의 내 정보(낙관적) — 장착 표시·추천 장착 미리 보기까지 다시 맞춘다. */
function meAfter(me: SoloMe, pieces: SoloMe['pieces'], avatarId: string | null): Partial<SoloMe> {
  const power = { weapon: 0, armor: 0, accessory: 0 };
  for (const p of pieces) power[p.slot] += p.score;
  const on = new Set(pieces.map((p) => p.key));
  const avatars = avatarId ? me.avatars.map((a) => ({ ...a, active: a.id === avatarId })) : me.avatars;
  const cur = avatars.find((a) => a.active);
  const next: SoloMe = { ...me, pieces, power, avatars, requiredItems: me.requiredItems.map((it) => ({ ...it, equipped: on.has(it.key) && pieces.some((p) => p.slot === it.slot && p.key === it.key) })), avatarSouth: cur?.south ?? me.avatarSouth, hasAvatar: !!cur?.keys };
  const best = bestOverall(next);
  const total = power.weapon + power.armor + power.accessory;
  return { ...next, bestPower: best.lo.total > total ? best.lo.total : null };
}

export function SoloBossView({ detail, spriteSrc, bgSrc, fx, bossName }: { detail: SoloDetail; spriteSrc: string; bgSrc: string; fx: SoloFx; bossName: string }) {
  const router = useRouter();
  const { showError } = useResourceToast();
  const [view, setView] = useState<'board' | 'prep' | 'battle'>('board');
  const [run, setRun] = useState<Run | null>(null);
  const [sheet, setSheet] = useState<'pattern' | 'reward' | 'pool' | 'avatar' | null>(null);
  const [poolSlot, setPoolSlot] = useState<SoloSlot>('weapon');
  const [pending, start] = useTransition();
  // 휴대폰 뒤로가기(11-14 결정) — 준비·전투 화면에 있는 동안 기록 한 칸을 쌓아 둔다. 준비 → 순위표,
  // 전투 중 → 연출을 건너뛰어 결과 카드(칸을 다시 쌓는다), 결과 → 순위표. 준비↔전투 오갈 때는 같은 칸을 그대로 쓴다.
  const battleCtl = useRef<{ skip: () => boolean } | null>(null);
  const onHardBack = useRef<() => boolean>(() => false);
  useEffect(() => {
    onHardBack.current = () => {
      if (view === 'battle' && battleCtl.current?.skip()) return true;
      const fromBattle = view === 'battle';
      setRun(null);
      setView('board');
      // 결과 화면 버튼(closeBattle)과 같게 — 다른 사람 기록까지 다시 읽는다.
      if (fromBattle) router.refresh();
      return false;
    };
  }, [view, router]);
  const inSub = view !== 'board';
  useEffect(() => {
    if (!inSub) return;
    let h: ReturnType<typeof modalHistory.open> | null = null;
    let alive = true;
    const arm = () => {
      h = modalHistory.open(() => {
        // 팝 처리 중에 바로 쌓지 않는다 — 다음 틱에(이 popstate 처리가 끝난 뒤).
        if (onHardBack.current()) setTimeout(() => alive && arm(), 0);
      });
    };
    arm();
    return () => {
      alive = false;
      h?.release();
    };
  }, [inSub]);
  const keyRef = useRef<string | null>(null);
  // 낙관적 화면(11-13 사용자) — 서버 응답 전에 먼저 바꿔 보여 주고, 실패하면 되돌린다. 새 데이터(router.refresh)가 오면 base가 달라져 자연히 버려진다.
  const [opt, setOpt] = useState<{ base: SoloDetail; me: Partial<SoloMe>; total?: number; top?: SoloDetail['top']; extra: number } | null>(null);
  const live = opt && opt.base === detail ? opt : null;
  const d: SoloDetail = live ? { ...detail, total: live.total ?? detail.total, top: live.top ?? detail.top, me: detail.me ? { ...detail.me, ...live.me } : null } : detail;
  const me = d.me;
  const patch = (p: { me?: Partial<SoloMe>; total?: number; top?: SoloDetail['top']; extra?: number }) =>
    setOpt((prev) => {
      const cur = prev && prev.base === detail ? prev : { base: detail, me: {}, extra: 0 };
      return { ...cur, ...p, base: detail, me: { ...cur.me, ...(p.me ?? {}) }, extra: p.extra ?? cur.extra };
    });
  const extraRetry = live?.extra ?? 0;
  const active = d.status === 'active';
  const runsLeft = me ? me.freeLeft + me.retryLeft + extraRetry : 0;
  const phase = soloPhaseFor(d.total);

  function challenge() {
    keyRef.current ??= crypto.randomUUID();
    const key = keyRef.current;
    start(async () => {
      // 연결이 끊기면(전송 실패·응답 유실) 에러 화면 대신 알림만 — 키는 그대로 두어 다시 누르면 서버가 같은 판을 돌려준다.
      const r = await soloRunAction(d.id, key).catch(() => ({ status: 'error' as const, code: 'UNKNOWN' as const, message: '연결이 끊겼어요. 다시 눌러 주세요.' }));
      if (r.status !== 'success') {
        showError(r.message);
        if (r.code !== 'UNKNOWN' && r.code !== 'RATE_LIMITED') keyRef.current = null;
        return;
      }
      keyRef.current = null;
      // 재전송으로 돌려받은 판은 판 전 최고 기록·순위를 모른다 — 지금 값으로 채워 '첫 기록·새 기록'으로 잘못 보이지 않게(11-14 검수).
      const ru = r.run.replayed ? { ...r.run, prevBest: r.run.prevBest ?? r.run.best, prevRank: r.run.prevRank ?? r.run.rank } : r.run;
      // 판 수·내 기록·순위·누적 피해를 응답값으로 바로 맞춘다(결과 카드를 닫은 뒤 순위표가 기다리지 않게).
      const meNow = d.me!;
      const dealt = ru.dealt;
      const mine = { rank: ru.rank, reward: null, userId: '__me', nickname: meNow.nickname, best: ru.best, dealt, me: true, avatar: meNow.avatarSouth, faceBox: meNow.faceBox, guildName: meNow.guildName, guildEmblem: meNow.guildEmblem, title: meNow.title };
      const others = d.top.filter((x) => !x.me);
      const top = ru.rank <= 10 ? [...others.slice(0, ru.rank - 1), mine, ...others.slice(ru.rank - 1)].slice(0, 10).map((x, i) => ({ ...x, rank: i + 1 })) : others.slice(0, 10);
      patch({ me: { freeLeft: 0, retryLeft: ru.runsLeft, best: ru.best, dealt, rank: ru.rank }, total: ru.totalAfter, top, extra: 0 });
      setRun(ru);
      setView('battle');
    });
  }
  /** 낙관적 실행 — 먼저 patch, 실패하면 그 직전 상태로 되돌린다. */
  function optimistic(p: Partial<SoloMe>, call: () => Promise<{ status: string; message?: string }>) {
    const before = opt;
    patch({ me: p });
    start(async () => {
      const r = await call().catch(() => ({ status: 'error', message: '연결이 끊겨 바꾸지 못했어요. 다시 시도해 주세요.' }));
      if (r.status !== 'success') {
        setOpt(before);
        showError(r.message ?? '바꾸지 못했어요.');
      }
      // 성공이면 액션 응답이 이 페이지를 다시 그려 온다(revalidatePath) — router.refresh()는 같은 렌더를 한 번 더 부른다(CLAUDE §11.7).
    });
  }
  function equipBest() {
    if (!me) return;
    const b = bestOverall(me);
    optimistic(meAfter(me, b.lo.pieces, b.id), () => soloEquipBestAction(d.id));
  }
  function equipOne(ueid: string) {
    if (!me) return;
    const it = me.requiredItems.find((x) => x.ueid === ueid);
    if (!it) return;
    const keys = me.avatars.find((a) => a.active)?.keys ?? null;
    const mult: 1 | 2 = keys && keys[it.slot] === it.key ? 2 : 1;
    const pieces = [...me.pieces.filter((p) => p.slot !== it.slot), { slot: it.slot, key: it.key, name: it.name, level: it.level, transcend: it.transcend, cp: it.cp, mult, score: it.cp * mult, src: it.src }];
    optimistic(meAfter(me, pieces, null), () => soloEquipAction(d.id, ueid));
  }
  function pickAvatar(id: string) {
    if (!me) return;
    const av = me.avatars.find((a) => a.id === id);
    if (!av || av.active || pending) return;
    setSheet(null);
    optimistic(meAfter(me, loadoutWith(me, av.keys).pieces, id), () => soloPickAvatarAction(d.id, id));
  }
  function closeBattle() {
    setRun(null);
    setView('board');
    router.refresh();
  }

  // 재도전 버튼 — 남은 판이 있으면 바로 준비 화면, 없으면 포인트로 사기(오늘 더 못 사면 잠김).
  const retryButton = (onAfter: () => void, label?: string) =>
    !me || !active || !me.resident ? null : runsLeft > 0 ? (
      <PrimaryButton onClick={onAfter}>{label ?? (me.best == null ? '토벌하기' : '재도전')}</PrimaryButton>
    ) : me.retryNext == null ? (
      <PrimaryButton disabled>오늘 도전 끝</PrimaryButton>
    ) : (
      <ExtraBuyButton
        item="wb_retry"
        trigger={{ label: `재도전 · ${me.retryNext}pt` }}
        onOptimistic={() => patch({ extra: extraRetry + 1 })}
        onRollback={() => patch({ extra: Math.max(0, extraRetry) })}
        onResult={(r) => {
          // 재전송(이미 산 구매)이면 낙관 반영이 되돌려졌으니 서버 값으로 다시 맞춘다 — 남은 판이 0으로 보여 출발이 잠기지 않게.
          if (r.duplicate) router.refresh();
          onAfter();
        }}
        className="flex-1 rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 text-[14px] font-black text-violet-50 shadow-[0_2px_10px_rgba(0,0,0,.4)]"
      />
    );

  return (
    <div className="pb-2">
      {view === 'board' && (
        <>
          <Hero d={d} bgSrc={bgSrc} spriteSrc={spriteSrc} idleSrc={fx.idle} bossName={bossName} phase={phase} onReward={() => setSheet('reward')} onPattern={() => setSheet('pattern')} />
          <Board d={d} stage={phase.stage} />
          {me && !me.resident && active ? (
            <p className="mx-3 mt-2 rounded-lg border border-violet-500/30 bg-violet-950/40 px-2.5 py-2 text-[11.5px] leading-snug text-slate-300">
              {d.zoneName}에 거주하면 도전할 수 있어요.{me.homeZoneName ? josa(` 지금 거주지는 ${me.homeZoneName}#{이에요}.`) : ''}{' '}
              <Link prefetch={false} href="/guild/map" className="font-bold text-violet-200 underline">
                지도에서 옮기기
              </Link>
            </p>
          ) : null}
          {!active && me && me.best != null ? <FinalCard d={d} /> : null}
          <FloatingBar>{retryButton(() => setView('prep')) ?? <PrimaryButton disabled>{active ? '토벌하기' : '원정 종료'}</PrimaryButton>}</FloatingBar>
        </>
      )}

      {view === 'prep' && me && (
        <Prep
          d={d}
          bgSrc={bgSrc}
          spriteSrc={spriteSrc}
          bossName={bossName}
          onBack={() => setView('board')}
          onPick={(s) => {
            setPoolSlot(s);
            setSheet('pool');
          }}
          onPattern={() => setSheet('pattern')}
          onEquipBest={equipBest}
          onAvatar={() => setSheet('avatar')}
          onGo={challenge}
          pending={pending}
          runsLeft={runsLeft}
        />
      )}

      {view === 'battle' && run && me && (
        <SoloBattle
          key={run.runId}
          d={d}
          run={run}
          fx={fx}
          bgSrc={bgSrc}
          bossName={bossName}
          retry={retryButton(() => {
            setRun(null);
            setView('prep');
          }, '재도전')}
          onDone={closeBattle}
          ctl={battleCtl}
        />
      )}

      {sheet === 'pattern' && <PatternSheet spriteSrc={spriteSrc} fx={fx} onClose={() => setSheet(null)} />}
      {sheet === 'reward' && <RewardSheet stage={phase.stage} share={me && me.best != null ? soloShareOf(me.dealt, d.total) : null} rank={me?.rank ?? null} onClose={() => setSheet(null)} />}
      {sheet === 'avatar' && me && <AvatarSheet me={me} onPick={pickAvatar} onClose={() => setSheet(null)} />}
      {sheet === 'pool' && <PoolSheet d={d} slot={poolSlot} onSlot={setPoolSlot} onEquip={equipOne} pending={pending} onClose={() => setSheet(null)} />}
    </div>
  );
}

// ── 첫 화면 ─────────────────────────────────────────────────────────────────

function remain(ms: number): string {
  const m = Math.ceil(ms / 60_000);
  if (m <= 0) return '곧 원정 종료';
  const h = Math.floor(m / 60);
  return h > 0 ? `종료까지 ${h}시간 ${m % 60}분` : `종료까지 ${m}분`;
}

function Hero({ d, bgSrc, spriteSrc, idleSrc, bossName, phase, onReward, onPattern }: { d: SoloDetail; bgSrc: string; spriteSrc: string; idleSrc: string; bossName: string; phase: ReturnType<typeof soloPhaseFor>; onReward: () => void; onPattern: () => void }) {
  const active = d.status === 'active';
  const leaveMs = new Date(d.leaveAt).getTime();
  const bonus = Math.round((soloPhaseBonus(phase.stage) - 1) * 100);
  return (
    <div className="relative h-[200px] overflow-hidden bg-slate-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full object-cover" style={PIX} />
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(2,6,23,0.6)_0%,transparent_30%,transparent_55%,rgba(2,6,23,0.95)_100%)]" />
      {/* 불사조 상세와 같은 뒤로 버튼 — 알림·배너로 바로 들어와 이전 화면이 없으면 지도로. */}
      <BackFab fallback="/guild/map" className="absolute top-3 left-3 z-10" />
      {/* 불사조 상세와 같은 크기의 무대(200px) — 머무는 동안은 대기 애니(.wbq), 끝나면 흐린 정지 그림. */}
      {active ? (
        <div role="img" aria-label={bossName} className="wbq absolute top-[54%] left-1/2 z-[1] -mt-[80px] -ml-[80px] h-[160px] w-[160px]" style={{ '--wbq-idle': `url(${idleSrc})` } as React.CSSProperties} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={spriteSrc} alt="" className="absolute top-[54%] left-1/2 z-[1] -mt-[80px] -ml-[80px] h-[160px] w-[160px] object-contain opacity-50 grayscale" style={PIX} />
      )}
      <div className="absolute top-3 right-[92px] left-[52px] z-[2] flex flex-col">
        <span className="flex items-center gap-1.5">
          <span className={`rounded-[4px] px-1 text-[9px] leading-[1.5] font-extrabold ${active ? 'bg-violet-700/90 text-violet-50' : 'bg-slate-700 text-slate-200'}`}>{active ? '월드보스' : '원정 종료'}</span>
          <h1 className="truncate text-[17px] font-extrabold text-slate-100 [text-shadow:0_1px_3px_#000]">{bossName}</h1>
        </span>
        <span className="text-[11px] text-slate-300 [text-shadow:0_1px_2px_#000]">{d.zoneName}</span>
      </div>
      {/* 보상·패턴 안내 — 히어로 우측 상단에 작게(11-13 사용자) */}
      <div className="absolute top-3 right-3 z-[3] flex flex-col items-end gap-1">
        <button type="button" onClick={onReward} className="rounded-full border border-violet-400/50 bg-slate-950/80 px-2 py-0.5 text-[10.5px] font-bold text-violet-100">
          보상 안내
        </button>
        <button type="button" onClick={onPattern} className="rounded-full border border-violet-400/50 bg-slate-950/80 px-2 py-0.5 text-[10.5px] font-bold text-violet-100">
          패턴 안내
        </button>
      </div>
      <div className="absolute inset-x-3 bottom-2.5 z-[2] flex items-end justify-between gap-2">
        <span className="flex flex-col">
          <b className={`text-[28px] leading-none font-black [text-shadow:0_1px_3px_#000] ${active ? 'text-violet-300' : 'text-slate-300'}`}>{active ? `${phase.stage}페이즈` : `최종 ${phase.stage}페이즈`}</b>
          {active ? (
            <span className="mt-1 text-[10.5px] text-slate-300 [text-shadow:0_1px_2px_#000]">
              다음 페이즈까지 <b className="text-violet-200">{man(phase.need - phase.into)}</b>
            </span>
          ) : null}
        </span>
        <span className="flex flex-col items-end">
          <b className="text-[13px] font-extrabold text-slate-100 [text-shadow:0_1px_2px_#000]">페이즈 보너스 +{bonus}%</b>
          {active ? (
            <Ticker intervalMs={60_000}>{(now) => <span className="text-[10.5px] text-slate-300 [text-shadow:0_1px_2px_#000]">{remain(leaveMs - now)}</span>}</Ticker>
          ) : (
            <span className="text-[10.5px] text-slate-400">{d.status === 'settling' ? '정산 중' : '원정 종료'}</span>
          )}
        </span>
      </div>
    </div>
  );
}

/** 원정이 끝난 뒤 내 최종 결과(11-14 사용자 결정) — 정산 중이면 안내만, 끝나면 최종 순위와 받은 보상(우편으로 간 것과 같은 값). */
function FinalCard({ d }: { d: SoloDetail }) {
  const me = d.me!;
  const done = d.status === 'left' && me.finalRank != null && me.reward != null;
  return (
    <div className="mx-3 mt-2.5 rounded-xl border border-violet-500/40 bg-gradient-to-b from-violet-950/60 to-slate-950 px-3 py-2.5">
      <div className="text-[10.5px] font-bold tracking-widest text-violet-300">내 최종 결과</div>
      {done ? (
        <>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <b className="text-[20px] leading-none font-black text-slate-50">{n(me.finalRank!)}위</b>
            <span className="font-mono text-[12.5px] font-bold text-slate-100 tabular-nums">{rewardText(me.reward!)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-slate-400">
            <span>
              최고 기록 {n(me.best!)} · 기여도 {soloSharePct(soloShareOf(me.dealt, d.total))}
            </span>
            <Link prefetch={false} href="/mail" className="font-bold text-violet-200 underline">
              우편함에서 받기
            </Link>
          </div>
        </>
      ) : (
        <p className="mt-1 text-[11.5px] leading-snug text-slate-300">순위를 정리하고 있어요. 곧 결과 우편이 도착해요.</p>
      )}
    </div>
  );
}

type BoardRow = { rank: number; reward?: { diamond: number; boxes: number } | null; nick: string; score: number; dealt: number; me: boolean; avatar: string | null; faceBox: FaceBox | null; guildName: string | null; guildEmblem: string | null; title: string | null };

/** 등수별 배경 틴트 — 대난투 순위와 같은 방식(금·은·동, 나는 보라). 좌→우라 오른쪽 아바타를 덮지 않는다. */
function rankTint(rank: number, me: boolean): string {
  if (rank === 1) return 'from-amber-400/35 via-amber-500/10';
  if (rank === 2) return 'from-slate-300/30 via-slate-300/8';
  if (rank === 3) return 'from-orange-600/30 via-orange-700/8';
  return me ? 'from-violet-500/30 via-violet-500/8' : 'from-slate-400/10 via-transparent';
}
/** 등수 숫자·구분선·게이지 색 — 틴트와 같은 계열. */
function rankAccent(rank: number, me: boolean): { text: string; line: string; bar: string } {
  if (rank === 1) return { text: 'text-amber-200', line: 'bg-amber-400/60', bar: 'bg-amber-400' };
  if (rank === 2) return { text: 'text-slate-100', line: 'bg-slate-300/50', bar: 'bg-slate-200' };
  if (rank === 3) return { text: 'text-orange-200', line: 'bg-orange-500/55', bar: 'bg-orange-500' };
  return me
    ? { text: 'text-violet-200', line: 'bg-violet-500/60', bar: 'bg-violet-400' }
    : { text: 'text-slate-300', line: 'bg-slate-700/60', bar: 'bg-slate-400/60' };
}
/** 순위 한 줄 — 대난투 순위와 같은 구성(오른쪽 얼굴 + 좌→우 등수 틴트·암막 2겹, 등수 | 구분선 | 1줄 이름·길드·칭호·'나', 2줄 작은 점수 · 보상).
 *  글자 그림자는 요소마다 drop-shadow로 — 부모 text-shadow는 칭호 글자(배경 클립)에 상속돼 효과가 뭉개진다.
 *  아래 가장자리 게이지 = 보스가 받은 전체 피해 중 이 사람이 넣은 몫(모든 도전 합, 11-14 사용자). */
function Row({ r, total, stage }: { r: BoardRow; total: number; stage: number }) {
  const share = soloShareOf(r.dealt, total);
  const tr = soloShareReward(share, stage);
  const rr = soloRankReward(r.rank);
  // 정산된 줄은 실제 지급값(우편과 같은 값), 머무는 동안은 지금 기준 예상값.
  const shown = r.reward ?? { diamond: tr.diamond + rr.diamond, boxes: tr.boxes + rr.boxes };
  const pct = share > 0 ? Math.max(1, Math.min(100, share * 100)) : 0;
  const accent = rankAccent(r.rank, r.me);
  const sh = 'drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]';
  return (
    <li className="relative flex h-[56px] items-center overflow-hidden border-b border-slate-800/70 px-3">
      {r.avatar ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-36">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.avatar} alt="" aria-hidden loading="lazy" decoding="async" className="absolute inset-0 h-full w-full" style={meleeFaceCropStyle(r.faceBox)} />
        </div>
      ) : null}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-r ${rankTint(r.rank, r.me)} to-transparent`} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-slate-950 to-transparent" />
      <div className="relative z-10 flex w-full items-center gap-2.5">
        <span className={`w-8 shrink-0 text-center font-mono text-[14px] font-extrabold ${sh} ${accent.text}`}>{r.rank <= 3 ? MEDAL[r.rank - 1] : r.rank}</span>
        <div className={`w-px shrink-0 self-stretch ${accent.line}`} />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1">
            <b className={`min-w-0 shrink truncate text-[12.5px] font-extrabold text-slate-50 ${sh}`}>{r.nick}</b>
            {r.guildName ? <GuildBadge emblemUrl={r.guildEmblem} name={r.guildName} size={11} className={`min-w-0 shrink-[2] text-[9.5px] text-slate-300 ${sh}`} /> : null}
            {r.title ? <TitleTag code={r.title} className="min-w-0 shrink-0 text-[10px]" /> : null}
            {r.me ? <span className="shrink-0 rounded bg-violet-500/30 px-1 text-[8.5px] font-black text-violet-200">나</span> : null}
          </div>
          <div className={`truncate text-[9.5px] text-slate-300 tabular-nums ${sh}`}>
            <b className="font-mono font-black text-slate-100">{n(r.score)}</b> · 기여 <b className="font-black text-violet-200">{soloSharePct(share)}</b> · {rewardText(shown)}
          </div>
        </div>
      </div>
      <span className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[2px] bg-black/40">
        <span className={`block h-full ${accent.bar}`} style={{ width: `${pct}%` }} />
      </span>
    </li>
  );
}

function Board({ d, stage }: { d: SoloDetail; stage: number }) {
  const me = d.me;
  const meInTop = d.top.some((r) => r.me);
  const total = d.total;
  return (
    <div>
      {/* 머리말 위아래 여백을 같게(py-2) — 히어로 아래와 첫 줄 위 간격이 달라 보이던 것(11-14 사용자). */}
      <div className="px-3 py-2 leading-none">
        <span className="text-[11px] font-bold tracking-widest text-slate-400">피해 순위</span>
      </div>
      <ul className="border-t border-slate-800/80">
        {d.top.length === 0 ? <li className="flex h-[56px] items-center justify-center text-[11.5px] text-slate-500">아직 기록이 없어요</li> : null}
        {d.top.map((r) => (
          <Row key={r.userId} total={total} stage={stage} r={{ rank: r.rank, reward: r.reward, nick: r.nickname, score: r.best, dealt: r.dealt, me: r.me, avatar: r.avatar, faceBox: r.faceBox, guildName: r.guildName, guildEmblem: r.guildEmblem, title: r.title }} />
        ))}
        {me && !meInTop ? (
          me.best != null && me.rank != null ? (
            <>
              <li className="border-b border-slate-800/80 py-0.5 text-center text-[10px] leading-none text-slate-600">⋮</li>
              <Row total={total} stage={stage} r={{ rank: me.finalRank ?? me.rank, reward: me.reward, nick: me.nickname, score: me.best, dealt: me.dealt, me: true, avatar: me.avatarSouth, faceBox: me.faceBox, guildName: me.guildName, guildEmblem: me.guildEmblem, title: me.title }} />
            </>
          ) : (
            <li className="flex h-[56px] items-center justify-center text-[11.5px] text-slate-400">아직 내 기록이 없어요</li>
          )
        ) : null}
      </ul>
    </div>
  );
}


// ── 도전 준비 ───────────────────────────────────────────────────────────────

/** 예상 피해 범위 — 같은 규칙으로 600판을 굴려 보통(20~80%) 범위를 잡는다(시드 고정이라 화면마다 같다, 11-13 사용자 4안). */
function expectRange(power: { weapon: number; armor: number; accessory: number }): [number, number] | null {
  if (power.weapon + power.armor + power.accessory <= 0) return null;
  let seed = 20261113;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const xs: number[] = [];
  for (let i = 0; i < 600; i++) xs.push(soloRunScore(rollSoloRun(power, rand)));
  xs.sort((x, y) => x - y);
  return [xs[Math.floor(xs.length * 0.2)]!, xs[Math.floor(xs.length * 0.8)]!];
}

function Prep({ d, bgSrc, spriteSrc, bossName, onBack, onPick, onPattern, onEquipBest, onAvatar, onGo, pending, runsLeft }: {
  d: SoloDetail; bgSrc: string; spriteSrc: string; bossName: string; onBack: () => void; onPick: (slot: SoloSlot) => void; onPattern: () => void; onEquipBest: () => void; onAvatar: () => void; onGo: () => void; pending: boolean; runsLeft: number;
}) {
  const me = d.me!;
  const total = me.power.weapon + me.power.armor + me.power.accessory;
  const required = d.pool.weapon.length + d.pool.armor.length + d.pool.accessory.length;
  const range = useMemo(() => expectRange(me.power), [me.power]);
  return (
    <>
      {/* 위쪽 얇은 무대 — 보스와 오늘 남은 도전(11-13 사용자 3안) */}
      <div className="relative h-[76px] overflow-hidden bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-55" style={PIX} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/50 to-slate-950/80" />
        <button type="button" onClick={onBack} aria-label="뒤로" className="absolute top-1/2 left-3 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-white/25 bg-black/45 pb-0.5 text-xl leading-none font-bold text-white">
          ‹
        </button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={spriteSrc} alt="" className="absolute top-1/2 left-[46px] z-[1] -mt-[34px] h-[68px] w-[68px] object-contain drop-shadow-[0_0_8px_rgba(139,92,246,.45)]" style={PIX} />
        <div className="absolute inset-y-0 right-3 left-[120px] z-[2] flex flex-col justify-center">
          <b className="text-[15px] font-extrabold text-slate-100 [text-shadow:0_1px_3px_#000]">도전 준비</b>
          <span className="text-[11px] text-slate-300 [text-shadow:0_1px_2px_#000]">{bossName}</span>
        </div>
        <span className="absolute top-1/2 right-3 z-[2] -translate-y-1/2 rounded-full border border-violet-400/50 bg-slate-950/80 px-2.5 py-1 text-[11px] font-bold text-violet-100">
          오늘 남은 도전 {runsLeft}번
        </span>
      </div>
      <div className="mx-3 mt-2.5 grid grid-cols-2 gap-1.5 text-center">
        <div className="rounded-lg bg-slate-900 py-1.5">
          <div className="text-[10px] text-slate-500">내 최고 기록</div>
          <b className="font-mono text-[14px] text-slate-100 tabular-nums">{me.best == null ? '-' : n(me.best)}</b>
          <div className="text-[10px] text-slate-500">{me.rank == null ? '기록 없음' : `${n(me.rank)}위`}</div>
        </div>
        <div className="rounded-lg bg-slate-900 py-1.5">
          <div className="text-[10px] text-slate-500">이 장비로 보통</div>
          <b className="font-mono text-[14px] text-violet-200 tabular-nums">{range ? `${man(range[0])}~${man(range[1])}` : '-'}</b>
          <div className="text-[10px] text-slate-500">
            {range && me.best != null ? (range[1] > me.best ? '최고 기록을 넘길 수 있어요' : '패턴이 좋으면 넘길 수 있어요') : '패턴에 따라 달라져요'}
          </div>
        </div>
      </div>
      <div className="mx-3 mt-2">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[11px] font-bold text-slate-500">내 장비 · 눌러서 바꾸기</span>
          <button type="button" onClick={() => onPick('weapon')} className="text-[11px] text-slate-400">
            요구 장비{' '}
            <b className="text-slate-200">
              {me.ownedRequired}/{required}
            </b>
            <span className="font-bold text-violet-300"> 보기 ›</span>
          </button>
        </div>
        {SLOTS.map((s) => {
          const p = me.pieces.find((x) => x.slot === s);
          const m = p?.mult ?? 0;
          return (
            <button
              key={s}
              type="button"
              onClick={() => onPick(s)}
              className={`-mx-3 flex w-[calc(100%+1.5rem)] items-center gap-2.5 border-b border-l-2 border-white/[.07] py-1.5 pr-3 pl-2.5 text-left active:bg-white/5 ${m === 2 ? 'border-l-amber-400 bg-amber-500/10' : m === 1 ? 'border-l-emerald-500/70' : 'border-l-red-500/60 bg-red-950/15'}`}
            >
              <span className={`flex h-9 w-9 flex-none items-center justify-center rounded-md border ${m === 2 ? 'border-amber-400 bg-amber-950/60 shadow-[0_0_8px_rgba(251,191,36,.35)]' : m === 0 ? 'border-slate-800 bg-slate-900 opacity-40 grayscale' : 'border-emerald-700/70 bg-slate-900'}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p?.src ? <img src={p.src} alt="" className="h-7 w-7" style={PIX} /> : null}
              </span>
              <span className={`min-w-0 flex-1 leading-tight ${m === 0 ? 'opacity-60' : ''}`}>
                <span className="block truncate text-[12px] text-slate-100">
                  {p ? p.name : '장착 없음'}
                  {p ? <span className="text-slate-500"> +{p.level}</span> : null}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-slate-500">
                  <span className={`rounded px-1 text-[9.5px] leading-[1.5] font-black ${m === 2 ? 'bg-amber-400 text-amber-950' : m === 1 ? 'bg-emerald-600/80 text-emerald-50' : 'border border-red-500/60 text-red-300'}`}>
                    {m === 2 ? '×2 아바타' : m === 1 ? '×1 적용' : '×0 미적용'}
                  </span>
                  {SLOT_KO[s]}
                  {p && m === 0 ? ' · 요구 장비 아님' : ''}
                </span>
              </span>
              <b className={`flex-none tabular-nums ${m === 2 ? 'text-[13px] text-amber-300' : m === 0 ? 'text-[12px] text-red-300/80' : 'text-[12.5px] text-slate-100'}`}>{m === 0 ? '제외' : n(p!.score)}</b>
              <span className="flex-none text-[14px] text-slate-600">›</span>
            </button>
          );
        })}
        {/* 아바타 — 무한의 탑처럼 이 자리에서 바로 고른다(고르면 그 아바타 기준 가장 센 장비로 함께 맞춤, 11-13 사용자). */}
        <button type="button" onClick={onAvatar} className="flex w-full items-center gap-2 border-b border-white/[.07] py-1.5 text-left text-[12px] active:bg-white/5">
          <span className="flex-none text-slate-400">아바타</span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {me.avatarSouth ? <img src={me.avatarSouth} alt="" className="h-8 w-auto" style={PIX} /> : null}
          <span className="text-[10.5px] text-slate-500">{me.hasAvatar ? '나만의 아바타' : '기본 아바타'}</span>
          <span className="ml-auto font-bold text-violet-300">변경 ›</span>
        </button>
        <div className="flex items-center justify-between gap-2 py-2 text-[12px] tabular-nums">
          {/* 추천 장착 미리 보기 — 바꾸면 오르는 전투력을 버튼에 바로(11-13 사용자 2안). 더 오를 게 없으면 숨긴다. */}
          {me.bestPower != null ? (
            <button type="button" onClick={onEquipBest} disabled={pending} className="flex min-w-0 items-center gap-1.5 rounded-lg border border-violet-400/60 bg-violet-950/40 px-2 py-1 text-[11px] font-bold text-violet-200 disabled:opacity-50">
              추천 장착
              <span className="font-mono text-violet-100">
                {man(total)} → <b className="text-violet-300">{man(me.bestPower)}</b>
              </span>
            </button>
          ) : (
            <span className="text-[10.5px] text-slate-500">지금이 가장 강력한 조합이에요</span>
          )}
          <span className="flex-none pl-2 text-slate-400">
            전투력 <b className="text-[14px] text-violet-200">{n(total)}</b>
          </span>
        </div>
      </div>
      <div className="mx-3 mt-1">
        <div className="mb-1 text-[10.5px] text-slate-500">부위 비율</div>
        <div className="flex h-2 overflow-hidden rounded-full bg-slate-800">
          {total > 0 ? (
            <>
              <span className="bg-amber-400" style={{ width: `${(me.power.weapon / total) * 100}%` }} />
              <span className="bg-emerald-500" style={{ width: `${(me.power.armor / total) * 100}%` }} />
              <span className="bg-sky-400" style={{ width: `${(me.power.accessory / total) * 100}%` }} />
            </>
          ) : null}
        </div>
        <div className="mt-1 flex gap-3 text-[10px] text-slate-400">
          {SLOTS.map((s) => (
            <span key={s} className={me.power[s] === 0 ? 'text-slate-600' : ''}>
              {SLOT_KO[s]} {total > 0 ? Math.round((me.power[s] / total) * 100) : 0}%
            </span>
          ))}
        </div>
      </div>
      <FloatingBar>
        <SecondaryButton onClick={onPattern}>패턴 안내</SecondaryButton>
        <PrimaryButton onClick={onGo} disabled={pending || total <= 0 || runsLeft <= 0}>
          {pending ? '준비 중' : total <= 0 ? '요구 장비 필요' : '출발'}
        </PrimaryButton>
      </FloatingBar>
    </>
  );
}

// ── 전투 ────────────────────────────────────────────────────────────────────

const LAND: Partial<Record<string, number>> = { crouch: 520, weapon: 880, armor: 880, accessory: 880, expose: 650 };
const PC: Partial<Record<string, string>> = { crouch: 'wbq-crouch', dodge: 'wbq-climb', weapon: 'wbq-bind', armor: 'wbq-bind', accessory: 'wbq-bind', expose: 'wbq-expose' };
const SIL = 'drop-shadow(0 0 10px rgba(139,92,246,.4))';
/** 레이드 게이지와 같은 색 순환(RaidSessionCard PHASE_PALETTE) — 페이즈를 넘길 때마다 다음 색. */
const PHASE_BAR = [
  'bg-emerald-400 shadow-emerald-400/60',
  'bg-sky-400 shadow-sky-400/60',
  'bg-violet-400 shadow-violet-400/60',
  'bg-amber-400 shadow-amber-400/60',
  'bg-rose-400 shadow-rose-400/60',
  'bg-cyan-400 shadow-cyan-400/60',
];
const phaseBarClass = (stage: number) => `h-full rounded-full shadow-[0_0_10px] ${PHASE_BAR[stage % PHASE_BAR.length]}`;

function SoloBattle({ d, run, fx, bgSrc, bossName, retry, onDone, ctl }: { d: SoloDetail; run: Run; fx: SoloFx; bgSrc: string; bossName: string; retry: React.ReactNode; onDone: () => void; ctl: React.RefObject<{ skip: () => boolean } | null> }) {
  const me = d.me!;
  const root = useRef<HTMLDivElement>(null);
  const st = useRef({ i: 0, sum: 0, busy: false, fast: false, phaseTotal: run.totalBefore, shown: soloPhaseFor(run.totalBefore).stage, chain: Promise.resolve(), timers: [] as ReturnType<typeof setTimeout>[] });
  const [left, setLeft] = useState(10);
  const [done, setDone] = useState(false);
  const best0 = run.prevBest ?? 0;
  const startPhase = soloPhaseFor(run.totalBefore);
  const bossVars = { '--wbq-idle': `url(${fx.idle})`, '--wbq-crouch': `url(${fx.crouch})`, '--wbq-climb': `url(${fx.climb})`, '--wbq-bind': `url(${fx.bind})`, '--wbq-expose': `url(${fx.expose})` } as React.CSSProperties;

  /** 기록 경주 — 지금 합(sum)으로 목표(최고 기록 → 다음 순위)와 막대 %, 설명 한 줄. ladder = 다른 사람들 최고 기록(큰 순). */
  const raceAt = (sum: number): { pct: number; note: string; goal: string; beat: boolean } => {
    const others = d.ladder;
    const estRank = 1 + others.filter((x) => x > sum).length;
    const rankWord = others.length >= 40 && estRank > 40 ? '' : ` · ${estRank}위권`;
    if (run.prevBest != null && sum <= run.prevBest) {
      return { pct: run.prevBest > 0 ? (sum / run.prevBest) * 100 : 0, note: `최고 기록까지 ${man(run.prevBest - sum)}`, goal: `최고 기록 ${man(run.prevBest)}`, beat: false };
    }
    const next = [...others].reverse().find((x) => x > sum);
    if (next == null) return { pct: 100, note: `${run.prevBest == null ? '첫 기록' : '기록 갱신 중'} · 1위권`, goal: '1위', beat: true };
    return { pct: (sum / next) * 100, note: `${run.prevBest == null ? '첫 기록' : '기록 갱신 중'}${rankWord}`, goal: `${estRank - 1}위 ${man(next)}`, beat: true };
  };
  const q = <T extends Element = HTMLElement>(s: string) => root.current?.querySelector<T>(s) ?? null;
  const reduce = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  // 화면을 떠나면(하단 탭·뒤로가기) 남은 연출·효과음을 모두 멈춘다 — 다른 화면에서 타격음·승리음이 나지 않게(11-14 검수).
  const dead = useRef(false);
  useEffect(() => {
    const s = st.current;
    return () => {
      dead.current = true;
      s.timers.forEach((t) => clearTimeout(t));
      s.timers.length = 0;
    };
  }, []);
  const later = (fn: () => void, ms: number) => {
    if (dead.current) return;
    const quick = reduce() || st.current.fast;
    if (quick || ms <= 0) fn();
    else st.current.timers.push(setTimeout(() => !dead.current && fn(), ms));
  };

  // 레이드 게이지와 같은 방식 — 이번 페이즈에 들어간 만큼 차오르고, 한 번에 여러 페이즈를 넘기면 페이즈마다 100%까지 채운 뒤
  // 다음 색으로 0부터 다시(넘긴 페이즈가 모두 보이게). 순서대로 이어 붙인다(chain) — 스킵이면 기다림 0.
  function setBar(stage: number, pct: number, animate: boolean) {
    const bar = q<HTMLElement>('[data-hpbar]');
    if (!bar) return;
    bar.className = phaseBarClass(stage);
    bar.style.transition = animate ? 'width 380ms ease-out' : 'none';
    bar.style.width = `${Math.max(2, pct)}%`;
  }
  function drawPhase() {
    const target = soloPhaseFor(st.current.phaseTotal);
    // 떠난 뒤에는 풀지 않는다 — 이어 붙은 연출(chain)이 그 자리에서 멈춘다.
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(() => !dead.current && r(), st.current.fast || reduce() ? 0 : ms));
    st.current.chain = st.current.chain.then(async () => {
      while (st.current.shown < target.stage) {
        setBar(st.current.shown, 100, true);
        await wait(440);
        st.current.shown += 1;
        const shown = st.current.shown;
        const ph = q('[data-phase]');
        if (ph) ph.textContent = `${shown}페이즈`;
        const bo = q('[data-bonus]');
        if (bo) bo.textContent = `페이즈 보너스 +${Math.round((soloPhaseBonus(shown) - 1) * 100)}%`;
        if (!st.current.fast && !reduce()) {
          ph?.animate([{ transform: 'scale(1.5)', background: '#c084fc' }, { transform: 'none' }], { duration: 650 });
          float(`${shown}페이즈`, 'text-[15px] text-fuchsia-200', 0, 0);
          sounds.levelup();
        }
        setBar(shown, 0, false);
        await wait(50);
      }
      setBar(target.stage, (target.into / target.need) * 100, true);
      const rem = q('[data-remain]');
      if (rem) rem.textContent = man(target.need - target.into);
    });
  }

  function float(text: string, cls: string, dx = 0, delay = 0, top = '30%') {
    if (st.current.fast) return;
    later(() => {
      const box = q('[data-fx]');
      if (!box) return;
      const el = document.createElement('b');
      el.textContent = text;
      el.className = `absolute font-mono font-black tabular-nums [text-shadow:0_2px_6px_#000] ${cls}`;
      el.style.cssText = `top:${top};left:calc(50% + ${dx}px);transform:translate(-50%,0);transition:transform .6s ease-out,opacity .6s ease-in;`;
      box.appendChild(el);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.transform = 'translate(-50%,-48px)';
          el.style.opacity = '0';
        }),
      );
      setTimeout(() => el.remove(), 750);
    }, delay);
  }

  function showPattern(h: SoloHit) {
    const boss = q<HTMLElement>('[data-boss]');
    const pat = q<HTMLElement>('[data-pat]');
    if (!boss || !pat) return;
    const label = h.p === 'none' ? null : SOLO_PATTERN_LABEL[h.p];
    const nm = pat.querySelector('[data-pname]') as HTMLElement;
    nm.textContent = label?.name ?? '';
    nm.className = `block text-[12px] font-extrabold ${PATTERN_TONE[h.p] ?? 'text-slate-300'}`;
    (pat.querySelector('[data-pdesc]') as HTMLElement).textContent = label?.desc ?? '';
    pat.style.opacity = label ? '1' : '0';
    const fast = st.current.fast || reduce();
    if (label && !fast) pat.animate([{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }], { duration: 220, easing: 'ease-out' });
    const thread = q<HTMLElement>('[data-thread]');
    const wasUp = boss.classList.contains('wbq-climb');
    if ((!wasUp || fast) && thread) thread.style.height = h.p === 'dodge' ? '40%' : '0';
    boss.classList.remove('wbq-crouch', 'wbq-climb', 'wbq-bind', 'wbq-expose');
    if (wasUp && !fast) {
      boss.classList.add('wbq-descend');
      later(() => {
        boss.classList.remove('wbq-descend');
        if (thread) thread.style.height = h.p === 'dodge' ? '40%' : '0';
      }, 560);
    }
    const cls = PC[h.p];
    if (cls && !fast) {
      void boss.offsetWidth;
      boss.classList.add(cls);
    }
    const head = q<HTMLElement>('[data-head]');
    if (h.p === 'dodge' && !fast) {
      if (head) head.style.opacity = '.3';
      later(() => head && (head.style.opacity = '1'), 1800);
      later(() => {
        boss.classList.remove('wbq-climb');
        void boss.offsetWidth;
        boss.classList.add('wbq-descend');
      }, 1200);
      later(() => {
        boss.classList.remove('wbq-descend');
        if (thread) thread.style.height = '0';
      }, 1780);
    }
    root.current?.querySelectorAll<HTMLElement>('[data-web]').forEach((w) => (w.style.opacity = '0'));
    if (h.p === 'weapon' || h.p === 'armor' || h.p === 'accessory') {
      const slot = h.p;
      const cell = q<HTMLElement>(`[data-gear="${slot}"]`);
      if (cell && root.current && !fast) {
        const rr = root.current.getBoundingClientRect();
        const br = boss.getBoundingClientRect();
        const cr = cell.getBoundingClientRect();
        const sx = br.left + br.width / 2 - rr.left;
        const sy = br.top + br.height * 0.62 - rr.top;
        const ex = cr.left + cr.width / 2 - rr.left;
        const ey = cr.top + cr.height / 2 - rr.top;
        const shot = document.createElement('img');
        shot.src = fx.webshot;
        shot.alt = '';
        shot.style.cssText = 'position:absolute;z-index:30;width:44px;height:44px;left:0;top:0;pointer-events:none;image-rendering:pixelated;opacity:0';
        root.current.appendChild(shot);
        const ang = (Math.atan2(ey - sy, ex - sx) * 180) / Math.PI - 180;
        shot.animate(
          [
            { opacity: 0, transform: `translate(${sx - 22}px,${sy - 22}px) rotate(${ang}deg) scale(.5)` },
            { opacity: 1, transform: `translate(${sx - 22}px,${sy - 22}px) rotate(${ang}deg) scale(1)`, offset: 0.15 },
            { opacity: 1, transform: `translate(${ex - 22}px,${ey - 22}px) rotate(${ang}deg) scale(1)` },
          ],
          { duration: 420, delay: 420, easing: 'cubic-bezier(.4,0,.8,1)', fill: 'forwards' },
        );
        setTimeout(() => shot.remove(), 900);
      }
      later(() => {
        root.current?.querySelectorAll<HTMLElement>('[data-web]').forEach((w) => {
          const on = w.dataset.web === slot;
          w.style.opacity = on ? '1' : '0';
          if (on && !st.current.fast) w.animate([{ scale: '0.4' }, { scale: '1.1' }, { scale: '1' }], { duration: 260 });
        });
      }, 840);
    }
  }

  function strike() {
    const s = st.current;
    if (s.busy || s.i >= 10) return;
    s.busy = true;
    const btn = q<HTMLButtonElement>('[data-atk]');
    if (btn) btn.disabled = true;
    const boss = q<HTMLElement>('[data-boss]');
    const descending = !!boss?.classList.contains('wbq-climb');
    const h = run.hits[s.i]!;
    showPattern(h);
    const land = () => {
      if (h.p === 'dodge') float('빗나감', 'text-[19px] text-slate-400', 0, 650, '50%');
      else float(n(h.d), h.p === 'expose' ? 'text-[32px] text-rose-200' : h.c ? 'text-[30px] text-amber-300' : 'text-[24px] text-slate-50');
      if (h.d && !s.fast && !reduce() && boss) {
        const strong = h.c || h.p === 'expose';
        boss.animate([{ rotate: '0deg', scale: '1' }, { rotate: `${strong ? -2.5 : -1.5}deg`, scale: strong ? '0.95' : '0.97' }, { rotate: `${strong ? 2 : 1}deg` }, { rotate: '0deg', scale: '1' }], { duration: strong ? 260 : 200, easing: 'ease-out' });
        boss.animate([{ filter: `${SIL} brightness(${strong ? 1.9 : 1.5})` }, { filter: SIL }], { duration: strong ? 280 : 180 });
      }
      if (!s.fast) {
        if (h.c || h.p === 'expose') {
          sounds.raidCrit();
          haptic.crit();
        } else if (h.d) {
          sounds.raidHit();
          haptic.hit();
        }
      }
      s.phaseTotal += h.d;
      drawPhase();
      const was = s.sum;
      s.sum += h.d;
      const tot = q<HTMLElement>('[data-total]');
      if (run.prevBest != null && was <= best0 && s.sum > best0) {
        const b = q<HTMLElement>('[data-best]');
        if (b) b.className = 'font-mono text-[12px] text-slate-500 line-through transition-colors';
        tot?.classList.replace('text-violet-100', 'text-white');
        if (!s.fast) tot?.animate([{ textShadow: '0 0 16px rgba(196,181,253,.95)' }, { textShadow: '0 0 0 transparent' }], { duration: 900 });
      }
      if (tot) rollNumber(tot, was, s.sum, s.fast || reduce() ? 0 : 420);
      const race = raceAt(s.sum);
      const rb = q<HTMLElement>('[data-race-bar]');
      if (rb) rb.style.width = `${race.pct}%`;
      const rn = q<HTMLElement>('[data-race-note]');
      if (rn) {
        rn.textContent = race.note;
        rn.className = `text-[10.5px] ${race.beat ? 'text-emerald-300' : 'text-slate-400'}`;
      }
      const rg = q<HTMLElement>('[data-race-goal]');
      if (rg) rg.textContent = race.goal;
      const cell = q('[data-cells]')?.children[s.i] as HTMLElement | undefined;
      if (cell) {
        // 칸(11-13 사용자 H1안) — 위 색 띠 + 패턴 짧은 이름(없으면 번호) + 치명 금테·약점 분홍테, 숫자는 굴러 올라간다.
        const ring = h.c ? 'ring-1 ring-amber-400/80' : h.p === 'expose' ? 'ring-1 ring-rose-400/70' : 'ring-1 ring-white/[.06]';
        cell.className = `relative flex h-[44px] flex-col items-center justify-center overflow-hidden rounded-md bg-slate-900 ${ring}`;
        const band = h.p === 'none' ? (h.c ? 'bg-amber-300' : 'bg-slate-700') : h.p === 'dodge' ? 'border border-slate-600 bg-transparent' : h.p === 'expose' ? 'bg-rose-400' : h.p === 'crouch' ? 'bg-sky-400/60' : 'bg-violet-400/50';
        const short = h.c ? '<b class="text-amber-300">치명</b>' : h.p === 'none' ? String(s.i + 1) : SOLO_PATTERN_LABEL[h.p].name.replace(' 옭아매기', '');
        const tone = h.c ? '' : PATTERN_TONE[h.p] ?? 'text-slate-500';
        cell.innerHTML = `<span class="absolute inset-x-0 top-0 h-[3px] ${band}"></span><span class="text-[9px] leading-none ${tone || 'text-slate-500'}">${short}</span><b data-v class="mt-1 font-mono text-[11.5px] leading-none tabular-nums ${h.d === 0 ? 'text-slate-500' : h.p === 'expose' ? 'text-rose-200' : h.c ? 'text-amber-200' : 'text-slate-100'}">${h.d === 0 ? '빗나감' : '0'}</b>`;
        const v = cell.querySelector<HTMLElement>('[data-v]');
        if (v && h.d > 0) rollNumber(v, 0, h.d, s.fast || reduce() ? 0 : 380);
        if (!s.fast) cell.animate([{ transform: 'scale(1.15)' }, { transform: 'none' }], { duration: 220 });
      }
      s.i++;
      setLeft(10 - s.i);
      later(
        () => {
          s.busy = false;
          if (btn) btn.disabled = s.i >= 10;
          if (s.i >= 10) finish();
          else if (s.fast) strike();
        },
        h.p === 'dodge' ? 1750 : 340,
      );
    };
    later(land, descending ? 520 : (LAND[h.p] ?? 100));
  }

  function finish() {
    later(() => {
      const pat = q<HTMLElement>('[data-pat]');
      if (pat) pat.style.opacity = '0';
      q('[data-boss]')?.classList.remove('wbq-crouch', 'wbq-climb', 'wbq-descend', 'wbq-bind', 'wbq-expose');
      const th = q<HTMLElement>('[data-thread]');
      if (th) th.style.height = '0';
      root.current?.querySelectorAll<HTMLElement>('[data-web]').forEach((w) => (w.style.opacity = '0'));
      later(() => {
        sounds.raidVictory();
        setDone(true);
      }, 900);
    }, 300);
  }

  // 뒤로가기 — 아직 공격이 남았으면 건너뛰고 true, 다 끝났으면 false(부모가 순위표로).
  useEffect(() => {
    ctl.current = { skip: () => (st.current.i >= 10 ? false : (skip(), true)) };
    return () => {
      ctl.current = null;
    };
  });

  function skip() {
    const s = st.current;
    if (s.i >= 10) return;
    s.fast = true;
    s.timers.forEach((t) => clearTimeout(t));
    s.timers.length = 0;
    s.busy = false;
    // 거미줄 타기 도중 끊으면 상단 이름표를 되돌리는 예약도 함께 지워진다 — 여기서 바로 되돌린다.
    const head = root.current?.querySelector<HTMLElement>('[data-head]');
    if (head) head.style.opacity = '1';
    strike();
  }

  return (
    <div ref={root} className="relative">
      <div className="relative h-[280px] overflow-hidden bg-slate-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={bgSrc} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" style={PIX} />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_55%,rgba(76,29,149,.12),rgba(2,6,23,.8)_85%)]" />
        <div data-head className="absolute top-3 left-3 z-10 flex items-center gap-1.5 transition-opacity duration-300">
          <span data-phase className="rounded-[4px] bg-violet-700/90 px-1 text-[9px] leading-[1.5] font-extrabold text-violet-50">
            {startPhase.stage}페이즈
          </span>
          <b className="text-[13px] font-extrabold text-slate-100 [text-shadow:0_1px_3px_#000]">{bossName}</b>
        </div>
        <div className="absolute inset-x-3 bottom-2.5 z-10">
          <div className="flex items-baseline justify-between text-[10.5px] text-slate-300 [text-shadow:0_1px_2px_#000]">
            <span>
              다음 페이즈까지{' '}
              <b data-remain className="font-mono text-violet-200">
                {man(startPhase.need - startPhase.into)}
              </b>
            </span>
            <b data-bonus className="text-slate-100">
              페이즈 보너스 +{Math.round((soloPhaseBonus(startPhase.stage) - 1) * 100)}%
            </b>
          </div>
          <div className="mt-1 h-2.5 isolate overflow-hidden rounded-full bg-black/55 ring-1 ring-white/10">
            <div data-hpbar className={phaseBarClass(startPhase.stage)} style={{ width: `${Math.max(2, (startPhase.into / startPhase.need) * 100)}%` }} />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-0 top-[38px] z-10 flex justify-center">
        <div data-pat className="rounded-xl bg-black/60 px-3 py-1 text-center leading-tight whitespace-nowrap text-slate-300 opacity-0 ring-1 ring-white/10 transition-opacity duration-150">
          <b data-pname className="block text-[12px] font-extrabold" />
          <span data-pdesc className="block text-[10px] text-slate-300/90" />
        </div>
        </div>
        <div data-thread className="pointer-events-none absolute top-0 left-1/2 z-[1] w-px -translate-x-1/2 bg-slate-200/70" style={{ height: 0, transition: 'height .3s ease-out' }} />
        {/* 가운데 정렬은 margin으로 — Tailwind v4의 -translate-*는 translate 속성이라 거미줄 타기 오르내림(translate keyframes)과 겹쳐 튄다. */}
        <div data-boss role="img" aria-label={bossName} className="wbq absolute top-[56%] left-1/2 z-[1] -mt-[89.5px] -ml-[89.5px] h-[179px] w-[179px]" style={bossVars} />
        <div data-fx className="pointer-events-none absolute inset-0 z-[5]" />
      </div>

      {!done ? (
        <div className="mx-3 mt-2 grid grid-cols-3 gap-1.5">
          {SLOTS.map((s) => {
            const p = me.pieces.find((x) => x.slot === s);
            return (
              <div key={s} data-gear={s} className={`relative flex items-center gap-1.5 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 px-1.5 py-1 ${!p || p.mult === 0 ? 'opacity-50' : ''}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {p?.src ? <img src={p.src} alt="" className="h-6 w-6" style={PIX} /> : <span className="h-6 w-6" />}
                <span className="min-w-0 leading-tight">
                  <span className="block text-[10px] text-slate-500">{SLOT_KO[s]}</span>
                  {/* 이 부위의 공격력(탑 규칙 적용 뒤) — 옭아매기에 묶이면 이 값이 빠진다(11-13 사용자). */}
                  <b className={`block font-mono text-[11.5px] tabular-nums ${p && p.score > 0 ? 'text-slate-100' : 'text-slate-600'}`}>{p && p.score > 0 ? man(p.score) : '0'}</b>
                </span>
                <span data-web={s} className="absolute inset-0" style={{ background: `url(${fx.webnet}) center/cover no-repeat`, imageRendering: 'pixelated', opacity: 0, transition: 'opacity .2s, scale .25s' }} />
              </div>
            );
          })}
        </div>
      ) : null}

      <div className="mx-3 mt-2.5 flex items-end justify-between">
        <div>
          <div className="text-[10.5px] text-slate-500">이번 피해</div>
          <b data-total className="font-mono text-[26px] leading-none font-black text-violet-100 tabular-nums">
            0
          </b>
        </div>
        <div className="text-right text-[10.5px] leading-snug text-slate-500">
          최고 기록{' '}
          <b data-best className="font-mono text-[11.5px] text-slate-300 transition-colors">
            {run.prevBest == null ? '-' : n(run.prevBest)}
          </b>
          <br />
          <b data-race-note className="text-[10.5px] text-slate-400">
            {raceAt(0).note}
          </b>
        </div>
      </div>
      {/* 기록 경주 막대(11-13 사용자 A안) — 최고 기록까지, 넘으면 다음 순위까지 차오른다. */}
      <div className="mx-3 mt-1.5">
        <div className="h-2 overflow-hidden rounded-full bg-slate-800">
          <div data-race-bar className="h-full rounded-full bg-gradient-to-r from-violet-500 to-slate-200 transition-[width] duration-300" style={{ width: '0%' }} />
        </div>
        <div className="mt-0.5 flex justify-between text-[9.5px] text-slate-500">
          <span>0</span>
          <span data-race-goal>{raceAt(0).goal}</span>
        </div>
      </div>
      <div data-cells className="mx-3 mt-2 grid grid-cols-5 gap-1">
        {Array.from({ length: 10 }, (_, k) => (
          <span key={k} className="relative flex h-[44px] flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-800 text-[10px] text-slate-700">
            {k + 1}
          </span>
        ))}
      </div>

      {done ? (
        <>
          <ResultCard run={run} />
          <div className="px-3 pt-3 pb-1">
            <div className="flex h-11 gap-2">
              {retry ? <div className="flex flex-1 [&>*]:flex-1">{retry}</div> : null}
              <PrimaryButton onClick={onDone}>확인</PrimaryButton>
            </div>
          </div>
        </>
      ) : (
        <div className="px-3 pt-3 pb-1">
          <div className="flex h-12 gap-2">
            <SecondaryButton onClick={skip}>스킵</SecondaryButton>
            <button data-atk type="button" onClick={strike} className="flex-[2] rounded-xl bg-gradient-to-b from-violet-500 to-violet-700 text-[15px] font-black text-violet-50 shadow-[0_2px_10px_rgba(0,0,0,.4)] active:scale-[.97] disabled:opacity-40">
              공격{' '}
              <span className="text-[12px] font-bold opacity-75">
                · <span className="font-mono">{left}</span>번 남음
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 결과 카드(인터랙티브) ────────────────────────────────────────────────────

function ResultCard({ run }: { run: Run }) {
  const card = useRef<HTMLDivElement>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const started = useRef(false);
  // 연출 예약(timeout·interval) — 카드가 사라지면 모두 지운다(순위표 화면에서 보상음이 나지 않게, 11-14 검수).
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    const ts = timers.current;
    return () => {
      ts.forEach((t) => { clearTimeout(t); clearInterval(t); });
      ts.length = 0;
    };
  }, []);
  const at = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));
  const updated = run.prevBest == null || run.score > run.prevBest;
  const stageAfter = soloPhaseFor(run.totalAfter).stage;
  // 기여도 = 내 누적 피해 ÷ 보스 누적 피해(이 판 전·후). 다른 사람이 더 치면 줄어든다 — 최종은 보스가 사라질 때.
  const share = soloShareOf(run.dealt, run.totalAfter);
  const sharePrev = soloShareOf(run.dealt - run.score, run.totalBefore);
  const barPct = share > 0 ? Math.max(2, Math.min(100, share * 100)) : 0;
  const tr = soloShareReward(share, stageAfter);
  const rr = soloRankReward(run.rank);
  const bonus = Math.round((soloPhaseBonus(stageAfter) - 1) * 100);

  // 첫 렌더 뒤 한 번 — 점수 카운트업·빛 스윕·순위 굴림·기여도 막대·칩 순차 등장.
  const reveal = (el: HTMLDivElement | null) => {
    card.current = el;
    if (!el || started.current) return;
    started.current = true;
    const reduce = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const steps = [...el.querySelectorAll<HTMLElement>('[data-step]')];
    const sc = el.querySelector<HTMLElement>('[data-rscore]')!;
    const rk = el.querySelector<HTMLElement>('[data-rrank]')!;
    const tier = el.querySelector<HTMLElement>('[data-rtier]')!;
    const bar = el.querySelector<HTMLElement>('[data-rtbar]')!;
    const delta = el.querySelector<HTMLElement>('[data-rdelta]');
    const show = (x: HTMLElement | undefined | null) => {
      if (!x) return;
      x.style.opacity = '1';
      if (!reduce) x.animate([{ opacity: 0, translate: '0 8px' }, { opacity: 1, translate: '0 0' }], { duration: 260, easing: 'ease-out' });
    };
    const pop = (x: HTMLElement) => !reduce && x.animate([{ scale: '1' }, { scale: '1.25' }, { scale: '1' }], { duration: 240 });
    if (reduce) {
      sc.textContent = n(run.score);
      steps.forEach((x) => (x.style.opacity = '1'));
      rk.textContent = n(run.rank);
      if (delta) delta.style.opacity = '1';
      tier.textContent = soloSharePct(share);
      bar.style.width = `${barPct}%`;
      return;
    }
    el.animate([{ scale: '.94', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 280, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    el.querySelector<HTMLElement>('[data-shine]')?.animate([{ translate: '-150% 0' }, { translate: '400% 0' }], { duration: 900, delay: 250, easing: 'ease-in-out' });
    let t0 = 0;
    const tick = (t: number) => {
      if (!t0) t0 = t;
      const k = Math.min(1, (t - t0) / 900);
      sc.textContent = n(Math.round(run.score * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(tick);
      else pop(sc);
    };
    requestAnimationFrame(tick);
    at(() => show(steps[0]), 950);
    at(() => {
      show(steps[1]);
      const from = run.prevRank ?? run.rank;
      if (from <= run.rank) {
        rk.textContent = n(run.rank);
        show(delta);
        return;
      }
      let r = from;
      const stepN = Math.max(1, Math.ceil((from - run.rank) / 8));
      const iv = setInterval(() => {
        r = Math.max(run.rank, r - stepN);
        rk.textContent = n(r);
        pop(rk);
        if (r <= run.rank) {
          clearInterval(iv);
          show(delta);
          sounds.reward();
        }
      }, 110);
      timers.current.push(iv);
    }, 1150);
    at(() => {
      show(steps[2]);
      bar.style.transition = 'width .7s ease-out';
    }, 1500);
    at(() => {
      tier.textContent = soloSharePct(share);
      if (share > sharePrev) pop(tier);
      bar.style.width = `${barPct}%`;
    }, 1800);
    at(() => show(steps[3]), 2250);
    at(() => show(steps[4]), 2400);
    at(() => show(steps[5]), 2600);
  };

  const hide = { opacity: 0 } as const;
  const band = SOLO_RANK_REWARDS.find((x) => run.rank >= x.from && run.rank <= x.to);
  const rankBand = band ? (band.from === band.to ? `${band.from}위` : `${band.from}~${band.to}위`) : '';
  const rankUp = run.prevRank != null && run.prevRank > run.rank ? run.prevRank - run.rank : 0;
  return (
    <div ref={reveal} className="relative mx-3 mt-3 overflow-hidden rounded-2xl border border-violet-400/60 bg-violet-950/30 px-3.5 py-3 shadow-[0_0_18px_rgba(167,139,250,.2)]">
      <div data-shine className="pointer-events-none absolute inset-y-0 left-0 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-slate-100/20 to-transparent" style={{ translate: '-150% 0' }} />
      <div className="text-center text-[11px] font-bold text-violet-300">{run.prevBest == null ? '첫 기록' : updated ? '기록 갱신' : '이번 기록'}</div>
      <b data-rscore className="block text-center font-mono text-[30px] leading-tight font-black text-violet-50 tabular-nums">
        0
      </b>
      <div data-step style={hide} className="text-center text-[11px] text-slate-400">
        {run.prevBest == null ? (
          '이 기록으로 순위에 올랐어요'
        ) : updated ? (
          <>
            최고 기록 <s className="text-slate-500">{n(run.prevBest)}</s> → <b className="font-mono text-slate-100">{n(run.best)}</b>
          </>
        ) : (
          <>
            최고 기록 <b className="font-mono text-slate-100">{n(run.best)}</b> 유지
          </>
        )}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-1.5">
        <div data-step style={hide} className="rounded-xl bg-black/30 px-2.5 py-2 text-center ring-1 ring-white/[.06]">
          <div className="text-[10px] text-slate-500">순위</div>
          <div className="flex items-baseline justify-center gap-0.5">
            <b data-rrank className="font-mono text-[24px] leading-none font-black text-violet-200">
              {run.prevRank ?? run.rank}
            </b>
            <span className="text-[11px] text-slate-400">위</span>
          </div>
          <div data-rdelta className={`mt-0.5 text-[10px] font-bold ${rankUp ? 'text-emerald-300' : 'text-slate-500'}`} style={hide}>
            {rankUp ? `▲ ${rankUp}` : run.prevRank == null ? '새 기록' : '변동 없음'}
          </div>
        </div>
        <div data-step style={hide} className="rounded-xl bg-black/30 px-2.5 py-2 text-center ring-1 ring-white/[.06]">
          <div className="text-[10px] text-slate-500">기여도</div>
          <b data-rtier className="block text-[20px] leading-none font-black text-slate-100">
            {soloSharePct(sharePrev)}
          </b>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-800">
            <div data-rtbar className="h-full rounded-full bg-gradient-to-r from-violet-500 to-slate-200" style={{ width: '0%' }} />
          </div>
          <div className="mt-0.5 text-[9.5px] text-slate-500">내 누적 피해 {man(run.dealt)}</div>
        </div>
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {rr.diamond > 0 ? (
          <button
            data-step
            style={hide}
            type="button"
            onClick={() => setDetail((x) => (x === 'rank' ? null : 'rank'))}
            className={`rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-slate-100 ring-1 ${detail === 'rank' ? 'ring-violet-300' : 'ring-violet-400/40'}`}
          >
            순위 {rewardText(rr)}
          </button>
        ) : null}
        <button
          data-step
          style={hide}
          type="button"
          onClick={() => setDetail((x) => (x === 'tier' ? null : 'tier'))}
          className={`rounded-full bg-black/35 px-2.5 py-1 text-[11px] font-bold text-slate-100 ring-1 ${detail === 'tier' ? 'ring-violet-300' : 'ring-violet-400/40'}`}
        >
          참가·기여 {rewardText(tr)}
        </button>
      </div>
      {detail ? (
        <p className="mt-1.5 text-center text-[10.5px] leading-snug text-slate-300">
          {detail === 'rank'
            ? `${rankBand} 순위 보상이에요. 보스가 사라질 때 최종 순위로 정해져요.`
            : josa(`참가 ${rewardText(SOLO_JOIN_REWARD)}#{와} 기여도 ${soloSharePct(share)} 몫에 페이즈 보너스 +${bonus}%(${stageAfter}페이즈)를 더한 지금 값이에요. 다른 사람이 도전하면 기여도가 바뀌고, 보스가 사라질 때 정해져요.`)}
        </p>
      ) : null}
      <span data-step style={hide} />
      {/* 시안과 같은 6단계 — 칩이 하나면 빈 자리를 채운다. */}
      {rr.diamond > 0 ? null : <span data-step style={hide} />}
    </div>
  );
}

// ── 안내 시트 ───────────────────────────────────────────────────────────────

/** 안내 팝업 공통 표 — 머리줄 + 줄(px-3 py-2), 본문 카드(bodyPad sm) 안에 바로. */
function SheetTable({ head, rows, hi }: { head: [string, string]; rows: [string, string][]; hi?: number }) {
  return (
    <table className="w-full overflow-hidden rounded-xl text-[12.5px]">
      <thead>
        <tr className="bg-slate-950/80 text-[11px] text-slate-500">
          <th className="px-3 py-1.5 text-left font-bold">{head[0]}</th>
          <th className="px-3 py-1.5 text-right font-bold">{head[1]}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {rows.map(([a, b], i) => (
          <tr key={a} className={i === hi ? 'bg-violet-500/15' : ''}>
            <td className={`px-3 py-2 font-bold ${i === hi ? 'text-violet-200' : 'text-slate-200'}`}>{a}</td>
            <td className="px-3 py-2 text-right font-bold text-slate-100 tabular-nums">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const PATTERN_ORDER = ['crouch', 'weapon', 'armor', 'accessory', 'dodge', 'expose'] as const;

function PatternSheet({ spriteSrc, fx, onClose }: { spriteSrc: string; fx: SoloFx; onClose: () => void }) {
  return (
    <ModalShell onClose={onClose} label="여왕의 패턴">
      <ModalLayout title="여왕의 패턴" footer={<ModalButton onClick={onClose}>닫기</ModalButton>} bodyPad="sm">
        <ul className="divide-y divide-slate-800">
          {PATTERN_ORDER.map((k) => {
            const label = SOLO_PATTERN_LABEL[k];
            return (
              <li key={k} className="flex items-center gap-3 px-2 py-2">
                <span className="relative flex h-9 w-9 flex-none items-center justify-center overflow-hidden rounded-lg bg-slate-900 ring-1 ring-violet-500/25">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={spriteSrc} alt="" className="h-8 w-8" style={PIX} />
                  {k === 'weapon' || k === 'armor' || k === 'accessory' ? <span className="absolute inset-0" style={{ background: `url(${fx.webnet}) center/cover no-repeat`, imageRendering: 'pixelated' }} /> : null}
                  {k === 'expose' ? <span className="absolute inset-0 bg-[radial-gradient(circle,rgba(251,113,133,.45),transparent_65%)]" /> : null}
                </span>
                <b className={`flex-1 text-[13px] font-extrabold ${PATTERN_TONE[k]}`}>{label.name}</b>
                <span className="flex-none text-[12px] text-slate-300">{label.desc}</span>
              </li>
            );
          })}
        </ul>
      </ModalLayout>
    </ModalShell>
  );
}

function RewardSheet({ stage, share, rank, onClose }: { stage: number; share: number | null; rank: number | null; onClose: () => void }) {
  const bonus = Math.round((soloPhaseBonus(stage) - 1) * 100);
  const m = soloPhaseBonus(stage);
  const myBand = rank == null ? -1 : SOLO_RANK_REWARDS.findIndex((r) => rank >= r.from && rank <= r.to);
  const per1 = { diamond: Math.round(SOLO_SHARE_POOL.diamond * 0.01 * m), boxes: Math.round(SOLO_SHARE_POOL.boxes * 0.01 * m) };
  const rows: [string, string][] = [
    ['참가 보상', rewardText(soloShareReward(0, stage))],
    ['기여도 1%마다', rewardText(per1)],
  ];
  if (share != null) rows.push([`내 기여도 ${soloSharePct(share)}`, rewardText(soloShareReward(share, stage))]);
  return (
    <ModalShell onClose={onClose} label="보상 안내">
      <ModalLayout title="보상 안내" subtitle={`${stage}페이즈 · 페이즈 보너스 +${bonus}%`} footer={<ModalButton onClick={onClose}>닫기</ModalButton>} bodyPad="sm">
        <div className="space-y-2">
          <p className="px-1 text-[11px] leading-snug text-slate-400">
            기여도는 여왕이 받은 전체 피해 중 내가 넣은 피해예요.
            <br />
            모든 도전의 피해를 더해서 정해져요.
          </p>
          <SheetTable head={['참가·기여도', '보상']} rows={rows} hi={share != null ? rows.length - 1 : undefined} />
          <SheetTable head={['순위', '보상']} rows={SOLO_RANK_REWARDS.map((r) => [r.from === r.to ? `${r.from}위` : `${r.from}~${r.to}위`, rewardText(r)])} hi={myBand >= 0 ? myBand : undefined} />
        </div>
      </ModalLayout>
    </ModalShell>
  );
}

/** 아바타 고르기(무한의 탑 '선택 아바타'와 같은 모양) — 고르면 그 아바타 기준 가장 센 장비로 맞췄을 때 전투력 순. */
function AvatarSheet({ me, onPick, onClose }: { me: SoloMe; onPick: (id: string) => void; onClose: () => void }) {
  const rows = me.avatars
    .map((a) => ({ a, lo: loadoutWith(me, a.keys) }))
    .sort((x, y) => Number(y.a.active) - Number(x.a.active) || y.lo.total - x.lo.total);
  return (
    <ModalShell onClose={onClose} label="아바타">
      <ModalLayout title="아바타" subtitle="고르면 그 아바타에 맞는 장비로 함께 바꿔요" bodyPad="sm" maxBodyClass="max-h-[56vh]" footer={<ModalButton tone="neutral" onClick={onClose}>닫기</ModalButton>}>
        <div className="flex flex-col gap-1.5">
          {rows.map(({ a, lo }) => (
            <button key={a.id} type="button" onClick={() => onPick(a.id)} className={`flex h-[56px] w-full items-center gap-2.5 rounded-xl border px-2.5 text-left ${a.active ? 'border-violet-400 bg-violet-500/10' : 'border-slate-800'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {a.south ? <img src={a.south} alt="" className="h-10 w-auto" style={PIX} /> : <span className="h-10 w-8" />}
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block text-[12px]">{a.isDefault ? '기본 아바타' : '나만의 아바타'}</b>
                {a.keys ? (
                  <span className="mt-1 flex gap-1">
                    {SLOTS.map((sl) => {
                      const k = a.keys?.[sl];
                      const on = !!k && lo.pieces.some((p) => p.slot === sl && p.key === k && p.mult === 2);
                      return (
                        <span key={sl} className={`relative flex h-6 w-6 flex-none items-center justify-center rounded-[5px] border ${on ? 'border-amber-400 bg-amber-950/60 shadow-[0_0_8px_rgba(251,191,36,.35)]' : 'border-slate-700 bg-slate-900 opacity-40 grayscale'}`}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {k ? <img src={assetUrl(`/sprites/${sl}/${k}.png`)} alt="" className="h-[19px] w-[19px]" style={PIX} /> : null}
                        </span>
                      );
                    })}
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500">만들 때 입은 장비 없음</span>
                )}
              </span>
              <span className="flex-none text-[10.5px] text-slate-300 tabular-nums">
                전투력 <b className="text-violet-200">{n(lo.total)}</b>
              </span>
            </button>
          ))}
        </div>
      </ModalLayout>
    </ModalShell>
  );
}

/** 요구 장비 고르기(탑의 착용 가능 장비 목록과 같은 방식, 11-13 사용자 1안) — 부위 탭 · 가진 것 먼저(장착 중 맨 위) · 못 가진 것은 흐리게. */
function PoolSheet({ d, slot, onSlot, onEquip, pending, onClose }: { d: SoloDetail; slot: SoloSlot; onSlot: (s: SoloSlot) => void; onEquip: (ueid: string) => void; pending: boolean; onClose: () => void }) {
  const mine = (d.me?.requiredItems ?? []).filter((x) => x.slot === slot);
  const ownedKeys = new Set(mine.map((x) => x.key));
  const missing = d.pool[slot].filter((x) => !ownedKeys.has(x.key));
  return (
    <ModalShell onClose={onClose} label="요구 장비">
      <ModalLayout title="요구 장비" footer={<ModalButton onClick={onClose}>닫기</ModalButton>} bodyPad="sm" maxBodyClass="max-h-[62vh]">
        <div className="grid grid-cols-3 gap-1 p-1">
          {SLOTS.map((s) => (
            <button key={s} type="button" onClick={() => onSlot(s)} className={`rounded-lg border py-1.5 text-[11.5px] font-extrabold tabular-nums ${slot === s ? 'border-violet-400/70 bg-violet-950/50 text-violet-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}>
              {SLOT_KO[s]} {(d.me?.requiredItems ?? []).filter((x) => x.slot === s).length}/{d.pool[s].length}
            </button>
          ))}
        </div>
        <div className="mt-1 flex flex-col gap-1.5 p-1">
          {mine.length === 0 ? <p className="py-3 text-center text-[11.5px] text-slate-500">이 부위의 요구 장비가 아직 없어요.</p> : null}
          {mine.map((it) => (
            <div key={it.ueid} className={`flex items-center gap-2 rounded-xl border px-2 py-1.5 ${it.equipped ? 'border-violet-400 bg-violet-950/40' : 'border-slate-800 bg-slate-950'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.src ? <img src={it.src} alt="" className="h-9 w-9 flex-none rounded-md bg-slate-900" style={PIX} /> : <span className="h-9 w-9" />}
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block truncate text-[12px] text-slate-100">{it.name}</b>
                <span className="text-[10px] text-slate-400">+{it.level}{it.transcend ? ` · 초월 ${it.transcend}` : ''}</span>
              </span>
              <span className="flex-none text-right leading-tight">
                <b className={`block text-[13px] tabular-nums ${it.mult === 2 ? 'text-amber-300' : 'text-slate-100'}`}>{n(it.score)}</b>
                <span className="text-[9.5px] text-slate-500 tabular-nums">{n(it.cp)} ×{it.mult}</span>
              </span>
              {it.equipped ? (
                <span className="w-[52px] flex-none text-center text-[10.5px] font-black text-violet-300">장착 중</span>
              ) : (
                <button type="button" onClick={() => onEquip(it.ueid)} disabled={pending} className="w-[52px] flex-none rounded-lg bg-violet-600 py-1.5 text-[11px] font-black text-violet-50 disabled:opacity-50">
                  장착
                </button>
              )}
            </div>
          ))}
          {missing.map((it) => (
            <div key={it.key} className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 opacity-45">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.src ? <img src={it.src} alt="" className="h-9 w-9 flex-none rounded-md bg-slate-900" style={PIX} /> : <span className="h-9 w-9" />}
              <span className="min-w-0 flex-1 leading-tight">
                <b className="block truncate text-[12px] text-slate-100">{it.name}</b>
                <span className="text-[10px] text-slate-400">아직 얻지 못한 장비</span>
              </span>
              <span className="w-[52px] flex-none text-center text-[10px] text-slate-500">미보유</span>
            </div>
          ))}
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
