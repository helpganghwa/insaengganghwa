import { useCallback, useEffect, useRef, useState } from 'react';

import { ModalShell } from '@/components/ModalShell';
import { ModalButton, ModalLayout } from '@/components/ModalLayout';
import { assetUrl } from '@/lib/asset-versions';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, towerIsSpecial } from '@/lib/game/balance';
import { TOWER_EVENT_TAG, towerFloorInfo, towerTurnLine, type TowerFloorInfo } from '@/lib/game/tower/floors';
import type { TowerChallengeResult } from '@/lib/game/tower/service';

const PIX = { imageRendering: 'pixelated' as const };
const STEP_MS = 650;
const n = (v: number) => v.toLocaleString('ko-KR');
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 전투 재생(TOWER.md §7) — 서버가 만든 턴 기록을 한 줄씩 보여 준다.
 * 세계지도 역사 재생처럼 영역 어디든 누르면 끝까지 건너뛰고, 끝난 뒤 헤더 "다시 보기"로 처음부터(또는 결정적 턴부터).
 * 전투력·배율은 서버가 실제로 싸운 값(result)을 그대로 보여 준다.
 */
export function TowerBattle({ result, info, avatarSouth, retrying, onList, onNext, onRetry, onGear }: {
  result: TowerChallengeResult;
  info: TowerFloorInfo;
  avatarSouth: string | null;
  retrying: boolean;
  onList: () => void;
  onNext: () => void;
  onRetry: () => void;
  onGear: () => void;
}) {
  const total = result.turns.length;
  const [shown, setShown] = useState(0);
  const [ended, setEnded] = useState(false);
  const [popup, setPopup] = useState(false);
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
    setPopup(true);
  }, [total]);
  const play = useCallback(
    (from = 0) => {
      stop();
      setEnded(false);
      setPopup(false);
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
    play(0);
    return stop;
  }, [play]);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: 'smooth' });
  }, [shown]);

  const last = shown > 0 ? result.turns[shown - 1]! : null;
  const meHp = last ? last.meHp : 100;
  const monHp = last ? last.monHp : 100;
  const keyIdx = Math.min(Math.max(0, result.keyIndex), Math.max(0, total - 1));
  const keyTurn = result.turns[keyIdx];

  return (
    <main className="flex-1 overflow-y-auto bg-zinc-950 px-3 pt-2 pb-6 text-zinc-100">
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={onList} className="text-[14px] font-extrabold">‹ {result.floor}층 전투</button>
        {ended ? (
          <span className="flex gap-3 text-[11.5px] font-extrabold">
            <button type="button" onClick={() => play(0)} className="text-amber-300">다시 보기</button>
            {!popup ? <button type="button" onClick={() => setPopup(true)} className="text-zinc-200">결과</button> : null}
          </span>
        ) : (
          <button type="button" onClick={finish} className="text-[11.5px] font-extrabold text-zinc-300">건너뛰기</button>
        )}
      </div>
      {/* 재생 영역 어디를 눌러도 건너뛰기(마우스·터치 편의) — 키보드는 헤더의 건너뛰기 버튼 */}
      <div onClick={() => (ended ? undefined : finish())} className="block w-full cursor-pointer text-left">
        <div className="relative h-[160px] overflow-hidden rounded-xl border border-zinc-800 bg-cover bg-center" style={{ backgroundImage: `url(${assetUrl(`/sprites/tower/scene/${info.scene}.png`)})`, ...PIX }}>
          <div className="absolute inset-0 bg-black/35" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {avatarSouth ? <img src={avatarSouth} alt="" className="absolute bottom-2 left-3 h-[92px] w-auto drop-shadow-[0_2px_2px_rgba(0,0,0,.8)]" style={PIX} /> : null}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)} alt="" className={`absolute bottom-2 right-3 h-[104px] w-auto drop-shadow-[0_2px_2px_rgba(0,0,0,.8)] ${ended && result.win ? 'grayscale brightness-50' : ''}`} style={PIX} />
          {ended ? (
            <span className={`absolute left-1/2 top-12 -translate-x-1/2 text-[22px] font-black drop-shadow-[0_2px_2px_rgba(0,0,0,.9)] ${result.win ? 'text-emerald-300' : 'text-red-300'}`}>{result.win ? '돌파' : '물러남'}</span>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[10.5px]">
          <div>
            <div className="flex justify-between text-zinc-300"><b>나</b><span className="tabular-nums">{Math.round(meHp)}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-emerald-400 transition-all duration-300" style={{ width: `${meHp}%` }} /></div>
          </div>
          <div>
            <div className="flex justify-between text-zinc-300"><b className="truncate">{info.name}</b><span className="tabular-nums">{Math.round(monHp)}%</span></div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800"><div className="h-full bg-red-400 transition-all duration-300" style={{ width: `${monHp}%` }} /></div>
          </div>
        </div>
        <div ref={logRef} className="mt-2 h-[230px] overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-[12px] leading-relaxed">
          {result.turns.slice(0, shown).map((t, i) => {
            const tag = t.event ? TOWER_EVENT_TAG[t.event] : null;
            return (
              <p key={i} className={`mb-1 ${t.actor === 'mon' ? 'text-zinc-300' : 'text-zinc-100'}`}>
                <span className="mr-1 text-[10px] tabular-nums text-zinc-600">{t.turn}</span>
                {towerTurnLine(t, info.name)}
                {tag ? <span className={`ml-1 rounded px-1 text-[9.5px] font-black ${tag.cls}`}>{tag.label}</span> : null}
                {t.damage > 0 ? <b className={`ml-1 tabular-nums ${t.actor === 'me' ? 'text-amber-300' : 'text-red-300'}`}>{Math.round(t.damage)}</b> : null}
              </p>
            );
          })}
        </div>
        {!ended ? <p className="mt-1 text-[9.5px] text-zinc-500">탭하면 건너뛰기</p> : null}
      </div>

      {popup ? (
        <ResultPopup
          result={result}
          info={info}
          keyLine={keyTurn ? towerTurnLine(keyTurn, info.name) : null}
          keyTag={keyTurn?.event ? TOWER_EVENT_TAG[keyTurn.event] : null}
          retrying={retrying}
          onReplayKey={() => play(keyIdx)}
          onClose={() => setPopup(false)}
          onList={onList}
          onNext={onNext}
          onRetry={onRetry}
          onGear={onGear}
        />
      ) : null}
    </main>
  );
}

function ResultPopup({ result, info, keyLine, keyTag, retrying, onReplayKey, onClose, onList, onNext, onRetry, onGear }: {
  result: TowerChallengeResult;
  info: TowerFloorInfo;
  keyLine: string | null;
  keyTag: { label: string; cls: string } | null;
  retrying: boolean;
  onReplayKey: () => void;
  onClose: () => void;
  onList: () => void;
  onNext: () => void;
  onRetry: () => void;
  onGear: () => void;
}) {
  const special = towerIsSpecial(result.floor);
  const [stage, setStage] = useState(prefersReduced() ? 3 : 0);
  const [opened, setOpened] = useState(!special);
  const [count, setCount] = useState(0);
  const dia = result.reward?.diamond ?? 0;

  // 단계 연출 — 도장(0) → 보상(1) → 다음 층(2) → 버튼(3). 누르면 바로 끝 상태.
  useEffect(() => {
    if (stage >= 3) return;
    const t = setTimeout(() => setStage((s) => s + 1), 350);
    return () => clearTimeout(t);
  }, [stage]);
  useEffect(() => {
    if (!result.win || !opened || stage < 1 || !dia) return;
    if (prefersReduced()) return setCount(dia);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 700);
      setCount(Math.round(dia * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [result.win, opened, stage, dia]);
  const skip = () => {
    setStage(3);
    if (opened) setCount(dia);
  };
  const nextFloor = Math.min(TOWER_FLOORS, result.floor + 1);
  const nextInfo = towerFloorInfo(nextFloor);

  if (result.win) {
    return (
      <ModalShell onClose={onClose} label="돌파">
        <ModalLayout
          icon={<span className="inline-block -rotate-3 rounded-lg border-[3px] border-emerald-400 px-2 text-[22px] font-black text-emerald-300 motion-safe:animate-stamp-in">{special ? `${result.floor}층 돌파` : '돌파'}</span>}
          subtitle={`${result.floor}층 · ${info.name}`}
          footer={
            <>
              <ModalButton tone="ghost" onClick={onList} disabled={stage < 3}>목록</ModalButton>
              {result.floor < TOWER_FLOORS ? <ModalButton tone="primary" grow={2} onClick={onNext} disabled={stage < 3 || !opened}>{nextFloor}층으로</ModalButton> : null}
            </>
          }
        >
          {/* 누르면 연출을 끝 상태로(마우스·터치 편의) — 버튼은 연출이 끝나면 열리니 키보드도 막히지 않는다 */}
          <div onClick={skip} className="flex w-full flex-col gap-2 text-left">
            {special && !opened ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpened(true);
                }}
                className="flex flex-col items-center rounded-xl border border-dashed border-amber-600 bg-amber-950/30 p-3"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={assetUrl('/sprites/tower/mon/chest.png')} alt="" className="h-14 w-14 motion-safe:animate-wiggle" style={PIX} />
                <b className="mt-1 text-[13px] text-amber-300">눌러서 열기</b>
                <span className="text-[10px] text-zinc-400">특별층 보상 상자</span>
              </button>
            ) : null}
            {stage >= 1 && opened ? (
              <span className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-[11.5px] dark:bg-zinc-950">
                <span className="text-zinc-500">첫 돌파 보상</span>
                <b className="text-[16px] tabular-nums">💎 {n(count)}{result.reward?.boxes ? ` · 📦 ${result.reward.boxes}` : ''}</b>
              </span>
            ) : null}
            {stage >= 2 ? (
              <span className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-[11.5px] dark:bg-zinc-950">
                <span className="text-zinc-500">남은 도전</span>
                <b>{Array.from({ length: TOWER_DAILY_ATTEMPTS }, (_, i) => <span key={i} className={i < result.attemptsLeft ? 'text-amber-400' : 'text-zinc-500'}>●</span>)} <span className="text-[10px] font-normal text-zinc-500">이긴 도전은 그대로</span></b>
              </span>
            ) : null}
            {stage >= 2 && result.floor < TOWER_FLOORS ? (
              <span className="flex items-center gap-2 rounded-lg bg-zinc-100 px-3 py-2 text-[11.5px] dark:bg-zinc-950">
                <span className="h-7 w-10 flex-none rounded bg-cover bg-center" style={{ backgroundImage: `url(${assetUrl(`/sprites/tower/scene/${nextInfo.scene}.png`)})` }} />
                <span><b className="block">{nextFloor}층의 문이 열렸다</b><span className="text-[10px] text-zinc-500">{special ? '새 구간이 열렸어요 · 요구 장비가 바뀝니다' : `다음 상대 · ${nextInfo.name}`}</span></span>
              </span>
            ) : null}
          </div>
        </ModalLayout>
      </ModalShell>
    );
  }
  return (
    <ModalShell onClose={onClose} label="물러났다">
      <ModalLayout
        icon={<span className="inline-block -rotate-3 rounded-lg border-[3px] border-red-400 px-2 text-[22px] font-black text-red-300 motion-safe:animate-stamp-in">물러났다</span>}
        subtitle={`${result.floor}층 · ${info.name}`}
        footer={
          <>
            <ModalButton tone="ghost" onClick={result.attemptsLeft > 0 ? onGear : onList}>{result.attemptsLeft > 0 ? '장비 · 아바타' : '목록'}</ModalButton>
            <ModalButton tone="primary" grow={2} onClick={onRetry} disabled={result.attemptsLeft <= 0 || retrying}>{result.attemptsLeft <= 0 ? '오늘 도전 끝' : retrying ? '도전 중…' : '다시 도전'}</ModalButton>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          {keyLine ? (
            <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2">
              <div className="text-[9.5px] text-zinc-500">결정적인 순간</div>
              <p className="mt-0.5 text-[12px]">{keyLine}{keyTag ? <span className={`ml-1 rounded px-1 text-[9.5px] font-black ${keyTag.cls}`}>{keyTag.label}</span> : null}</p>
              <button type="button" onClick={onReplayKey} className="mt-1 text-[10.5px] font-extrabold text-amber-400">그 장면 다시 보기 ›</button>
            </div>
          ) : null}
          <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-[11.5px] dark:bg-zinc-950">
            <span className="text-zinc-500">남은 도전</span>
            <b>{Array.from({ length: TOWER_DAILY_ATTEMPTS }, (_, i) => <span key={i} className={i < result.attemptsLeft ? 'text-amber-400' : 'text-zinc-500'}>●</span>)}</b>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-zinc-100 px-3 py-2 text-[11.5px] dark:bg-zinc-950">
            <span className="text-zinc-500">탑 전투력</span>
            <b className="tabular-nums">{n(result.towerCp)} <span className="text-[10px] font-normal text-zinc-500">· 선택 아바타 ×{result.mult.toFixed(2)}</span></b>
          </div>
        </div>
      </ModalLayout>
    </ModalShell>
  );
}
