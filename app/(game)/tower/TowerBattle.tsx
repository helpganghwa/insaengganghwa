import { useCallback, useEffect, useRef, useState } from 'react';
import { josa } from 'josa';

import { BackTitle } from '@/components/BackNav';
import { assetUrl } from '@/lib/asset-versions';
import { sounds } from '@/lib/game/sound';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, towerRequirement } from '@/lib/game/balance';
import type { TowerTurn } from '@/lib/game/tower/battle';
import { TOWER_EVENT_TAG, towerFloorInfo, towerResultLine, towerTurnLine, type TowerFloorInfo } from '@/lib/game/tower/floors';
import type { TowerChallengeResult } from '@/lib/game/tower/service';

import { ActionBar, AttemptsChip, FloorKicker, PANEL, PIX, PrimaryButton, SecondaryButton, n, pageBg, rewardText } from './TowerUi';

const STEP_MS = 700;
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 잔여 체력 비율별 게이지 색(대난투와 같은 녹→황→주→적). */
function hpColor(pct: number): string {
  if (pct > 55) return 'bg-emerald-500';
  if (pct > 30) return 'bg-amber-400';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-red-700';
}

/** 층 화면 헤더 — 상세·전투 공통(뒤로 · N층 · 오늘 도전, 전투 중엔 TURN 칩). */
export function TowerFloorHeader({ floor, left, turn, onBack }: { floor: number; left: number; turn?: string | null; onBack?: () => void }) {
  return (
    <BackTitle
      title={`${floor}층`}
      fallback="/tower"
      onBack={onBack}
      className="flex-none"
      right={
        <span className="flex items-center gap-1.5">
          {turn ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-mono text-[10.5px] font-bold tracking-wider text-amber-200">{turn}</span> : null}
          <AttemptsChip left={left} />
        </span>
      }
    />
  );
}

type Fight = { cur: TowerTurn | null; prev: TowerTurn | null; shown: number; ended: boolean; win: boolean };

/**
 * 무대 패널 — 상세·전투 공통. 위 줄(층·장소·돌파 보상) + 장면 창(나 ↔ 층 주인) + 장면 아래 해설 한 줄.
 * fight가 없으면 대기(상세): 둘이 마주 서 있고 체력은 가득, 해설 자리엔 층 서술. 도전하면 같은 자리에서 그대로 싸운다.
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
    <div className={`${PANEL} flex-none overflow-hidden`}>
      <div className="flex h-8 items-center justify-between gap-2 border-b border-[rgba(168,145,107,.18)] px-3">
        <FloorKicker floor={floor} info={info} />
        <span className="flex-none text-[11px] font-bold tabular-nums text-zinc-200">돌파 {rewardText(floor)}</span>
      </div>
      <div className="relative h-[216px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(`/sprites/tower/scene/${info.scene}.png`)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={PIX} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/10 via-black/25 to-black/80" />
        {hitTarget ? <div key={`f${shown}`} className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/60 mix-blend-screen" /> : null}
        <div className="relative z-10 grid h-[176px] grid-cols-2 items-end pt-1">
          <div className="flex justify-center">
            <Fighter
              name="나"
              cp={meCp}
              img={meImg}
              side="l"
              role={fight ? (cur?.actor === 'mon' ? 'def' : 'atk') : null}
              hit={hitTarget === 'me'}
              stepKey={shown}
              dmg={hitTarget === 'me' ? cur!.damage : null}
              hp={cur ? cur.meHp : 100}
              hpBefore={prev ? prev.meHp : 100}
              down={!!fight?.ended && !fight.win}
            />
          </div>
          <div className="flex justify-center">
            <Fighter
              name={info.name}
              cp={towerRequirement(floor)}
              img={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)}
              side="r"
              role={fight ? (cur?.actor === 'mon' ? 'atk' : 'def') : null}
              hit={hitTarget === 'mon'}
              stepKey={shown}
              dmg={hitTarget === 'mon' ? cur!.damage : null}
              hp={cur ? cur.monHp : 100}
              hpBefore={prev ? prev.monHp : 100}
              down={!!fight?.ended && fight.win}
            />
          </div>
        </div>
        {/* 해설 — 대기엔 층 서술, 전투 중엔 지금 줄, 끝나면 결말. 2줄 고정(레이아웃 시프트 방지). */}
        <div className="relative z-10 flex h-10 items-center justify-center px-4">
          <p className={`line-clamp-2 text-center text-[11.5px] leading-snug break-keep italic drop-shadow ${tone === 'win' ? 'font-bold text-emerald-300' : tone === 'lose' ? 'font-bold text-red-300' : tone === 'idle' ? 'text-zinc-300' : 'text-zinc-100'}`}>
            {narration}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * 전투(TOWER.md §7) — 층 화면(상세)과 같은 헤더·무대 패널에서 그대로 이어 싸운다(화면 전환 없음).
 * 상세의 장비 패널 자리에 턴 기록이 쌓이고, 끝나면 결과가 기록 끝에 결말로 붙는다.
 * 건너뛰기 없이 끝까지 재생한다. 진 판은 결말에서 결정적 순간부터 다시 볼 수 있다.
 * result가 null이면 도전 직후 — 서버 판정을 기다리는 동안 무대를 먼저 보여 준다(낙관적 전환).
 * 양쪽 이름 아래에 전투력(나=탑 전투력, 층 주인=그 층 요구치)을 둔다(2차 피드백 1).
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
  const narration = !result
    ? josa(`${info.name}#{와} 마주 섰다. 전투를 준비하는 중…`)
    : ended
      ? towerResultLine(win, info.name, turns[total - 1]?.turn ?? total)
      : cur
        ? towerTurnLine(cur, info.name)
        : info.line;

  return (
    <main className="flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col gap-2 overflow-hidden px-3 pt-1.5 pb-3 text-zinc-100" style={pageBg(info.scene)}>
      {/* 결과가 나오기 전엔 뒤로 가기를 막는다(판정 대기 중 목록으로 나가면 결과가 어긋난다). */}
      <TowerFloorHeader floor={floor} left={result ? left : attemptsBefore} turn={cur ? `${cur.turn} TURN` : 'READY'} onBack={result && ended ? onList : () => {}} />
      <TowerStage
        floor={floor}
        info={info}
        meImg={avatarSouth}
        meCp={result?.towerCp ?? myCp}
        fight={{ cur, prev, shown, ended, win }}
        narration={narration}
        tone={!result || !ended ? 'play' : win ? 'win' : 'lose'}
      />

      {/* 턴 기록 — 상세의 장비 패널 자리. 아래로 쌓이고 끝나면 결말이 이어 붙는다. */}
      <div ref={logRef} className={`${PANEL} min-h-0 flex-1 overflow-y-auto overscroll-contain`}>
        {!result ? <p className="py-6 text-center text-[11.5px] text-zinc-500">전투를 준비하는 중…</p> : null}
        <ul>
          {turns.slice(0, shown).map((t, i) => {
            const tag = t.event ? TOWER_EVENT_TAG[t.event] : null;
            const firstOfTurn = i === 0 || turns[i - 1]!.turn !== t.turn;
            const mine = t.actor === 'me';
            return (
              <li key={i} className={`flex items-stretch gap-2.5 border-b border-[rgba(168,145,107,.12)] px-3 py-1.5 ${ended && !win && i === keyIdx ? 'bg-red-950/40' : ''}`}>
                <div className="flex w-8 flex-none flex-col items-center justify-center">
                  {firstOfTurn ? (
                    <>
                      <span className="font-mono text-[13px] leading-none font-extrabold text-zinc-400 tabular-nums">{t.turn}</span>
                      <span className="mt-0.5 text-[7px] font-bold tracking-[0.15em] text-zinc-600">TURN</span>
                    </>
                  ) : null}
                </div>
                <div className="w-px flex-none bg-zinc-800/80" />
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <span className={`h-1.5 w-1.5 flex-none rounded-full ${mine ? 'bg-amber-400' : 'bg-sky-400'}`} />
                  <span className="min-w-0 flex-1 text-[12px] leading-snug">
                    {towerTurnLine(t, info.name)}
                    {tag ? <span className={`ml-1 rounded px-1 text-[9.5px] font-black ${tag.cls}`}>{tag.label}</span> : null}
                  </span>
                  <span className="flex-none text-right font-mono text-[11px] leading-tight">
                    {t.damage > 0 ? <b className={mine ? 'text-amber-300' : 'text-red-300'}>-{Math.round(t.damage)}</b> : <span className="text-zinc-600">-</span>}
                    <span className="block text-[9.5px] text-zinc-500">{mine ? `적 ${Math.round(t.monHp)}%` : `나 ${Math.round(t.meHp)}%`}</span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        {result && ended ? (
          win ? (
            <div className="mx-3 my-2 rounded-r-lg border-l-[3px] border-emerald-400 bg-emerald-950/40 px-2.5 py-1.5">
              <b className="text-[13px] text-emerald-300">돌파 — {towerResultLine(true, info.name, turns[total - 1]?.turn ?? total)}</b>
              {result.reward ? (
                <div className="mt-0.5 text-[11.5px]">돌파 보상 <b>💎 {n(result.reward.diamond)}{result.reward.boxes ? ` · 📦 ${result.reward.boxes}` : ''}</b> · 목록에서 받을 수 있어요 · 오늘 도전 <Left left={left} /> 그대로</div>
              ) : null}
              {floor < TOWER_FLOORS ? (
                <div className="text-[11.5px] text-zinc-400">{nextFloor}층의 문이 열렸다 · 다음 상대 {towerFloorInfo(nextFloor).name}</div>
              ) : (
                <div className="text-[11.5px] text-zinc-400">지금 열린 가장 높은 층까지 올랐다.</div>
              )}
            </div>
          ) : (
            <div className="mx-3 my-2 rounded-r-lg border-l-[3px] border-red-400 bg-red-950/40 px-2.5 py-1.5">
              <b className="text-[13px] text-red-300">물러남 — {towerResultLine(false, info.name, 0)}</b>
              {keyTurn ? (
                <div className="mt-0.5 text-[11.5px] text-zinc-300">
                  결정적인 순간 · {keyTurn.turn}턴 {towerTurnLine(keyTurn, info.name)}{' '}
                  <button type="button" onClick={() => play(keyIdx)} className="font-extrabold text-amber-400">그 장면 다시 보기 ›</button>
                </div>
              ) : null}
              <div className="text-[11.5px] text-zinc-400">오늘 도전 <Left left={left} /></div>
            </div>
          )
        ) : null}
      </div>

      <ActionBar>
        {!result || !ended ? (
          <div className="flex flex-1 items-center justify-center rounded-xl border border-[rgba(168,145,107,.25)] text-[13px] font-bold text-zinc-500">
            {result ? '전투 중…' : '전투 준비 중…'}
          </div>
        ) : win ? (
          <>
            <SecondaryButton onClick={onList}>목록</SecondaryButton>
            {floor < TOWER_FLOORS ? <PrimaryButton onClick={onNext}>{nextFloor}층으로</PrimaryButton> : null}
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
    </main>
  );
}

/** 무대 위 한쪽(대난투 Fighter와 같은 문법) — 라벨·이름·몸·체력바. 맞으면 흔들리고 머리 위로 피해량. role=null이면 대기(라벨 자리만). */
function Fighter({ name, cp, img, side, role, hit, stepKey, dmg, hp, hpBefore, down }: {
  name: string;
  cp: number;
  img: string | null;
  side: 'l' | 'r';
  role: 'atk' | 'def' | null;
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
  const attacking = role === 'atk';
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  return (
    <div className="flex w-40 flex-col items-center gap-0.5">
      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold text-white ${role === null ? 'invisible' : attacking ? 'bg-amber-600/85' : 'bg-sky-700/85'}`}>{attacking ? '공격' : '방어'}</span>
      <span className="max-w-[150px] truncate text-[11px] leading-tight font-bold text-white drop-shadow">{name}</span>
      <span className="text-[10px] leading-none text-zinc-300 tabular-nums drop-shadow">전투력 <b className="text-amber-300">{n(cp)}</b></span>
      <div key={hit ? `h${stepKey}` : 'idle'} className={`relative h-[100px] w-40 transition-transform duration-200 ${lunge} ${hit ? 'animate-hit-shake' : ''}`}>
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-4 z-20 font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">-{Math.round(dmg)}</div>
        ) : null}
        <div className="h-full w-full transition-all duration-500 ease-out" style={{ opacity: down ? 0.3 : 1, filter: down ? 'grayscale(1)' : 'none' }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={img} alt="" className="h-full w-full object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]" style={{ ...PIX, transform: `scaleX(${side === 'r' ? -1 : 1})`, transformOrigin: 'center bottom' }} />
          ) : null}
        </div>
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-24 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
      <div className="isolate h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
        <div className={`h-full ${hpColor(pct)}`} style={{ width: `${Math.max(0, pct)}%`, transition: 'width 650ms ease-out' }} />
      </div>
    </div>
  );
}

/** 남은 도전 N/3 — 다 쓰면 N(0)만 빨간색. */
function Left({ left }: { left: number }) {
  return (
    <b className="tabular-nums">
      <span className={left <= 0 ? 'text-red-400' : 'text-amber-300'}>{left}</span>
      <span className="font-normal text-zinc-400">/{TOWER_DAILY_ATTEMPTS}</span>
    </b>
  );
}
