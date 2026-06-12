'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import {
  CONQUEST_DEFENDER_BONUS,
  CONQUEST_EXECUTOR_POWER_MULT,
  CONQUEST_BATTLE_KST_HOUR,
} from '@/lib/game/guild/balance';

import {
  deployMemberAction,
  clearMemberDeploymentAction,
  setExecutorAction,
  clearExecutorAction,
} from '../actions';
import { guildErrMsg } from '../errors-msg';

type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';
type DeployRole = 'attack' | 'defend';
type Member = {
  userId: string;
  nickname: string;
  role: 'leader' | 'vice' | 'member';
  combat: number;
  depZoneId: number | null;
  depZoneName: string | null;
  depRole: DeployRole | null;
  execZoneId: number | null;
  execZoneName: string | null;
};
type Zone = {
  id: number;
  name: string;
  region: Region;
  mapX: number;
  mapY: number;
  /** 미개방(단계 개방 — 안개). */
  locked: boolean;
  ownerGuildId: string | null;
  ownerEmblemUrl: string | null;
};

const DEFEND_MULT = 1 + CONQUEST_DEFENDER_BONUS; // 수비 ×1.2
const fmt = (n: number) =>
  new Intl.NumberFormat('ko-KR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function DeployBoard({
  isOfficer,
  myGuildId,
  mapSrc,
  attackableZoneIds,
  adjacency,
  members: initialMembers,
  zones,
}: {
  isOfficer: boolean;
  myGuildId: string;
  mapSrc: string;
  attackableZoneIds: number[];
  adjacency: { a: number; b: number }[];
  members: Member[];
  zones: Zone[];
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const [members, setMembers] = useState(initialMembers);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [pending, start] = useTransition();

  // 포그 오브 워 — 잠긴 존이 있을 때만 장막 렌더(SVG 마스크가 개방 존을 뚫음).
  const hasFog = zones.some((z) => z.locked);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const attackable = useMemo(() => new Set(attackableZoneIds), [attackableZoneIds]);
  const ownedIds = useMemo(
    () => new Set(zones.filter((z) => z.ownerGuildId === myGuildId).map((z) => z.id)),
    [zones, myGuildId],
  );
  const lockedIds = useMemo(() => new Set(zones.filter((z) => z.locked).map((z) => z.id)), [zones]);
  const usable = (id: number) => !lockedIds.has(id) && (ownedIds.has(id) || attackable.has(id));

  const selected = selectedId != null ? (zoneById.get(selectedId) ?? null) : null;
  const selectedRole: DeployRole | null = selected
    ? selected.ownerGuildId === myGuildId
      ? 'defend'
      : 'attack'
    : null;
  const isDefend = selectedRole === 'defend';

  const attackCount = members.filter((m) => m.depRole === 'attack').length;
  const defendCount = members.filter((m) => m.depRole === 'defend' || m.execZoneId != null).length;
  const idleCount = members.filter((m) => m.depZoneId == null && m.execZoneId == null).length;

  const deployedHere = useMemo(
    () => (selectedId != null ? members.filter((m) => m.depZoneId === selectedId) : []),
    [members, selectedId],
  );
  const execHere = useMemo(
    () => (selectedId != null ? members.filter((m) => m.execZoneId === selectedId) : []),
    [members, selectedId],
  );

  // 선택 구역 총 전투력 — 수비: 일반 ×1.2 + 집행관 ×3 / 공격: ×1.0.
  const totalPower = useMemo(() => {
    if (!selected) return 0;
    if (isDefend) {
      const def = deployedHere.reduce((s, m) => s + m.combat * DEFEND_MULT, 0);
      const exe = execHere.reduce((s, m) => s + m.combat * CONQUEST_EXECUTOR_POWER_MULT, 0);
      return Math.round(def + exe);
    }
    return Math.round(deployedHere.reduce((s, m) => s + m.combat, 0));
  }, [selected, isDefend, deployedHere, execHere]);

  const patch = (userId: string, p: Partial<Member>) =>
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...p } : m)));

  const assign = (m: Member) => {
    if (!selected || !selectedRole) return;
    const prev = m;
    patch(m.userId, { depZoneId: selected.id, depZoneName: selected.name, depRole: selectedRole });
    start(async () => {
      const r = await deployMemberAction(m.userId, selected.id, selectedRole);
      if (r.status !== 'success') {
        patch(m.userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: selectedRole === 'attack' ? '공격 배치' : '수비 배치' });
    });
  };

  const remove = (m: Member) => {
    const prev = m;
    patch(m.userId, { depZoneId: null, depZoneName: null, depRole: null });
    start(async () => {
      const r = await clearMemberDeploymentAction(m.userId);
      if (r.status !== 'success') {
        patch(m.userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '배치 해제' });
    });
  };

  const setExec = (m: Member) => {
    if (selectedId == null || !selected) return;
    const snapshot = members;
    setMembers((prev) =>
      prev.map((x) => {
        if (x.execZoneId === selectedId) return { ...x, execZoneId: null, execZoneName: null }; // 기존 집행관 해제
        if (x.userId === m.userId)
          return { ...x, execZoneId: selectedId, execZoneName: selected.name, depZoneId: null, depZoneName: null, depRole: null };
        return x;
      }),
    );
    start(async () => {
      const r = await setExecutorAction(selectedId, m.userId);
      if (r.status !== 'success') {
        setMembers(snapshot);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 지정' });
    });
  };

  const clearExec = () => {
    if (selectedId == null) return;
    const snapshot = members;
    setMembers((prev) => prev.map((x) => (x.execZoneId === selectedId ? { ...x, execZoneId: null, execZoneName: null } : x)));
    start(async () => {
      const r = await clearExecutorAction(selectedId);
      if (r.status !== 'success') {
        setMembers(snapshot);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 해제' });
    });
  };

  // 구역별 우리 배치 요약(노드 라벨) — 인원 + 전투력(역할 배수 반영). 우리 배치만(안개).
  const zoneDeploy = useMemo(() => {
    const m = new Map<number, { count: number; power: number }>();
    const add = (zid: number, power: number) => {
      const e = m.get(zid) ?? { count: 0, power: 0 };
      e.count += 1;
      e.power += power;
      m.set(zid, e);
    };
    for (const mem of members) {
      if (mem.execZoneId != null) add(mem.execZoneId, mem.combat * CONQUEST_EXECUTOR_POWER_MULT);
      else if (mem.depZoneId != null) add(mem.depZoneId, mem.combat * (mem.depRole === 'defend' ? DEFEND_MULT : 1));
    }
    for (const e of m.values()) e.power = Math.round(e.power);
    return m;
  }, [members]);

  // 노드 라벨 — 3초마다 인원↔전투력 토글.
  const [showPower, setShowPower] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setShowPower((v) => !v), 3000);
    return () => clearInterval(t);
  }, []);

  // 전투 윈도 잠금(KST 23:00~24:00) — 라이브 시계로 판정. Date.now()는 UTC epoch라 단말 표준시 무관.
  // UX 차단일 뿐 권위는 서버(BATTLE_IN_PROGRESS). 하이드레이션 불일치 회피 위해 false로 시작 후 마운트 시 갱신.
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    const check = () =>
      setLocked(Math.floor((Date.now() + 9 * 3_600_000) / 3_600_000) % 24 === CONQUEST_BATTLE_KST_HOUR);
    check();
    const t = setInterval(check, 15_000);
    return () => clearInterval(t);
  }, []);

  const edges = useMemo(() => {
    return adjacency
      .map(({ a, b }) => {
        const za = zoneById.get(a);
        const zb = zoneById.get(b);
        if (!za || !zb || za.locked || zb.locked) return null; // 안개 속 길 미노출
        return { a, b, x1: za.mapX, y1: za.mapY, x2: zb.mapX, y2: zb.mapY, active: usable(a) && usable(b) };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacency, zoneById, ownedIds, attackable]);

  return (
    <div className="flex min-h-full flex-col">
      {/* 지도 — 상단 전체. 우리 점령지·공격 가능만 또렷, 그 외 흐릿(보이되 비활성) */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden border-b border-zinc-800 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapSrc}
          alt="월드맵"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/30" />
        {/* 점령전 시각 안내 — 지도 우하단(지도 안 가림). 평시: 전투 시각·등록 불가 / 전투 윈도: 진행 중 */}
        <div className="pointer-events-none absolute bottom-2 right-2 z-20 max-w-[58%] text-right">
          {locked ? (
            <div className="inline-flex items-center gap-1.5 rounded-lg border border-red-400/60 bg-red-950/85 px-2 py-1 text-[9px] font-bold text-red-100 shadow-lg backdrop-blur-sm">
              <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-red-400" />
              점령전 진행 중 · 배치 변경 잠금
            </div>
          ) : (
            <div className="inline-block rounded-lg bg-black/60 px-2 py-1 text-[9px] font-semibold leading-[1.5] text-white/90 shadow-lg backdrop-blur-sm">
              매일 {CONQUEST_BATTLE_KST_HOUR}:00~24:00 점령전 전투
              <br />
              <span className="text-white/70">전투 시간 동안 공격·수비 등록 불가</span>
            </div>
          )}
        </div>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((e) => (
            <line
              key={`h${e.a}-${e.b}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#000000"
              strokeOpacity={e.active ? 0.32 : 0.14}
              strokeWidth={e.active ? 0.85 : 0.6}
              strokeLinecap="round"
            />
          ))}
          {edges.map((e) => (
            <line
              key={`m${e.a}-${e.b}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke={e.active ? '#fcd34d' : '#9ca3af'}
              strokeOpacity={e.active ? 0.55 : 0.22}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {/* 미개방 안개(포그 오브 워) — RTS 문법: 미탐사 = 무채색. 같은 지도를 마스크 안에서
            한 번 더 그려 잠긴 영역만 흑백·어둡게(개방 경계가 '색이 빠지는' 전환 — 발광 헤일로 없음),
            그 위에 feTurbulence 안개 김 한 겹. CSS 다중 mask의 add 합성 함정 회피(SVG mask). */}
        {hasFog && (
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            className="pointer-events-none absolute inset-0 h-full w-full"
            style={{ zIndex: 25 }}
            aria-hidden
          >
            <defs>
              <filter id="dbfog-wobble" x="-20%" y="-20%" width="140%" height="140%">
                <feTurbulence type="fractalNoise" baseFrequency="0.18" numOctaves="2" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="7" />
              </filter>
              {/* 흑백 + 한랭 톤다운 — B 채널만 덜 깎아 차가운 '미탐사' 색. sRGB 고정(linearRGB 밝아짐 방지) */}
              <filter id="dbfog-desat" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
                <feColorMatrix type="saturate" values="0.08" />
                <feComponentTransfer>
                  <feFuncR type="linear" slope="0.38" intercept="0.015" />
                  <feFuncG type="linear" slope="0.4" intercept="0.02" />
                  <feFuncB type="linear" slope="0.48" intercept="0.045" />
                </feComponentTransfer>
              </filter>
              {/* 안개 김 — 노이즈 R 채널을 옅은 청회색 구름 알파로 변환 */}
              <filter id="dbfog-tex" x="0%" y="0%" width="100%" height="100%" colorInterpolationFilters="sRGB">
                <feTurbulence type="fractalNoise" baseFrequency="0.045" numOctaves="3" seed="11" />
                <feColorMatrix type="matrix" values="0 0 0 0 0.62  0 0 0 0 0.66  0 0 0 0 0.74  0.9 0 0 0 -0.3" />
              </filter>
              <radialGradient id="dbfog-hole">
                <stop offset="60%" stopColor="black" />
                <stop offset="100%" stopColor="white" />
              </radialGradient>
              <mask id="dbfog-mask" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="100">
                <rect width="100" height="100" fill="white" />
                <g filter="url(#dbfog-wobble)">
                  {zones
                    .filter((z) => !z.locked)
                    .map((z) => (
                      <circle key={z.id} cx={z.mapX} cy={z.mapY} r={12} fill="url(#dbfog-hole)" />
                    ))}
                </g>
              </mask>
            </defs>
            {/* 1) 잠긴 지형 — 흑백 고스트(윤곽은 남겨 기대감 유지) 2) 한랭 남색 틴트 3) 안개 김 */}
            <image
              href={mapSrc}
              width="100"
              height="100"
              preserveAspectRatio="xMidYMid slice"
              filter="url(#dbfog-desat)"
              mask="url(#dbfog-mask)"
              style={{ imageRendering: 'pixelated' }}
            />
            <rect width="100" height="100" fill="rgb(24, 30, 48)" opacity={0.3} mask="url(#dbfog-mask)" />
            <rect width="100" height="100" filter="url(#dbfog-tex)" mask="url(#dbfog-mask)" opacity={0.55} />
          </svg>
        )}
        {zones.map((z) => {
          if (z.locked) return null; // 미개방 — 노드 미노출
          const mine = z.ownerGuildId === myGuildId;
          const canAttack = !mine && attackable.has(z.id);
          const isUsable = mine || canAttack;
          const isSel = z.id === selectedId;
          const owned = z.ownerGuildId != null;
          const ring = mine ? '#10b981' : canAttack ? '#ef4444' : '#71717a';
          const dep = zoneDeploy.get(z.id);
          return (
            <button
              key={z.id}
              type="button"
              disabled={!isUsable}
              onClick={() => isUsable && setSelectedId(z.id)}
              aria-label={z.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${z.mapX}%`, top: `${z.mapY}%`, zIndex: isSel ? 30 : isUsable ? 10 : 1 }}
            >
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/60 transition"
                style={{
                  backgroundColor: owned ? 'transparent' : 'rgba(10,12,20,0.5)',
                  outline: `1.5px solid ${ring}`,
                  outlineOffset: 0,
                  opacity: isUsable ? 1 : 0.55,
                  boxShadow: isUsable ? `0 0 4px ${ring}99` : 'none',
                }}
              >
                {/* 점령 길드 문양(모든 점령 구역) */}
                {owned && z.ownerEmblemUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={z.ownerEmblemUrl}
                    alt=""
                    aria-hidden
                    className="h-full w-full object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : null}
              </span>
              {/* 배치 요약 라벨 — 우리 배치가 있으면 인원↔전투력 토글(노드 하단) */}
              {dep && (
                <span className="pointer-events-none absolute left-1/2 top-full mt-[2px] -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/75 px-1 text-[7px] font-bold leading-[1.4] text-white shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                  {showPower ? `전투력 ${fmt(dep.power)}` : `${dep.count}명`}
                </span>
              )}
              {/* 선택 마크 — 세계지도 '내 위치'처럼 떠 있는 핀 */}
              {isSel && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
                  <span className="block animate-marker-bob">
                    <span
                      className="relative block h-[11px] w-[11px] border-[1.5px] border-white animate-marker-pin-glow"
                      style={{
                        background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
                        borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)',
                      }}
                    >
                      <span className="absolute left-1/2 top-1/2 h-[3.5px] w-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                    </span>
                  </span>
                </span>
              )}
            </button>
          );
        })}
        {/* 범례(좌하단) */}
        <div className="pointer-events-none absolute bottom-2 left-2 z-20 flex flex-col gap-1 rounded-lg bg-black/55 px-2 py-1.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #10b981' }} /> 우리 점령지
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #ef4444' }} /> 공격 가능
          </span>
        </div>
      </div>

      {/* 하단 — 좌: 선택 구역 / 우: 길드원 전체 */}
      <div className="grid flex-1 grid-cols-2 divide-x divide-zinc-200 dark:divide-zinc-800">
        {/* 좌: 선택 구역 배치 */}
        <section className="min-w-0 p-3">
          {selected ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <h3 className="truncate text-[13px] font-bold">{selected.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${
                    isDefend ? 'bg-sky-500/15 text-sky-600 dark:text-sky-400' : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}
                >
                  {isDefend ? '수비' : '공격'}
                </span>
              </div>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                총 전투력 <span className="font-mono font-bold text-zinc-700 dark:text-zinc-200">{fmt(totalPower)}</span>
              </p>

              {execHere.length === 0 && deployedHere.length === 0 ? (
                <p className="mt-2 text-[11px] text-zinc-400">배치된 길드원이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {execHere.map((m) => (
                    <li key={m.userId} className="flex min-h-[38px] items-center justify-between gap-1">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex w-full items-center gap-1">
                          <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                          <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                            {fmt(Math.round(m.combat * CONQUEST_EXECUTOR_POWER_MULT))}
                          </span>
                        </span>
                        <span className="text-[9px] font-medium text-indigo-500">집행관</span>
                      </div>
                      {isOfficer && !locked && (
                        <button
                          type="button"
                          onClick={clearExec}
                          disabled={pending}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                        >
                          해제
                        </button>
                      )}
                    </li>
                  ))}
                  {deployedHere.map((m) => (
                    <li key={m.userId} className="flex min-h-[38px] items-center justify-between gap-1">
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="flex w-full items-center gap-1">
                          <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                          <span className="shrink-0 font-mono text-[9px] text-zinc-400">
                            {fmt(Math.round(m.combat * (isDefend ? DEFEND_MULT : 1)))}
                          </span>
                        </span>
                        <span className={`text-[9px] font-medium ${isDefend ? 'text-sky-500' : 'text-red-500'}`}>
                          {isDefend ? '수비' : '공격'}
                        </span>
                      </div>
                      {isOfficer && !locked && (
                        <div className="flex shrink-0 items-center gap-0.5">
                          {isDefend && (
                            <button
                              type="button"
                              onClick={() => setExec(m)}
                              disabled={pending}
                              className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-indigo-500 disabled:opacity-50"
                            >
                              집행관
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => remove(m)}
                            disabled={pending}
                            className="rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                          >
                            해제
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-zinc-400">
              지도에서 우리 점령지(수비) 또는 공격 가능 구역을 선택하세요.
            </p>
          )}
        </section>

        {/* 우: 길드원 전체 */}
        <section className="min-w-0 p-3">
          <div className="flex items-baseline gap-1.5">
            <h3 className="text-[13px] font-bold">길드원 ({members.length})</h3>
          </div>
          <p className="mt-0.5 text-[10px] text-zinc-500">
            <span className="font-semibold text-red-500">공 {attackCount}</span> ·{' '}
            <span className="font-semibold text-sky-500">수 {defendCount}</span> ·{' '}
            <span className="text-zinc-400">대기 {idleCount}</span>
          </p>
          <ul className="mt-2 space-y-1">
            {members.map((m) => {
              const isExec = m.execZoneId != null;
              const here = selectedId != null && m.depZoneId === selectedId;
              const deployedZoneId = m.depZoneId ?? m.execZoneId; // 클릭 시 이동할 구역
              const status = isExec
                ? `집행관·${m.execZoneName}`
                : m.depRole
                  ? `${m.depRole === 'attack' ? '공격' : '수비'}·${m.depZoneName}`
                  : '미배치';
              const canAssign = isOfficer && !locked && selected != null && !isExec && !here;
              return (
                <li key={m.userId} className="flex min-h-[38px] items-center gap-1">
                  <button
                    type="button"
                    onClick={() => deployedZoneId != null && setSelectedId(deployedZoneId)}
                    disabled={deployedZoneId == null}
                    className="flex min-w-0 flex-1 flex-col items-start text-left disabled:cursor-default"
                  >
                    <span className="flex w-full items-center gap-1">
                      <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                      <span className="shrink-0 font-mono text-[9px] text-zinc-400">{fmt(m.combat)}</span>
                    </span>
                    <span
                      className={`truncate text-[9px] font-medium ${
                        isExec
                          ? 'text-indigo-500'
                          : m.depRole === 'attack'
                            ? 'text-red-500'
                            : m.depRole === 'defend'
                              ? 'text-sky-500'
                              : 'text-zinc-400'
                      }`}
                    >
                      {status}
                    </span>
                  </button>
                  {here ? (
                    <span className="shrink-0 text-[9px] font-bold text-emerald-500">배치됨</span>
                  ) : canAssign ? (
                    <button
                      type="button"
                      onClick={() => assign(m)}
                      disabled={pending}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-50 ${
                        isDefend ? 'bg-sky-600' : 'bg-red-600'
                      }`}
                    >
                      {isDefend ? '수비' : '공격'}
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
