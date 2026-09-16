'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { GuildEmblemImg } from '@/components/GuildEmblemImg';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { PAPER, SERIF } from '@/app/wiki/theme';
import type { HistoryDayData, HistoryEvent, HistoryGuildMeta, HistoryIndex } from '@/lib/game/history/types';
import { HistoryChart } from './HistoryChart';

/**
 * 대륙의 역사 연속 재생(2026-09-16, 시안 v2 01) — 무대(지도) + 읽기 칸(재생 중 문장 강조) + 스크러버·조작.
 *  - 첫 진입은 정지 + 최신 지도(현재 소유). 재생을 누르면 첫날부터, 스크러버·전날·다음으로 임의 날짜부터.
 *  - 하루 = 그날 리플레이 스크립트(/api/history/day)를 ChronicleReplayPanel(배속·일시정지 지원)로 재생.
 *    끝나면 1.5초 날짜 카드 → 다음 날. 최신 공개일이 끝나면 끝 화면.
 *  - 소유 상태는 그날 스크립트의 beforeOwner에서 시작해 점령/중립화 콜백으로 갱신 → 우상단 집계가 실시간.
 *  - 길드 색·문양은 그날 리플레이 스냅샷(guilds)이 우선, 없으면 현재 값 → 초기 6일은 색 방패 폴백.
 */
type Phase = 'idle' | 'loading' | 'playing' | 'end';
type Mode = 'battle' | 'quick';
const QUICK_DAY_MS = 2500; // 빠른 흐름 — 하루 2.5초(23일 ≈ 1분)
const SUBTITLE_MS = 4000;
const EVENT_PRIORITY: Record<HistoryEvent['kind'], number> = { leader: 0, sweep: 1, peak: 2, vanish: 3, rename: 4, disband: 5, power1: 6 };
const SPEEDS = [1, 2, 4] as const;
const STATIC_DAY_MS = 5000; // 리플레이 스크립트가 없는 날(전투 없이 기록만) — 본문만 보여 주고 넘어간다
/** 게임 세계지도와 같은 무대 폭(루트 viewport 390 기준 정사각) — 노드 17px가 게임과 같은 비율로 보인다(피드백 2). */
const STAGE_PX = 390;

const TOKEN_RE = /\{([guz])\|([^}|]+)(?:\|[^}]*)?\}+/g;
/** 헤드라인·카드용 칩 렌더 — 재생 본문은 패널이 그린다. */
function Headline({ text, className = '' }: { text: string; className?: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const kind = m[1]!;
    const name = m[2]!;
    parts.push(
      <span
        key={i++}
        className={
          kind === 'g'
            ? 'inline-block rounded px-1 font-semibold text-[#4b3a8a]'
            : kind === 'z'
              ? 'inline-block rounded px-1 font-semibold text-[#2f6a45]'
              : 'inline-block rounded px-1 font-semibold text-[#8a4b23]'
        }
      >
        {name}
      </span>,
    );
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <span className={className}>{parts}</span>;
}

function ordinalKo(n: number): string {
  const units = ['', '한', '두', '세', '네', '다섯', '여섯', '일곱', '여덟', '아홉'];
  const tens = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
  if (n === 1) return '첫';
  if (n < 100) {
    const t = Math.floor(n / 10);
    const u = n % 10;
    return `${tens[t]}${u === 0 ? '' : units[u]}`;
  }
  return `${n}`;
}
const fmtDay = (d: string) => `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

export function HistoryPlayer({ index, mapSrc, startDay }: { index: HistoryIndex; mapSrc: string; startDay: string | null }) {
  const { days, zones, edges, serverId, story } = index;
  const n = days.length;
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('battle');
  const [idx, setIdx] = useState<number>(n - 1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1); // 게임과 같은 속도가 기본
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [owners, setOwners] = useState<Record<number, string | null>>(index.owners);
  const [meta, setMeta] = useState<Record<string, HistoryGuildMeta>>(index.guilds);
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bindLayer = useCallback((el: HTMLDivElement | null) => {
    layerRef.current = el;
    setLayer(el);
  }, []);
  // 이어 읽기 — 시작한 날들을 한 목록에 쌓고 끝난 날의 재생 패널도 그대로 마운트해 둔다(정적으로 바꿔 그리면 튄다).
  const [queue, setQueue] = useState<{ kstDay: string; headline: string; nth: number; data: HistoryDayData; session: number }[]>([]);
  // 빠른 흐름 — 날짜·헤드라인·점령 수 한 줄씩.
  const [quickRows, setQuickRows] = useState<{ kstDay: string; headline: string; nth: number; captures: number }[]>([]);
  // 순간 자막(1위 교체·지역 석권·과반·소멸) — 소유가 바뀔 때 계산.
  const [subtitle, setSubtitle] = useState<{ kind: string; text: string; at: number } | null>(null);
  const baselineRef = useRef<{ leader: string | null; regions: Record<string, string | null>; counts: Record<string, number> } | null>(null);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const cache = useRef(new Map<string, HistoryDayData | null>());
  const run = useRef(0);
  const startAtRef = useRef<(k: number, continuous?: boolean) => Promise<void>>(async () => {});
  const modeRef = useRef<Mode>('battle');
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const zonesByRegion = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const z of zones) m.set(z.region, [...(m.get(z.region) ?? []), z.id]);
    return m;
  }, [zones]);
  const regionColor = useCallback((region: string) => REGION_META[region as Region]?.color ?? '#a8a29e', []);
  const regionLabel = useCallback((region: string) => REGION_META[region as Region]?.label ?? region, []);
  const zoneColor = useCallback(
    (name: string) => {
      const z = zones.find((x) => x.name === name);
      return z ? regionColor(z.region) : null;
    },
    [zones, regionColor],
  );

  /** 소유 상태 요약 — 1위·지역별 단독 소유·길드별 수. 자막 판정의 재료. */
  const summarize = useCallback(
    (o: Record<number, string | null>) => {
      const counts: Record<string, number> = {};
      for (const g of Object.values(o)) if (g) counts[g] = (counts[g] ?? 0) + 1;
      let leader: string | null = null;
      let best = 0;
      for (const [g, c] of Object.entries(counts)) if (c > best) { best = c; leader = g; }
      const regions: Record<string, string | null> = {};
      for (const [r, ids] of zonesByRegion) {
        const first = o[ids[0]!] ?? null;
        regions[r] = first && ids.every((id) => o[id] === first) ? first : null;
      }
      return { leader, regions, counts };
    },
    [zonesByRegion],
  );
  // 순간 자막 — 재생 중 소유가 바뀔 때마다 기준(그날 시작)과 비교.
  useEffect(() => {
    if (phase !== 'playing' || !baselineRef.current) return;
    const now = summarize(owners);
    const base = baselineRef.current;
    let text: { kind: string; text: string } | null = null;
    if (now.leader && base.leader && now.leader !== base.leader) text = { kind: '1위 교체', text: `${base.leader} ${base.counts[base.leader] ?? 0} → ${now.leader} ${now.counts[now.leader] ?? 0}` };
    if (!text) for (const [r, g] of Object.entries(now.regions)) if (g && base.regions[r] !== g) { text = { kind: '지역 석권', text: `${g}, ${regionLabel(r)} 전역` }; break; }
    const half = Math.ceil(zones.length / 2);
    if (!text) for (const [g, c] of Object.entries(now.counts)) if (c >= half && (base.counts[g] ?? 0) < half) { text = { kind: '과반', text: `${g}, 대륙 과반 ${c}곳` }; break; }
    if (!text) for (const [g, c] of Object.entries(base.counts)) if (c > 0 && !(now.counts[g] ?? 0)) { text = { kind: '소멸', text: `${g}, 대륙에서 사라지다` }; break; }
    if (text) {
      setSubtitle({ ...text, at: Date.now() });
      baselineRef.current = now;
    }
  }, [owners, phase, summarize, regionLabel, zones.length]);
  // 자막 자동 소거.
  useEffect(() => {
    if (!subtitle) return;
    const id = setTimeout(() => setSubtitle((s) => (s && s.at === subtitle.at ? null : s)), SUBTITLE_MS / speed);
    return () => clearTimeout(id);
  }, [subtitle, speed]);

  const fetchDay = useCallback(
    async (k: number): Promise<HistoryDayData | null> => {
      const d = days[k];
      if (!d) return null;
      if (cache.current.has(d.kstDay)) return cache.current.get(d.kstDay)!;
      try {
        const r = await fetch(`/api/history/day?s=${serverId}&day=${d.kstDay}&v=2`, { cache: 'no-store' });
        const v = r.ok ? ((await r.json()) as HistoryDayData) : null;
        cache.current.set(d.kstDay, v);
        return v;
      } catch {
        return null;
      }
    },
    [days, serverId],
  );

  /** 지도 위 번쩍임(빠른 흐름용) — 재생 엔진 없이 소유 변화만 표시. */
  const flashZone = useCallback(
    (zoneId: number, color: string | null) => {
      const z = zoneById.get(zoneId);
      const l = layerRef.current;
      if (!z || !l) return;
      const f = document.createElement('div');
      const c = color ?? '#a8a29e';
      f.style.cssText = `position:absolute;z-index:35;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:7px;left:${z.mapX}%;top:${z.mapY}%;pointer-events:none;`;
      l.appendChild(f);
      f.animate([{ boxShadow: `0 0 0 0 ${c}d9`, background: `${c}d9` }, { boxShadow: `0 0 0 22px ${c}00`, background: `${c}00` }], { duration: 1100, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => f.remove(), 1200);
    },
    [zoneById],
  );

  const finish = useCallback(() => {
    setPhase('end');
    setOwners(index.owners);
    baselineRef.current = null;
  }, [index.owners]);

  /** 하루가 끝났을 때 — 곧바로 다음 날로, 마지막이면 끝. */
  const advance = useCallback(
    (k: number) => {
      if (k + 1 < n) void startAtRef.current(k + 1, true);
      else finish();
    },
    [n, finish],
  );

  /** 빠른 흐름 — 그날 점령을 순서대로 번쩍이며 2.5초 안에 넘긴다(재생 엔진 미사용). */
  const runQuick = useCallback(
    async (k: number, token: number, data: HistoryDayData) => {
      const replay = data.replay;
      const captures = replay ? Object.values(replay.events).filter((e) => e.type === 'capture') : [];
      const step = (QUICK_DAY_MS / speed) / (captures.length + 1);
      const wait = async (ms: number) => {
        await new Promise((r) => setTimeout(r, ms));
        while (pausedRef.current && token === run.current) await new Promise((r) => setTimeout(r, 120));
      };
      for (const ev of captures) {
        await wait(step);
        if (token !== run.current) return;
        setOwners((o) => ({ ...o, [ev.zoneId]: ev.winner }));
        flashZone(ev.zoneId, replay?.guilds[ev.winner]?.color ?? null);
      }
      await wait(step);
      if (token !== run.current) return;
      setQuickRows((q) => (q.some((r) => r.kstDay === data.kstDay) ? q : [...q, { kstDay: data.kstDay, headline: data.headline, nth: k + 1, captures: captures.length }]));
      advance(k);
    },
    [speed, flashZone, advance],
  );

  /** k번째 날부터 재생 — 이어 재생(continuous)이면 위에 쌓인 기록을 유지. */
  const startAt = useCallback(
    async (k: number, continuous = false) => {
      if (k < 0 || k >= n) return;
      const token = ++run.current;
      pausedRef.current = false;
      setPaused(false);
      layerRef.current?.replaceChildren();
      if (!continuous) {
        setQueue([]);
        setQuickRows([]);
      }
      stickRef.current = true;
      setIdx(k);
      setSubtitle(null);
      if (!continuous) setPhase('loading');
      const data = await fetchDay(k);
      if (token !== run.current) return;
      void fetchDay(k + 1);
      const replay = data?.replay ?? null;
      if (replay) {
        setOwners({ ...replay.beforeOwner });
        baselineRef.current = summarize(replay.beforeOwner);
        const snap = Object.entries(replay.guilds).map(([g, v]) => [g, { color: v.color, emblemUrl: v.emblemUrl }] as const);
        setMeta((m) => ({ ...m, ...Object.fromEntries(snap) }));
      }
      setPhase('playing');
      if (!data) {
        setTimeout(() => { if (token === run.current) advance(k); }, 300);
        return;
      }
      if (modeRef.current === 'quick') {
        void runQuick(k, token, data);
        return;
      }
      setQueue((q) => [...q, { kstDay: data.kstDay, headline: data.headline, nth: k + 1, data, session: token }]);
      if (!replay) setTimeout(() => { if (token === run.current) advance(k); }, STATIC_DAY_MS / speed);
    },
    [n, fetchDay, speed, advance, runQuick, summarize],
  );
  useEffect(() => {
    startAtRef.current = startAt;
  }, [startAt]);

  // 자동 스크롤 — 글자가 찍힐 때마다 바닥을 따라간다(위로 올리면 멈춤, 바닥 근처로 내리면 재개).
  useEffect(() => {
    const el = readerRef.current;
    if (!el || phase === 'idle') return;
    const mo = new MutationObserver(() => { if (stickRef.current) el.scrollTop = el.scrollHeight; });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const onScroll = () => { stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48; };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => { mo.disconnect(); el.removeEventListener('scroll', onScroll); };
  }, [phase]);

  // ?day= 딥링크 — 첫 렌더 뒤 그날부터.
  useEffect(() => {
    if (!startDay) return;
    const k = days.findIndex((d) => d.kstDay === startDay);
    if (k < 0) return;
    const id = setTimeout(() => void startAtRef.current(k), 0);
    return () => clearTimeout(id);
  }, [startDay, days]);

  const begin = (m: Mode, k = 0) => {
    setMode(m);
    modeRef.current = m;
    void startAt(k);
  };
  const togglePause = () => {
    if (phase === 'idle' || phase === 'end') { begin(mode, 0); return; }
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const switchMode = (m: Mode) => {
    if (m === mode) return;
    setMode(m);
    modeRef.current = m;
    if (phase === 'playing' || phase === 'loading') void startAt(idx);
  };

  const legend = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of Object.values(owners)) if (g) c.set(g, (c.get(g) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [owners]);
  const cur = days[idx]!;
  const showingDay = phase === 'idle' ? days[n - 1]! : cur;
  const dayEvents = phase === 'idle' ? [] : (story.events[cur.kstDay] ?? []);
  const edgeLines = useMemo(
    () => edges.map((e) => { const a = zoneById.get(e.a); const b = zoneById.get(e.b); return a && b ? { key: `${e.a}-${e.b}`, x1: a.mapX, y1: a.mapY, x2: b.mapX, y2: b.mapY } : null; }).filter((x): x is NonNullable<typeof x> => !!x),
    [edges, zoneById],
  );
  // 시대 띠·사건 눈금
  const ticks = useMemo(
    () => days.map((d, i) => { const evs = story.events[d.kstDay]; if (!evs?.length) return null; const e = [...evs].sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind])[0]!; return { i, short: e.short, label: e.label }; }).filter((x): x is NonNullable<typeof x> => !!x),
    [days, story.events],
  );
  const curEra = story.eras.findIndex((e) => idx >= e.startIdx && idx <= e.endIdx);
  const chartUpTo = phase === 'idle' || phase === 'end' ? n - 1 : idx;
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);

  return (
    <main className="mx-auto w-full max-w-[1180px] px-0 py-0 md:px-6 md:py-6">
      <div className={`overflow-hidden border-y md:rounded-2xl md:border ${PAPER.card}`}>
        <div className="md:grid md:grid-cols-[390px_minmax(0,1fr)]">
          {/* ── 지도 열 ── */}
          <div className="sticky top-14 z-20 md:static">
            <div className="mx-auto w-full bg-[#0c0a09]" style={{ maxWidth: STAGE_PX }}>
              <div className="relative isolate aspect-square w-full overflow-hidden bg-zinc-950">
                <div ref={bindLayer} aria-hidden className="pointer-events-none absolute inset-0 z-40" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mapSrc} alt="대륙 지도" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                  {edgeLines.map((l) => <line key={`h${l.key}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#000000" strokeOpacity={0.42} strokeWidth={1} strokeLinecap="round" />)}
                  {edgeLines.map((l) => <line key={`m${l.key}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#fde047" strokeOpacity={0.95} strokeWidth={0.72} strokeLinecap="round" />)}
                </svg>
                {zones.map((z) => {
                  const owner = owners[z.id] ?? null;
                  const m = owner ? meta[owner] : undefined;
                  const color = regionColor(z.region);
                  return (
                    <div key={z.id} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${z.mapX}%`, top: `${z.mapY}%`, zIndex: owner ? 10 : 1 }} title={`${z.name}${owner ? ` · ${owner}` : ''}`}>
                      <span
                        className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition-colors duration-500"
                        style={{ backgroundColor: owner ? (m?.color ? `${m.color}73` : `${color}55`) : 'rgba(10,12,20,0.45)', boxShadow: owner ? `0 0 4px ${color}88` : 'none', outline: `1px solid ${color}${owner ? '' : '88'}`, outlineOffset: 0 }}
                      >
                        {owner && m?.emblemUrl ? <GuildEmblemImg key={m.emblemUrl} src={m.emblemUrl} className="h-full w-full object-contain" /> : null}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 현황 줄: 날짜 · 집계 · 순간 자막 · 이날의 사건 ── */}
            <div className={`border-t px-3 pb-2 pt-2 ${PAPER.border} ${PAPER.card}`}>
              <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold" style={SERIF}>{fmtDay(showingDay.kstDay)}</div>
                  <div className={`font-mono text-[10px] ${PAPER.muted}`}>
                    {phase === 'idle' ? `지금의 대륙 · ${n}일째` : `${ordinalKo(idx + 1)} 번째 날 · ${idx + 1} / ${n}`}
                    {paused ? ' · 일시정지' : phase === 'loading' ? ' · 펼치는 중' : mode === 'quick' && phase === 'playing' ? ' · 빠른 흐름' : ''}
                  </div>
                </div>
                {legend.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] tabular-nums">
                    {legend.map(([g, c]) => (
                      <span key={g} className="inline-flex items-center gap-1.5">
                        <i className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20" style={{ background: meta[g]?.color ?? '#9a917f' }} />
                        <span className="font-semibold">{g}</span>
                        <b className={`font-mono font-medium ${PAPER.muted}`}>{c}</b>
                      </span>
                    ))}
                  </div>
                ) : null}
                {subtitle ? (
                  <div key={subtitle.at} className="mt-2 flex items-center gap-2 rounded-lg border border-[#f0c987] bg-[#fff3d6] px-2.5 py-1.5 text-[11.5px] text-[#2a251e] motion-safe:animate-[fadeIn_.4s_ease-out]">
                    <span className="rounded-full bg-[#8a4b23] px-2 py-px font-mono text-[9.5px] font-bold text-white">{subtitle.kind}</span>
                    <span className="min-w-0 truncate">{subtitle.text}</span>
                  </div>
                ) : null}
                {dayEvents.length > 0 ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {dayEvents.map((e, i) => (
                      <span key={i} title={e.label} className={`rounded-full border px-2 py-px text-[10px] ${e.kind === 'leader' || e.kind === 'sweep' ? 'border-[#8a4b23] font-bold text-[#8a4b23]' : `${PAPER.border} ${PAPER.muted}`}`}>
                        {e.label}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            {/* ── 판도 차트 ── */}
            {story.guilds.length > 0 ? (
              <div className={`border-t px-3 pb-2 pt-2 ${PAPER.border} ${PAPER.card}`}>
                <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                  <div className={`mb-0.5 flex justify-between text-[10px] ${PAPER.muted}`}><span>영토 판도 · 길드별 구역 수</span><span>{phase === 'end' || phase === 'idle' ? '전체' : '지금까지'}</span></div>
                  <HistoryChart days={days.map((d) => d.kstDay)} story={story} upTo={chartUpTo} current={phase === 'idle' ? -1 : idx} onPick={(i) => void startAt(i)} />
                </div>
              </div>
            ) : null}

            {/* ── 시대 띠 + 스크러버 + 조작 ── */}
            <div className={`border-t px-3 pb-3 pt-2 ${PAPER.border} ${PAPER.card}`}>
              <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                {story.eras.length > 0 ? (
                  <>
                    <div className="flex h-2.5 overflow-hidden rounded-[5px] border border-[#e2d9c6]" role="list" aria-label="시대">
                      {story.eras.map((e, i) => (
                        <button
                          key={i}
                          type="button"
                          title={`「${e.name}」의 시대 · ${days[e.startIdx]!.kstDay} ~ ${days[e.endIdx]!.kstDay}`}
                          onClick={() => void startAt(e.startIdx)}
                          className="h-full border-r border-[#f5f0e6] last:border-r-0"
                          style={{ width: `${((e.endIdx - e.startIdx + 1) / n) * 100}%`, background: e.color ?? '#9a917f', opacity: i === curEra || phase === 'idle' ? 1 : 0.45 }}
                        />
                      ))}
                    </div>
                    <div className="relative mt-0.5 h-4">
                      {ticks.map((t) => (
                        <button key={t.i} type="button" title={`${days[t.i]!.kstDay} · ${t.label}`} onClick={() => void startAt(t.i)} className="absolute top-0 -translate-x-1/2" style={{ left: `${pct(t.i)}%` }}>
                          <span className="block h-1.5 w-px bg-[#6d6455]" />
                          <span className="hidden whitespace-nowrap font-mono text-[8px] text-[#6d6455] md:block">{t.short}</span>
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 flex gap-1 overflow-x-auto pb-0.5">
                      {story.eras.map((e, i) => (
                        <button key={i} type="button" onClick={() => void startAt(e.startIdx)} className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${i === curEra && phase !== 'idle' ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.hover}`}`}>
                          「{e.name}」의 시대 · {e.endIdx - e.startIdx + 1}일
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <input type="range" min={0} max={n - 1} value={phase === 'idle' ? n - 1 : idx} onChange={(e) => void startAt(Number(e.target.value))} aria-label="날짜" className="mt-1 h-1.5 w-full cursor-pointer accent-[#8a4b23]" />
                <div className={`mt-0.5 flex justify-between font-mono text-[9.5px] ${PAPER.muted}`}>
                  <span>{shortDay(days[0]!.kstDay)}</span>
                  <span className="font-semibold text-[#2a251e]">{shortDay(showingDay.kstDay)}</span>
                  <span>{shortDay(days[n - 1]!.kstDay)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Btn onClick={() => void startAt(0)} label="⏮ 처음" />
                  <Btn onClick={() => void startAt((phase === 'idle' ? n : idx) - 1)} label="◀ 전날" disabled={phase !== 'idle' && idx === 0} />
                  <button type="button" onClick={togglePause} className="rounded-lg bg-[#8a4b23] px-3.5 py-1.5 text-[12px] font-extrabold text-white">
                    {phase === 'idle' ? '▶ 처음부터' : phase === 'end' ? '▶ 다시 보기' : paused ? '▶ 재생' : '❚❚ 일시정지'}
                  </button>
                  <Btn onClick={() => void startAt(idx + 1)} label="다음 날 ▶" disabled={phase === 'idle' || idx >= n - 1} />
                  <span className="mx-1 h-4 w-px bg-[#e2d9c6]" />
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" onClick={() => setSpeed(s)} aria-pressed={speed === s} className={`rounded-lg border px-2 py-1.5 font-mono text-[11px] font-bold ${speed === s ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.hover}`}`}>×{s}</button>
                  ))}
                  <span className="mx-1 h-4 w-px bg-[#e2d9c6]" />
                  {(['battle', 'quick'] as const).map((m) => (
                    <button key={m} type="button" onClick={() => switchMode(m)} aria-pressed={mode === m} className={`rounded-lg border px-2 py-1.5 text-[11px] font-bold ${mode === m ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.hover}`}`}>
                      {m === 'battle' ? '전투 재생' : '빠른 흐름'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── 두루마리 ── */}
          <div className={`flex min-h-[280px] flex-col border-t md:border-l md:border-t-0 ${PAPER.border}`}>
            {phase === 'idle' ? (
              <div className="flex flex-1 flex-col p-4 md:p-6">
                <div className="text-[18px] font-bold leading-snug" style={SERIF}>대륙의 역사</div>
                <div className={`mt-1 font-mono text-[10.5px] ${PAPER.muted}`}>{days[0]!.kstDay} 부터 {days[n - 1]!.kstDay} 까지 · {n}일의 기록 · 시대 {story.eras.length}</div>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed">
                  점령전이 있던 날마다 이야기꾼이 남긴 기록을 첫날부터 오늘까지 지도 위에 이어서 재생합니다. 1위가 바뀌는 날을 경계로 시대가 나뉘고, 구역이 뒤집힐 때마다 판도 차트가 자랍니다.
                </p>
                {story.eras.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {story.eras.map((e, i) => (
                      <button key={i} type="button" onClick={() => begin('battle', e.startIdx)} className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-[12.5px] ${PAPER.border} ${PAPER.hover}`}>
                        <span className="flex items-center gap-2"><i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: e.color ?? '#9a917f' }} /><span className="font-semibold" style={SERIF}>「{e.name}」의 시대</span></span>
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>{days[e.startIdx]!.kstDay.slice(5)} ~ {days[e.endIdx]!.kstDay.slice(5)} · {e.endIdx - e.startIdx + 1}일</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button type="button" onClick={() => begin('quick', 0)} className="rounded-lg bg-[#8a4b23] px-4 py-2 text-[13px] font-extrabold text-white">⏩ 1분 만에 보기</button>
                  <button type="button" onClick={() => begin('battle', 0)} className={`rounded-lg border px-4 py-2 text-[13px] font-extrabold ${PAPER.border} ${PAPER.hover}`}>▶ 처음부터 자세히</button>
                </div>
              </div>
            ) : (
              <div ref={readerRef} className="max-h-[56vh] flex-1 overflow-y-auto p-4 md:max-h-[720px] md:p-6">
                {queue.length === 0 && quickRows.length === 0 && phase === 'loading' ? <p className={`text-[12px] ${PAPER.muted}`}>기록을 펼치는 중…</p> : null}
                {mode === 'quick' ? (
                  <div className="flex flex-col gap-1">
                    {[...quickRows, ...(phase === 'playing' ? [{ kstDay: cur.kstDay, headline: cur.headline, nth: idx + 1, captures: -1 }] : [])].map((r) => (
                      <button key={r.kstDay} type="button" onClick={() => begin('battle', r.nth - 1)} className={`grid grid-cols-[46px_1fr_auto] items-baseline gap-2 rounded-md px-1 py-1 text-left ${r.captures < 0 ? 'bg-[#ece3d1]' : PAPER.hover}`} title="이날을 전투 재생으로 보기">
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>{r.kstDay.slice(5)}</span>
                        <span className="text-[12.5px] font-semibold leading-snug" style={SERIF}>{r.headline ? <Headline text={r.headline} /> : '기록'}</span>
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>{r.captures >= 0 ? `점령 ${r.captures}` : '…'}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  queue.map((q, i) => (
                    <section key={`${q.kstDay}-${q.session}`} className={i === 0 ? '' : 'mt-7'}>
                      <DayDivider kstDay={q.kstDay} nth={q.nth} headline={q.headline} battles={q.data.replay ? Object.keys(q.data.replay.events).length : null} dim={i < queue.length - 1} />
                      <div className={`mt-2 text-[13px] leading-[1.85] ${i < queue.length - 1 ? 'opacity-75' : ''}`}>
                        {q.data.replay ? (
                          <ChronicleReplayPanel
                            text={q.data.text}
                            replay={q.data.replay}
                            zones={zones.map((z) => ({ id: z.id, name: z.name, mapX: z.mapX, mapY: z.mapY }))}
                            layer={layer}
                            zoneColor={zoneColor}
                            onOwnerFlip={(zoneId, guild) => setOwners((o) => ({ ...o, [zoneId]: guild }))}
                            onNeutralize={(zoneId) => setOwners((o) => ({ ...o, [zoneId]: null }))}
                            onDone={() => { if (q.session === run.current) advance(q.nth - 1); }}
                            speed={speed}
                            pausedRef={pausedRef}
                          />
                        ) : (
                          <StaticChronicle text={q.data.text} zoneColor={zoneColor} />
                        )}
                      </div>
                    </section>
                  ))
                )}
                {phase === 'end' ? (
                  <section className="mt-8 text-center">
                    <div className={`flex items-center gap-2 font-mono text-[10px] ${PAPER.muted}`}><span className="h-px flex-1 bg-[#e2d9c6]" /><span>{ordinalKo(n)} 번째 날까지</span><span className="h-px flex-1 bg-[#e2d9c6]" /></div>
                    <div className="mt-3 text-[16px] font-bold" style={SERIF}>여기까지가 오늘의 대륙입니다</div>
                    <div className={`mt-1 text-[11px] ${PAPER.muted}`}>다음 기록은 자정에 열립니다 · 판도 차트에 전체 흐름이 펼쳐졌습니다</div>
                    <div className="mt-3 flex justify-center gap-2">
                      <button type="button" onClick={() => begin(mode, 0)} className="rounded-lg bg-[#8a4b23] px-3 py-2 text-[12px] font-bold text-white">⏮ 처음부터 다시</button>
                      <button type="button" onClick={() => { setPhase('idle'); setIdx(n - 1); setQueue([]); setQuickRows([]); setOwners(index.owners); }} className={`rounded-lg border px-3 py-2 text-[12px] font-bold ${PAPER.border} ${PAPER.hover}`}>지금의 대륙</button>
                    </div>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/** 날 구분선 — 두루마리 안에서 날이 바뀌는 자리. 지난 날은 흐리게. */
function DayDivider({ kstDay, nth, headline, battles, dim }: { kstDay: string; nth: number; headline: string; battles?: number | null; dim?: boolean }) {
  return (
    <div className={dim ? 'opacity-70' : ''}>
      <div className={`flex items-center gap-2 font-mono text-[10px] ${PAPER.muted}`}>
        <span className="h-px flex-1 bg-[#e2d9c6]" />
        <span>
          {ordinalKo(nth)} 번째 날 · {kstDay}
          {battles ? ` · 전투 ${battles}` : ''}
        </span>
        <span className="h-px flex-1 bg-[#e2d9c6]" />
      </div>
      {headline ? (
        <div className="mt-1.5 text-[14px] font-bold leading-snug" style={SERIF}>
          <Headline text={headline} />
        </div>
      ) : null}
    </div>
  );
}

/** 재생이 끝난 날의 정적 본문 — 마커를 칩으로(재생 패널과 같은 어휘, 종이 톤). */
function StaticChronicle({ text, zoneColor }: { text: string; zoneColor: (name: string) => string | null }) {
  return (
    <div className="flex flex-col gap-2.5">
      {text.split(/\n{2,}/).map((para, i) => {
        const parts: React.ReactNode[] = [];
        let last = 0;
        let k = 0;
        for (const m of para.matchAll(TOKEN_RE)) {
          if (m.index! > last) parts.push(para.slice(last, m.index));
          const kind = m[1]!;
          const name = m[2]!;
          if (kind === 'z') {
            const c = zoneColor(name);
            parts.push(
              <span key={k++} className="mx-px inline-block rounded-[3px] px-1 align-baseline text-[11px] font-semibold" style={{ backgroundColor: c ? `${c}33` : '#e2d9c6', color: c ?? '#2a251e', boxShadow: c ? `inset 0 0 0 1px ${c}55` : undefined }}>
                {name}
              </span>,
            );
          } else if (kind === 'g') {
            parts.push(<span key={k++} className="inline-block align-baseline font-semibold text-[#4b3a8a]">{name}</span>);
          } else {
            parts.push(<span key={k++} className="text-[#8a4b23] underline decoration-dotted underline-offset-2">{name}</span>);
          }
          last = m.index! + m[0].length;
        }
        if (last < para.length) parts.push(para.slice(last));
        return (
          <p key={i} className="whitespace-pre-line">
            {parts}
          </p>
        );
      })}
    </div>
  );
}

function Btn({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold ${disabled ? 'border-[#e2d9c6] text-[#b8ae9a]' : `${PAPER.border} ${PAPER.hover}`}`}
    >
      {label}
    </button>
  );
}
