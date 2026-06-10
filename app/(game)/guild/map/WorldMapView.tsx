'use client';

import { useMemo, useState, useTransition } from 'react';

import { useResourceToast } from '@/components/ResourceToast';
import { assetUrl } from '@/lib/asset-versions';

import { setResidenceAction, getZoneBattleAction } from '../actions';
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
  residentCount: number;
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
  residenceZoneId,
  canSetResidence,
  guildDeploys,
  zones,
}: {
  mapSrc: string;
  myGuildId: string | null;
  residenceZoneId: number | null;
  canSetResidence: boolean;
  guildDeploys: Array<{ zoneId: number; role: DeployRole }>;
  zones: Zone[];
}) {
  const { showHeaderToast, showError } = useResourceToast();
  const [residence, setResidence] = useState<number | null>(residenceZoneId);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [replay, setReplay] = useState<Battle | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [pending, start] = useTransition();

  const selected = zones.find((z) => z.id === selectedId) ?? null;

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

  // 거주 이동 — 낙관적(즉시 반영, 서버 백그라운드). router.refresh를 transition 안에서
  // 호출하면 refresh 동안 pending이 묶여 다음 이동이 막혔음 → 제거해 연속 이동 가능.
  const moveResidence = (zoneId: number) => {
    const prev = residence;
    setResidence(zoneId); // 낙관적
    showHeaderToast({ title: '거주지 이동 완료' });
    start(async () => {
      const r = await setResidenceAction(zoneId);
      if (r.status !== 'success') {
        setResidence(prev);
        showError(guildErrMsg(r.code));
      }
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
        {/* 지역 이름 오버레이 토글 — 켜면 50개 라벨 노출(좁아서 겹칠 수 있어 기본 꺼짐). */}
        <button
          type="button"
          onClick={() => setShowNames((v) => !v)}
          className={`absolute left-2 top-2 z-30 w-[78px] rounded-lg py-1 text-center text-[10px] font-bold ring-1 backdrop-blur-sm transition active:scale-95 ${
            showNames
              ? 'bg-amber-600 text-white ring-amber-300/60'
              : 'bg-black/55 text-white/90 ring-white/25'
          }`}
        >
          지역 이름 {showNames ? 'ON' : 'OFF'}
        </button>
        {zones.map((z) => {
          const owned = z.ownerGuildId != null;
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
              <span
                className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition"
                style={{
                  // 점령 시: 배경 투명(문양만) + 얇은 지역색 보더. 중립: 어두운 배경 + 흐린 지역색.
                  backgroundColor: owned ? 'transparent' : 'rgba(10,12,20,0.45)',
                  boxShadow: owned ? `0 0 4px ${color}88` : 'none',
                  outline: `1px solid ${color}${owned ? '' : '88'}`,
                  outlineOffset: 1,
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
              {/* 내 위치 — 네모 상단에 둥둥 떠 있는 amber 핀(부유 + 글로우 펄스) */}
              {isResidence && (
                <span className="pointer-events-none absolute bottom-full left-1/2 mb-1 -translate-x-1/2">
                  <span className="block" style={{ animation: 'marker-bob 1.5s ease-in-out infinite' }}>
                    <span
                      className="relative block h-[11px] w-[11px] border-[1.5px] border-white"
                      style={{
                        background: 'linear-gradient(135deg, #fcd34d, #f59e0b)',
                        borderRadius: '50% 50% 50% 0',
                        transform: 'rotate(-45deg)',
                        animation: 'marker-pin-glow 1.5s ease-in-out infinite',
                      }}
                    >
                      <span className="absolute left-1/2 top-1/2 h-[3.5px] w-[3.5px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
                    </span>
                  </span>
                </span>
              )}
              {/* 지역 이름 라벨(토글 시) — 노드 하단, 지역색 텍스트, 클릭 통과 */}
              {showNames && (
                <span
                  className="pointer-events-none absolute left-1/2 top-full mt-[2px] -translate-x-1/2 whitespace-nowrap rounded-sm bg-black/70 px-0.5 text-[5px] font-bold leading-[1.4] shadow-[0_1px_2px_rgba(0,0,0,0.75)]"
                  style={{ color }}
                >
                  {z.name}
                </span>
              )}
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
                <div className="flex justify-between gap-2">
                  <dt className="text-zinc-500">소유 길드</dt>
                  <dd className="flex min-w-0 items-center gap-1.5 font-semibold">
                    {selected.ownerGuildName ? (
                      <>
                        {selected.ownerEmblemUrl && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={selected.ownerEmblemUrl}
                            alt=""
                            aria-hidden
                            className="h-4 w-4 shrink-0 object-contain"
                            style={{ imageRendering: 'pixelated' }}
                          />
                        )}
                        <span className="truncate">{selected.ownerGuildName}</span>
                      </>
                    ) : (
                      <span className="text-zinc-400">중립</span>
                    )}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">집행관</dt>
                  <dd className="font-semibold">
                    {selected.executorNickname ?? <span className="text-zinc-400">공석</span>}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">거주 인원</dt>
                  <dd className="font-mono tabular-nums">{selected.residentCount.toLocaleString('ko-KR')}명</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-zinc-500">누적 세금 💎</dt>
                  <dd className="font-mono tabular-nums">{selected.taxDiamond}</dd>
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

            {/* 점령전 배치 안개 — 우리 길드 배치 현황만 열람 */}
            {myGuildId &&
              (() => {
                const fog = guildDeployByZone.get(selected.id);
                if (!fog) return null;
                return (
                  <div className="mt-3 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                    <p className="text-[11px] text-zinc-500">
                      우리 길드 배치 — 공격 {fog.attack} · 수비 {fog.defend}
                    </p>
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
