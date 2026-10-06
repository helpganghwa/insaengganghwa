import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { josa } from 'josa';

import { BackFab } from '@/components/BackNav';
import { GuildBadge } from '@/components/GuildBadge';
import { assetUrl } from '@/lib/asset-versions';
import { sounds } from '@/lib/game/sound';
import { TOWER_DAILY_ATTEMPTS, TOWER_FLOORS, TOWER_HP_MULT, towerIsSpecial, towerRequirement } from '@/lib/game/balance';
import { TOWER_BATTLE, type TowerSkill, type TowerTurn } from '@/lib/game/tower/battle';
import { TOWER_SKILL_INFO, towerFloorInfo, towerResultLine, towerTurnLine, type TowerFloorInfo, towerFloorTitle } from '@/lib/game/tower/floors';
import type { TowerBattleReward, TowerChallengeResult } from '@/lib/game/tower/service';

import { TowerSkillTags } from './TowerSkills';
import { TitleTag } from '@/components/TitleTag';
import { ActionBar, PIX, PrimaryButton, SecondaryButton, huntText, n, rewardText } from './TowerUi';

const STEP_MS = 700;
const prefersReduced = () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 층 화면(상세·전투) — 헤더 없이 장면이 맨 위부터, 그 아래는 텍스트 RPG식 줄 구성. */
export const FLOOR_MAIN = 'flex h-[calc(100%-var(--chat-dock-h,0px))] flex-col overflow-hidden bg-[#100f0e] text-zinc-100';
/** 무대 아래 구역 구분선. */
export const FLOOR_ROW = 'border-b border-white/[.07]';

type Fight = { cur: TowerTurn | null; prev: TowerTurn | null; shown: number; ended: boolean; win: boolean };

/** 무대 위 내 표시 — 대난투처럼 닉네임 · 길드(문양+이름). */
export type TowerMe = { nickname: string; guild: { name: string; emblemUrl: string | null } | null };

/**
 * 무대 — 상세·전투 공통. 장면이 화면 맨 위부터 깔리고, 위쪽에 뒤로가기 · 층·장소 · 돌파 보상 · 오늘 도전(전투 중엔 N턴).
 * 아래쪽에 나 ↔ 몬스터(대난투 문법: 이름 · 길드/스킬 · 전투력 · 몸 · 몸 아래 체력바), 자리·발 높이 고정.
 * 대기(fight 없음)와 판정 전·전투 중이 같은 그림이고, 공격한 쪽만 빛나며 짧게 튀었다 제자리로 온다. 무대 아래는 해설 한 칸.
 */
export function TowerStage({ floor, hunt, info, me, meImg, meCp, left, total = TOWER_DAILY_ATTEMPTS, plus, turn, onBack, backLocked, fight, narration, tone = 'idle' }: {
  floor: number;
  /** 토벌(돌파한 층 재도전) — 보상 줄을 토벌 다이아로. */
  hunt?: boolean;
  info: TowerFloorInfo;
  me: TowerMe;
  meImg: string | null;
  meCp: number;
  left: number;
  /** 오늘 전체 도전(하루 3 + 오늘 산 추가 도전). */
  total?: number;
  /** 남은 도전 0일 때 붙일 추가 도전 ＋. */
  plus?: React.ReactNode;
  turn?: string | null;
  onBack?: () => void;
  backLocked?: boolean;
  fight?: Fight;
  narration: string;
  tone?: 'idle' | 'play' | 'win' | 'lose';
}) {
  const cur = fight?.cur ?? null;
  const prev = fight?.prev ?? null;
  const shown = fight?.shown ?? 0;
  const ended = !!fight?.ended;
  const hitTarget: 'me' | 'mon' | null = cur && cur.damage > 0 ? (cur.actor === 'me' ? 'mon' : 'me') : null;
  const sp = towerIsSpecial(floor);
  // 기록의 체력은 절대값(전투력 × TOWER_HP_MULT) — 체력바는 최대 대비 비율로.
  const meMax = meCp * TOWER_HP_MULT;
  const monMax = towerRequirement(floor) * TOWER_HP_MULT;
  return (
    <>
      <section className="relative h-[234px] flex-none overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={assetUrl(`/sprites/tower/scene/${info.scene}.png`)} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover" style={PIX} />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/70 via-black/5 via-30% to-black/40" />
        {hitTarget ? <div key={`f${shown}`} className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/50 mix-blend-screen" /> : null}

        <div className="absolute inset-x-0 top-0 z-10 flex items-start gap-2.5 px-3 pt-2">
          <BackFab fallback="/tower" onClick={onBack} disabled={backLocked} className="flex-none" />
          <div className="min-w-0 flex-1 leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
            <div className="truncate">
              <b className="text-[15px] font-black text-white">{sp ? <span className="text-red-300">✦ </span> : null}{floor}층</b>
              <span className="text-[11px] text-zinc-300"> · {info.theme}</span>
            </div>
            <div className="text-[11px] text-zinc-300">
              {hunt ? `토벌 ${huntText(floor)}` : <>돌파 {rewardText(floor)}{towerFloorTitle(floor) ? <> · 칭호 <TitleTag code={towerFloorTitle(floor)} /></> : null}</>}
            </div>
          </div>
          <div className="flex-none text-right text-[11px] leading-snug tabular-nums text-zinc-200 drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
            <div>
              오늘 도전 <b className={left <= 0 ? 'text-red-400' : 'text-white'}>{left}</b>
              <span className="text-zinc-400">/{total}</span>
              {left <= 0 && plus ? <span className="ml-1 inline-flex align-[-2px]">{plus}</span> : null}
            </div>
            {turn ? <div className="font-bold text-zinc-100">{turn}</div> : null}
          </div>
        </div>

        <Fighter
          side="l"
          name={me.nickname || '나'}
          sub={
            me.guild ? (
              <>
                <GuildBadge emblemUrl={me.guild.emblemUrl} size={10} className="shrink-0" />
                <span className="truncate text-amber-100/85">{me.guild.name}</span>
              </>
            ) : null
          }
          cp={meCp}
          img={meImg}
          act={!!cur && !ended && cur.actor === 'me'}
          hit={hitTarget === 'me'}
          stepKey={shown}
          dmg={hitTarget === 'me' ? cur!.damage : null}
          hp={cur ? pctOf(cur.meHp, meMax) : 100}
          hpBefore={prev ? pctOf(prev.meHp, meMax) : 100}
          down={ended && !fight!.win}
          hpAbs={cur ? cur.meHp : meMax}
          hpMax={meMax}
        />
        <Fighter
          side="r"
          name={info.name}
          sub={<TowerSkillTags floor={floor} className="text-[9.5px]" />}
          cp={towerRequirement(floor)}
          img={assetUrl(`/sprites/tower/mon/${info.sprite}.png`)}
          flip={info.flip}
          act={!!cur && !ended && cur.actor === 'mon'}
          hit={hitTarget === 'mon'}
          stepKey={shown}
          dmg={hitTarget === 'mon' ? cur!.damage : null}
          hp={cur ? pctOf(cur.monHp, monMax) : 100}
          hpBefore={prev ? pctOf(prev.monHp, monMax) : 100}
          down={ended && !!fight?.win}
          hpAbs={cur ? cur.monHp : monMax}
          hpMax={monMax}
        />
      </section>

      {/* 해설 한 칸 — 대기엔 층 서술, 전투 중엔 지금 줄, 끝나면 결말. 높이 고정(2줄까지, 한 줄이면 가운데). */}
      <div className={`flex h-12 flex-none items-center px-4 ${FLOOR_ROW}`}>
        <p className={`line-clamp-2 text-[12px] leading-snug break-keep ${tone === 'win' ? 'font-bold text-emerald-300' : tone === 'lose' ? 'font-bold text-red-300' : tone === 'idle' ? 'text-zinc-400' : 'text-zinc-100'}`}>
          {narration}
        </p>
      </div>
    </>
  );
}

/**
 * 전투(TOWER.md §7) — 층 화면(상세)과 같은 무대에서 그대로 이어 싸운다(화면 전환 없음).
 * 장비 자리에 텍스트 RPG식 기록(턴 구분 · 누가 · 변수 · 피해 변화 · 남은 HP)이 쌓이고, 끝나면 결말이 붙는다.
 * 건너뛰기 없이 끝까지 재생, 끝나면 처음부터 다시 볼 수 있다. result가 null이면 판정 대기 — 대기와 같은 무대(낙관적 전환).
 */
export function TowerBattle({ floor, hunt = false, me, result, myCp, attemptsBefore, attemptsTotal = TOWER_DAILY_ATTEMPTS, plus, avatarSouth, retrying, onList, onNext, onRetry }: {
  floor: number;
  /** 토벌 판 — 이기면 보상이 바로 지급되고, 다음 층 대신 같은 층을 다시 토벌. */
  hunt?: boolean;
  me: TowerMe;
  /** 판정 전 헤더에 보여 줄 남은 도전(결과가 오면 결과 값). */
  attemptsBefore: number;
  /** 오늘 전체 도전 = 하루 3 + 오늘 산 추가 도전(10-06). */
  attemptsTotal?: number;
  /** 남은 도전이 0일 때 결과 줄 '오늘 도전' 옆에 붙일 추가 도전 ＋(살 수 있을 때만 호출부가 넘긴다). 머리에는 두지 않는다(＋가 두 개 보였다). */
  plus?: React.ReactNode;
  result: TowerChallengeResult | null;
  /** 판정 전(낙관적 전환) 보여 줄 내 탑 전투력 — 결과가 오면 결과 값을 쓴다. */
  myCp: number;
  avatarSouth: string | null;
  retrying: boolean;
  onList: () => void;
  onNext: () => void;
  onRetry: () => void;
}) {
  const router = useRouter();
  const info: TowerFloorInfo = towerFloorInfo(floor);
  const turns = result?.turns ?? [];
  const total = turns.length;
  const [shown, setShown] = useState(0);
  const [ended, setEnded] = useState(false);
  // 한 번 끝까지 재생된 판 — '처음부터 다시 보기' 중에도 결과는 이미 확정이라 목록·뒤로가기·버튼을 잠그지 않는다(10-01).
  const [finishedOnce, setFinishedOnce] = useState(false);
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
    setFinishedOnce(true);
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
  // 급소는 치명타 소리, 몬스터가 처음 광폭해지는 줄은 으르렁 소리로 기록을 보지 않아도 알 수 있게.
  useEffect(() => {
    const t = shown > 0 ? turns[shown - 1] : null;
    if (!t) return;
    if (t.event === 'enrage' && !turns.slice(0, shown - 1).some((x) => x.event === 'enrage')) sounds.towerEnrage();
    if (t.damage <= 0) return;
    if (t.monHp <= 0 || t.meHp <= 0) sounds.meleeKo();
    else if (t.event === 'critical') sounds.raidCrit();
    else sounds.meleeHit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  useEffect(() => {
    if (ended && result?.win) sounds.meleeVictory();
  }, [ended, result?.win]);

  const cur: TowerTurn | null = shown > 0 ? turns[shown - 1]! : null;
  const prev: TowerTurn | null = shown > 1 ? turns[shown - 2]! : null;
  const win = !!result?.win;
  const nextFloor = Math.min(TOWER_FLOORS, floor + 1);
  const left = result?.attemptsLeft ?? 0;
  const done = !!result && ended;
  const unlocked = done || (!!result && finishedOnce);
  const narration = !result
    ? josa(`${info.name}#{와} 마주 섰다. 전투를 준비하는 중…`)
    : ended
      ? towerResultLine(win, info.name, turns[total - 1]?.turn ?? total)
      : cur
        ? towerTurnLine(cur, info.name)
        : info.line;

  return (
    <main className={FLOOR_MAIN}>
      <TowerStage
        floor={floor}
        hunt={hunt}
        info={info}
        me={me}
        meImg={avatarSouth}
        meCp={result?.towerCp ?? myCp}
        left={result ? left : attemptsBefore}
        total={attemptsTotal}
        turn={cur ? `${cur.turn}턴` : '준비'}
        onBack={onList}
        backLocked={!unlocked}
        fight={{ cur, prev, shown, ended, win }}
        narration={narration}
        tone={!done ? 'play' : win ? 'win' : 'lose'}
      />

      {/* 기록 — 상세의 장비 자리. 턴마다 구분하고 한 줄에 누가 · 무슨 변수로 · 피해가 얼마로 · 남은 HP가 얼마인지. */}
      <div ref={logRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-3">
        {!result ? <p className="py-5 text-center text-[12px] text-zinc-500">전투를 준비하는 중…</p> : null}
        {turns.slice(0, shown).map((t, i) => (
          <div key={i}>
            {i === 0 || turns[i - 1]!.turn !== t.turn ? (
              <div className="mt-2.5 mb-1 flex items-center gap-2 text-[10.5px] font-bold text-zinc-500">
                <span className="h-px flex-1 bg-white/[.08]" />
                {t.turn}턴
                <span className="h-px flex-1 bg-white/[.08]" />
              </div>
            ) : null}
            <LogLine t={t} monName={info.name} />
          </div>
        ))}
        {/* 토벌 승리 — 마지막 기록 줄에 전리품(이 판에서 이미 지급됨). 더블·상자가 터지면 강조. */}
        {done && hunt && win && result.reward ? <HuntLoot reward={result.reward} monName={info.name} /> : null}
        {done ? (
          <div className="mt-3 border-t border-white/[.08] pt-2.5 text-[12px] leading-relaxed text-zinc-300">
            {win ? (
              <>
                <b className="block text-[13px] text-emerald-300">승리</b>
                {hunt ? (
                  <div className="text-zinc-400">오늘 도전 <Left left={left} total={attemptsTotal} />{left <= 0 && plus ? <span className="ml-1.5 inline-flex align-[-2px]">{plus}</span> : null}</div>
                ) : result.reward ? (
                  <button type="button" onClick={onList} className="font-bold text-amber-300">
                    돌파 보상 💎 {n(result.reward.diamond)}{result.reward.boxes ? ` · 📦 ${result.reward.boxes}` : ''}
                    {/* 층 도달 칭호(10·60·100층) — 조건이 찼다는 안내. 발견·보상은 칭호 화면에서. */}
                    {towerFloorTitle(floor) ? <> · 칭호 <TitleTag code={towerFloorTitle(floor)} /></> : null}
                    {' '}· 목록에서 받기 ›
                  </button>
                ) : null}
              </>
            ) : (
              <>
                <b className="text-[13px] text-red-300">패배</b>
                {/* 얼마나 가까웠나 — 이 판에서 몬스터에게 남은 체력. */}
                {(() => {
                  const last = turns[total - 1];
                  const monMax = towerRequirement(floor) * TOWER_HP_MULT;
                  return last && monMax > 0 ? <div>{info.name} HP {pctText(last.monHp / monMax)} 남음</div> : null;
                })()}
                <div className="text-zinc-400">오늘 도전 <Left left={left} total={attemptsTotal} />{left <= 0 && plus ? <span className="ml-1.5 inline-flex align-[-2px]">{plus}</span> : null}</div>
              </>
            )}
            {/* 기록 전체를 처음부터 다시 재생(판정은 그대로, 보기만). */}
            <button type="button" onClick={() => play(0)} className="mt-1 block text-[11.5px] font-bold text-zinc-400">
              처음부터 다시 보기 ›
            </button>
          </div>
        ) : null}
      </div>

      {/* 버튼 줄 — 늘 두 칸(왼쪽 보조 · 오른쪽 주). 판정·재생 중엔 둘 다 잠김. */}
      <div className="flex-none px-3 pt-2 pb-3">
        <ActionBar>
          {!unlocked ? (
            <>
              <SecondaryButton disabled>목록</SecondaryButton>
              <PrimaryButton disabled>{result ? '전투 중…' : '전투 준비 중…'}</PrimaryButton>
            </>
          ) : win && hunt ? (
            // 토벌 승리 — 같은 층을 다시 토벌하거나(도전이 남았으면) 강화로.
            <>
              <SecondaryButton onClick={onList}>목록</SecondaryButton>
              {left > 0 ? (
                <PrimaryButton onClick={onRetry} disabled={retrying}>{retrying ? '토벌 중…' : '다시 토벌'}</PrimaryButton>
              ) : (
                <PrimaryButton onClick={() => router.push('/enhance')}>강화하러 가기</PrimaryButton>
              )}
            </>
          ) : win ? (
            <>
              <SecondaryButton onClick={onList}>목록</SecondaryButton>
              {/* 꼭대기 층을 돌파하면 다음 층 대신 탑 랭킹으로. */}
              {floor < TOWER_FLOORS ? <PrimaryButton onClick={onNext}>{nextFloor}층으로</PrimaryButton> : <PrimaryButton onClick={() => router.push('/leaderboard?tab=tower')}>랭킹 보기</PrimaryButton>}
            </>
          ) : (
            <>
              {left > 0 ? (
                <>
                  <SecondaryButton onClick={() => router.push('/enhance')}>강화하러 가기</SecondaryButton>
                  <PrimaryButton onClick={onRetry} disabled={retrying}>{retrying ? (hunt ? '토벌 중…' : '도전 중…') : hunt ? '다시 토벌' : '다시 도전'}</PrimaryButton>
                </>
              ) : (
                // 오늘 도전을 다 쓴 패배 — 할 수 있는 다음 일은 강화.
                <>
                  <SecondaryButton onClick={onList}>목록</SecondaryButton>
                  <PrimaryButton onClick={() => router.push('/enhance')}>강화하러 가기</PrimaryButton>
                </>
              )}
            </>
          )}
        </ActionBar>
      </div>
    </main>
  );
}

/** 기록 속 변수 이름(급소!·광폭화 등) — 변수마다 색. */
function Ev({ c, children }: { c: string; children: React.ReactNode }) {
  return <b className={c}>{children}</b>;
}

/** 체력·피해 표시 — 기록은 %p(0~100)를 정수로. 0보다 크면 최소 1(쓰러진 것처럼 보이지 않게). */
const hpNum = (v: number) => compact(v > 0 ? Math.max(1, Math.round(v)) : 0);

/**
 * 큰 수 줄여 쓰기 — 체력이 전투력의 8배라 상위권은 억 단위. 1만 이상은 '3.2만'·'1.77억'(소수점 끝 0은 뺀다), 그 아래는 쉼표.
 * 무대의 HP와 기록의 피해·HP가 같은 표기를 쓴다.
 */
function compact(v: number): string {
  const trim = (x: number, d: number) => x.toFixed(d).replace(/\.?0+$/, '');
  if (v >= 1e8) return `${trim(v / 1e8, 2)}억`;
  if (v >= 1e4) return `${trim(v / 1e4, 1)}만`;
  return n(v);
}
/** 남은 체력 비율(0~1) → 'N%'. 0보다 크면 최소 1%(쓰러진 것처럼 보이지 않게). */
const pctText = (r: number) => `${r > 0 ? Math.max(1, Math.round(r * 100)) : 0}%`;
/** 절대 체력 → 체력바 %. */
const pctOf = (hp: number, max: number) => (max > 0 ? Math.max(0, Math.min(100, (hp / max) * 100)) : 0);

/**
 * 기록 한 줄(텍스트 RPG) — 누가 · 변수 · 피해(바뀐 경우 'raw → 피해') · 남은 HP. 게이지 없이 글만.
 * 나=금색 ▸, 몬스터=빨강 ▸. raw가 없는 옛 기록은 바뀐 값만 보여 준다.
 * memo — 재생 중 한 줄씩 늘 때 이미 나온 줄은 다시 그리지 않는다.
 */
/** 토벌 전리품 줄 — 평소 💎 한 줄, 더블이면 그 줄을 강조, 상자가 터지면 한 줄 더. */
function HuntLoot({ reward, monName }: { reward: TowerBattleReward; monName: string }) {
  return (
    <div className="mt-1.5 space-y-0.5 text-[12px] leading-relaxed">
      <div>
        <span className="text-amber-300">▸ </span>
        {reward.double ? (
          <b className="text-amber-200">✦ 대박! {monName}의 전리품이 두 배 — 💎{n(reward.diamond)}</b>
        ) : (
          <span className="text-zinc-200">{monName}의 전리품 <b className="text-amber-300">💎{n(reward.diamond)}</b></span>
        )}
      </div>
      {reward.boxes > 0 ? (
        <div>
          <span className="text-amber-300">▸ </span>
          <b className="text-sky-200">✦ {josa(`${monName}#{이}`)} 숨겨 둔 보급 상자 📦{n(reward.boxes)} 발견!</b>
        </div>
      ) : null}
    </div>
  );
}

const LogLine = memo(function LogLine({ t, monName }: { t: TowerTurn; monName: string }) {
  const B = TOWER_BATTLE;
  const mine = t.actor === 'me';
  const d = hpNum(t.damage);
  const raw = t.raw != null ? hpNum(t.raw) : null;
  const dNum = Math.round(t.damage);
  const rawNum = t.raw != null ? Math.round(t.raw) : null;
  const D = <b className={mine ? 'text-amber-300' : 'text-red-300'}>{d}</b>;
  const hp = mine ? (
    <span className="text-zinc-500"> · {monName} HP <b className="font-bold text-zinc-300">{hpNum(t.monHp)}</b></span>
  ) : (
    <span className="text-zinc-500"> · 내 HP <b className="font-bold text-zinc-300">{hpNum(t.meHp)}</b></span>
  );
  // 배율이 붙어 피해가 커진 경우만 'raw → 피해'(급소·광폭화). 반격·공명은 절반이라 '(raw의 절반)'.
  const grew = rawNum != null && dNum > rawNum;
  const half = rawNum != null && Math.abs(dNum - rawNum * 0.5) <= Math.max(1, rawNum * 0.01);
  // 몬스터 스킬 — 이 줄에 붙은 스킬 이름(아이콘 포함)과, 몬스터가 회복한 체력.
  const sk = t.skills ?? [];
  const S = (k: TowerSkill) => <Ev c="text-rose-300">{TOWER_SKILL_INFO[k].icon} {TOWER_SKILL_INFO[k].name}</Ev>;
  const heal = t.heal ? <span className="text-emerald-300/90"> (+{hpNum(t.heal)})</span> : null;
  // 내 공격이 강철 피부·위압으로 줄어든 경우 — 'raw → 피해 (강철 피부)'.
  const shrunk = mine && rawNum != null && dNum < rawNum && sk.length ? (
    <span className="text-zinc-500"> ({sk.map((k) => TOWER_SKILL_INFO[k].name).join('·')})</span>
  ) : null;
  // 몬스터 공격에 붙은 스킬(빙결·화상·시간 정지·흡혈) — 줄 끝에 이어 붙인다.
  const riders = !mine && t.event !== 'skill' && sk.length ? (
    <> · {sk.map((k, i) => <span key={k}>{i ? ' ' : ''}{S(k)}</span>)}{heal}</>
  ) : null;
  let body: React.ReactNode;
  switch (t.event) {
    case 'skill': {
      const k = sk[0];
      if (mine) body = <>{k ? S(k) : null} {k === 'stop' ? '시간이 멈춰 움직이지 못한다.' : '몸이 얼어붙어 움직이지 못한다.'}</>;
      else if (k === 'regen') body = <>{S(k)} {monName}의 상처가 아문다.{heal}</>;
      else if (k === 'rebirth') body = <>{S(k)} {josa(`${monName}#{이}`)} 다시 일어섰다.{heal}</>;
      else if (k === 'burn') body = <>{S(k)} 몸이 타들어 간다. 피해 {D}</>;
      else if (k === 'reflect') body = <>{S(k)} 급소의 충격이 되돌아왔다. 피해 {D}</>;
      else if (k === 'death') body = <>{S(k)} {josa(`${monName}#{이}`)} 숨통을 끊었다. 피해 {D}</>;
      else if (k === 'multi') body = <>{S(k)} {josa(`${monName}#{이}`)} 한 번 더 몰아쳤다. 피해 {D}{sk.includes('drain') ? <> · {S('drain')}{heal}</> : null}</>;
      else body = <>{josa(`${monName}#{이}`)} 스킬을 썼다.</>;
      break;
    }
    case 'miss':
      body = mine ? <>내 공격이 빗나갔다.</> : <>{monName}의 공격이 빗나갔다.</>;
      break;
    case 'critical':
      // 몬스터 급소는 광폭화와 겹칠 수 있어 배율을 실제 비율로 보여 준다(×1.6 또는 ×2.4).
      body = mine
        ? <><Ev c="text-amber-300">급소!</Ev> {monName}의 빈틈을 꿰뚫었다. 피해 {grew ? <>{raw} → </> : null}{D}{grew ? <span className="text-zinc-500"> (×{B.critMul})</span> : null}</>
        : <><Ev c="text-red-400">급소!</Ev> {josa(`${monName}#{이}`)} 급소를 찔렀다. 피해 {grew ? <>{raw} → </> : null}{D}{grew && rawNum ? <span className="text-zinc-500"> (×{Math.round((dNum / rawNum) * 10) / 10})</span> : null}</>;
      break;
    case 'resonance':
      body = <><Ev c="text-sky-300">공명!</Ev> 아바타와 장비가 함께 울려 추가 피해 {D}{half ? <span className="text-zinc-500"> ({raw}의 절반)</span> : null}</>;
      break;
    case 'counter':
      body = <><Ev c="text-purple-300">반격!</Ev> 막아 낸 틈을 타 되받아쳤다. 피해 {D}{half ? <span className="text-zinc-500"> ({raw}의 절반)</span> : null}</>;
      break;
    case 'enrage':
      body = <><Ev c="text-red-400">광폭화</Ev> {josa(`${monName}#{이}`)} 날뛴다. 피해 {grew ? <>{raw} → </> : null}{D}{grew ? <span className="text-zinc-500"> (×{B.enrageMul})</span> : null}</>;
      break;
    case 'revive':
      body = <>{monName}의 공격 {D}. <Ev c="text-emerald-300">기사회생!</Ev> 쓰러지기 직전 다시 일어섰다.</>;
      break;
    case 'first_strike':
      body = mine
        ? <><Ev c="text-orange-300">선제!</Ev> 먼저 거리를 좁혀 첫 일격. 피해 {shrunk ? <>{raw} → </> : null}{D}</>
        : <><Ev c="text-orange-300">선제!</Ev> {josa(`${monName}#{이}`)} 먼저 달려들었다. 피해 {D}</>;
      break;
    default:
      // 전투력 차가 커서 피해가 0.1%p도 안 되면 0으로 기록된다 — '피해 0' 대신 통하지 않았다고.
      if (t.damage <= 0) body = mine ? <>공격했지만 통하지 않았다.</> : <>{josa(`${monName}#{이}`)} 공격했지만 통하지 않았다.</>;
      else body = mine ? <>{josa(`${monName}#{을}`)} 공격했다. 피해 {shrunk ? <>{raw} → </> : null}{D}</> : <>{josa(`${monName}#{이}`)} 공격했다. 피해 {D}</>;
  }
  return (
    <p className={`py-0.5 text-[12px] leading-relaxed break-keep text-zinc-200 ${(mine && t.monHp <= 0) || (!mine && t.meHp <= 0) ? 'font-bold' : ''}`}>
      <span className={mine ? 'text-amber-400' : 'text-red-400'}>▸ </span>
      {body}
      {shrunk}
      {riders}
      {hp}
      {/* 마지막 일격 — 쓰러뜨린 줄·쓰러진 줄을 강조해 결말과 이어지게. */}
      {mine && t.damage > 0 && t.monHp <= 0 ? <Ev c="text-emerald-300"> 쓰러뜨렸다!</Ev> : null}
      {!mine && t.meHp <= 0 ? <Ev c="text-red-300"> 쓰러졌다.</Ev> : null}
    </p>
  );
});

/**
 * 무대 위 한쪽(대난투 Fighter 문법) — 이름 · 길드/특성 · 전투력 · 몸 · 몸 아래 체력바. 자리·크기 고정.
 * 공격한 쪽은 빛 + 짧게 튀었다 제자리, 맞으면 흔들리고 피해량이 뜬다.
 */
function Fighter({ side, name, sub, cp, img, flip, act, hit, stepKey, dmg, hp, hpBefore, down, hpAbs, hpMax }: {
  side: 'l' | 'r';
  /** 그림을 좌우로 뒤집는다 — 몬스터 그림 방향표(towerFloorInfo.flip). */
  flip?: boolean;
  name: string;
  sub: React.ReactNode;
  cp: number;
  img: string | null;
  act: boolean;
  hit: boolean;
  stepKey: number;
  dmg: number | null;
  hp: number;
  hpBefore: number;
  down: boolean;
  /** 체력바 아래 '남은 / 최대' 표시용 절대값. */
  hpAbs: number;
  hpMax: number;
}) {
  // 체력바: 이전 → 지금으로 줄어드는 연출. 차오를 때(다시 보기로 되감기 등)는 애니메이션 없이 바로.
  const [pct, setPct] = useState(hpBefore);
  const [instant, setInstant] = useState(true);
  useEffect(() => {
    setInstant(true);
    setPct(hpBefore);
    const id = requestAnimationFrame(() => {
      setInstant(hp >= hpBefore);
      setPct(hp);
    });
    return () => cancelAnimationFrame(id);
  }, [hp, hpBefore, stepKey]);
  const motion = act ? (side === 'l' ? 'animate-lunge-r' : 'animate-lunge-l') : hit ? 'animate-hit-shake' : '';
  return (
    <div className={`absolute bottom-2 flex w-36 flex-col items-center gap-0.5 ${side === 'l' ? 'left-[5%]' : 'right-[5%]'}`}>
      <span className="max-w-full truncate text-[11px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">{name}</span>
      {/* 길드(문양+이름) / 몬스터 스킬(누르면 설명) — 없어도 높이 고정. */}
      <span className="flex h-3 max-w-full items-center gap-0.5 text-[9.5px] drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">{sub}</span>
      <span className={`text-[10px] leading-none font-bold tabular-nums drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] ${side === 'l' ? 'text-amber-300' : 'text-red-300'}`}>
        <span className="font-normal text-zinc-300">전투력 </span>{n(cp)}
      </span>
      <div key={`${stepKey}${act ? 'a' : hit ? 'h' : ''}`} className={`relative mt-0.5 h-[100px] w-36 ${motion}`}>
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-4 z-20 whitespace-nowrap font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">-{compact(Math.round(dmg))}</div>
        ) : null}
        <div className="h-full w-full transition-[opacity,filter] duration-500 ease-out" style={{ opacity: down ? 0.3 : 1, filter: down ? 'grayscale(1)' : 'none' }}>
          {img ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className={`h-full w-full object-contain object-bottom ${act ? 'drop-shadow-[0_0_6px_rgba(251,191,36,.85)]' : 'drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]'}`}
              style={{ ...PIX, transform: `scaleX(${flip ? -1 : 1})`, transformOrigin: 'center bottom' }}
            />
          ) : null}
        </div>
      </div>
      {/* 체력바 — 몸 아래(대난투와 같은 자리). */}
      <div className="isolate mt-0.5 h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/50">
        <div className={`h-full ${hpColor(pct)}`} style={{ width: `${Math.max(0, pct)}%`, transition: instant ? 'none' : 'width 650ms ease-out' }} />
      </div>
      {/* 남은 / 최대 HP — 바와 함께 줄어든다(기록의 남은 HP와 같은 표기). */}
      <span className="text-[9.5px] leading-none tabular-nums text-zinc-300 drop-shadow-[0_1px_2px_rgba(0,0,0,.9)]">
        {hpNum(hpAbs)} / {compact(Math.round(hpMax))}
      </span>
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

/** 남은 도전 N/전체(하루 3 + 오늘 산 추가 도전) — 다 쓰면 N(0)만 빨간색. */
function Left({ left, total }: { left: number; total: number }) {
  return (
    <b className="tabular-nums">
      <span className={left <= 0 ? 'text-red-400' : 'text-zinc-100'}>{left}</span>
      <span className="font-normal text-zinc-400">/{total}</span>
    </b>
  );
}
