'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { josa } from 'es-hangul';

import { assetUrl } from '@/lib/asset-versions';
import { CONQUEST_HP_MULT } from '@/lib/game/guild/balance';
import type { ConquestBattleView as View } from '@/lib/game/guild/conquest/battle-view';

// 길드별 색상 — 로스터 등장 순서대로 배정(승자/패자 시각 구분).
const TEAM_COLORS = ['#f59e0b', '#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#ec4899', '#14b8a6', '#eab308'];

const REGION: Record<string, { label: string; color: string }> = {
  volcano: { label: '드래곤 화산', color: '#ef4444' },
  temple: { label: '잊힌 신전', color: '#60a5fa' },
  swamp: { label: '슬라임 늪', color: '#22c55e' },
  orc: { label: '오크 부락', color: '#f97316' },
  kingdom: { label: '왕국', color: '#fbbf24' },
  angel: { label: '타락 천사 부유섬', color: '#c084fc' },
};

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const DEFAULT_AVATAR = '/sprites/default/male/south.png';

// 점령전 내레이션 — 라운드별 결정적 선택(round % len)으로 렌더 순수성 유지.
const KILLED_MSGS: ((a: string, t: string, d: string) => string)[] = [
  (a, t, d) => `${a}의 일격이 ${josa(t, '을/를')} 베어 넘긴다. ${t}, 전열에서 이탈한다. (-${d})`,
  (a, t, d) => `${josa(a, '이/가')} 결정타를 꽂는다. ${t} 무너지고, ${d}의 피해가 전장에 새겨진다.`,
  (a, t, d) => `${t}, ${a}의 맹공을 버티지 못하고 쓰러진다. (-${d})`,
  (a, t, d) => `${a}의 창끝이 ${josa(t, '을/를')} 꿰뚫는다 — ${t} 전사. (-${d})`,
];
const SURVIVE_MSGS: ((a: string, t: string, d: string, hp: string) => string)[] = [
  (a, t, d, hp) => `${a}의 공격이 ${josa(t, '을/를')} 강타! ${t}, 체력 ${hp}로 버틴다. (-${d})`,
  (a, t, d, hp) => `${josa(a, '이/가')} ${d}의 일격을 날린다. ${t}, 체력 ${hp}로 진영을 지킨다.`,
  (a, t, d, hp) => `격전! ${a}의 ${d} 피해에도 ${josa(t, '은/는')} 체력 ${hp}로 견딘다.`,
  (a, t, d, hp) => `${a}의 맹공 ${d}. ${t}, ${hp}의 기세로 맞선다.`,
];

function hpColor(pct: number): string {
  if (pct > 55) return 'bg-emerald-500';
  if (pct > 30) return 'bg-amber-400';
  if (pct > 0) return 'bg-orange-500';
  return 'bg-red-700';
}

type Fight = {
  round: number;
  atkName: string;
  atkAvatar: string;
  atkHref: string | null;
  atkColor: string;
  atkEmblem: string | null;
  atkGuild: string;
  atkHp: number;
  atkMaxHp: number;
  tgtName: string;
  tgtAvatar: string;
  tgtHref: string | null;
  tgtColor: string;
  tgtEmblem: string | null;
  tgtGuild: string;
  dmg: number;
  hpAfter: number;
  tgtMaxHp: number;
  survivors: number;
};

// 길드 표식 — 문양 있으면 문양, 없으면 색 점(공수 구분).
function GuildMark({ emblem, color, size = 14 }: { emblem: string | null; color: string; size?: number }) {
  if (emblem) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={emblem}
        alt=""
        aria-hidden
        className="shrink-0 object-contain"
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      />
    );
  }
  return (
    <span
      className="shrink-0 rounded-full"
      style={{ width: Math.round(size * 0.6), height: Math.round(size * 0.6), backgroundColor: color }}
    />
  );
}

// ── 단일 파이터(아바타·HP·공방 라벨) — melee 무대와 동일 톤 ──
function Fighter({
  name,
  avatar,
  href,
  side,
  role,
  color,
  emblem,
  guild,
  shake,
  dmg,
  hp,
  hpBefore,
  maxHp,
}: {
  name: string;
  avatar: string;
  href: string | null;
  side: 'l' | 'r';
  role: 'atk' | 'def';
  color: string;
  emblem: string | null;
  guild: string;
  shake: boolean;
  dmg?: number;
  hp: number;
  hpBefore: number;
  maxHp: number;
}) {
  const dead = hp <= 0;
  const [pct, setPct] = useState(clampPct((hpBefore / maxHp) * 100));
  useEffect(() => {
    const id = requestAnimationFrame(() => setPct(clampPct((hp / maxHp) * 100)));
    return () => cancelAnimationFrame(id);
  }, [hp, maxHp]);

  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (!dead) return;
    const t = setTimeout(() => setFaded(true), 680);
    return () => clearTimeout(t);
  }, [dead]);

  const attacking = role === 'atk';
  const lunge = attacking ? (side === 'l' ? 'translate-x-2' : '-translate-x-2') : '';
  const img = (
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
  );
  return (
    <div className="flex w-40 flex-col items-center gap-0.5">
      <div
        className={`relative h-36 w-40 transition-transform duration-200 ${lunge} ${shake ? 'animate-hit-shake' : ''}`}
      >
        <span
          className={`absolute left-1/2 top-0 z-20 -translate-x-1/2 rounded-full px-2 py-0.5 text-[9px] font-bold text-white text-pixel-outline ${
            attacking ? 'bg-amber-600/85' : 'bg-sky-700/85'
          }`}
        >
          {attacking ? '공격' : '방어'}
        </span>
        {dmg != null ? (
          <div className="animate-dmg-float pointer-events-none absolute left-1/2 top-4 z-20 font-mono text-xl font-extrabold text-red-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
            -{dmg.toLocaleString()}
          </div>
        ) : null}
        <div
          className="h-full w-full transition-all duration-500 ease-out"
          style={{ opacity: faded ? 0.25 : 1, filter: faded ? 'grayscale(1)' : 'none' }}
        >
          {href ? (
            <Link href={href} aria-label={`${name} 프로필`} className="block h-full w-full">
              {img}
            </Link>
          ) : (
            img
          )}
        </div>
        <div className="pointer-events-none absolute -bottom-0.5 left-1/2 h-2 w-24 -translate-x-1/2 rounded-[50%] bg-black/55 blur-[3px]" />
      </div>
      <div className="flex max-w-[150px] items-center gap-1">
        <span className="truncate text-[11px] font-bold text-white drop-shadow">{name}</span>
      </div>
      {/* 길드 정보 — 문양(없으면 색점) + 길드명 */}
      <div className="flex max-w-[150px] items-center gap-1">
        <GuildMark emblem={emblem} color={color} size={13} />
        <span className="truncate text-[10px] font-medium text-zinc-300 drop-shadow">{guild}</span>
      </div>
      <div className="mt-0.5 h-1.5 w-24 isolate overflow-hidden rounded-full bg-zinc-800 ring-1 ring-black/40">
        <div className={`h-full ${hpColor(pct)}`} style={{ width: `${pct}%`, transition: 'width 650ms ease-out' }} />
      </div>
    </div>
  );
}

function FightStage({
  fight,
  playing,
  onBack,
}: {
  fight: Fight;
  playing: { idx: number; total: number } | null;
  onBack: () => void;
}) {
  const killed = fight.hpAfter <= 0;
  const dmgStr = fight.dmg.toLocaleString();
  const hpStr = Math.max(0, fight.hpAfter).toLocaleString();
  const narration = killed
    ? KILLED_MSGS[fight.round % KILLED_MSGS.length]!(fight.atkName, fight.tgtName, dmgStr)
    : SURVIVE_MSGS[fight.round % SURVIVE_MSGS.length]!(fight.atkName, fight.tgtName, dmgStr, hpStr);

  return (
    <div className="relative z-10 flex h-full flex-col">
      <div className="animate-hit-flash pointer-events-none absolute inset-0 bg-red-500/70 mix-blend-screen" />
      <div className="relative z-10 grid grid-cols-3 items-center px-3 pt-2 text-[10px] font-semibold drop-shadow">
        <span className="text-left text-zinc-200">생존 {fight.survivors.toLocaleString()}</span>
        <span className="text-center font-mono tracking-wider text-amber-200">
          {fight.round.toLocaleString()} ROUND
        </span>
        <span />
      </div>
      <div className="relative z-10 grid min-h-0 flex-1 grid-cols-2 items-center overflow-hidden">
        <div className="flex justify-center">
          <Fighter
            name={fight.atkName}
            avatar={fight.atkAvatar}
            href={fight.atkHref}
            side="l"
            role="atk"
            color={fight.atkColor}
            emblem={fight.atkEmblem}
            guild={fight.atkGuild}
            shake={false}
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
            color={fight.tgtColor}
            emblem={fight.tgtEmblem}
            guild={fight.tgtGuild}
            shake
            dmg={fight.dmg}
            hp={fight.hpAfter}
            hpBefore={fight.hpAfter + fight.dmg}
            maxHp={fight.tgtMaxHp}
          />
        </div>
      </div>
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
        {playing ? `정지 ${playing.idx + 1}/${playing.total}` : '← 정보'}
      </button>
    </div>
  );
}

// ── 무대 기본 뷰(전투 미선택) — 구역·승자·길드 대진 요약 ──
function IntroView({
  view,
  colorOf,
  emblemOf,
}: {
  view: View;
  colorOf: (gid: string) => string;
  emblemOf: (gid: string) => string | null;
}) {
  const region = REGION[view.zoneRegion] ?? { label: view.zoneRegion, color: '#71717a' };
  return (
    <div className="relative z-10 flex h-full flex-col px-4 pt-2.5 pb-9">
      <p className="text-[10px] font-bold text-pixel-outline" style={{ color: region.color }}>
        {region.label} · {view.kstDay.replace(/-/g, '.')}
      </p>
      <h1 className="text-base font-extrabold text-white text-pixel-outline">{view.zoneName} 점령전</h1>
      {view.winner ? (
        <div className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-full bg-black/45 px-2.5 py-0.5 ring-1 ring-amber-400/40 backdrop-blur-sm">
          {/* 길드문양을 길드이름 오른쪽에 — '점령 {이름} [문양]' */}
          <span className="text-[11px] font-bold text-white text-pixel-outline">
            <span className="text-amber-300">점령</span> {view.winner.name}
          </span>
          {view.winner.emblemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={view.winner.emblemUrl}
              alt=""
              aria-hidden
              className="h-4 w-4 object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          ) : null}
        </div>
      ) : (
        <div className="mt-1 inline-flex w-fit rounded-full bg-black/45 px-2.5 py-0.5 text-[11px] font-semibold text-zinc-200 ring-1 ring-white/20">
          무혈 · 승자 없음
        </div>
      )}
      {/* 길드 대진 — 문양 + 생존/처치 */}
      <div className="mt-auto space-y-1">
        {view.guilds.slice(0, 4).map((g) => (
          <div
            key={g.guildId}
            className="flex items-center gap-2 rounded-lg bg-black/45 px-2.5 py-1 text-[10px] backdrop-blur-sm"
          >
            <GuildMark emblem={emblemOf(g.guildId)} color={colorOf(g.guildId)} size={14} />
            <span className="min-w-0 flex-1 truncate font-bold text-white text-pixel-outline">{g.guildName}</span>
            {g.isWinner && <span className="shrink-0 font-bold text-amber-300">점령</span>}
            <span className="shrink-0 text-zinc-300">
              생존 <span className="font-mono font-bold text-white">{g.survivors}</span>/{g.memberCount}
            </span>
            <span className="shrink-0 text-zinc-300">
              처치 <span className="font-mono font-bold text-red-300">{g.kills}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── 로그 라운드 카드 — 라운드 + 공격/방어 2행(길드 문양·길드명 노출) ──
function RoundCard({
  round,
  atk,
  tgt,
  dmg,
  hp,
  atkColor,
  tgtColor,
  atkEmblem,
  tgtEmblem,
  atkGuild,
  tgtGuild,
  atkMine,
  tgtMine,
  killed,
  onClick,
}: {
  round: number;
  atk: string;
  tgt: string;
  dmg: number;
  hp: number;
  atkColor: string;
  tgtColor: string;
  atkEmblem: string | null;
  tgtEmblem: string | null;
  atkGuild: string;
  tgtGuild: string;
  atkMine: boolean;
  tgtMine: boolean;
  killed: boolean;
  onClick: () => void;
}) {
  return (
    <li className="border-b border-zinc-900/60">
      <button
        type="button"
        onClick={onClick}
        className="flex w-full items-stretch gap-2.5 px-3 py-2 text-left transition hover:bg-zinc-900/50 active:bg-zinc-800/60"
      >
        <div className="flex w-8 shrink-0 flex-col items-center justify-center">
          <span className="font-mono text-[13px] font-extrabold leading-none tabular-nums text-zinc-400">
            {round.toLocaleString()}
          </span>
          <span className="mt-0.5 text-[7px] font-bold tracking-[0.15em] text-zinc-600">ROUND</span>
        </div>
        <div className="w-px shrink-0 bg-zinc-800/80" />
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center gap-1.5">
            <GuildMark emblem={atkEmblem} color={atkColor} size={15} />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              <span className={`font-bold ${atkMine ? 'text-amber-300' : 'text-white'}`}>{atk}</span>
              <span className="text-zinc-500"> · {atkGuild}</span>
              <span className="text-zinc-500"> 공격</span>
            </span>
            <span className="ml-auto shrink-0 font-mono text-[11px] font-semibold text-red-300">
              -{dmg.toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <GuildMark emblem={tgtEmblem} color={tgtColor} size={15} />
            <span className="min-w-0 flex-1 truncate text-[12px]">
              <span className={`font-bold ${tgtMine ? 'text-amber-300' : 'text-zinc-200'}`}>{tgt}</span>
              <span className="text-zinc-500"> · {tgtGuild}</span>
              <span className="text-zinc-500"> 방어</span>
            </span>
            <span className="ml-auto shrink-0 text-[11px]">
              {killed ? (
                <span className="font-bold text-red-400">탈락</span>
              ) : (
                <span className="font-mono font-semibold text-emerald-300">HP {Math.max(0, hp).toLocaleString()}</span>
              )}
            </span>
          </div>
        </div>
      </button>
    </li>
  );
}

export function ConquestBattleView({ view }: { view: View }) {
  const { roster, events, myGuildId } = view;
  const [tab, setTab] = useState<'all' | 'guild'>('all');
  const [fight, setFight] = useState<Fight | null>(null);
  const [fightKey, setFightKey] = useState(0);
  const [autoplay, setAutoplay] = useState<{ list: Fight[]; idx: number } | null>(null);
  const [speed, setSpeed] = useState(1);

  // 길드 → 색(로스터 등장 순서).
  const colorMap = (() => {
    const m = new Map<string, string>();
    roster.forEach((r) => {
      if (!m.has(r.guildId)) m.set(r.guildId, TEAM_COLORS[m.size % TEAM_COLORS.length]!);
    });
    return m;
  })();
  const colorOf = (gid: string) => colorMap.get(gid) ?? '#71717a';
  const hrefOf = (code: string | null) => (code ? `/u/${encodeURIComponent(code)}` : null);
  // 길드 → 문양 URL(공수 표식).
  const emblemMap = new Map(view.guilds.map((g) => [g.guildId, g.emblemUrl]));
  const emblemOf = (gid: string) => emblemMap.get(gid) ?? null;

  const maxHp = roster.map((r) => Math.max(1, r.effCp * CONQUEST_HP_MULT));

  // 행 데이터(시간순) — 공격자 HP 추적·생존자 수 산출.
  type Row = {
    key: number;
    round: number;
    atk: string;
    tgt: string;
    dmg: number;
    hp: number;
    atkColor: string;
    tgtColor: string;
    atkEmblem: string | null;
    tgtEmblem: string | null;
    atkGuild: string;
    tgtGuild: string;
    atkMine: boolean;
    tgtMine: boolean;
    killed: boolean;
    fight: Fight;
  };
  const hpByIdx = new Map<number, number>();
  let alive = roster.length;
  const logData: Row[] = events.map((e, i) => {
    const [ai, ti, dmg, hpAfter] = e;
    const a = roster[ai]!;
    const t = roster[ti]!;
    const round = i + 1;
    const survivors = alive;
    const atkHp = hpByIdx.get(ai) ?? maxHp[ai]!;
    hpByIdx.set(ti, hpAfter);
    if (hpAfter <= 0) alive -= 1;
    return {
      key: round,
      round,
      atk: a.nickname,
      tgt: t.nickname,
      dmg,
      hp: hpAfter,
      atkColor: colorOf(a.guildId),
      tgtColor: colorOf(t.guildId),
      atkEmblem: emblemOf(a.guildId),
      tgtEmblem: emblemOf(t.guildId),
      atkGuild: a.guildName,
      tgtGuild: t.guildName,
      atkMine: myGuildId != null && a.guildId === myGuildId,
      tgtMine: myGuildId != null && t.guildId === myGuildId,
      killed: hpAfter <= 0,
      fight: {
        round,
        atkName: a.nickname,
        atkAvatar: a.avatar || DEFAULT_AVATAR,
        atkHref: hrefOf(a.publicCode),
        atkColor: colorOf(a.guildId),
        atkEmblem: emblemOf(a.guildId),
        atkGuild: a.guildName,
        atkHp,
        atkMaxHp: maxHp[ai]!,
        tgtName: t.nickname,
        tgtAvatar: t.avatar || DEFAULT_AVATAR,
        tgtHref: hrefOf(t.publicCode),
        tgtColor: colorOf(t.guildId),
        tgtEmblem: emblemOf(t.guildId),
        tgtGuild: t.guildName,
        dmg,
        hpAfter,
        tgtMaxHp: maxHp[ti]!,
        survivors,
      },
    };
  });

  // 우리 길드 = 우리 길드원이 공격자 또는 방어자인 라운드만 필터.
  const guildRows =
    myGuildId != null ? logData.filter((r) => r.atkMine || r.tgtMine) : [];
  const rows = tab === 'all' ? logData : guildRows;
  const displayRows = [...rows].reverse();

  const play = (f: Fight) => {
    setFight(f);
    setFightKey((k) => k + 1);
  };
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
  const selectTab = (t: 'all' | 'guild') => {
    setTab(t);
    stopPlay();
    setFight(null);
  };

  return (
    <div className="flex h-full flex-col">
      {/* 무대 — 고정(지역 배경) */}
      <div className="relative h-60 shrink-0 overflow-hidden border-b border-zinc-800">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl(`/sprites/guild/region/${view.zoneRegion}.png`)}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
        {fight ? (
          <FightStage
            key={fightKey}
            fight={fight}
            playing={autoplay ? { idx: autoplay.idx, total: autoplay.list.length } : null}
            onBack={() => {
              stopPlay();
              setFight(null);
            }}
          />
        ) : (
          <IntroView view={view} colorOf={colorOf} emblemOf={emblemOf} />
        )}
      </div>

      {/* 필터·컨트롤 — 고정 */}
      <div className="shrink-0 border-b border-zinc-800 bg-zinc-950">
        <div className="flex gap-1 px-3 pt-2.5">
          {(
            [
              ['all', '전체 전투'],
              ['guild', '우리 길드'],
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
            {tab === 'all' ? `${events.length.toLocaleString()}전` : `우리 길드 ${guildRows.length.toLocaleString()}전`}
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

      {/* 로그 — 내부 스크롤 */}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-zinc-950">
        {displayRows.length === 0 ? (
          <div className="px-4 py-10 text-center text-[12px] text-zinc-500">
            {tab === 'guild' && myGuildId == null
              ? '길드에 가입하면 우리 길드 전투가 표시됩니다.'
              : '전투 기록이 없습니다.'}
          </div>
        ) : (
          <ul>
            {displayRows.map((r) => (
              <RoundCard
                key={r.key}
                round={r.round}
                atk={r.atk}
                tgt={r.tgt}
                dmg={r.dmg}
                hp={r.hp}
                atkColor={r.atkColor}
                tgtColor={r.tgtColor}
                atkEmblem={r.atkEmblem}
                tgtEmblem={r.tgtEmblem}
                atkGuild={r.atkGuild}
                tgtGuild={r.tgtGuild}
                atkMine={r.atkMine}
                tgtMine={r.tgtMine}
                killed={r.killed}
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
