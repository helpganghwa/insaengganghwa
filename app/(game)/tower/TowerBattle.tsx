import { useCallback, useEffect, useRef, useState } from 'react';
import { josa } from 'josa';

import { BackTitle } from '@/components/BackNav';
import { assetUrl } from '@/lib/asset-versions';
import { sounds } from '@/lib/game/sound';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, towerRequirement } from '@/lib/game/balance';
import type { TowerTurn } from '@/lib/game/tower/battle';
import { TOWER_EVENT_TAG, towerFloorInfo, towerResultLine, towerTurnLine, type TowerFloorInfo } from '@/lib/game/tower/floors';
import type { TowerChallengeResult } from '@/lib/game/tower/service';

import { ActionBar, AttemptsChip, FloorKicker, PIX, PrimaryButton, SecondaryButton, n, rewardText } from './TowerUi';

const STEP_MS = 700;
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 층 화면(상세·전투) 바탕 — 풀스크린, 장면 그림은 무대에만. */
export const FLOOR_MAIN = 'flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-hidden bg-[#100f0e] text-zinc-100';
/** 무대 아래 구역 구분선. */
export const FLOOR_ROW = 'border-b border-[rgba(168,145,107,.18)]';

/** 층 화면 헤더 — 상세·전투 공통(뒤로 · N층 · 준비/턴 · 오늘 도전). 전투 중엔 뒤로 가기가 잠긴다. */
export function TowerFloorHeader({ floor, left, turn, onBack, locked }: { floor: number; left: number; turn?: string | null; onBack?: () => void; locked?: boolean }) {
  return (
    <div className={`flex-none px-3 pt-1.5 pb-1 ${locked ? '[&>div>button:first-child]:pointer-events-none [&>div>button:first-child]:opacity-30' : ''}`}>
      <BackTitle
        title={`${floor}층`}
        fallback="/tower"
        onBack={onBack}
        right={
          <span className="flex items-center gap-1.5">
            {turn ? <span className="rounded-full border border-[rgba(168,145,107,.28)] bg-black/45 px-2 py-0.5 text-[11px] font-bold tabular-nums text-zinc-200">{turn}</span> : null}
            <AttemptsChip left={left} />
          </span>
        }
      />
    </div>
  );
}

type Fight = { cur: TowerTurn | null; prev: TowerTurn | null; shown: number; ended: boolean; win: boolean };

/**
 * 무대 — 상세·전투 공통, 풀스크린. 위 층 정보(머리 줄 · 몬스터 이름 · 빨강 전투력 칩 · 돌파 보상 칩) + 장면 창 + 해설 한 줄.
 * 나·층 주인 자리와 발 높이는 고정 — 대기(fight 없음)와 판정 전·전투 중이 같은 그림이고, 공격한 쪽만 빛나며 짧게 튀었다 제자리로 온다.
 */
export function TowerStage({ floor, info, meImg, meCp, fight, narration, tone = 'idle' }: {
  floor: number;
  info: TowerFloorInfo;
  meImg: string | null;
  meCp: number;
  fight?: Fight;
  narration: string;
  tone?: 'idle' | 'play' | 'win' | 'lose';
}) {
  const cur = fight?.cur ?? null;
  const prev = fight?.prev ?? null;
  const shown = fight?.shown ?? 0;
  const hitTarget: 'me' | 'mon' | null = cur && cur.damage > 0 ? (cur.actor === 'me' ? 'mon' : 'me') : null;
  return (
    <section className={`flex-none ${FLOOR_ROW}`}>
      <div className="flex items-end gap-2 border-t border-[rgba(168,145,107,.18)] px-3 py-1.5">
        <div className="min-w-0 flex-1 leading-tight">
          <div className="flex"><FloorKicker floor={floor} info={info} /></div>
          <b className="block truncate text-[15px] font-black">{info.name}</b>
        </div>
        <div className="flex flex-none flex-col items-end gap-1">
          <span className="rounded-full border border-red-400/40 bg-black/40 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-red-300">전투력 {n(towerRequirement(floor))}</span>
          <span className="rounded-full border border-[rgba(168,145,107,.28)] bg-black/40 px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-zinc-200">돌파 {rewardText(floor)}</span>
        </div>
      </div>
      <div className="relative h-[204px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(`/sprites/tower/scene/${info.scene}.png`)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={PIX} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 to-black/45" />
        {hitTarget ? <div key={`f${shown}`} className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/50 mix-blend-screen" /> : null}
        <Fighter
          side="l"
          cp={meCp}
          img={meImg}
          act={!!cur && !fight?.ended && cur.actor === 'me'}
          hit={hitTarget === 'me'}
          stepKey={shown}
          dmg={hitTarget === 'me' ? cur!.damage : null}
          hp={cur ? cur.meHp : 100}
          hpBefore={prev ? prev.meHp : 100}
          down={!!fight?.ended && !fight.win}
        />
        <Fighter
          side="r"
          cp={towerRequirement(floor)}
          img={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)}
          act={!!cur && !fight?.ended && cur.actor === 'mon'}
          hit={hitTarget === 'mon'}
          stepKey={shown}
          dmg={hitTarget === 'mon' ? cur!.damage : null}
          hp={cur ? cur.monHp : 100}
          hpBefore={prev ? prev.monHp : 100}
          down={!!fight?.ended && fight.win}
        />
      </div>
      {/* 해설 — 장면 위가 아니라 무대 아래 줄(밝은 장면에서도 읽히게). 대기엔 층 서술, 전투 중엔 지금 줄, 끝나면 결말. 2줄 고정. */}
      <div className="flex h-10 items-center justify-center bg-black/30 px-4">
        <p className={`line-clamp-2 text-center text-[11.5px] leading-snug break-keep ${tone === 'win' ? 'font-bold text-emerald-300' : tone === 'lose' ? 'font-bold text-red-300' : tone === 'idle' ? 'text-zinc-400' : 'text-zinc-100'}`}>
          {narration}
        </p>
      </div>
    </section>
  );
}

/**
 * 전투(TOWER.md §7) — 층 화면(상세)과 같은 헤더·무대에서 그대로 이어 싸운다(화면 전환 없음).
 * 상세의 장비 자리에 데미지 중심 기록이 쌓이고, 끝나면 결말 상자가 붙는다. 건너뛰기 없이 끝까지 재생,
 * 진 판은 결말에서 결정적 순간부터 다시 볼 수 있다. result가 null이면 판정 대기 — 대기와 같은 무대를 먼저 보여 준다(낙관적 전환).
 */
export function TowerBattle({ floor, result, myCp, attemptsBefore, avatarSouth, retrying, onList, onNext, onRetry, onGear }: {
  floor: number;
  /** 판정 전 헤더에 보여 줄 남은 도전(결과가 오면 결과 값). */
  attemptsBefore: number;
  result: TowerChallengeResult | null;
  /** 판정 전(낙관적 전환) 보여 줄 내 탑 전투력 — 결과가 오면 결과 값을 쓴다. */
  myCp: number;
  avatarSouth: string | null;
  retrying: boolean;
  onList: () => void;
  onNext: () => void;
  onRetry: () => void;
  onGear: () => void;
}) {
  const info: TowerFloorInfo = towerFloorInfo(floor);
  const turns = result?.turns ?? [];
  const total = turns.length;
  const [shown, setShown] = useState(0);
  const [ended, setEnded] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const stop = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };
  const finish = useCallback(() => {
    stop();
    setShown(total);
    setEnded(true);
  }, [total]);
  const play = useCallback(
    (from = 0) => {
      stop();
      setEnded(false);
      setShown(from);
      if (prefersReduced()) return finish();
      let i = from;
      timer.current = setInterval(() => {
        i += 1;
        setShown(i);
        if (i >= total) finish();
      }, STEP_MS);
    },
    [finish, total],
  );
  useEffect(() => {
    if (!result) return;
    play(0);
    return stop;
  }, [play, result]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown, ended]);
  // 효과음 — 대난투와 같은 소리: 한 줄마다 타격음, 쓰러뜨린 한 방은 KO, 돌파하면 팡파레(설정의 효과음 끄기를 따른다).
  useEffect(() => {
    const t = shown > 0 ? turns[shown - 1] : null;
    if (!t || t.damage <= 0) return;
    if (t.monHp <= 0 || t.meHp <= 0) sounds.meleeKo();
    else sounds.meleeHit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (ended && result?.win) sounds.meleeVictory();
  }, [ended, result?.win]);

  const cur: TowerTurn | null = shown > 0 ? turns[shown - 1]! : null;
  const prev: TowerTurn | null = shown > 1 ? turns[shown - 2]! : null;
  const keyIdx = Math.min(Math.max(0, result?.keyIndex ?? 0), Math.max(0, total - 1));
  const keyTurn = turns[keyIdx];
  const win = !!result?.win;
  const nextFloor = Math.min(TOWER_FLOORS, floor + 1);
  const left = result?.attemptsLeft ?? 0;
  const done = !!result && ended;
  const narration = !result
    ? josa(`${info.name}#{와} 마주 섰다. 전투를 준비하는 중…`)
    : ended
      ? towerResultLine(win, info.name, turns[total - 1]?.turn ?? total)
      : cur
        ? towerTurnLine(cur, info.name)
        : info.line;

  return (
    <main className={FLOOR_MAIN}>
      <TowerFloorHeader floor={floor} left={result ? left : attemptsBefore} turn={cur ? `${cur.turn}턴` : '준비'} onBack={done ? onList : undefined} locked={!done} />
      <TowerStage
        floor={floor}
        info={info}
        meImg={avatarSouth}
        meCp={result?.towerCp ?? myCp}
        fight={{ cur, prev, shown, ended, win }}
        narration={narration}
        tone={!done ? 'play' : win ? 'win' : 'lose'}
      />

      {/* 기록 — 상세의 장비 자리. 한 줄 = 누가 · 얼마(큰 숫자) · 맞은 쪽 체력 막대(깎인 만큼 밝게) · 남은 체력, 아래에 짧은 서술. */}
      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {!result ? <p className="py-6 text-center text-[11.5px] text-zinc-500">전투를 준비하는 중…</p> : null}
        <ul>
          {turns.slice(0, shown).map((t, i) => (
            <LogRow key={i} t={t} first={i === 0 || turns[i - 1]!.turn !== t.turn} monName={info.name} mark={done && !win && i === keyIdx} />
          ))}
        </ul>
        {done ? (
          win ? (
            <div className="mx-3 my-2.5 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2">
              <b className="block text-[13px] text-emerald-300">돌파</b>
              <div className="text-[11.5px] text-zinc-300">
                {floor < TOWER_FLOORS ? `${nextFloor}층의 문이 열렸다 · 다음 상대 ${towerFloorInfo(nextFloor).name}` : '지금 열린 가장 높은 층까지 올랐다.'}
              </div>
              <div className="text-[11.5px] text-zinc-400">오늘 도전 <Left left={left} /> 그대로</div>
              {result.reward ? (
                <button type="button" onClick={onList} className="mt-1 text-[11.5px] font-bold text-amber-300">
                  돌파 보상 💎 {n(result.reward.diamond)}{result.reward.boxes ? ` · 📦 ${result.reward.boxes}` : ''} · 목록에서 받기 ›
                </button>
              ) : null}
            </div>
          ) : (
            <div className="mx-3 my-2.5 rounded-xl border border-red-500/40 bg-red-500/10 px-3 py-2">
              <b className="block text-[13px] text-red-300">물러남</b>
              {keyTurn ? (
                <div className="text-[11.5px] text-zinc-300">
                  결정적인 순간 · {keyTurn.turn}턴 {towerTurnLine(keyTurn, info.name)}{' '}
                  <button type="button" onClick={() => play(keyIdx)} className="font-bold text-amber-300">그 장면 다시 보기 ›</button>
                </div>
              ) : null}
              <div className="text-[11.5px] text-zinc-400">오늘 도전 <Left left={left} /></div>
            </div>
          )
        ) : null}
      </div>

      {/* 버튼 줄 — 늘 두 칸(왼쪽 보조 · 오른쪽 주). 판정·재생 중엔 둘 다 잠김. */}
      <div className="flex-none px-3 pt-2 pb-3">
        <ActionBar>
          {!done ? (
            <>
              <SecondaryButton disabled>목록</SecondaryButton>
              <PrimaryButton disabled>{result ? '전투 중…' : '전투 준비 중…'}</PrimaryButton>
            </>
          ) : win ? (
            <>
              <SecondaryButton onClick={onList}>목록</SecondaryButton>
              {floor < TOWER_FLOORS ? <PrimaryButton onClick={onNext}>{nextFloor}층으로</PrimaryButton> : <PrimaryButton disabled>꼭대기</PrimaryButton>}
            </>
          ) : (
            <>
              <SecondaryButton onClick={left > 0 ? onGear : onList}>{left > 0 ? '장비·아바타' : '목록'}</SecondaryButton>
              <PrimaryButton onClick={onRetry} disabled={left <= 0 || retrying}>
                {left <= 0 ? '오늘 도전 끝' : retrying ? '도전 중…' : '다시 도전'}
              </PrimaryButton>
            </>
          )}
        </ActionBar>
      </div>
    </main>
  );
}

/** 기록 한 줄 — 데미지 중심. 나=금색, 적=빨강. 막대는 맞은 쪽 체력(남은 만큼 + 이번에 깎인 만큼 밝게). */
function LogRow({ t, first, monName, mark }: { t: TowerTurn; first: boolean; monName: string; mark: boolean }) {
  const mine = t.actor === 'me';
  const tag = t.event ? TOWER_EVENT_TAG[t.event] : null;
  const after = Math.max(0, mine ? t.monHp : t.meHp);
  const before = Math.min(100, after + Math.max(0, t.damage));
  return (
    <li className={`grid grid-cols-[30px_1fr_58px] items-center gap-2 border-b border-[rgba(168,145,107,.1)] px-3 py-1.5 ${mark ? 'bg-red-950/40' : ''}`}>
      <span className="text-center text-[10.5px] font-bold tabular-nums text-zinc-500">{first ? `${t.turn}턴` : ''}</span>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className={`flex-none rounded px-1 text-[9.5px] font-black ${mine ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}>{mine ? '나' : '적'}</span>
          {/* 맞은 쪽 체력 — 남은 만큼(흐리게) + 이번에 깎인 만큼(밝게). */}
          <span className="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <span className={`absolute inset-y-0 left-0 ${mine ? 'bg-red-400/45' : 'bg-emerald-400/45'}`} style={{ width: `${after}%` }} />
            <span className={`absolute inset-y-0 ${mine ? 'bg-amber-300' : 'bg-red-400'}`} style={{ left: `${after}%`, width: `${before - after}%` }} />
          </span>
          {tag ? <span className={`flex-none rounded px-1 text-[9.5px] font-black ${tag.cls}`}>{tag.label}</span> : null}
        </div>
        <p className="mt-0.5 truncate text-[10.5px] text-zinc-400">{towerTurnLine(t, monName)}</p>
      </div>
      <span className="text-right leading-tight">
        {t.damage > 0 ? (
          <b className={`block text-[15px] font-black tabular-nums ${mine ? 'text-amber-300' : 'text-red-300'}`}>-{Math.round(t.damage)}</b>
        ) : (
          <b className="block text-[11px] text-zinc-500">{t.event === 'miss' ? '빗나감' : '-'}</b>
        )}
        <span className="text-[9.5px] tabular-nums text-zinc-500">{mine ? '적' : '나'} {Math.round(after)}%</span>
      </span>
    </li>
  );
}

/** 무대 위 한쪽 — 자리·크기 고정(전투력 칩 · 체력바 · 몸). 공격한 쪽은 빛 + 짧게 튀었다 제자리, 맞으면 흔들리고 피해량이 뜬다. */
function Fighter({ side, cp, img, act, hit, stepKey, dmg, hp, hpBefore, down }: {
  side: 'l' | 'r';
  cp: number;
  img: string | null;
  act: boolean;
  hit: boolean;
  stepKey: number;
  dmg: number | null;
  hp: number;
  hpBefore: number;
  down: boolean;
}) {
  // 체력바: 이전 → 지금으로 줄어드는 연출.
  const [pct, setPct] = useState(hpBefore);
  useEffect(() => {
    setPct(hpBefore);
    const id = requestAnimationFrame(() => setPct(hp));
    return () => cancelAnimationFrame(id);
  }, [hp, hpBefore, stepKey]);
  const motion = act ? (side === 'l' ? 'animate-lunge-r' : 'animate-lunge-l') : hit ? 'animate-hit-shake' : '';
  return (
    <div className={`absolute bottom-3 flex w-36 flex-col items-center gap-1 ${side === 'l' ? 'left-[6%]' : 'right-[6%]'}`}>
      <span className={`rounded-full bg-black/60 px-2 py-0.5 text-[10.5px] font-black tabular-nums ${side === 'l' ? 'text-amber-300' : 'text-red-300'}`}>{n(cp)}</span>
      <div className="isolate h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
        <div className={`h-full ${hpColor(pct)}`} style={{ width: `${Math.max(0, pct)}%`, transition: 'width 650ms ease-out' }} />
      </div>
      <div key={`${stepKey}${act ? 'a' : hit ? 'h' : ''}`} className={`relative h-[100px] w-36 ${motion}`}>
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-4 z-20 font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">-{Math.round(dmg)}</div>
        ) : null}
        <div className="h-full w-full transition-[opacity,filter] duration-500 ease-out" style={{ opacity: down ? 0.3 : 1, filter: down ? 'grayscale(1)' : 'none' }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className={`h-full w-full object-contain object-bottom ${act ? 'drop-shadow-[0_0_6px_rgba(251,191,36,.85)]' : 'drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]'}`}
              style={{ ...PIX, transform: `scaleX(${side === 'r' ? -1 : 1})`, transformOrigin: 'center bottom' }}
            />
          ) : null}
        </div>
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 -z-10 h-2 w-20 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
    </div>
  );
}

/** 잔여 체력 비율별 게이지 색(대난투와 같은 녹→황→주→적). */
function hpColor(pct: number): string {
  if (pct > 55) return 'bg-emerald-500';
  if (pct > 30) return 'bg-amber-400';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-red-700';
}

/** 남은 도전 N/3 — 다 쓰면 N(0)만 빨간색. */
function Left({ left }: { left: number }) {
  return (
    <b className="tabular-nums">
      <span className={left <= 0 ? 'text-red-400' : 'text-zinc-100'}>{left}</span>
      <span className="font-normal text-zinc-400">/{TOWER_DAILY_ATTEMPTS}</span>
    </b>
  );
}
