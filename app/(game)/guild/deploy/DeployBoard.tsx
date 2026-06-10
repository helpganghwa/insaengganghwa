'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

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
  execZoneName: string | null;
};
type Zone = { id: number; name: string; region: Region; ownerGuildId: string | null };

const REGION_LABEL: Record<Region, string> = {
  volcano: '드래곤 화산',
  temple: '잊힌 신전',
  swamp: '슬라임 늪',
  orc: '오크 부락',
  kingdom: '인간 왕국',
  angel: '타락 천사 부유섬',
};
const REGIONS: Region[] = ['volcano', 'temple', 'swamp', 'orc', 'kingdom', 'angel'];
const ROLE_BADGE: Record<Member['role'], { label: string; cls: string } | null> = {
  leader: { label: '길드장', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
  vice: { label: '부길드장', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  member: null,
};

export function DeployBoard({
  isOfficer,
  myGuildId,
  battleDayLabel,
  members: initialMembers,
  zones,
}: {
  isOfficer: boolean;
  myGuildId: string;
  battleDayLabel: string;
  members: Member[];
  zones: Zone[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [members, setMembers] = useState(initialMembers);
  const [editing, setEditing] = useState<Member | null>(null);
  const [pending, start] = useTransition();

  const attackCount = members.filter((m) => m.depRole === 'attack').length;
  const defendCount = members.filter((m) => m.depRole === 'defend' || m.execZoneName).length;

  const patch = (userId: string, p: Partial<Member>) =>
    setMembers((prev) => prev.map((m) => (m.userId === userId ? { ...m, ...p } : m)));

  const assign = (userId: string, zoneId: number, role: DeployRole) => {
    const prev = members.find((m) => m.userId === userId)!;
    const zone = zones.find((z) => z.id === zoneId);
    patch(userId, { depZoneId: zoneId, depZoneName: zone?.name ?? null, depRole: role }); // 낙관
    setEditing(null);
    start(async () => {
      const r = await deployMemberAction(userId, zoneId, role);
      if (r.status !== 'success') {
        patch(userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: role === 'attack' ? '공격 배치' : '수비 배치' });
      router.refresh();
    });
  };

  const clearDep = (userId: string) => {
    const prev = members.find((m) => m.userId === userId)!;
    patch(userId, { depZoneId: null, depZoneName: null, depRole: null }); // 낙관
    start(async () => {
      const r = await clearMemberDeploymentAction(userId);
      if (r.status !== 'success') {
        patch(userId, { depZoneId: prev.depZoneId, depZoneName: prev.depZoneName, depRole: prev.depRole });
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '배치 해제' });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <h1 className="text-base font-bold">점령지 관리 · {battleDayLabel}</h1>
        <p className="mt-0.5 text-[11px] text-zinc-500">
          {isOfficer
            ? '길드장·부길드장이 길드원의 공격/수비를 지정합니다.'
            : '배치는 길드장·부길드장이 지정합니다(조회 전용).'}
          {' · '}공격 {attackCount} · 수비 {defendCount}
        </p>
      </div>

      <ul className="space-y-1.5">
        {members.map((m) => {
          const badge = ROLE_BADGE[m.role];
          const isExec = m.execZoneName != null;
          return (
            <li
              key={m.userId}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-800"
            >
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                <span className="truncate text-[13px] font-semibold">{m.nickname}</span>
                {badge && (
                  <span className={`shrink-0 rounded-full px-1.5 py-0 text-[9px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                )}
              </div>

              {/* 현재 배치 */}
              {isExec ? (
                <span className="shrink-0 text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                  집행관 · {m.execZoneName} 자동수비
                </span>
              ) : m.depRole ? (
                <span
                  className={`shrink-0 truncate text-[11px] font-semibold ${
                    m.depRole === 'attack'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-sky-600 dark:text-sky-400'
                  }`}
                >
                  {m.depRole === 'attack' ? '공격' : '수비'} · {m.depZoneName}
                </span>
              ) : (
                <span className="shrink-0 text-[11px] text-zinc-400">미배치</span>
              )}

              {/* 임원 편집 */}
              {isOfficer && !isExec && (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(m)}
                    disabled={pending}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-[10px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    {m.depRole ? '변경' : '배치'}
                  </button>
                  {m.depRole && (
                    <button
                      type="button"
                      onClick={() => clearDep(m.userId)}
                      disabled={pending}
                      className="text-[10px] font-semibold text-red-500 disabled:opacity-50"
                    >
                      해제
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {editing && (
        <AssignModal
          member={editing}
          zones={zones}
          myGuildId={myGuildId}
          pending={pending}
          onClose={() => setEditing(null)}
          onAssign={(zoneId, role) => assign(editing.userId, zoneId, role)}
        />
      )}
    </div>
  );
}

function AssignModal({
  member,
  zones,
  myGuildId,
  pending,
  onClose,
  onAssign,
}: {
  member: Member;
  zones: Zone[];
  myGuildId: string;
  pending: boolean;
  onClose: () => void;
  onAssign: (zoneId: number, role: DeployRole) => void;
}) {
  const [role, setRole] = useState<DeployRole>(member.depRole ?? 'attack');
  const owned = zones.filter((z) => z.ownerGuildId === myGuildId);
  const enemy = zones.filter((z) => z.ownerGuildId !== myGuildId);
  const pool = role === 'defend' ? owned : enemy;
  const [zoneId, setZoneId] = useState<number | ''>(
    member.depZoneId && pool.some((z) => z.id === member.depZoneId) ? member.depZoneId : '',
  );

  const switchRole = (r: DeployRole) => {
    setRole(r);
    setZoneId(''); // 역할 바뀌면 구역 선택 초기화
  };

  const byRegion = (list: Zone[]) =>
    REGIONS.map((rg) => ({ rg, zs: list.filter((z) => z.region === rg) })).filter((g) => g.zs.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[340px] rounded-2xl bg-white p-4 dark:bg-zinc-950"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold">{member.nickname} 배치</h2>

        <div className="mt-3 flex gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-900">
          {(
            [
              ['attack', '공격'],
              ['defend', '수비'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => switchRole(k)}
              className={`flex-1 rounded-md py-1.5 text-[12px] font-bold transition ${
                role === k
                  ? k === 'attack'
                    ? 'bg-red-600 text-white'
                    : 'bg-sky-600 text-white'
                  : 'text-zinc-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {pool.length === 0 ? (
          <p className="mt-3 rounded-lg bg-zinc-100 px-3 py-3 text-center text-[12px] text-zinc-500 dark:bg-zinc-900">
            {role === 'defend' ? '수비할 소유 구역이 없습니다.' : '공격할 구역이 없습니다.'}
          </p>
        ) : (
          <select
            value={zoneId}
            onChange={(e) => setZoneId(e.target.value ? Number(e.target.value) : '')}
            className="mt-3 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-[13px] dark:border-zinc-700 dark:bg-zinc-950"
          >
            <option value="">구역 선택</option>
            {byRegion(pool).map((g) => (
              <optgroup key={g.rg} label={REGION_LABEL[g.rg]}>
                {g.zs.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-400"
          >
            취소
          </button>
          <button
            type="button"
            onClick={() => zoneId !== '' && onAssign(zoneId, role)}
            disabled={pending || zoneId === ''}
            className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
          >
            배치
          </button>
        </div>
      </div>
    </div>
  );
}
