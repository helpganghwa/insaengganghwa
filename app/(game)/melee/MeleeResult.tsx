'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';

import { MELEE_REPLAY_ROUNDS, MELEE_HP_MULT } from '@/lib/game/balance';
import { assetUrl } from '@/lib/asset-versions';
import type { MeleeFinale, MeleeMyEvent } from '@/lib/db/schema/melee';

export type MeleeResultView = {
  /** 제N회(하루 1회 → 날짜 순서가 회차). */
  edition: number;
  participantCount: number;
  totalRounds: number;
  championNickname: string;
  podium: {
    rank: number;
    nickname: string;
    /** 불변 공개 코드 — 아바타 클릭 시 /u/<code> 프로필 상세. */
    publicCode: string | null;
    avatarUrl: string | null;
    /** 공격 성공 = 내 공격으로 상대가 쓰러진 횟수(킬). */
    attackSuccess: number;
    /** 방어 성공 = 공격받고도 버텨낸 횟수(피격 − 탈락당함). */
    defenseSuccess: number;
  }[];
  me: {
    rank: number;
    diamond: number;
    boxes: { weapon: number; armor: number; accessory: number };
  } | null;
  myEvents: MeleeMyEvent[];
  myNickname: string;
  myAvatar: string | null;
  /** 내 공개 코드 — 내 전투 리플레이에서 내 아바타 → 프로필 상세. */
  myPublicCode: string | null;
  myCp: number;
  finale: MeleeFinale;
  rosterAvatars: (string | null)[];
  /** finale 로스터 로컬 인덱스별 공개 코드(아바타 클릭 링크용). */
  rosterCodes: (string | null)[];
};

type Fight = {
  round: number;
  atkName: string;
  atkAvatar: string | null;
  /** 공격자 프로필 상세 경로(/u/<code|nick>) — 아바타 클릭 이동. */
  atkHref?: string | null;
  /** 공격자 현재/최대 HP(양쪽 HP바 영역 일치 + 정보 표시). */
  atkHp?: number;
  atkMaxHp?: number;
  tgtName: string;
  tgtAvatar: string | null;
  tgtHref?: string | null;
  dmg: number;
  hpAfter: number;
  tgtMaxHp?: number;
  /** 이 라운드 진행 중 아레나 생존자 수(상단 표시). */
  survivors?: number;
  /** 결승(최후의 1인을 가린 마지막) 라운드 — 특별 연출. */
  isFinal?: boolean;
};

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
/** 내 전투 상대(아바타 미상)·폴백용 기본 지급 아바타. */
const DEFAULT_AVATAR = '/sprites/default/male/south.png';

// 전투 내레이션 풀 — 라운드별 결정적 선택(round % len)으로 다양하게(렌더 순수성 유지).
const KILLED_MSGS: ((a: string, t: string, d: string) => string)[] = [
  (a, t, d) => `${a}의 일격이 ${t}을(를) 꿰뚫는다. ${d}의 치명타 — ${t}, 모래 위에 무너지다.`,
  (a, t, d) => `${a}의 마지막 공격! ${d}의 피해로 ${t}이(가) 쓰러진다.`,
  (a, t, d) => `${t}, ${a}의 ${d} 일격을 버티지 못하고 무릎 꿇는다.`,
  (a, t, d) => `${a}이(가) 결정타를 꽂는다. ${d} — ${t}, 아레나에서 탈락.`,
  (a, t, d) => `섬광 같은 ${a}의 공격. ${t}이(가) ${d}의 피해와 함께 스러진다.`,
  (a, t, d) => `${a}의 분노가 ${t}을(를) 덮친다. ${d} 치명타로 결착.`,
];
const SURVIVE_MSGS: ((a: string, t: string, d: string, hp: string) => string)[] = [
  (a, t, d, hp) => `${a}, ${t}에게 ${d}의 피해를 새긴다. 남은 생명력 ${hp}, 아직 쓰러지지 않는다.`,
  (a, t, d, hp) => `${a}의 공격이 ${t}을(를) 강타! ${d} 피해 — ${t}, 체력 ${hp}로 버틴다.`,
  (a, t, d, hp) => `${t}, ${a}의 ${d} 공격을 이 악물고 견딘다. (체력 ${hp})`,
  (a, t, d, hp) => `${a}이(가) ${d}의 일격을 날린다. ${t}, 체력 ${hp}로 반격을 노린다.`,
  (a, t, d, hp) => `격렬한 공방! ${a}의 ${d} 피해에도 ${t}은(는) 체력 ${hp}로 살아남는다.`,
  (a, t, d, hp) => `${a}의 맹공 ${d}. ${t}, 남은 ${hp}의 생명으로 맞선다.`,
];

/** 내 순위·보상 칩(인라인) — 무대 하단 바 중앙. 탭하면 우편함(상세 보상). */
function MyRankChip({ me }: { me: MeleeResultView['me'] }) {
  if (!me) {
    return (
      <div className="min-w-0 shrink truncate rounded-full bg-black/55 px-3 py-1 text-[11px] font-medium text-zinc-300 ring-1 ring-zinc-700/50 backdrop-blur-sm text-pixel-outline">
        오늘 미참가
      </div>
    );
  }
  const totalBoxes = me.boxes.weapon + me.boxes.armor + me.boxes.accessory;
  const reward = [
    me.diamond > 0 ? `다이아 ${me.diamond.toLocaleString()}` : null,
    totalBoxes > 0 ? `상자 ${totalBoxes}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link
      href="/mail"
      className="inline-flex min-w-0 shrink items-center gap-1.5 truncate rounded-full bg-black/60 px-3 py-1 text-[11px] font-medium text-zinc-100 ring-1 ring-amber-700/40 backdrop-blur-sm text-pixel-outline"
    >
      <span className="shrink-0">
        내 순위 <span className="font-mono font-extrabold text-amber-300">{me.rank}위</span>
      </span>
      {reward ? <span className="truncate text-zinc-300">· {reward}</span> : null}
    </Link>
  );
}

/** 잔여 HP 비율별 게이지 색상(녹→황→주→적). */
function hpColor(pct: number): string {
  if (pct > 55) return 'bg-emerald-500';
  if (pct > 30) return 'bg-amber-400';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-red-700';
}

// ── 단일 전투 무대(레이드식 타격·HP 연출) ──
//  공격/방어 라벨·이름·HP바를 양쪽 모두 고정 높이로 둬 두 파이터 높이를 맞춘다.
function Fighter({
  name,
  avatar,
  href,
  side,
  role,
  shake,
  dmg,
  hp,
  hpBefore,
  maxHp,
}: {
  name: string;
  avatar: string | null;
  /** 있으면 아바타 클릭 시 프로필 상세로 이동. */
  href?: string | null;
  side: 'l' | 'r';
  role: 'atk' | 'def';
  shake: boolean;
  /** 이 캐릭터 머리 위로 띄울 피해량(타겟에만). */
  dmg?: number;
  hp?: number;
  hpBefore?: number;
  maxHp?: number;
}) {
  const dead = maxHp != null && (hp ?? 0) <= 0;
  // HP 바: 피격 전 → 후로 애니메이션(시각적 감소).
  const [pct, setPct] = useState(maxHp ? clampPct(((hpBefore ?? hp ?? 0) / maxHp) * 100) : 0);
  useEffect(() => {
    if (maxHp == null) return;
    const id = requestAnimationFrame(() => setPct(clampPct(((hp ?? 0) / maxHp) * 100)));
    return () => cancelAnimationFrame(id);
  }, [hp, maxHp]);

  // 사망 페이드 — 처음엔 색이 있다가, HP가 비워진 뒤(650ms) 투명/회색으로 전환.
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (!dead) return;
    const t = setTimeout(() => setFaded(true), 680);
    return () => clearTimeout(t);
  }, [dead]);

  const attacking = role === 'atk';
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  return (
    <div className="flex w-40 flex-col items-center gap-0.5">
      <div
        className={`relative h-36 w-40 transition-transform duration-200 ${lunge} ${
          shake ? 'animate-hit-shake' : ''
        }`}
      >
        {/* 공격/방어 라벨 — 머리 위 오버레이(세로 공간 절약) */}
        <span
          className={`absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white text-pixel-outline ${
            attacking ? 'bg-amber-600/85' : 'bg-sky-700/85'
          }`}
        >
          {attacking ? '공격' : '방어'}
        </span>
        {/* 피해량 — 타겟 머리 위 정중앙에서 떠오름 */}
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-4 z-20 font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            -{dmg.toLocaleString()}
          </div>
        ) : null}
        {/* 사망 시 색→투명 전환(transition) */}
        <div
          className="h-full w-full transition-all duration-500 ease-out"
          style={{ opacity: faded ? 0.25 : 1, filter: faded ? 'grayscale(1)' : 'none' }}
        >
          {avatar ? (
            href ? (
              <Link href={href} aria-label={`${name} 프로필`} className="block h-full w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatar}
                  alt={name}
                  className="h-full w-full object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]"
                  style={{
                    imageRendering: 'pixelated',
                    // +20% 확대 + 아래로 이동(닉네임~라벨 사이). origin bottom으로 발끝 고정. side r는 좌우반전.
                    transform: `translateY(26px) scale(1.2) scaleX(${side === 'r' ? -1 : 1})`,
                    transformOrigin: 'center bottom',
                  }}
                />
              </Link>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatar}
                alt={name}
                className="h-full w-full object-contain object-bottom drop-shadow-[0_2px_5px_rgba(0,0,0,0.85)]"
                style={{
                  imageRendering: 'pixelated',
                  transform: `translateY(26px) scale(1.2) scaleX(${side === 'r' ? -1 : 1})`,
                  transformOrigin: 'center bottom',
                }}
              />
            )
          ) : (
            <div className="flex h-full w-full items-center justify-center text-3xl font-extrabold text-zinc-400">
              {name.slice(0, 1)}
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-24 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
      <div className="max-w-[150px] truncate text-[11px] font-bold text-white drop-shadow">{name}</div>
      {/* HP바 — 양쪽 동일 높이 확보(공격자는 빈 자리 placeholder). */}
      {maxHp != null ? (
        <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
          <div
            className={`h-full ${hpColor(pct)}`}
            style={{ width: `${pct}%`, transition: 'width 650ms ease-out' }}
          />
        </div>
      ) : (
        <div className="h-1.5 w-24" />
      )}
    </div>
  );
}

function FightStage({
  fight,
  participantCount,
  playing,
  onBack,
}: {
  fight: Fight;
  participantCount: number;
  /** 전체 재생 중이면 진행 상황(N/M). */
  playing: { idx: number; total: number } | null;
  onBack: () => void;
}) {
  const killed = fight.hpAfter <= 0;
  const isFinal = !!fight.isFinal;
  // 판타지 내레이션 — 라운드별 결정적 랜덤. 결승은 우승 멘트.
  const dmgStr = fight.dmg.toLocaleString();
  const hpStr = Math.max(0, fight.hpAfter).toLocaleString();
  const narration = isFinal
    ? `${fight.atkName}의 최후의 일격! 마지막 한 명까지 쓰러뜨리고 대난투를 제패하다 — 우승!`
    : killed
      ? KILLED_MSGS[fight.round % KILLED_MSGS.length]!(fight.atkName, fight.tgtName, dmgStr)
      : SURVIVE_MSGS[fight.round % SURVIVE_MSGS.length]!(fight.atkName, fight.tgtName, dmgStr, hpStr);

  // 결승 WINNER 토스트 — 헤더 위(portal, fixed top)로 내려왔다 3.8s 후 사라짐(랭킹 변화 토스트처럼).
  const [winnerShow, setWinnerShow] = useState(isFinal);
  useEffect(() => {
    if (!isFinal) return;
    const t = setTimeout(() => setWinnerShow(false), 3800);
    return () => clearTimeout(t);
  }, [isFinal]);

  return (
    <div className="relative z-10 flex h-full flex-col">
      {/* 피격 플래시(1회) — 결승은 골드 */}
      <div
        className={`animate-hit-flash pointer-events-none absolute inset-0 mix-blend-screen ${
          isFinal ? 'bg-amber-400/70' : 'bg-red-500/70'
        }`}
      />
      {/* 결승 우승 토스트 — 헤더 위(portal, fixed top)로 내려오는 골드 배너 + 샤인 스윕(3.8s 후 사라짐) */}
      {isFinal && winnerShow && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="pointer-events-none fixed inset-x-0 top-0 z-[60] overflow-hidden"
              style={{ animation: 'winner-drop 0.6s cubic-bezier(0.22,1,0.36,1) both' }}
            >
              <div className="mx-auto flex max-w-[390px] flex-col items-center justify-center overflow-hidden border-b-2 border-amber-300/70 bg-gradient-to-r from-amber-600 via-amber-300 to-amber-600 py-2 shadow-[0_6px_24px_rgba(245,158,11,0.7)]">
                <div className="text-xl font-extrabold tracking-[0.35em] text-white drop-shadow-[0_2px_4px_rgba(120,53,15,0.9)]">
                  WINNER
                </div>
                <div className="text-[12px] font-extrabold text-amber-950">{fight.atkName} 우승</div>
                <div
                  className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 bg-white/50 blur-md"
                  style={{ animation: 'winner-shine 1.1s ease-out 0.35s both' }}
                />
              </div>
            </div>,
            document.body,
          )
        : null}
      {/* 상단: 참가자 / ROUND / 비움 */}
      <div className="relative z-10 grid grid-cols-3 items-center px-3 pt-2 text-[10px] font-semibold drop-shadow">
        <span className="text-left text-zinc-200">
          생존 {(fight.survivors ?? participantCount).toLocaleString()}
        </span>
        <span className="text-center font-mono tracking-wider text-amber-200">
          {fight.round.toLocaleString()} ROUND
        </span>
        <span />
      </div>
      {/* 중단: 화면 2분할 — 각 절반 중앙에 파이터 배치 */}
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-2 items-center overflow-hidden">
        <div className="flex justify-center">
          <Fighter
            name={fight.atkName}
            avatar={fight.atkAvatar}
            href={fight.atkHref}
            side="l"
            role="atk"
            shake={false}
            // 공격자 HP — 양쪽 바 영역 일치 + 현재 체력 표시(피격 없음 → 정적).
            hp={fight.atkHp}
            hpBefore={fight.atkHp}
            maxHp={fight.atkMaxHp}
          />
        </div>
        <div className="flex justify-center">
          <Fighter
            name={fight.tgtName}
            avatar={fight.tgtAvatar}
            href={fight.tgtHref}
            side="r"
            role="def"
            shake
            dmg={fight.dmg}
            hp={fight.hpAfter}
            hpBefore={fight.hpAfter + fight.dmg}
            // maxHp 미상(예: 내 전투 상대)이면 피격 전 HP를 기준으로 → 항상 바가 보이고 0까지 차감 연출.
            maxHp={fight.tgtMaxHp ?? Math.max(1, fight.hpAfter + fight.dmg)}
          />
        </div>
      </div>
      {/* 하단: 판타지 내레이션 — 높이 2줄 고정(레이아웃 시프트 방지) + 단어단위 개행 */}
      <div className="relative z-10 flex h-10 shrink-0 items-center justify-center px-4 pb-1">
        <p className="line-clamp-2 break-keep text-center text-[11px] italic leading-snug text-zinc-100 drop-shadow">
          {narration}
        </p>
      </div>
      <button
        type="button"
        onClick={onBack}
        className="absolute right-1.5 top-1.5 z-20 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-bold text-zinc-200 backdrop-blur-sm"
      >
        {playing ? `정지 ${playing.idx + 1}/${playing.total}` : '← 랭킹'}
      </button>
    </div>
  );
}

// ── 랭킹 뷰(기본) — 리더보드식 2·1·3 전신 ──
function RankingView({
  podium,
  participantCount,
  edition,
}: {
  podium: MeleeResultView['podium'];
  participantCount: number;
  edition: number;
}) {
  const byRank = new Map(podium.map((p) => [p.rank, p]));
  const slots = [
    { slot: 2, p: byRank.get(2) },
    { slot: 1, p: byRank.get(1) },
    { slot: 3, p: byRank.get(3) },
  ];
  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="pt-1.5 text-center text-[10px] font-semibold text-amber-200 text-pixel-outline">
        제{edition.toLocaleString()}회 대난투 · 참가 {participantCount.toLocaleString()}명
      </div>
      {/* items-end + 동일 높이 아바타 박스 + object-bottom → 발끝(바닥선) 통일. #1만 scale로 확대. */}
      {/* pb-9: 하단 내 순위 칩과 겹치지 않게 시상대를 위로 띄움. */}
      <div className="flex flex-1 items-end justify-center gap-0.5 px-1 pb-9">
        {slots.map(({ slot, p }) => {
          const first = slot === 1;
          return (
            <div key={slot} className={`flex w-1/3 flex-col items-center ${first ? 'z-10' : ''}`}>
              <div className="flex items-center gap-0.5">
                <span className="font-mono text-[11px] font-bold tabular-nums text-amber-300 text-pixel-outline">
                  #{slot}
                </span>
                <span className="max-w-[78px] truncate text-[11px] font-medium text-white text-pixel-outline">
                  {p?.nickname ?? '—'}
                </span>
              </div>
              {/* object-bottom + 동일 박스 하단선(items-end) → 발끝 통일. scale은 origin bottom이라 발끝 고정. */}
              {/* 아바타 클릭 → 프로필 상세(/u/<code>). */}
              <div className="relative h-36 w-full">
                {p?.avatarUrl ? (
                  p.publicCode ? (
                    <Link
                      href={`/u/${encodeURIComponent(p.publicCode)}`}
                      aria-label={`${p.nickname} 프로필`}
                      className="absolute inset-0 block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.avatarUrl}
                        alt=""
                        aria-hidden
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-contain object-bottom"
                        style={{
                          imageRendering: 'pixelated',
                          transform: 'translateY(25px) scale(1.5)',
                          transformOrigin: 'center bottom',
                          filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.6))',
                        }}
                      />
                    </Link>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.avatarUrl}
                      alt=""
                      aria-hidden
                      draggable={false}
                      className="absolute inset-0 h-full w-full object-contain object-bottom"
                      style={{
                        imageRendering: 'pixelated',
                        transform: 'translateY(25px) scale(1.5)',
                        transformOrigin: 'center bottom',
                        filter: 'drop-shadow(0 3px 5px rgba(0,0,0,0.6))',
                      }}
                    />
                  )
                ) : null}
              </div>
              <span className="pb-0.5 text-[9px] font-medium text-amber-100 text-pixel-outline">
                {p ? `공격 성공 ${p.attackSuccess} · 방어 성공 ${p.defenseSuccess}` : '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 로그 라운드 카드 — 라운드 번호 + 공격/방어 2행(모던·스캔 가능) ──
function RoundCard({
  round,
  atk,
  tgt,
  dmg,
  hp,
  atkSeq,
  defSeq,
  tgtRank,
  me,
  onClick,
}: {
  round: number;
  atk: string;
  tgt: string;
  dmg: number;
  hp: number;
  /** 공격자의 누적 공격 횟수(이 라운드 기준). */
  atkSeq: number;
  /** 방어자의 누적 방어(피격) 횟수. */
  defSeq: number;
  /** 탈락 시 그 타겟의 최종 등수(있으면 "N위" 표기). */
  tgtRank?: number;
  me?: string;
  onClick: () => void;
}) {
  const killed = hp <= 0;
  const isMe = (n: string) => n === me;
  return (
    <li className="border-b border-zinc-900/60 last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-stretch gap-2.5 px-3 py-2 text-left transition hover:bg-zinc-900/50 active:bg-zinc-800/60"
      >
        {/* 라운드 번호 */}
        <div className="flex w-8 shrink-0 flex-col items-center justify-center">
          <span className="font-mono text-[13px] font-extrabold leading-none tabular-nums text-zinc-400">
            {round.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[7px] font-bold tracking-[0.15em] text-zinc-600">ROUND</span>
        </div>
        <div className="w-px shrink-0 bg-zinc-800/80" />
        {/* 공격 / 방어 2행 */}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400" />
            <span className="min-w-0 truncate text-[12px]">
              <span className={`font-bold ${isMe(atk) ? 'text-amber-300' : 'text-white'}`}>{atk}</span>
              <span className="text-zinc-500">의 {atkSeq.toLocaleString()}번째 공격</span>
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold text-red-300">
              -{dmg.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
            <span className="min-w-0 truncate text-[12px]">
              <span className={`font-bold ${isMe(tgt) ? 'text-amber-300' : 'text-zinc-200'}`}>{tgt}</span>
              <span className="text-zinc-500">의 {defSeq.toLocaleString()}번째 방어</span>
            </span>
            <span className="ml-auto shrink-0 text-[11px]">
              {killed ? (
                <span className="font-bold text-red-400">
                  쓰러짐{tgtRank ? ` · ${tgtRank.toLocaleString()}위` : ''}
                </span>
              ) : (
                <span className="font-mono font-semibold text-emerald-300">
                  HP {Math.max(0, hp).toLocaleString()}
                </span>
              )}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

// ── 로그 최상단 FINAL 카드 — 우승 축하(round 자리에 FINAL) + 챔피언 아바타 배경. 표시 전용(비클릭). ──
function FinalCard({ champion, avatar }: { champion: string; avatar: string | null }) {
  return (
    <li className="relative flex items-center overflow-hidden border-b border-amber-900/40 py-3 pr-3 pl-3">
      {/* 우측 — 챔피언 아바타(배경 레이어). height/top으로 상반신·얼굴이 박스 세로 중앙(여백 보정). */}
      {avatar ? (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-36 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatar}
            alt=""
            aria-hidden
            className="absolute left-1/2 w-auto -translate-x-1/2"
            style={{ imageRendering: 'pixelated', height: '450%', top: '-40%' }}
          />
        </div>
      ) : null}
      {/* 연속 그라데이션 — 아바타 영역까지 포함해 좌→우로 한 번에 깔림 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-500/25 via-amber-500/10 to-transparent" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-zinc-950/95 via-zinc-950/45 to-transparent" />
      {/* 콘텐츠 — 그라데이션 위 */}
      <div className="relative z-10 flex w-full items-center gap-2.5">
        <div className="flex w-8 shrink-0 flex-col items-center justify-center">
          <span className="font-mono text-[11px] font-extrabold leading-none tracking-[0.1em] text-amber-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
            FINAL
          </span>
        </div>
        <div className="w-px shrink-0 self-stretch bg-amber-600/40" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-extrabold tracking-tight text-amber-200 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            {champion} 우승
          </div>
          <div className="truncate text-[10px] font-medium text-amber-100/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]">
            최후의 1인 — 대난투를 제패하다
          </div>
        </div>
      </div>
    </li>
  );
}

export function MeleeResult({ view }: { view: MeleeResultView }) {
  const [tab, setTab] = useState<'log' | 'mine'>('log');
  const [fight, setFight] = useState<Fight | null>(null);
  const [fightKey, setFightKey] = useState(0);
  const {
    podium,
    me,
    finale,
    championNickname,
    edition,
    participantCount,
    totalRounds,
    myEvents,
    myNickname,
    myAvatar,
    myPublicCode,
    myCp,
    rosterAvatars,
    rosterCodes,
  } = view;
  /** 핸들(코드 또는 닉네임)로 프로필 상세 경로. 없으면 null(링크 없음). */
  const hrefOf = (handle: string | null | undefined) =>
    handle ? `/u/${encodeURIComponent(handle)}` : null;
  const roster = finale.roster;
  const truncated = finale.events.length >= MELEE_REPLAY_ROUNDS;
  const finaleStart = totalRounds - finale.events.length;

  // 라운드별 아레나 생존자 수(리플레이 상단 표시). finale 윈도 시작 생존자 = 챔피언 + 윈도 내 탈락 예정자.
  const killsInFinale = finale.events.filter((e) => e[3] <= 0).length;
  const aliveByRound = new Map<number, number>();
  {
    let alive = 1 + killsInFinale;
    finale.events.forEach((e, i) => {
      aliveByRound.set(finaleStart + i + 1, alive); // 이 라운드 진행 중 생존자
      if (e[3] <= 0) alive -= 1; // 탈락은 다음 라운드부터 반영
    });
  }

  const play = (f: Fight) => {
    setFight(f);
    setFightKey((k) => k + 1);
  };

  // 행 데이터(시간순) — 표시는 역순, 전체 재생은 시간순으로 사용.
  type Row = {
    key: number;
    round: number;
    atk: string;
    tgt: string;
    dmg: number;
    hp: number;
    atkSeq: number;
    defSeq: number;
    tgtRank?: number;
    fight: Fight;
  };
  // 누적 공격/방어 횟수(리플레이 윈도 내 시간순). 미절단이면 절대값, 절단이면 윈도 기준.
  const atkSeqMap = new Map<number, number>();
  const defSeqMap = new Map<number, number>();
  // 로스터 인덱스별 현재 HP 추적(피격 시 hpAfter로 갱신) — 공격자 HP바 표시용.
  const hpByIdx = new Map<number, number>();
  const logData: Row[] = finale.events.map((e, i) => {
    const round = finaleStart + i + 1;
    const atk = roster[e[0]]?.nickname ?? '?';
    const tgt = roster[e[1]]?.nickname ?? '?';
    const atkCp = roster[e[0]]?.cp ?? 0;
    const tgtCp = roster[e[1]]?.cp ?? 0;
    const atkSeq = (atkSeqMap.get(e[0]) ?? 0) + 1;
    atkSeqMap.set(e[0], atkSeq);
    const defSeq = (defSeqMap.get(e[1]) ?? 0) + 1;
    defSeqMap.set(e[1], defSeq);
    const atkMaxHp = atkCp > 0 ? atkCp * MELEE_HP_MULT : undefined;
    // 공격자 현재 HP — 직전 피격 잔여(없으면 풀). 이번 라운드 공격자는 피격 안 함.
    const atkHp = atkMaxHp != null ? hpByIdx.get(e[0]) ?? atkMaxHp : undefined;
    hpByIdx.set(e[1], e[3]); // 타겟 HP 갱신(다음 라운드 반영)
    return {
      key: round,
      round,
      atk,
      tgt,
      dmg: e[2],
      hp: e[3],
      atkSeq,
      defSeq,
      tgtRank: e[3] <= 0 ? roster[e[1]]?.rank : undefined,
      fight: {
        round,
        atkName: atk,
        atkAvatar: rosterAvatars[e[0]] ?? null,
        atkHref: hrefOf(rosterCodes[e[0]]),
        atkHp,
        atkMaxHp,
        tgtName: tgt,
        tgtAvatar: rosterAvatars[e[1]] ?? null,
        tgtHref: hrefOf(rosterCodes[e[1]]),
        dmg: e[2],
        hpAfter: e[3],
        tgtMaxHp: tgtCp > 0 ? tgtCp * MELEE_HP_MULT : undefined,
        survivors: aliveByRound.get(round),
        // finale 마지막 이벤트 = 최후의 1인을 가린 결승 라운드.
        isFinal: i === finale.events.length - 1,
      },
    };
  });
  // 내 전투 = 전체 전투(finale)에서 내가 공격자/타겟인 라운드만 "필터" — 전체와 완전 동일(상대 아바타·HP·등수 일관).
  const myFiltered: Row[] = myNickname
    ? logData.filter((r) => r.atk === myNickname || r.tgt === myNickname)
    : [];

  // 폴백 — finale 윈도 밖(초대규모 절단 시 내 라운드가 윈도 밖)이면 per-user myEvents로 복원.
  //  닉네임→로스터 메타(아바타·코드)로 상대 프로필 복원 + 내 HP 추적(공격 시 잔여 HP 표시).
  const byNick = new Map<string, { avatar: string | null; code: string | null }>();
  finale.roster.forEach((r, i) =>
    byNick.set(r.nickname, { avatar: rosterAvatars[i] ?? null, code: rosterCodes[i] ?? null }),
  );
  const myMax = myCp > 0 ? myCp * MELEE_HP_MULT : undefined;
  let myHp = myMax ?? 0;
  const myAtkSeqMap = new Map<string, number>();
  const myDefSeqMap = new Map<string, number>();
  const myFallback: Row[] = myEvents.map((e, i) => {
    const [role, opp, dmg, hp] = e;
    const round = e[4] ?? i + 1;
    const atk = role === 0 ? myNickname : opp;
    const tgt = role === 0 ? opp : myNickname;
    const atkSeq = (myAtkSeqMap.get(atk) ?? 0) + 1;
    myAtkSeqMap.set(atk, atkSeq);
    const defSeq = (myDefSeqMap.get(tgt) ?? 0) + 1;
    myDefSeqMap.set(tgt, defSeq);
    const oppMeta = byNick.get(opp);
    const oppAvatar = oppMeta?.avatar ?? DEFAULT_AVATAR;
    const oppHref = hrefOf(oppMeta?.code ?? opp);
    const meHref = hrefOf(myPublicCode);
    const atkHpNow = role === 0 ? (myMax != null ? myHp : undefined) : undefined;
    const row: Row = {
      key: i,
      round,
      atk,
      tgt,
      dmg,
      hp,
      atkSeq,
      defSeq,
      tgtRank: role === 1 && hp <= 0 ? me?.rank : undefined,
      fight: {
        round,
        atkName: atk,
        atkAvatar: role === 0 ? myAvatar ?? DEFAULT_AVATAR : oppAvatar,
        atkHref: role === 0 ? meHref : oppHref,
        atkHp: atkHpNow,
        atkMaxHp: role === 0 ? myMax : undefined,
        tgtName: tgt,
        tgtAvatar: role === 0 ? oppAvatar : myAvatar ?? DEFAULT_AVATAR,
        tgtHref: role === 0 ? oppHref : meHref,
        dmg,
        hpAfter: hp,
        tgtMaxHp: role === 1 ? myMax : undefined,
        survivors: aliveByRound.get(round) ?? (role === 1 && hp <= 0 ? me?.rank : undefined),
      },
    };
    if (role === 1) myHp = hp; // 내가 피격 → 다음 라운드부터 잔여 HP 반영
    return row;
  });

  const myData = myFiltered.length > 0 ? myFiltered : myFallback;
  const rows = tab === 'log' ? logData : myData;
  const displayRows = [...rows].reverse(); // 최신 라운드가 위로

  // 전체 재생 — 시간순으로 무대에 라운드를 순차 재생. 배속(1·2·4x)으로 간격 조절.
  const [autoplay, setAutoplay] = useState<{ list: Fight[]; idx: number } | null>(null);
  const [speed, setSpeed] = useState(1);
  useEffect(() => {
    if (!autoplay) return;
    const t = setTimeout(() => {
      const next = autoplay.idx + 1;
      if (next >= autoplay.list.length) {
        setAutoplay(null);
        return;
      }
      setAutoplay({ list: autoplay.list, idx: next });
      play(autoplay.list[next]!);
    }, 1600 / speed);
    return () => clearTimeout(t);
  }, [autoplay, speed]);
  const stopPlay = () => setAutoplay(null);
  const cycleSpeed = () => setSpeed((s) => (s === 1 ? 4 : s === 4 ? 8 : s === 8 ? 16 : 1));
  const startPlayAll = () => {
    const list = rows.map((r) => r.fight);
    if (list.length === 0) return;
    setAutoplay({ list, idx: 0 });
    play(list[0]!);
  };
  const selectTab = (t: 'log' | 'mine') => {
    setTab(t);
    stopPlay();
    setFight(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 무대 — 헤더처럼 고정(스크롤·오버스크롤 영향 없음) */}
      <div className="relative h-60 shrink-0 overflow-hidden border-b border-amber-900/50">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/hub/melee.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/45" />
        {fight ? (
          <FightStage
            key={fightKey}
            fight={fight}
            participantCount={participantCount}
            playing={autoplay ? { idx: autoplay.idx, total: autoplay.list.length } : null}
            onBack={() => {
              stopPlay();
              setFight(null);
            }}
          />
        ) : (
          <RankingView podium={podium} participantCount={participantCount} edition={edition} />
        )}
        {/* 무대 하단 바 — [보상테이블] · [내 순위] · [역대우승자]. 랭킹 뷰일 때만. */}
        {!fight ? (
          <div className="absolute inset-x-0 bottom-2 z-20 flex items-center justify-between gap-1.5 px-3">
            <Link
              href="/melee/info"
              className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-amber-200 backdrop-blur-sm text-pixel-outline"
            >
              보상테이블
            </Link>
            <MyRankChip me={me} />
            <Link
              href="/melee/info?tab=history"
              className="shrink-0 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-bold text-amber-200 backdrop-blur-sm text-pixel-outline"
            >
              역대우승자
            </Link>
          </div>
        ) : null}
      </div>

      {/* 필터·컨트롤 — 헤더/무대처럼 고정(shrink-0, 오버스크롤 영향 없음) */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950">
        <div className="flex gap-1 px-3 pt-2.5">
            {(
              [
                ['log', '전체 전투'],
                ['mine', '내 전투'],
              ] as const
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => selectTab(t)}
                className={`flex-1 rounded-lg py-1.5 text-xs font-bold transition ${
                  tab === t ? 'bg-amber-600 text-white' : 'bg-zinc-900 text-zinc-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <span className="truncate text-[10px] text-zinc-500">
              {tab === 'log' && truncated ? `마지막 ${finale.events.length.toLocaleString()}전` : ''}
            </span>
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={cycleSpeed}
                className="rounded-lg bg-zinc-800 px-2 py-1 text-[10px] font-bold text-zinc-200 tabular-nums transition active:bg-zinc-700"
              >
                {speed}x
              </button>
              <button
                type="button"
                onClick={() => (autoplay ? stopPlay() : startPlayAll())}
                disabled={rows.length === 0}
                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold text-white transition disabled:opacity-40 ${
                  autoplay ? 'bg-zinc-700' : 'bg-amber-600/90'
                }`}
              >
                {autoplay ? `정지 ${autoplay.idx + 1}/${autoplay.list.length}` : '전체 재생'}
              </button>
            </div>
          </div>
      </div>

      {/* 로그 — 고정 헤더/컨트롤 아래 내부 스크롤(풀폭, 별도 박스 없음) */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {displayRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-zinc-500">
            {tab === 'mine' && !me ? '참가 시 내 전투가 표시됩니다.' : '전투 기록이 없습니다.'}
          </div>
        ) : (
          <ul>
            {/* 결승 우승 축하 — 전체 전투 탭 최상단 FINAL 배너(표시 전용). */}
            {tab === 'log' && championNickname && logData.length > 0 ? (
              <FinalCard
                champion={championNickname}
                avatar={podium.find((p) => p.rank === 1)?.avatarUrl ?? null}
              />
            ) : null}
            {displayRows.map((r) => (
              <RoundCard
                key={r.key}
                round={r.round}
                atk={r.atk}
                tgt={r.tgt}
                dmg={r.dmg}
                hp={r.hp}
                atkSeq={r.atkSeq}
                defSeq={r.defSeq}
                tgtRank={r.tgtRank}
                me={myNickname}
                onClick={() => {
                  stopPlay();
                  play(r.fight);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
