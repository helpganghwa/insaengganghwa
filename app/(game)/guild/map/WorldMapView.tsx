'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';

import {
  setResidenceAction,
  deployAction,
  cancelDeployAction,
  setLordAction,
  clearLordAction,
} from '../actions';
import { guildErrMsg } from '../errors-msg';

type Region = 'volcano' | 'temple' | 'swamp' | 'orc' | 'kingdom' | 'angel';
type DeployRole = 'attack' | 'defend';
type Member = { userId: string; nickname: string };

type Zone = {
  id: number;
  region: Region;
  name: string;
  mapX: number;
  mapY: number;
  ownerGuildId: string | null;
  ownerGuildName: string | null;
  lordUserId: string | null;
  lordNickname: string | null;
  taxDiamond: string;
};

const REGION: Record<Region, { label: string; color: string }> = {
  volcano: { label: '드래곤 화산', color: '#ef4444' },
  temple: { label: '잊힌 신전', color: '#60a5fa' },
  swamp: { label: '슬라임 늪', color: '#22c55e' },
  orc: { label: '오크 부락', color: '#f97316' },
  kingdom: { label: '인간 왕국', color: '#fbbf24' },
  angel: { label: '타락 천사 부유섬', color: '#c084fc' },
};

export function WorldMapView({
  mapSrc,
  myGuildId,
  isOfficer,
  residenceZoneId,
  canSetResidence,
  battleDayLabel,
  myDeployment,
  guildDeploys,
  members,
  zones,
}: {
  mapSrc: string;
  myGuildId: string | null;
  isOfficer: boolean;
  residenceZoneId: number | null;
  canSetResidence: boolean;
  battleDayLabel: string;
  myDeployment: { zoneId: number; role: DeployRole } | null;
  guildDeploys: Array<{ zoneId: number; role: DeployRole }>;
  members: Member[];
  zones: Zone[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [residence, setResidence] = useState<number | null>(residenceZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(residenceZoneId);
  const [pending, start] = useTransition();
  const selected = zones.find((z) => z.id === selectedId) ?? null;

  // 자기 길드 배치 집계(안개 — 자기 길드만): zoneId → {attack, defend}.
  const guildDeployByZone = new Map<number, { attack: number; defend: number }>();
  for (const d of guildDeploys) {
    const e = guildDeployByZone.get(d.zoneId) ?? { attack: 0, defend: 0 };
    e[d.role] += 1;
    guildDeployByZone.set(d.zoneId, e);
  }

  const moveResidence = (zoneId: number) => {
    start(async () => {
      const r = await setResidenceAction(zoneId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      setResidence(zoneId); // 낙관적 — router.refresh로 서버 상태 재동기화
      showHeaderToast({ title: '거주지 이동 완료' });
      router.refresh();
    });
  };

  const deploy = (zoneId: number, role: DeployRole) => {
    start(async () => {
      const r = await deployAction(zoneId, role);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: role === 'attack' ? '공격 배치 완료' : '수비 배치 완료' });
      router.refresh();
    });
  };

  const cancelDeploy = () => {
    start(async () => {
      const r = await cancelDeployAction();
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '배치 취소' });
      router.refresh();
    });
  };

  const assignLord = (zoneId: number, targetUserId: string) => {
    if (!targetUserId) return;
    start(async () => {
      const r = await setLordAction(zoneId, targetUserId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '영주 지정 완료' });
      router.refresh();
    });
  };

  const removeLord = (zoneId: number) => {
    start(async () => {
      const r = await clearLordAction(zoneId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      showHeaderToast({ title: '영주 해제' });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-4">
      <div className="mb-3">
        <h1 className="text-base font-bold">월드맵</h1>
        <p className="text-[11px] text-zinc-500">
          구역을 눌러 소유 길드·영주·세금을 확인하고 거주지를 정하세요.
        </p>
      </div>

      {/* 지도 + 핀 오버레이 */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={mapSrc}
          alt="월드맵"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        {zones.map((z) => {
          const owned = z.ownerGuildId != null;
          const mine = owned && z.ownerGuildId === myGuildId;
          const isResidence = z.id === residence;
          const isSel = z.id === selectedId;
          const color = REGION[z.region].color;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedId(z.id)}
              aria-label={z.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${z.mapX}%`, top: `${z.mapY}%` }}
            >
              <span
                className="block rounded-full ring-1 ring-black/60 transition"
                style={{
                  width: isSel ? 16 : 11,
                  height: isSel ? 16 : 11,
                  backgroundColor: owned ? color : 'rgba(255,255,255,0.25)',
                  boxShadow: owned ? `0 0 6px ${color}` : 'none',
                  outline: isResidence ? '2px solid #fbbf24' : mine ? '2px solid #fff' : 'none',
                  outlineOffset: 2,
                }}
              />
            </button>
          );
        })}
      </div>

      {/* 범례 */}
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
        {(Object.keys(REGION) as Region[]).map((r) => (
          <span key={r} className="flex items-center gap-1 text-[10px] text-zinc-500">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: REGION[r].color }} />
            {REGION[r].label}
          </span>
        ))}
      </div>

      {/* 선택 구역 상세 */}
      {selected && (
        <div className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="truncate text-sm font-bold">{selected.name}</h2>
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
              style={{ backgroundColor: REGION[selected.region].color }}
            >
              {REGION[selected.region].label}
            </span>
          </div>
          <dl className="mt-2 space-y-1 text-[12px]">
            <div className="flex justify-between">
              <dt className="text-zinc-500">소유 길드</dt>
              <dd className="font-semibold">
                {selected.ownerGuildName ?? <span className="text-zinc-400">중립</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">영주</dt>
              <dd className="font-semibold">
                {selected.lordNickname ?? <span className="text-zinc-400">—</span>}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-zinc-500">누적 세금</dt>
              <dd className="font-mono tabular-nums">{selected.taxDiamond}💎</dd>
            </div>
          </dl>
          {selected.id === residence ? (
            <p className="mt-2 rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] text-amber-700 dark:text-amber-300">
              내 거주 구역 — 강화 성공 시 이곳에 세금 포인트가 쌓입니다.
            </p>
          ) : canSetResidence ? (
            <button
              type="button"
              onClick={() => moveResidence(selected.id)}
              disabled={pending}
              className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              이곳을 거주지로 설정
            </button>
          ) : null}

          {/* 점령전 배치(길드원만) */}
          {myGuildId &&
            (() => {
              const ownedByMe = selected.ownerGuildId === myGuildId;
              const here = myDeployment?.zoneId === selected.id ? myDeployment.role : null;
              const elsewhere = myDeployment && myDeployment.zoneId !== selected.id;
              const fog = guildDeployByZone.get(selected.id);
              return (
                <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold">점령전 · {battleDayLabel}</h3>
                    {fog && (
                      <span className="text-[10px] text-zinc-500">
                        우리 길드 공격 {fog.attack} · 수비 {fog.defend}
                      </span>
                    )}
                  </div>

                  {here ? (
                    <div className="mt-2 flex items-center gap-2">
                      <span className="flex-1 rounded-lg bg-emerald-500/10 px-2 py-2 text-center text-[12px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {here === 'attack' ? '공격 배치됨' : '수비 배치됨'}
                      </span>
                      <button
                        type="button"
                        onClick={cancelDeploy}
                        disabled={pending}
                        className="rounded-lg border border-zinc-300 px-3 py-2 text-[12px] font-semibold text-zinc-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400"
                      >
                        취소
                      </button>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => deploy(selected.id, ownedByMe ? 'defend' : 'attack')}
                        disabled={pending}
                        className={`mt-2 w-full rounded-lg py-2.5 text-sm font-bold text-white disabled:opacity-50 ${
                          ownedByMe ? 'bg-sky-600' : 'bg-red-600'
                        }`}
                      >
                        {ownedByMe ? '이 구역 수비' : '이 구역 공격'}
                      </button>
                      {elsewhere && (
                        <p className="mt-1.5 text-[10px] text-zinc-500">
                          현재 다른 구역에 배치 중 — 배치하면 이동합니다.
                        </p>
                      )}
                    </>
                  )}

                  {/* 영주 지정(길드장/부길드장 · 자기 길드 소유 구역) */}
                  {ownedByMe && isOfficer && (
                    <div className="mt-3 rounded-lg bg-zinc-100 p-2.5 dark:bg-zinc-900">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold">영주 관리</span>
                        {selected.lordUserId && (
                          <button
                            type="button"
                            onClick={() => removeLord(selected.id)}
                            disabled={pending}
                            className="text-[10px] font-semibold text-red-500 disabled:opacity-50"
                          >
                            해제
                          </button>
                        )}
                      </div>
                      <select
                        value={selected.lordUserId ?? ''}
                        onChange={(e) => assignLord(selected.id, e.target.value)}
                        disabled={pending}
                        className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-[12px] dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        <option value="">영주 공석 (지정 안 함)</option>
                        {members.map((m) => (
                          <option key={m.userId} value={m.userId}>
                            {m.nickname}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[10px] text-zinc-500">
                        영주는 ×3 자동 방어 + 세금 수금권. 공석이면 세금이 동결됩니다.
                      </p>
                    </div>
                  )}
                </div>
              );
            })()}
        </div>
      )}
    </div>
  );
}
