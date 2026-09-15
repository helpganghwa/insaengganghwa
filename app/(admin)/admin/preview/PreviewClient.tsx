'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import type { ConquestReplay } from '@/lib/game/guild/conquest/replay';
import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { assetUrl } from '@/lib/asset-versions';

import { updateChronicleAction, regenerateChronicleAction, improveChronicleAction, checkChronicleAction } from './actions';
import { CHRONICLE_FEEDBACK, CHRONICLE_IMPROVE_MODELS, type ChronicleFeedbackKey, type ChronicleImproveModel, type ChronicleReviewNote } from '@/lib/game/guild/conquest/chronicle';

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
        {/* layer 준비 후 마운트(2026-07-17) — 같은 렌더에 패널을 올리면 엔진이 null 레이어를
            잡아 문양·전투 연출이 전부 no-op(타이핑만 동작하던 버그). */}
        {layer ? (
          <ChronicleReplayPanel
            key={runKey}
            text={text}
            replay={replay}
            zones={zones}
            layer={layer}
            zoneColor={zoneColor}
            onOwnerFlip={(zoneId, guild) => setOwners((m) => ({ ...m, [zoneId]: guild }))}
            onNeutralize={(zoneId) => setOwners((m) => ({ ...m, [zoneId]: null }))}
            onDone={() => {}}
          />
        ) : (
          <p className="text-[11px] text-zinc-500">지도 준비 중…</p>
        )}
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
  headlineCandidates,
  todayText: initialText,
  replay,
  zones,
  adjacency,
}: {
  serverId: number;
  kstDay: string;
  headline: string;
  /** 생성 시 낸 헤드라인 후보(0193) — 누르면 입력칸에 채워진다. 이전 행은 []. */
  headlineCandidates: string[];
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
  const [regenAsk, setRegenAsk] = useState(false); // 재생성 확인(편집 내용을 덮어쓰므로 원클릭 금지)
  const [pending, start] = useTransition();
  const dirty = headline !== initialHeadline || text !== initialText;

  // AI 개선(2026-09-15) — 피드백 칩 + 직접 입력 + 모델 → 현재 텍스트를 고친 결과로 입력칸을 바로 교체(사용자 확정),
  // 확정은 기존 '수정 저장'. 변경 목록·코드 검증 결과를 아래에 보여 준다. 실패는 사유만 표시하고 텍스트는 그대로.
  const [fb, setFb] = useState<Set<ChronicleFeedbackKey>>(new Set());
  const [note, setNote] = useState('');
  const [model, setModel] = useState<ChronicleImproveModel>('claude-sonnet-5');
  const [improving, setImproving] = useState(false);
  const [improveMsg, setImproveMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [changes, setChanges] = useState<ChronicleReviewNote[]>([]);
  const [issues, setIssues] = useState<{ before: string[]; after: string[] | null } | null>(null);
  const toggleFb = (k: ChronicleFeedbackKey) =>
    setFb((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  const improve = async () => {
    if (improving) return;
    if (fb.size === 0 && !note.trim()) {
      setImproveMsg({ tone: 'err', text: '개선 방향을 하나 이상 고르거나 직접 입력하세요.' });
      return;
    }
    setImproving(true);
    setImproveMsg(null);
    try {
      const r = await improveChronicleAction({ serverId, kstDay, headline, todayText: text, feedback: [...fb], note, model });
      if (r.ok) {
        setText(r.today);
        setHeadline(r.headline);
        setChanges(r.changes);
        setIssues({ before: r.issuesBefore, after: r.issuesAfter });
        setImproveMsg({ tone: 'ok', text: `개선안으로 교체됨(변경 ${r.changes.length}건) — 확정하려면 수정 저장` });
      } else {
        setIssues({ before: r.issuesBefore, after: null });
        setImproveMsg({ tone: 'err', text: r.reason });
      }
    } finally {
      setImproving(false);
    }
  };
  const check = async () => {
    if (improving) return;
    setImproving(true);
    setImproveMsg(null);
    try {
      const r = await checkChronicleAction({ serverId, kstDay, todayText: text });
      if ('issues' in r) {
        setIssues({ before: r.issues, after: null });
        setImproveMsg({ tone: r.issues.length === 0 ? 'ok' : 'err', text: r.issues.length === 0 ? '코드 검증 통과 — 마커·연출 순서·사실 대조 위반 없음' : `코드 검증 위반 ${r.issues.length}건` });
      } else setImproveMsg({ tone: 'err', text: r.error });
    } finally {
      setImproving(false);
    }
  };

  const save = () => {
    start(async () => {
      const r = await updateChronicleAction({ serverId, kstDay, headline, todayText: text });
      setFlash(r.status === 'success' ? '저장됨' : r.message);
      if (r.status === 'success') router.refresh();
    });
  };

  /**
   * 재생성 — 같은 사실표로 주사위를 다시 굴린다(LLM 2회, 40초 안팎). 성공하면 서버가 새
   * 텍스트를 저장하고, refresh로 내려온 새 initial 값이 key 리마운트로 편집칸에 반영된다.
   * 실패 시 서버가 기존 행을 복원하므로 화면·DB 모두 원래대로다.
   */
  const regenerate = () => {
    setRegenAsk(false);
    start(async () => {
      const r = await regenerateChronicleAction({ serverId, kstDay });
      setFlash(r.status === 'success' ? '재생성됨' : r.message);
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
      {headlineCandidates.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {headlineCandidates.map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setHeadline(h)}
              className={`rounded-full border px-2.5 py-1 text-[11px] ${
                h === headline
                  ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
              }`}
              title={h}
            >
              {h.replace(/\{[gzu]\|([^|}]+)(?:\|[^}]*)?\}/g, '$1')}
            </button>
          ))}
        </div>
      ) : null}
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
        {/* 실패는 빨간색으로 구분 — 회색 단일 표시가 에러를 '저장됨'처럼 보이게 했음(07-17). */}
        {flash ? (
          <span className={`text-[12px] font-bold ${flash === '저장됨' ? 'text-emerald-400' : 'text-red-400'}`}>
            {flash}
          </span>
        ) : null}
        {replay ? (
          <button
            type="button"
            onClick={() => setShowReplay((v) => !v)}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300"
          >
            {showReplay ? '미리보기 닫기' : '애니메이션 미리보기'}
          </button>
        ) : null}
        {/* 재생성 — 현재 텍스트(수정분 포함)를 새 생성으로 덮어쓴다. 2단계 확인 + 진행 표시. */}
        <span className="ml-auto flex items-center gap-2">
          {regenAsk ? (
            <>
              <span className="text-[11px] text-red-300">지금 텍스트를 버리고 다시 생성합니다</span>
              <button
                type="button"
                onClick={regenerate}
                disabled={pending}
                className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                재생성 실행
              </button>
              <button
                type="button"
                onClick={() => setRegenAsk(false)}
                disabled={pending}
                className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300"
              >
                취소
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setRegenAsk(true)}
              disabled={pending}
              className="rounded-lg border border-red-500/50 px-3 py-2 text-sm font-bold text-red-400 disabled:opacity-40"
            >
              {pending && flash === null && !dirty ? '재생성 중… (40초 안팎)' : '재생성'}
            </button>
          )}
        </span>
      </div>
      {showReplay && replay ? <ReplayPreview key={text} text={text} replay={replay} zones={zones} adjacency={adjacency} /> : null}

      {/* ── AI 개선 패널 — 피드백 칩 · 직접 입력 · 모델 · 실행. 결과는 입력칸 즉시 교체 + 변경 목록 + 코드 검증. ── */}
      <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
        <div className="mb-2 text-[11px] font-bold text-zinc-400">AI 개선 — 지금 입력칸의 텍스트를 고른 방향으로 고칩니다(결과가 입력칸을 바로 교체, 저장은 따로)</div>
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(CHRONICLE_FEEDBACK) as ChronicleFeedbackKey[]).map((k) => {
            const on = fb.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleFb(k)}
                disabled={improving}
                aria-pressed={on}
                className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                  on ? 'border-violet-500 bg-violet-500/20 text-violet-200' : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                }`}
              >
                {CHRONICLE_FEEDBACK[k].label}
              </button>
            );
          })}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={improving}
            maxLength={300}
            placeholder="직접 입력 — 예: '집행관·하루 만에 표현 줄여'"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-[12px]"
          />
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as ChronicleImproveModel)}
            disabled={improving}
            className="rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-2 text-[12px]"
            aria-label="모델"
          >
            {(Object.keys(CHRONICLE_IMPROVE_MODELS) as ChronicleImproveModel[]).map((m) => (
              <option key={m} value={m}>
                {CHRONICLE_IMPROVE_MODELS[m]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={improve}
            disabled={improving || pending}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {improving ? '개선 중… (20~60초)' : 'AI 개선'}
          </button>
          <button
            type="button"
            onClick={check}
            disabled={improving || pending}
            className="rounded-lg border border-zinc-700 px-3 py-2 text-sm font-bold text-zinc-300 disabled:opacity-40"
            title="LLM 없이 코드 검증만 — 마커 누락·연출 순서·사실 대조"
          >
            사실 검증
          </button>
        </div>
        {improveMsg ? (
          <p className={`mt-2 text-[12px] font-bold ${improveMsg.tone === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>{improveMsg.text}</p>
        ) : null}
        {changes.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {changes.map((c, i) => (
              <li key={i} className="rounded-md border border-zinc-800 bg-zinc-900/60 px-2.5 py-1.5 text-[11.5px] leading-relaxed">
                <span className={`mr-1.5 rounded px-1 py-px text-[9.5px] font-extrabold ${c.kind === 'fact' ? 'bg-red-500/20 text-red-300' : 'bg-sky-500/20 text-sky-300'}`}>
                  {c.kind === 'fact' ? '사실' : '표현'}
                </span>
                {c.before ? <span className="text-zinc-500 line-through">{c.before}</span> : null}
                {c.before ? ' → ' : ''}
                <span className="text-zinc-100">{c.after}</span>
                {c.reason ? <span className="ml-1.5 text-zinc-500">({c.reason})</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
        {issues ? (
          <div className="mt-2 grid gap-2 text-[11.5px] sm:grid-cols-2">
            <div>
              <div className="mb-1 font-bold text-zinc-400">코드 검증 — {issues.after === null ? '현재 본문' : '개선 전'} ({issues.before.length}건)</div>
              {issues.before.length === 0 ? <p className="text-emerald-400">위반 없음</p> : <ul className="list-disc space-y-0.5 pl-4 text-amber-200">{issues.before.map((s, i) => <li key={i}>{s}</li>)}</ul>}
            </div>
            {issues.after !== null ? (
              <div>
                <div className="mb-1 font-bold text-zinc-400">개선 후 ({issues.after.length}건)</div>
                {issues.after.length === 0 ? <p className="text-emerald-400">위반 없음</p> : <ul className="list-disc space-y-0.5 pl-4 text-amber-200">{issues.after.map((s, i) => <li key={i}>{s}</li>)}</ul>}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
