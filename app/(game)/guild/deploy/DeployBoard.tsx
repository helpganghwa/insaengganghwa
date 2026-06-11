'use client';

import { useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';

import { deployMemberAction, clearMemberDeploymentAction } from '../actions';
import { guildErrMsg } from '../errors-msg';

type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';
type DeployRole = 'attack' | 'defend';
type Member = {
  userId: string;
  nickname: string;
  role: 'leader' | 'vice' | 'member';
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
  ownerGuildId: string | null;
  ownerEmblemUrl: string | null;
};

const ROLE_BADGE: Record<Member['role'], { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
};

export function DeployBoard({
  isOfficer,
  myGuildId,
  battleDayLabel,
  mapSrc,
  attackableZoneIds,
  adjacency,
  members: initialMembers,
  zones,
}: {
  isOfficer: boolean;
  myGuildId: string;
  battleDayLabel: string;
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

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const attackable = useMemo(() => new Set(attackableZoneIds), [attackableZoneIds]);
  const ownedIds = useMemo(
    () => new Set(zones.filter((z) => z.ownerGuildId === myGuildId).map((z) => z.id)),
    [zones, myGuildId],
  );
  // 사용 가능 구역 = 우리 소유(수비) 또는 공격 가능(인접). 그 외는 disabled.
  const usable = (id: number) => ownedIds.has(id) || attackable.has(id);

  const selected = selectedId != null ? (zoneById.get(selectedId) ?? null) : null;
  const selectedRole: DeployRole | null = selected
    ? selected.ownerGuildId === myGuildId
      ? 'defend'
      : 'attack'
    : null;

  const attackCount = members.filter((m) => m.depRole === 'attack').length;
  const defendCount = members.filter((m) => m.depRole === 'defend' || m.execZoneId != null).length;

  // 선택 구역에 배치된 우리 길드원 + 집행관(자동수비).
  const deployedHere = selectedId != null ? members.filter((m) => m.depZoneId === selectedId) : [];
  const execHere = selectedId != null ? members.filter((m) => m.execZoneId === selectedId) : [];

  const patch = (userId: string, p: Partial<Member>) =>
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...p } : m)));

  const assign = (m: Member) => {
    if (!selected || !selectedRole) return;
    const prev = m;
    patch(m.userId, {
      depZoneId: selected.id,
      depZoneName: selected.name,
      depRole: selectedRole,
    }); // 낙관 — 좌/우 패널 즉시 반영
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
    patch(m.userId, { depZoneId: null, depZoneName: null, depRole: null }); // 낙관
    start(async () => {
      const r = await clearMemberDeploymentAction(m.userId);
      if (r.status !== 'success') {
        patch(m.userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '배치 해제' });
    });
  };

  // 길(인접 간선) 선분 — 양 끝이 모두 usable이면 활성, 아니면 disabled.
  const edges = useMemo(() => {
    return adjacency
      .map(({ a, b }) => {
        const za = zoneById.get(a);
        const zb = zoneById.get(b);
        if (!za || !zb) return null;
        return { a, b, x1: za.mapX, y1: za.mapY, x2: zb.mapX, y2: zb.mapY, active: usable(a) && usable(b) };
      })
      .filter((e): e is NonNullable<typeof e> => e != null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adjacency, zoneById, ownedIds, attackable]);

  return (
    <div className="flex flex-col">
      {/* 헤더 */}
      <div className="px-4 pb-2 pt-3">
        <h1 className="text-base font-bold">점령지 관리 · {battleDayLabel}</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {isOfficer ? '구역을 선택해 길드원을 공격/수비에 배치합니다.' : '배치는 길드장·부길드장이 지정(조회 전용).'}
          {' · '}공격 {attackCount} · 수비 {defendCount}
        </p>
      </div>

      {/* 지도 — 우리 점령지·공격 가능 구역만 또렷, 그 외 disabled */}
      <div className="relative aspect-square w-full shrink-0 overflow-hidden border-y border-zinc-800 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapSrc}
          alt="월드맵"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <div className="pointer-events-none absolute inset-0 bg-black/35" />
        {/* 길 */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          {edges.map((e) => (
            <line
              key={`h${e.a}-${e.b}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="#000000"
              strokeOpacity={e.active ? 0.35 : 0.15}
              strokeWidth={e.active ? 0.9 : 0.6}
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
              strokeOpacity={e.active ? 0.6 : 0.12}
              strokeWidth={0.5}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {/* 노드 */}
        {zones.map((z) => {
          const owned = ownedIds.has(z.id);
          const canAttack = !owned && attackable.has(z.id);
          const isUsable = owned || canAttack;
          const isSel = z.id === selectedId;
          const ring = owned ? '#10b981' : canAttack ? '#ef4444' : '#52525b';
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
                className="relative block overflow-hidden rounded-[4px] transition"
                style={{
                  height: isSel ? 21 : 17,
                  width: isSel ? 21 : 17,
                  backgroundColor: owned ? 'transparent' : 'rgba(10,12,20,0.55)',
                  outline: `${isSel ? 2 : 1.5}px solid ${isSel ? '#fde047' : ring}`,
                  outlineOffset: 0,
                  opacity: isUsable ? 1 : 0.4,
                  filter: isUsable ? 'none' : 'grayscale(1)',
                  boxShadow: isSel ? `0 0 8px ${ring}` : owned ? `0 0 4px ${ring}88` : 'none',
                }}
              >
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
            </button>
          );
        })}
        {/* 범례 */}
        <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 rounded-lg bg-black/55 px-2 py-1.5 text-[9px] font-semibold text-white backdrop-blur-sm">
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #10b981' }} /> 우리 점령지
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="h-2 w-2 rounded-sm" style={{ outline: '1.5px solid #ef4444' }} /> 공격 가능
          </span>
        </div>
      </div>

      {/* 하단 — 좌: 선택 구역 배치 / 우: 길드원 전체 */}
      <div className="grid grid-cols-2 gap-2 p-3">
        {/* 좌: 선택 구역 */}
        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
          {selected ? (
            <>
              <div className="flex items-baseline gap-1.5">
                <h3 className="truncate text-[13px] font-bold">{selected.name}</h3>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${
                    selectedRole === 'attack'
                      ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                      : 'bg-sky-500/15 text-sky-600 dark:text-sky-400'
                  }`}
                >
                  {selectedRole === 'attack' ? '공격' : '수비'}
                </span>
              </div>
              {execHere.length === 0 && deployedHere.length === 0 ? (
                <p className="mt-2 text-[11px] text-zinc-400">배치된 길드원이 없습니다.</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {execHere.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-[12px] font-semibold">{m.nickname}</span>
                      <span className="shrink-0 text-[9px] font-bold text-indigo-500">집행관·자동수비</span>
                    </li>
                  ))}
                  {deployedHere.map((m) => (
                    <li key={m.userId} className="flex items-center justify-between gap-1">
                      <span className="min-w-0 truncate text-[12px] font-semibold">{m.nickname}</span>
                      {isOfficer ? (
                        <button
                          type="button"
                          onClick={() => remove(m)}
                          disabled={pending}
                          className="shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-red-500 disabled:opacity-50"
                        >
                          해제
                        </button>
                      ) : (
                        <span className="shrink-0 text-[9px] font-bold text-zinc-400">배치됨</span>
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
        <section className="min-w-0 rounded-xl border border-zinc-200 bg-white p-2.5 dark:border-zinc-800 dark:bg-zinc-950">
          <h3 className="text-[13px] font-bold">길드원 ({members.length})</h3>
          <ul className="mt-2 space-y-1">
            {members.map((m) => {
              const badge = ROLE_BADGE[m.role];
              const isExec = m.execZoneId != null;
              const here = m.depZoneId === selectedId && selectedId != null;
              const status = isExec
                ? `집행관·${m.execZoneName}`
                : m.depRole
                  ? `${m.depRole === 'attack' ? '공격' : '수비'}·${m.depZoneName}`
                  : '미배치';
              const canAssign = isOfficer && selected != null && !isExec && !here;
              return (
                <li key={m.userId} className="flex items-center gap-1">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[12px] font-semibold">{m.nickname}</span>
                      {badge && (
                        <span className={`shrink-0 rounded-full px-1 py-0 text-[8px] font-bold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      )}
                    </div>
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
                  </div>
                  {here ? (
                    <span className="shrink-0 text-[9px] font-bold text-emerald-500">배치됨</span>
                  ) : canAssign ? (
                    <button
                      type="button"
                      onClick={() => assign(m)}
                      disabled={pending}
                      className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold text-white disabled:opacity-50 ${
                        selectedRole === 'attack' ? 'bg-red-600' : 'bg-sky-600'
                      }`}
                    >
                      {selectedRole === 'attack' ? '공격' : '수비'}
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
