'use client';

/**
 * 월드보스 전투 재생(docs/WORLD-BOSS.md §3·§9) — 저장된 전투 기록(finale)을 한 칸씩 보여 준다.
 * 10-11 사용자 C안: 무대(300px, 너무 크지 않게) 안에서 보스가 움직이고 피해 숫자·보상이 튀며, 무대 발밑에 **텍스트 RPG식 일지**가
 * 한 줄씩 떠오른다(▶ 공격 · ✦ 보스 · 라운드 머리). 아래는 대난투 순위 목록처럼 **얼굴을 행 오른쪽에 크게** 깐 컴팩트 행(50px).
 * 공격 = 보스 흔들림 + 피해 숫자, 쓰러짐 = 붉은 번쩍임 + 그 행 흑백, 라운드가 바뀌면 큰 라운드 표시. 큰 당첨(💎300+ · 📦90+)은
 * 글자 없이 효과로만(금빛 광선·번쩍임·크게 — 2026-10-08 사용자: '대박!' 같은 텍스트 금지). 건너뛰기로 바로 끝(2.5배속 탭은 10-11 삭제).
 * 결과 팝업은 없다(10-11 사용자) — 끝나면 결과(총 피해·페이즈·획득·최다 피해)도 일지 줄로 붙고, 명단 아래 일지 전체가 펼쳐진다. 하단은 다시 재생·나가기. 안내 문구는 두지 않는다.
 * 원정대장은 행·결과 표에 '원정대장' 칩으로 보인다(10-11 사용자: 어울리는 곳엔 최대한).
 */
import { josa } from 'josa';
import { useEffect, useMemo, useRef, useState } from 'react';

import { meleeFaceCropStyle } from '@/components/faceCrop';
import { GuildBadge } from '@/components/GuildBadge';
import { WorldBossBackdrop } from '@/components/WorldBossBackdrop';
import { WorldBossSprite } from '@/components/WorldBossSprite';
import { assetUrl } from '@/lib/asset-versions';
import { worldBossStageFor } from '@/lib/game/guild/balance';
import { sounds } from '@/lib/game/sound';
import { worldBossBgEmberUrl } from '@/lib/game/world-boss/bosses';
import { formatCompactKR } from '@/lib/ui/format-number';
import type { WorldBossBattle } from '@/lib/game/world-boss/view-types';

import { LeaderChip } from './LeaderChip';

// 재생 간격 — 10-11 사용자: 처음(520/1000)의 2배로 느리게.
const STEP_ATTACK_MS = 1040;
const STEP_FALL_MS = 2000;
/** 마지막 전투 줄 뒤 정산 줄까지 기다리는 시간(건너뛰기는 바로). */
const RESULT_DELAY_MS = 1400;
/** 라운드 전환 쉼 — 쓰러짐 연출이 지난 뒤 새 라운드 첫 공격 이만큼 전에 라운드 알약만 바뀐다(10-11 사용자). */
const ROUND_BEAT_MS = 600;
/** 일지 문장 풀 — 같은 문장만 반복되면 재미없어(10-11 사용자) 공격·반격마다 다른 문장을 고른다(기록마다 자리가 달라지게 원정대 id로 섞는다).
 * 무기 이름이 기록돼 있으면(10-11부터) 무기 문장, 없으면(옛 기록) 맨손 문장. josa 표기(#{을} 등)는 조사 라이브러리가 받침에 맞춘다. */
const ATTACK_LINES: ((nick: string, weapon: string) => string)[] = [
  (n, w) => `${n}, ${w}#{을} 휘두른다`,
  (n, w) => `${n}#{이} ${w}#{을} 번뜩이며 파고든다`,
  (n, w) => `${n}, 틈을 노려 ${w}#{을} 찔러 넣는다`,
  (n, w) => `${n}의 ${w}#{이} 깃털을 가르며 꽂힌다`,
  (n, w) => `${n}, 잿불을 뚫고 ${w}#{을} 내리꽂는다`,
  (n, w) => `${n}#{이} ${w}#{을} 크게 휘둘러 후려친다`,
  (n, w) => `${n}, ${w}#{을} 움켜쥐고 몸통을 노린다`,
  (n, w) => `${n}#{이} 날개 사이로 ${w}#{을} 꽂아 넣는다`,
];
const BARE_ATTACK_LINES: ((nick: string) => string)[] = [
  (n) => `${n}#{이} 일격을 날린다`,
  (n) => `${n}#{이} 몸통을 노려 내리친다`,
  (n) => `${n}, 틈을 노려 찔러 든다`,
  (n) => `${n}#{이} 잿불을 뚫고 달려든다`,
];
const BOSS_LINES: ((boss: string, nick: string) => string)[] = [
  (b, n) => `${b}의 날갯짓 — 잿불이 ${n}#{을} 덮쳤다. 쓰러짐`,
  (b, n) => `${b}#{이} 울부짖으며 불덩이를 토해 냈다 — ${n} 쓰러짐`,
  (_, n) => `${n}#{이} 잿불 폭풍에 휩쓸려 쓰러졌다`,
  (b, n) => `${b}의 발톱이 ${n}#{을} 낚아챘다 — 쓰러짐`,
  (_, n) => `잿더미가 솟구쳐 ${n}#{을} 삼켰다. 쓰러짐`,
  (b, n) => `${b}의 꼬리 깃이 불꽃을 흩뿌려 ${n}#{이} 쓰러졌다`,
  (b, n) => `${n}, ${b}의 눈빛에 묶인 채 잿불에 휘감겼다 — 쓰러짐`,
  (_, n) => `불타는 깃털 소나기 — ${n}#{이} 버티지 못하고 쓰러졌다`,
];
/** 페이즈 게이지 컬러 — 레이드 카드와 같은 6색 순환(페이즈마다 다음 색, 10-11 사용자: 레이드와 같은 방식). */
const PHASE_PALETTE = [
  { bar: 'bg-emerald-400', text: 'text-emerald-300', glow: 'shadow-emerald-400/60' },
  { bar: 'bg-sky-400', text: 'text-sky-300', glow: 'shadow-sky-400/60' },
  { bar: 'bg-violet-400', text: 'text-violet-300', glow: 'shadow-violet-400/60' },
  { bar: 'bg-amber-400', text: 'text-amber-300', glow: 'shadow-amber-400/60' },
  { bar: 'bg-rose-400', text: 'text-rose-300', glow: 'shadow-rose-400/60' },
  { bar: 'bg-cyan-400', text: 'text-cyan-300', glow: 'shadow-cyan-400/60' },
];
/** 문자열 → 작은 정수(기록마다 문장 자리를 다르게). */
const seedOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

type LootTier = 'small' | 'good' | 'jackpot';
/** 보상 등급 — jackpot(💎300+·📦90+)은 금빛 광선, good(💎50+·📦30+)은 호박색 강조, 나머지는 어두운 알약(10-11 사용자: 높은 보상은 더 눈에 띄게). */
const lootTier = (d: number, b: number): LootTier => (d >= 300 || b >= 90 ? 'jackpot' : d >= 50 || b >= 30 ? 'good' : 'small');
type LogLine = { key: string; kind: 'round' | 'atk' | 'boss' | 'result'; text: string; dmg?: number; loot?: string; lootTier?: LootTier; weak?: number };

export function WorldBossReplay({
  battle,
  bossName,
  bossTraits = [],
  bgSrc,
  onClose,
}: {
  battle: WorldBossBattle;
  bossName: string;
  /** 보스 특성 — 이름 오른쪽 아이콘(10-10). */
  bossTraits?: { code: string; icon: string; name: string }[];
  bgSrc: string;
  onClose: () => void;
}) {
  const { roster, events } = battle.finale;
  const drops = battle.finale.drops ?? [];
  const weakBits = battle.finale.weak ?? [];
  const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [idx, setIdx] = useState(reduced ? events.length : 0); // 적용된 이벤트 수
  const done = idx >= events.length;
  // 정산(★ 결과) 줄은 마지막 전투 줄이 끝나고 잠시 뒤에 올라온다(10-11 사용자).
  const [resultShown, setResultShown] = useState(false);

  useEffect(() => {
    if (done) return;
    const ev = events[idx]!;
    const ms = ev[0] < 0 ? STEP_FALL_MS : STEP_ATTACK_MS;
    const t = setTimeout(() => setIdx((i) => i + 1), ms);
    return () => clearTimeout(t);
  }, [idx, done, events]);

  // 지금까지 적용된 이벤트로 상태를 다시 계산(최대 65칸이라 매 단계 전부 다시 세도 가볍다).
  const st = useMemo(() => {
    const dmg = new Array<number>(roster.length).fill(0);
    const gotD = new Array<number>(roster.length).fill(0);
    const gotB = new Array<number>(roster.length).fill(0);
    const atk = new Array<number>(roster.length).fill(0);
    const fell = new Array<number | null>(roster.length).fill(null);
    let total = 0;
    let round = 1;
    for (let k = 0; k < idx; k++) {
      const [a, t, d, aux] = events[k]!;
      if (a >= 0) {
        dmg[a]! += d;
        atk[a]!++;
        total = aux;
        gotD[a]! += drops[k]?.[0] ?? 0;
        gotB[a]! += drops[k]?.[1] ?? 0;
      } else {
        fell[t] = aux;
        round = aux + 1;
      }
    }
    const last = idx > 0 ? events[idx - 1]! : null;
    const lastDrop = idx > 0 ? (drops[idx - 1] ?? null) : null;
    return { dmg, atk, fell, gotD, gotB, total, round: Math.min(round, battle.finale.rounds), last, lastDrop, alive: fell.filter((f) => f == null).length };
  }, [idx, events, drops, roster.length, battle.finale.rounds]);

  // 일지(텍스트 RPG) — 적용된 이벤트를 문장으로. 무기 이름이 기록돼 있으면 "창천검을 휘두른다", 없으면(옛 기록) "일격".
  const lines = useMemo(() => {
    const out: LogLine[] = [{ key: 'r1', kind: 'round', text: '1라운드' }];
    const dmgSum: number[] = [];
    const seed = seedOf(battle.partyId);
    // 같은 사람이 연달아 같은 문장을 쓰지 않도록 k에 소수를 곱해 돌린다.
    const pick = <T,>(pool: T[], k: number): T => pool[(seed + k * 7) % pool.length]!;
    for (let k = 0; k < idx; k++) {
      const [a, t, d, aux] = events[k]!;
      if (a >= 0) {
        const m = roster[a]!;
        const weapon = m.items?.find((i) => i.slot === 'weapon')?.name;
        const drop = drops[k];
        const wb = weakBits[k] ?? 0;
        dmgSum[a] = (dmgSum[a] ?? 0) + d;
        out.push({
          key: `e${k}`,
          kind: 'atk',
          text: josa(weapon ? pick(ATTACK_LINES, k)(m.nickname, weapon) : pick(BARE_ATTACK_LINES, k)(m.nickname)),
          dmg: d,
          loot: drop && drop[0] > 0 ? `💎${drop[0].toLocaleString('ko-KR')}` : drop && drop[1] > 0 ? `📦${drop[1]}` : undefined,
          lootTier: drop ? lootTier(drop[0], drop[1]) : undefined,
          weak: [1, 2, 4].filter((b) => (wb & b) !== 0).length,
        });
      } else {
        const m = roster[t]!;
        out.push({ key: `e${k}`, kind: 'boss', text: josa(pick(BOSS_LINES, k)(bossName, m.nickname)) });
        if (aux + 1 <= battle.finale.rounds && k < events.length - 1) out.push({ key: `r${aux + 1}`, kind: 'round', text: `${aux + 1}라운드` });
      }
    }
    // 끝나면 결과도 일지로(10-11 사용자: 결과 팝업 없이 일지·로그만으로) — 총 피해·페이즈 변화·원정대 획득·최다 피해.
    if (resultShown && events.length > 0) {
      const moved = battle.stageTo - battle.stageFrom;
      let top = 0;
      for (let i = 1; i < dmgSum.length; i++) if ((dmgSum[i] ?? 0) > (dmgSum[top] ?? 0)) top = i;
      out.push({ key: 'end', kind: 'round', text: '원정 종료' });
      out.push({ key: 'res1', kind: 'result', text: `원정대 피해 ${battle.finale.totalDamage.toLocaleString('ko-KR')} · ${moved > 0 ? `${bossName} ${battle.stageTo}페이즈까지 +${moved}페이즈` : `보스 ${battle.stageTo}페이즈 그대로`}` });
      out.push({ key: 'res2', kind: 'result', text: `원정대 총획득 💎${battle.reward.diamond.toLocaleString('ko-KR')} 📦${battle.reward.boxes.toLocaleString('ko-KR')}` });
      if (roster[top]) out.push({ key: 'res3', kind: 'result', text: `최대 피해 ${roster[top].nickname} ${formatCompactKR(dmgSum[top] ?? 0)}` });
    }
    return out;
  }, [idx, events, roster, drops, weakBits, bossName, battle.partyId, battle.finale.rounds, battle.stageFrom, battle.stageTo, battle.finale.totalDamage, battle.reward.diamond, battle.reward.boxes, resultShown]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => setResultShown(true), RESULT_DELAY_MS);
    return () => clearTimeout(t);
  }, [done]);
  // 효과음 — 탑·대난투처럼 있는 소리로만(10-11 사용자: 울음·출정 같은 전용음 없음, 설정의 효과음 끄기를 따른다):
  // 대원 타격=레이드 타격(약점 적중도 같은 소리 — 특수음은 보상에만), 날갯짓에 쓰러짐=KO,
  // 보상을 뽑으면 타격 뒤에 이어 울린다: 작은 전리품=보석, 좋은 전리품=보상 팡파레, 대박=강화 대박 팡파레. 건너뛰기는 마지막 한 번만.
  useEffect(() => {
    const ev = idx > 0 ? events[idx - 1] : null;
    if (!ev) return;
    if (ev[0] < 0) {
      sounds.meleeKo();
      return;
    }
    sounds.raidHit();
    const drop = drops[idx - 1];
    if (!drop || (drop[0] <= 0 && drop[1] <= 0)) return;
    const tier = lootTier(drop[0], drop[1]);
    if (tier === 'jackpot') sounds.enhanceJackpot();
    else if (tier === 'good') sounds.reward();
    else sounds.gem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);
  // 정산 줄이 올라올 때 팡파레(레이드 승리), 페이즈를 올렸으면 레벨업 소리가 뒤따른다.
  useEffect(() => {
    if (!resultShown) return;
    sounds.raidVictory();
    if (battle.stageTo - battle.stageFrom > 0) window.setTimeout(() => sounds.levelup(), 450);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultShown]);
  // 라운드 알약은 보스 반격(쓰러짐) 연출이 지난 뒤에 바뀐다 — 첫 공격 ROUND_BEAT_MS 전에 알약만 커져 전환이 읽힌다. 되감으면(다시 재생) 바로.
  const [shownRound, setShownRound] = useState(1);
  useEffect(() => {
    if (st.round === shownRound) return;
    const t = setTimeout(() => setShownRound(st.round), st.round < shownRound || done ? 0 : STEP_FALL_MS - ROUND_BEAT_MS);
    return () => clearTimeout(t);
  }, [st.round, shownRound, done]);
  // 이번 공격이 맞힌 약점 부위 수 — 무대 숫자·명단 숫자의 스타일로만 드러낸다(10-11 사용자: 글자·배지 없음).
  const lastWeak = idx > 0 && st.last && st.last[0] >= 0 ? [1, 2, 4].filter((b) => ((weakBits[idx - 1] ?? 0) & b) !== 0).length : 0;
  // 페이즈 게이지 — 출발 시점 보스 누적(finale.start)이 기록된 전투만(옛 기록은 원정대 피해 합계로 대신).
  const phase = battle.finale.start != null ? worldBossStageFor(battle.finale.start + st.total) : null;
  // 레이드 카드와 같은 게이지 시퀀스: 페이즈를 넘기면 100%까지 채우고(440ms) 다음 색으로 바뀌어 0부터 다시 찬다. 건너뛰기·되감기는 바로.
  const targetPct = phase ? Math.min(100, (phase.into / Math.max(1, phase.need)) * 100) : 0;
  const [gPhase, setGPhase] = useState(phase?.stage ?? 0);
  const [gPct, setGPct] = useState(targetPct);
  const [phaseUp, setPhaseUp] = useState(false);
  const gaugeTok = useRef(0);
  useEffect(() => {
    if (!phase) return;
    const token = ++gaugeTok.current;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      if (phase.stage < gPhase || done) {
        setGPhase(phase.stage);
        setGPct(targetPct);
        return;
      }
      let ph = gPhase;
      while (ph < phase.stage) {
        setGPct(100);
        await sleep(440);
        if (gaugeTok.current !== token) return;
        ph += 1;
        setGPhase(ph);
        setGPct(0);
        await sleep(50);
        if (gaugeTok.current !== token) return;
      }
      setGPct(targetPct);
      if (ph !== gPhase) {
        setPhaseUp(true);
        await sleep(650);
        if (gaugeTok.current === token) setPhaseUp(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase?.stage, targetPct, done]);
  const pal = PHASE_PALETTE[gPhase % PHASE_PALETTE.length]!;
  // 무대 오버레이 — 라운드 줄은 빼고 마지막 3줄(라운드는 상단 중앙 알약이 맡는다, 10-11 사용자). 명단 아래 전체 일지에는 라운드 머리를 남긴다.
  const shown = lines.filter((l) => l.kind !== 'round').slice(-3);

  const struck = st.last && st.last[0] < 0;
  const hit = st.last && st.last[0] >= 0;
  const face = (userId: string) => battle.avatars?.[userId] ?? { src: null, box: null };
  const isLeader = (nickname: string) => nickname === battle.leaderNickname;

  // 대원이 칠 때 보스 흔들림 — Web Animations로 그 자리에서만 흔들어 대기 애니(띠)가 처음으로 돌아가지 않게 한다.
  const shakeRef = useRef<HTMLDivElement>(null);
  // 목록 — 지금 공격하는(또는 쓰러지는) 대원 행을 화면 안으로.
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    const ev = idx > 0 ? events[idx - 1] : null;
    if (!ev) return;
    const who = ev[0] >= 0 ? ev[0] : ev[1];
    rowRefs.current[who]?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }, [idx, events, reduced]);
  useEffect(() => {
    if (!hit || reduced) return;
    shakeRef.current?.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }],
      { duration: 280, easing: 'ease-in-out' },
    );
  }, [idx, hit, reduced]);

  const jackpot = !!hit && !!st.lastDrop && (st.lastDrop[0] >= 300 || st.lastDrop[1] >= 90);

  return (
    <div className="fixed inset-0 z-50 mx-auto flex w-full max-w-[390px] flex-col bg-stone-950 text-stone-100" role="dialog" aria-label="원정대 전투">
      <>
          {/* 위 — 무대(배경 + 보스 + 일지). 탭하면 빠르게. 글자는 어두운 바탕 위에만 둬 숲 배경에서도 읽힌다(리뷰 R1). */}
          <div className="relative h-[300px] shrink-0 overflow-hidden text-left">
            <WorldBossBackdrop bgSrc={bgSrc} emberSrc={assetUrl(worldBossBgEmberUrl())} className="opacity-85" />
            <span className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,rgba(9,9,11,0.75)_0%,transparent_20%,transparent_55%,#09090b_100%)]" />
            {/* 보스가 칠 때 가장자리만 붉게 물든다(전체를 덮으면 분홍으로 튐 — 2026-10-09) */}
            {struck && <span key={`f${idx}`} className="wb-vignette pointer-events-none absolute inset-0 animate-wb-flash" />}
            {jackpot && <span key={`fj${idx}`} className="pointer-events-none absolute inset-0 animate-wb-flash bg-orange-300/35" />}
            <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+10px)] z-10 flex items-center px-3 text-[11px]">
              <span className="rounded-full bg-black/60 px-2 py-0.5 text-stone-300">
                생존 <b className="text-white">{st.alive}</b>/{roster.length}
              </span>
              {/* 라운드 — 좌우 정중앙(10-11 사용자), 바뀔 때마다 크게 */}
              <span key={`r${shownRound}`} className="absolute left-1/2 -translate-x-1/2 animate-wb-round rounded-full bg-black/60 px-2.5 py-0.5 text-[12px] font-black tracking-widest text-orange-300">
                {shownRound}라운드
              </span>
            </div>
            <div className="absolute left-1/2 top-[40%] h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2">
              <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(249,115,22,0.22),transparent_65%)]" />
              {/* 보스 — 대기 애니는 계속 돌고, 대원이 치면 흔들림, 보스가 치면 다가오기 + 불씨 플레어(WorldBossSprite attack) */}
              <div ref={shakeRef} className="relative h-full w-full">
                <WorldBossSprite
                  alt={bossName}
                  attack={struck ? idx : null}
                  className="h-full w-full"
                  style={{ filter: 'drop-shadow(0 0 1px #000) drop-shadow(0 0 1px #000) drop-shadow(0 0 16px rgba(249,115,22,0.45))' }}
                />
              </div>
              {/* 큰 당첨 — 글자 없이 효과로만(금빛 광선 + 번쩍임 + 크게) */}
              {jackpot && (
                <span key={`j${idx}`} className="pointer-events-none absolute -inset-10 animate-wb-jackpot rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,rgba(249,115,22,0.55)_20deg,transparent_40deg,transparent_60deg,rgba(249,115,22,0.55)_80deg,transparent_100deg,transparent_120deg,rgba(249,115,22,0.55)_140deg,transparent_160deg,transparent_180deg,rgba(249,115,22,0.55)_200deg,transparent_220deg,transparent_240deg,rgba(249,115,22,0.55)_260deg,transparent_280deg,transparent_300deg,rgba(249,115,22,0.55)_320deg,transparent_340deg)]" />
              )}
              {/* 피해 숫자 — 보스 머리 위 한 자리(10-11 사용자). 약점을 맞히면 숫자 스타일로만(호박색 빛, 두 부위 이상은 더 크고 밝게). */}
              {hit && st.last && (
                <span
                  key={`d${idx}`}
                  className={`absolute left-1/2 -top-2.5 -translate-x-1/2 animate-wb-num whitespace-nowrap font-mono font-black tabular-nums ${
                    lastWeak >= 2
                      ? 'text-[26px] text-amber-100 [text-shadow:0_0_14px_#fbbf24,0_0_4px_#f59e0b,0_1px_2px_#000]'
                      : lastWeak === 1
                        ? 'text-[23px] text-amber-200 [text-shadow:0_0_10px_#f59e0b,0_1px_2px_#000]'
                        : 'text-[22px] text-white [text-shadow:0_0_8px_#ea580c,0_1px_2px_#000,0_0_2px_#000]'
                  }`}
                >
                  {formatCompactKR(st.last[2])}
                </span>
              )}
              {hit && st.lastDrop && (st.lastDrop[0] > 0 || st.lastDrop[1] > 0) && (
                <span
                  key={`g${idx}`}
                  className={`absolute left-[calc(100%-2px)] top-[56px] animate-wb-round whitespace-nowrap font-black tabular-nums ${
                    jackpot
                      ? 'text-[17px] text-amber-100 [text-shadow:0_0_14px_#fbbf24,0_0_4px_#f59e0b,0_1px_2px_#000]'
                      : lootTier(st.lastDrop[0], st.lastDrop[1]) === 'good'
                        ? 'text-[14px] text-amber-200 [text-shadow:0_0_8px_#f59e0b,0_1px_2px_#000]'
                        : 'text-[12.5px] text-stone-100 [text-shadow:0_1px_2px_#000,0_0_2px_#000]'
                  }`}
                >
                  {st.lastDrop[0] > 0 ? `💎${st.lastDrop[0].toLocaleString('ko-KR')}` : `📦${st.lastDrop[1]}`}
                </span>
              )}
            </div>
            {/* 일지 — 무대 발밑 어두운 알약 위에 마지막 3줄. 새 줄은 아래서 떠오른다. */}
            <div className="pointer-events-none absolute inset-x-2 bottom-8 z-10 flex flex-col gap-1">
              {shown.map((l, i) => {
                const newest = i === shown.length - 1;
                return (
                  <p
                    key={l.key}
                    className={`flex items-center gap-2 overflow-hidden whitespace-nowrap rounded-md px-2.5 py-1.5 text-[12px] leading-snug [text-shadow:0_1px_2px_#000] ${newest ? 'animate-wb-line' : ''} ${
                      l.kind === 'round'
                        ? 'self-center bg-black/60 px-3 text-[11px] tracking-widest text-stone-300'
                        : l.kind === 'boss'
                          ? 'border-l-2 border-red-500 bg-black/75 text-red-200'
                          : l.kind === 'result'
                            ? 'border-l-2 border-orange-400 bg-orange-950/85 font-bold text-orange-100'
                            : 'bg-black/70 text-stone-50'
                    }`}
                  >
                    <LogText l={l} />
                  </p>
                );
              })}
            </div>
            {/* 보스 이름 · 페이즈 게이지(지금 페이즈·다음까지, 바닥 3px 바) — 무대 맨 아래. 원정대 피해 합계는 명단 머리로 옮겼다. 출발 누적이 없는 옛 기록은 합계를 여기 둔다. */}
            <div className={`absolute inset-x-0 z-10 flex items-baseline justify-between px-3 ${phase ? 'bottom-[13px]' : 'bottom-1.5'} ${phaseUp ? 'animate-phase-up' : ''}`}>
              <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-orange-200 [text-shadow:0_1px_3px_#000]">
                {bossName}
                {bossTraits.length > 0 && <span className="text-[11px]">{bossTraits.map((t) => t.icon).join(' ')}</span>}
              </span>
              {phase ? (
                <span className="whitespace-nowrap text-[10.5px] text-stone-300 [text-shadow:0_1px_3px_#000]">
                  <b className={`font-mono text-[14px] tabular-nums ${pal.text}`}>PHASE {gPhase}</b>
                  <span className="ml-1.5">다음까지</span>{' '}
                  <b className="font-mono text-[11.5px] text-stone-100 tabular-nums">{formatCompactKR(Math.max(0, phase.need - phase.into))}</b>
                </span>
              ) : (
                <span className="text-[11px] text-stone-300 [text-shadow:0_1px_3px_#000]">
                  원정대 피해 <b className="font-mono text-[15px] text-orange-300 tabular-nums">{st.total.toLocaleString('ko-KR')}</b>
                </span>
              )}
            </div>
            {phase && (
              <div className="absolute inset-x-3 bottom-[5px] z-10 h-1.5 isolate overflow-hidden rounded-full bg-black/60 ring-1 ring-black/40">
                <div key={gPhase} className={`h-full ${pal.bar} shadow-[0_0_10px] ${pal.glow}`} style={{ width: `${Math.max(2, gPct)}%`, transition: 'width 380ms ease-out' }} />
              </div>
            )}
          </div>

          {/* 아래 — 원정대원 목록(참가 순, 대난투 순위 행처럼 얼굴을 오른쪽에 크게). 지금 공격하는 행이 빛나고 화면 안으로 따라온다. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-2">
            {/* 머리는 행보다 위(z-20) — 행 안의 z-10 글자가 같은 스택에서 머리를 덮던 문제(10-11 사용자). 행은 isolate로 자기 스택을 만든다. */}
            <div className="sticky top-0 z-20 flex items-center justify-between bg-stone-950 py-1.5 text-[10.5px] text-stone-500">
              <span>원정대원 {roster.length}명</span>
              {phase && (
                <span>
                  원정대 피해 <b className="font-mono text-[12px] text-orange-300 tabular-nums">{st.total.toLocaleString('ko-KR')}</b>
                </span>
              )}
            </div>
            <ul className="overflow-hidden rounded-xl border border-stone-800">
              {roster.map((m, i) => {
                const fellR = st.fell[i];
                // 끝나면 마지막 타격·반격 강조는 걷는다 — 마지막에 쓰러진 대원도 다른 대원처럼 흑백이 된다(10-11 사용자).
                const isHit = !done && !!hit && st.last![0] === i;
                const isStruck = !done && !!struck && st.last![1] === i;
                const f = face(m.userId);
                const weakNow = isHit ? lastWeak : 0;
                const down = fellR != null && !isStruck;
                return (
                  <li
                    key={m.userId}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={`relative isolate flex h-[50px] items-center overflow-hidden border-b border-stone-800/80 last:border-b-0 ${
                      isStruck ? 'bg-red-950/60' : isHit ? 'bg-orange-950/40' : 'bg-stone-900'
                    } ${down ? 'opacity-60' : ''}`}
                  >
                    {f.src ? (
                      <div className="pointer-events-none absolute inset-y-0 right-0 w-32">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={f.src} alt="" aria-hidden decoding="async" className={`absolute inset-0 h-full w-full ${down ? 'grayscale' : ''}`} style={meleeFaceCropStyle(f.box)} />
                      </div>
                    ) : null}
                    {/* 왼쪽에서 어두워지는 그라데이션 — 글자 자리 확보(대난투 행과 같은 방식) */}
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#1c1917_0%,#1c1917_50%,rgba(28,25,23,0.15)_100%)]" />
                    {isHit && <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-orange-400" />}
                    {isHit && st.lastDrop && lootTier(st.lastDrop[0], st.lastDrop[1]) !== 'small' && (
                      <div key={`lf${idx}`} className="pointer-events-none absolute inset-0 animate-wb-flash bg-amber-300/30" />
                    )}
                    {isStruck && <div className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-red-500" />}
                    <div className="relative z-10 min-w-0 flex-1 px-2.5 leading-tight">
                      <span className="flex min-w-0 items-center gap-1 text-[12.5px] font-bold text-stone-50 [text-shadow:0_1px_2px_#000]">
                        <span className="truncate">{m.nickname}</span>
                        {isLeader(m.nickname) && <LeaderChip />}
                        {fellR != null && <span className="shrink-0 rounded bg-red-900/80 px-1 text-[8.5px] font-extrabold text-red-200">{fellR}R 쓰러짐</span>}
                      </span>
                      <span className="mt-0.5 flex min-w-0 items-center gap-1 whitespace-nowrap text-[10.5px] text-stone-300 [text-shadow:0_1px_2px_#000]">
                        {m.guildName ? (
                          <GuildBadge emblemUrl={battle.guildEmblems?.[m.userId]?.url ?? null} emblemColor={battle.guildEmblems?.[m.userId]?.color ?? null} name={m.guildName} size={10} className="min-w-0 max-w-[72px]" />
                        ) : (
                          <span className="shrink-0">무소속</span>
                        )}
                        <span className="shrink-0 text-stone-600">·</span>
                        <span className="shrink-0">
                          공격 <b className="font-mono text-stone-200">{st.atk[i]}</b> · 피해{' '}
                          <b className={`font-mono ${weakNow ? 'text-amber-200 [text-shadow:0_0_6px_#f59e0b]' : isHit ? 'text-orange-300' : 'text-stone-200'}`}>{formatCompactKR(st.dmg[i]!)}</b>
                          {st.gotD[i]! > 0 || st.gotB[i]! > 0 ? (
                            <>
                              {' '}· <b className="text-orange-300">{[st.gotD[i]! > 0 ? `💎${st.gotD[i]}` : '', st.gotB[i]! > 0 ? `📦${st.gotB[i]}` : ''].filter(Boolean).join(' ')}</b>
                            </>
                          ) : null}
                        </span>
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
            {/* 끝난 뒤 — 일지 전체(결과 팝업을 닫고 다시 읽을 수 있게). */}
            {done && (
              <div className="mt-2 rounded-xl border border-stone-800 bg-stone-900/70 px-2.5 py-2">
                <p className="mb-1 text-[10.5px] text-stone-500">전투 일지</p>
                {lines.map((l) => (
                  <p
                    key={l.key}
                    className={`flex items-center gap-2 overflow-hidden whitespace-nowrap text-[11.5px] leading-relaxed ${
                      l.kind === 'round' ? 'mt-1 justify-center text-[10.5px] tracking-widest text-stone-500' : l.kind === 'boss' ? 'text-red-200' : l.kind === 'result' ? 'font-bold text-orange-200' : 'text-stone-200'
                    }`}
                  >
                    <LogText l={l} />
                  </p>
                ))}
              </div>
            )}
          </div>
          {done ? (
            <div className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] mt-1 flex shrink-0 gap-2">
              <button
                type="button"
                onClick={() => {
                  setResultShown(false);
                  setIdx(0);
                }}
                className="flex-1 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
              >
                다시 재생
              </button>
              <button type="button" onClick={onClose} className="flex-1 rounded-lg bg-orange-700 py-2.5 text-[12.5px] font-extrabold text-orange-50">
                나가기
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setIdx(events.length);
                setResultShown(true); // 건너뛰기는 정산까지 한 번에(10-11 사용자)
              }}
              className="mx-4 mb-[calc(env(safe-area-inset-bottom,0px)+14px)] mt-1 shrink-0 rounded-lg border border-stone-700 py-2.5 text-[12.5px] font-bold text-stone-300"
            >
              건너뛰기
            </button>
          )}
        </>
    </div>
  );
}

/** 일지 한 줄 — 부모가 flex. 문장은 왼쪽에서 줄어들고(말줄임), 피해·전리품은 줄 끝에 고정돼 길어도 잘리지 않는다(10-11 사용자).
 * 약점 적중은 숫자 스타일(호박색 빛)로만, 전리품도 테두리·배경 없이 글자 색·빛만(jackpot 금빛 · good 호박색 · small 회색). */
function LogText({ l }: { l: LogLine }) {
  if (l.kind === 'atk') {
    const weak = l.weak ?? 0;
    return (
      <>
        <span className="min-w-0 flex-1 truncate">▶ {l.text}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          <b className={`font-mono tabular-nums ${weak >= 2 ? 'text-amber-100 [text-shadow:0_0_8px_#fbbf24]' : weak === 1 ? 'text-amber-200 [text-shadow:0_0_6px_#f59e0b]' : 'text-orange-300'}`}>
            {formatCompactKR(l.dmg ?? 0)}
          </b>
          {l.loot ? (
            l.lootTier === 'jackpot' ? (
              <b className="text-amber-100 [text-shadow:0_0_8px_#fbbf24]">{l.loot}</b>
            ) : l.lootTier === 'good' ? (
              <b className="text-amber-200 [text-shadow:0_0_6px_#f59e0b]">{l.loot}</b>
            ) : (
              <span className="text-stone-300">{l.loot}</span>
            )
          ) : null}
        </span>
      </>
    );
  }
  if (l.kind === 'boss') return <span className="min-w-0 flex-1 truncate">✦ {l.text}</span>;
  if (l.kind === 'result') return <span className="min-w-0 flex-1 truncate">★ {l.text}</span>;
  return <span className="min-w-0 truncate">{l.text}</span>;
}
