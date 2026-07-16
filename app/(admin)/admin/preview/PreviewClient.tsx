'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';
import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { assetUrl } from '@/lib/asset-versions';

import { updateChronicleAction, regenTrophyAction } from './actions';

type PreviewZone = { id: number; name: string; mapX: number; mapY: number; region: Region };

/**
 * 애니메이션 미리보기(2026-07-16) — 공개 전 검수에서 연대기 리플레이(진군·격돌·점령)를
 * 미니 지도 + 실제 리플레이 엔진(ChronicleReplayPanel)으로 재생. **편집 중 텍스트**를 그대로
 * 사용하므로 저장 전 문구·마커 수정의 연출 결과를 즉시 확인 가능.
 */
function ReplayPreview({
  text,
  replay,
  zones,
  adjacency,
}: {
  text: string;
  replay: ConquestReplay;
  zones: PreviewZone[];
  adjacency: { a: number; b: number }[];
}) {
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const [runKey, setRunKey] = useState(0);
  const [owners, setOwners] = useState<Record<number, string | null>>({ ...replay.beforeOwner });
  const zoneColor = (name: string) => {
    const z = zones.find((x) => x.name === name);
    return z ? REGION_META[z.region].color : null;
  };
  const posById = new Map(zones.map((z) => [z.id, z]));
  return (
    <div className="space-y-2">
      {/* 실지도 재현(2026-07-16 피드백) — 월드맵 배경 + 인접 길 + 실노드 스타일(WorldMapView와 동일 문법) */}
      <div className="relative aspect-square w-full max-w-[340px] overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={assetUrl('/sprites/guild/worldmap.png')}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
          style={{ imageRendering: 'pixelated' }}
        />
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-0 h-full w-full">
          {adjacency.map((e) => {
            const A = posById.get(e.a);
            const B = posById.get(e.b);
            if (!A || !B) return null;
            return (
              <line
                key={`${e.a}-${e.b}`}
                x1={A.mapX}
                y1={A.mapY}
                x2={B.mapX}
                y2={B.mapY}
                stroke="#fcd34d"
                strokeOpacity={0.5}
                strokeWidth={0.5}
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        {zones.map((z) => {
          const owner = owners[z.id] ?? null;
          const color = REGION_META[z.region].color;
          const g = owner ? replay.guilds[owner] : null;
          const gColor = owner ? (g?.color ?? '#a8a29e') : null;
          return (
            <span
              key={z.id}
              title={z.name}
              className="absolute block h-[17px] w-[17px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[4px] ring-1 ring-black/70"
              style={{
                left: `${z.mapX}%`,
                top: `${z.mapY}%`,
                backgroundColor: gColor ? `${gColor}73` : 'rgba(10,12,20,0.45)',
                outline: `1px solid ${color}${owner ? '' : '88'}`,
                outlineOffset: 0,
              }}
            >
              {g?.emblemUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={g.emblemUrl}
                  alt=""
                  aria-hidden
                  className="h-full w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              ) : null}
            </span>
          );
        })}
        <div ref={setLayer} aria-hidden className="pointer-events-none absolute inset-0 z-40" />
      </div>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5">
        <ChronicleReplayPanel
          key={runKey}
          text={text}
          replay={replay}
          zones={zones}
          layer={layer}
          zoneColor={zoneColor}
          onOwnerFlip={(zoneId, guild) => setOwners((m) => ({ ...m, [zoneId]: guild }))}
          onDone={() => {}}
        />
      </div>
      <button
        type="button"
        onClick={() => {
          setOwners({ ...replay.beforeOwner });
          setRunKey((k) => k + 1);
        }}
        className="rounded-lg border border-zinc-700 px-3 py-1.5 text-[12px] font-bold text-zinc-300"
      >
        처음부터 다시 재생
      </button>
    </div>
  );
}

/** 연대기 편집 폼 — 자정 공개 전 교정(공개 후 수정도 즉시 반영). */
export function ChronicleEditor({
  serverId,
  kstDay,
  headline: initialHeadline,
  todayText: initialText,
  replay,
  zones,
  adjacency,
}: {
  serverId: number;
  kstDay: string;
  headline: string;
  todayText: string;
  replay: ConquestReplay | null;
  zones: PreviewZone[];
  adjacency: { a: number; b: number }[];
}) {
  const router = useRouter();
  const [headline, setHeadline] = useState(initialHeadline);
  const [text, setText] = useState(initialText);
  const [flash, setFlash] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false); // 애니메이션 미리보기 토글(0안 접힘)
  const [pending, start] = useTransition();
  const dirty = headline !== initialHeadline || text !== initialText;

  const save = () => {
    start(async () => {
      const r = await updateChronicleAction({ serverId, kstDay, headline, todayText: text });
      setFlash(r.status === 'success' ? '저장됨' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };

  return (
    <div className="space-y-2">
      <input
        value={headline}
        onChange={(e) => setHeadline(e.target.value)}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-bold"
        placeholder="헤드라인"
      />
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={12}
        className="w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[13px] leading-relaxed"
        placeholder="본문 — {g|길드} {z|구역} {u|인물} 토큰은 유저 화면에서 칩으로 렌더됨"
      />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          {pending ? '저장 중…' : '수정 저장'}
        </button>
        {flash ? <span className="text-[12px] text-zinc-400">{flash}</span> : null}
        {replay ? (
          <button
            type="button"
            onClick={() => setShowReplay((v) => !v)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300"
          >
            {showReplay ? '미리보기 닫기' : '애니메이션 미리보기'}
          </button>
        ) : null}
      </div>
      {showReplay && replay ? <ReplayPreview key={text} text={text} replay={replay} zones={zones} adjacency={adjacency} /> : null}
    </div>
  );
}

/** 트로피 재생성 버튼 — 3초 재탭 컨펌(기존 결과물이 지워지므로). */
export function TrophyRegenButton({ battleId }: { battleId: string }) {
  const router = useRouter();
  const [armed, setArmed] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false); // 애니메이션 미리보기 토글(0안 접힘)
  const [pending, start] = useTransition();

  const click = () => {
    if (!armed) {
      setArmed(true);
      window.setTimeout(() => setArmed(false), 3000);
      return;
    }
    setArmed(false);
    start(async () => {
      const r = await regenTrophyAction(battleId);
      setFlash(r.status === 'success' ? '재생성 시작 — 1~5분 뒤 완료' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        onClick={click}
        disabled={pending}
        className={`rounded-lg px-3 py-1.5 text-[12px] font-bold text-white disabled:opacity-40 ${
          armed ? 'bg-red-600' : 'bg-zinc-700'
        }`}
      >
        {pending ? '요청 중…' : armed ? '한 번 더 눌러 확정' : '트로피 재생성'}
      </button>
      {flash ? <span className="text-[11px] text-zinc-400">{flash}</span> : null}
    </span>
  );
}
