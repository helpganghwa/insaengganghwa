'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import { useResourceToast } from '@/components/ResourceToast';
import { assetUrl } from '@/lib/asset-versions';

import {
  setResidenceAction,
  setExecutorAction,
  clearExecutorAction,
  getZoneBattleAction,
} from '../actions';
import { guildErrMsg } from '../errors-msg';
import { ConquestReplay } from './ConquestReplay';

import { ZONE_LORE } from '@/lib/game/guild/zone-lore';

import type { ConquestFinale } from '@/lib/game/guild/conquest/simulate';

type Battle = {
  battleKstDay: string;
  winnerGuildId: string | null;
  winnerName: string | null;
  finale: ConquestFinale;
};

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
  ownerEmblemUrl: string | null;
  executorUserId: string | null;
  executorNickname: string | null;
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
  guildDeploys,
  members,
  zones,
}: {
  mapSrc: string;
  myGuildId: string | null;
  isOfficer: boolean;
  residenceZoneId: number | null;
  canSetResidence: boolean;
  guildDeploys: Array<{ zoneId: number; role: DeployRole }>;
  members: Member[];
  zones: Zone[];
}) {
  const router = useRouter();
  const { showHeaderToast, showError } = useResourceToast();
  const [residence, setResidence] = useState<number | null>(residenceZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replay, setReplay] = useState<Battle | null>(null);
  const [pending, start] = useTransition();
  // 낙관적 상태 — 구역 집행관 오버라이드(서버 응답 전 즉시 반영, 실패 시 롤백).
  const [execOverride, setExecOverride] = useState<
    Map<number, { executorUserId: string | null; executorNickname: string | null }>
  >(new Map());

  const base = zones.find((z) => z.id === selectedId) ?? null;
  const selected = base ? { ...base, ...(execOverride.get(base.id) ?? {}) } : null;

  const openBattle = (zoneId: number) => {
    start(async () => {
      const r = await getZoneBattleAction(zoneId);
      if (r.status !== 'success') return showError(guildErrMsg(r.code));
      if (!r.battle) return showError('전투 기록이 없습니다.');
      setReplay(r.battle);
    });
  };

  // 자기 길드 배치 집계(안개 — 자기 길드만 열람).
  const guildDeployByZone = useMemo(() => {
    const m = new Map<number, { attack: number; defend: number }>();
    for (const d of guildDeploys) {
      const e = m.get(d.zoneId) ?? { attack: 0, defend: 0 };
      e[d.role] += 1;
      m.set(d.zoneId, e);
    }
    return m;
  }, [guildDeploys]);

  const moveResidence = (zoneId: number) => {
    const prev = residence;
    setResidence(zoneId); // 낙관적
    start(async () => {
      const r = await setResidenceAction(zoneId);
      if (r.status !== 'success') {
        setResidence(prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '거주지 이동 완료' });
      router.refresh();
    });
  };


  const restoreExec = (
    zoneId: number,
    prev: { executorUserId: string | null; executorNickname: string | null } | undefined,
  ) =>
    setExecOverride((o) => {
      const n = new Map(o);
      if (prev) n.set(zoneId, prev);
      else n.delete(zoneId);
      return n;
    });

  const assignExecutor = (zoneId: number, targetUserId: string) => {
    if (!targetUserId) return;
    const prev = execOverride.get(zoneId);
    const nickname = members.find((m) => m.userId === targetUserId)?.nickname ?? null;
    setExecOverride((o) => new Map(o).set(zoneId, { executorUserId: targetUserId, executorNickname: nickname })); // 낙관적
    start(async () => {
      const r = await setExecutorAction(zoneId, targetUserId);
      if (r.status !== 'success') {
        restoreExec(zoneId, prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 지정 완료' });
      router.refresh();
    });
  };

  const removeExecutor = (zoneId: number) => {
    const prev = execOverride.get(zoneId);
    setExecOverride((o) => new Map(o).set(zoneId, { executorUserId: null, executorNickname: null })); // 낙관적
    start(async () => {
      const r = await clearExecutorAction(zoneId);
      if (r.status !== 'success') {
        restoreExec(zoneId, prev);
        return showError(guildErrMsg(r.code));
      }
      showHeaderToast({ title: '집행관 해제' });
      router.refresh();
    });
  };

  return (
    <div className="px-4 py-4">
      {/* 지도 + 네모 노드 오버레이 */}
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
          const color = REGION[z.region].color;
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => setSelectedId(z.id)}
              aria-label={z.name}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                left: `${z.mapX}%`,
                top: `${z.mapY}%`,
                zIndex: isResidence ? 20 : owned ? 10 : 1,
              }}
            >
              {/* 내 거주 — 노드를 감싸는 은은한 펄스 헤일로(살짝 큰 링) */}
              {isResidence && (
                <span className="pointer-events-none absolute left-1/2 top-1/2 h-[23px] w-[23px] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-[7px] bg-amber-400/35" />
              )}
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition"
                style={{
                  backgroundColor: owned ? color : 'rgba(10,12,20,0.45)',
                  boxShadow: isResidence
                    ? '0 0 6px 1px rgba(251,191,36,0.65)'
                    : owned
                      ? `0 0 5px ${color}aa`
                      : 'none',
                  outline: isResidence
                    ? '2px solid #fbbf24'
                    : mine
                      ? '2px solid #ffffff'
                      : `1px solid ${color}88`,
                  outlineOffset: isResidence ? 0 : 1,
                }}
              >
                {/* 점령 길드 문양(있으면) */}
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
      </div>

      {/* 세계 정세(하단) — 매일 AI 갱신 예정. 현재는 UI 셸(내용만 담백하게). */}
      <section className="mt-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-[13px] leading-relaxed text-zinc-500">
          대륙의 정세 브리핑이 매일 이곳에 전해질 예정입니다. 어느 길드가 어느 땅을 차지했는지,
          전장의 불길이 어디로 번지는지 — 곧 만나보세요.
        </p>
      </section>

      {/* 구역 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-[340px] overflow-y-auto rounded-2xl bg-white dark:bg-zinc-950"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 헤더 — 지역(6종) 배경 + 지역이름 + 전투보기 */}
            <div
              className="relative h-20 w-full"
              style={{ background: `linear-gradient(135deg, ${REGION[selected.region].color}, #0b0e16)` }}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${assetUrl(`/sprites/guild/region/${selected.region}.png`)})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-black/10" />
              <div className="relative flex h-full items-end justify-between gap-2 p-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-bold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.95)]">
                    {selected.name}
                  </h2>
                  <p className="truncate text-[10px] text-white/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.95)]">
                    {ZONE_LORE[selected.id]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openBattle(selected.id)}
                  disabled={pending}
                  className="shrink-0 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm disabled:opacity-50"
                >
                  전투 기록
                </button>
              </div>
            </div>

            <div className="px-4 pb-4 pt-3">
              <dl className="space-y-1 text-[12px]">
                <div className="flex justify-between">
                  <dt className="text-zinc-500">소유 길드</dt>
                  <dd className="font-semibold">
                    {selected.ownerGuildName ?? <span className="text-zinc-400">중립</span>}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">집행관</dt>
                  <dd className="font-semibold">
                    {selected.executorNickname ?? <span className="text-zinc-400">공석</span>}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">누적 세금</dt>
                  <dd className="font-mono tabular-nums">💎 {selected.taxDiamond}</dd>
                </div>
              </dl>

            {canSetResidence &&
              (selected.id === residence ? (
                // 현재 위치 — '이동' 버튼과 동일 크기(레이아웃 시프트 방지)
                <button
                  type="button"
                  disabled
                  className="mt-3 w-full cursor-default rounded-lg bg-amber-500/15 py-2.5 text-sm font-bold text-amber-700 dark:text-amber-300"
                >
                  현재 위치
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => moveResidence(selected.id)}
                  disabled={pending}
                  className="mt-3 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  이동
                </button>
              ))}

            {/* 점령전 배치(길드원만) */}
            {myGuildId &&
              (() => {
                const ownedByMe = selected.ownerGuildId === myGuildId;
                const fog = guildDeployByZone.get(selected.id);
                if (!fog && !(ownedByMe && isOfficer)) return null;
                return (
                  <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    {fog && (
                      <p className="text-[11px] text-zinc-500">
                        우리 길드 배치 — 공격 {fog.attack} · 수비 {fog.defend}
                      </p>
                    )}

                    {/* 집행관 지정(길드장/부길드장 · 자기 길드 소유 구역) */}
                    {ownedByMe && isOfficer && (
                      <div className="mt-3 rounded-lg bg-zinc-100 p-2.5 dark:bg-zinc-900">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold">집행관 관리</span>
                          {selected.executorUserId && (
                            <button
                              type="button"
                              onClick={() => removeExecutor(selected.id)}
                              disabled={pending}
                              className="text-[10px] font-semibold text-red-500 disabled:opacity-50"
                            >
                              해제
                            </button>
                          )}
                        </div>
                        <select
                          value={selected.executorUserId ?? ''}
                          onChange={(e) => assignExecutor(selected.id, e.target.value)}
                          disabled={pending}
                          className="mt-1.5 w-full rounded-lg border border-zinc-300 bg-white px-2 py-2 text-[12px] dark:border-zinc-700 dark:bg-zinc-950"
                        >
                          <option value="">집행관 공석 (지정 안 함)</option>
                          {members.map((m) => (
                            <option key={m.userId} value={m.userId}>
                              {m.nickname}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-zinc-500">
                          집행관은 ×3 자동 방어 + 세금 수금권. 공석이면 세금이 동결됩니다.
                        </p>
                      </div>
                    )}
                  </div>
                );
              })()}

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="mt-3 w-full py-1.5 text-[11px] text-zinc-500"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {replay && <ConquestReplay battle={replay} onClose={() => setReplay(null)} />}
    </div>
  );
}
