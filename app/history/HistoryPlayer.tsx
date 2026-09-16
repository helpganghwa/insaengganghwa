'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { GuildEmblemImg } from '@/components/GuildEmblemImg';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { PAPER, SERIF } from '@/app/wiki/theme';
import type { HistoryDayData, HistoryGuildMeta, HistoryIndex } from '@/lib/game/history/types';

/**
 * 대륙의 역사 연속 재생(2026-09-16, 시안 v2 01) — 무대(지도) + 읽기 칸(재생 중 문장 강조) + 스크러버·조작.
 *  - 첫 진입은 정지 + 최신 지도(현재 소유). 재생을 누르면 첫날부터, 스크러버·전날·다음으로 임의 날짜부터.
 *  - 하루 = 그날 리플레이 스크립트(/api/history/day)를 ChronicleReplayPanel(배속·일시정지 지원)로 재생.
 *    끝나면 1.5초 날짜 카드 → 다음 날. 최신 공개일이 끝나면 끝 화면.
 *  - 소유 상태는 그날 스크립트의 beforeOwner에서 시작해 점령/중립화 콜백으로 갱신 → 우상단 집계가 실시간.
 *  - 길드 색·문양은 그날 리플레이 스냅샷(guilds)이 우선, 없으면 현재 값 → 초기 6일은 색 방패 폴백.
 */
type Phase = 'idle' | 'loading' | 'playing' | 'end';
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
  const { days, zones, edges, serverId } = index;
  const n = days.length;
  const [phase, setPhase] = useState<Phase>('idle');
  const [idx, setIdx] = useState<number>(n - 1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(2);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [owners, setOwners] = useState<Record<number, string | null>>(index.owners);
  const [meta, setMeta] = useState<Record<string, HistoryGuildMeta>>(index.guilds);
  const [dayData, setDayData] = useState<HistoryDayData | null>(null);
  // 이어 읽기(피드백 3) — 재생이 끝난 날의 본문은 위에 남기고, 새 날은 아래로 이어 붙인다. 스크러버로 뛰면 비운다.
  const [played, setPlayed] = useState<{ kstDay: string; headline: string; text: string }[]>([]);
  const readerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true); // 사용자가 위로 올려 읽는 중이면 자동 스크롤을 멈춘다
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bindLayer = useCallback((el: HTMLDivElement | null) => {
    layerRef.current = el;
    setLayer(el);
  }, []);
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState(0); // 재생 세션 — 같은 날을 다시 시작해도 패널이 리마운트되게 key에 섞는다
  const cache = useRef(new Map<string, HistoryDayData | null>());
  const run = useRef(0); // 재생 세션 토큰 — 스크러버로 뛰면 이전 로딩·타이머를 무효화
  const startAtRef = useRef<(k: number, continuous?: boolean) => Promise<void>>(async () => {});

  const zoneById = useMemo(() => new Map(zones.map((z) => [z.id, z])), [zones]);
  const regionColor = useCallback((region: string) => REGION_META[region as Region]?.color ?? '#a8a29e', []);
  const zoneColor = useCallback(
    (name: string) => {
      const z = zones.find((x) => x.name === name);
      return z ? regionColor(z.region) : null;
    },
    [zones, regionColor],
  );

  const fetchDay = useCallback(
    async (k: number): Promise<HistoryDayData | null> => {
      const d = days[k];
      if (!d) return null;
      if (cache.current.has(d.kstDay)) return cache.current.get(d.kstDay)!;
      try {
        const r = await fetch(`/api/history/day?s=${serverId}&day=${d.kstDay}`, { cache: 'force-cache' });
        const v = r.ok ? ((await r.json()) as HistoryDayData) : null;
        cache.current.set(d.kstDay, v);
        return v;
      } catch {
        return null;
      }
    },
    [days, serverId],
  );

  /** 하루가 끝났을 때 — 본문을 위에 남기고 곧바로 다음 날로(하루 카드 없음), 마지막이면 끝 화면(소유는 지금 상태로). */
  const advance = useCallback(
    (k: number) => {
      setDayData((d) => {
        if (d) setPlayed((p) => (p.some((x) => x.kstDay === d.kstDay) ? p : [...p, { kstDay: d.kstDay, headline: d.headline, text: d.text }]));
        return d;
      });
      if (k + 1 < n) void startAtRef.current(k + 1, true);
      else {
        setPhase('end');
        setOwners(index.owners);
      }
    },
    [n, index.owners],
  );

  /** k번째 날부터 재생 — 로딩 → 곧바로 재생. continuous=false(스크러버·버튼으로 뛴 경우)면 위에 쌓인 기록을 비운다. */
  const startAt = useCallback(
    async (k: number, continuous = false) => {
      if (k < 0 || k >= n) return;
      const token = ++run.current;
      pausedRef.current = false;
      setPaused(false);
      layerRef.current?.replaceChildren();
      if (!continuous) setPlayed([]);
      stickRef.current = true;
      setIdx(k);
      setSession((s) => s + 1);
      setPhase('loading');
      setDayData(null);
      const data = await fetchDay(k);
      if (token !== run.current) return;
      void fetchDay(k + 1); // 다음 날 미리
      const replay = data?.replay ?? null;
      if (replay) {
        setOwners({ ...replay.beforeOwner });
        const snap = Object.entries(replay.guilds).map(([g, v]) => [g, { color: v.color, emblemUrl: v.emblemUrl }] as const);
        setMeta((m) => ({ ...m, ...Object.fromEntries(snap) }));
      }
      setDayData(data);
      setPhase('playing');
      window.history.replaceState(null, '', `?s=${serverId}&day=${days[k]!.kstDay}`);
      if (!replay) {
        // 스크립트 없는 날 — 본문만 잠시 보여 주고 넘어간다.
        setTimeout(() => {
          if (token === run.current) advance(k);
        }, STATIC_DAY_MS / speed);
      }
    },
    [n, fetchDay, serverId, days, speed, advance],
  );
  useEffect(() => {
    startAtRef.current = startAt;
  }, [startAt]);

  // 자동 스크롤 — 재생 중 읽기 칸을 바닥에 붙여 둔다(사용자가 위로 올리면 멈추고, 다시 바닥 근처로 내리면 재개).
  useEffect(() => {
    if (phase !== 'playing') return;
    const el = readerRef.current;
    if (!el) return;
    const id = setInterval(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    }, 250);
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      clearInterval(id);
      el.removeEventListener('scroll', onScroll);
    };
  }, [phase, idx]);

  // ?day= 딥링크 — 첫 렌더 뒤 그날부터(동기 setState 회피: 다음 틱).
  useEffect(() => {
    if (!startDay) return;
    const k = days.findIndex((d) => d.kstDay === startDay);
    if (k < 0) return;
    const id = setTimeout(() => void startAtRef.current(k), 0);
    return () => clearTimeout(id);
  }, [startDay, days]);

  const togglePause = () => {
    if (phase === 'idle' || phase === 'end') {
      void startAt(0);
      return;
    }
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  };
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}/history?s=${serverId}&day=${days[idx]!.kstDay}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 클립보드 거부 — 무시 */
    }
  };

  // 실시간 영토 집계(상위 5)
  const legend = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of Object.values(owners)) if (g) c.set(g, (c.get(g) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [owners]);

  const cur = days[idx]!;
  const showingDay = phase === 'idle' ? days[n - 1]! : cur;
  const edgeLines = useMemo(
    () =>
      edges
        .map((e) => {
          const a = zoneById.get(e.a);
          const b = zoneById.get(e.b);
          return a && b ? { key: `${e.a}-${e.b}`, x1: a.mapX, y1: a.mapY, x2: b.mapX, y2: b.mapY } : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [edges, zoneById],
  );

  return (
    <main className="mx-auto w-full max-w-[1180px] px-0 py-0 md:px-6 md:py-6">
      <div className={`overflow-hidden border-y md:rounded-2xl md:border ${PAPER.card}`}>
        <div className="md:grid md:grid-cols-[390px_minmax(0,1fr)]">
          {/* ── 무대 — 게임 세계지도와 같은 390px 정사각(피드백 2). 모바일은 위에 고정. ── */}
          <div className="sticky top-14 z-20 md:static">
            <div className="mx-auto w-full bg-[#0c0a09]" style={{ maxWidth: STAGE_PX }}>
              <div className="relative isolate aspect-square w-full overflow-hidden bg-zinc-950">
                <div ref={bindLayer} aria-hidden className="pointer-events-none absolute inset-0 z-40" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mapSrc} alt="대륙 지도" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ imageRendering: 'pixelated' }} />
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                  {edgeLines.map((l) => (
                    <line key={`h${l.key}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#000" strokeOpacity={0.35} strokeWidth={0.9} strokeLinecap="round" />
                  ))}
                  {edgeLines.map((l) => (
                    <line key={`m${l.key}`} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} stroke="#cbd5e1" strokeOpacity={0.5} strokeWidth={0.5} strokeLinecap="round" />
                  ))}
                </svg>
                {zones.map((z) => {
                  const owner = owners[z.id] ?? null;
                  const m = owner ? meta[owner] : undefined;
                  const color = regionColor(z.region);
                  return (
                    <div
                      key={z.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2"
                      style={{ left: `${z.mapX}%`, top: `${z.mapY}%`, zIndex: owner ? 10 : 1 }}
                      title={`${z.name}${owner ? ` · ${owner}` : ''}`}
                    >
                      <span
                        className="relative block h-[17px] w-[17px] overflow-hidden rounded-[4px] ring-1 ring-black/70 transition-colors duration-500"
                        style={{
                          backgroundColor: owner ? (m?.color ? `${m.color}73` : `${color}55`) : 'rgba(10,12,20,0.45)',
                          boxShadow: owner ? `0 0 4px ${color}88` : 'none',
                          outline: `1px solid ${color}${owner ? '' : '88'}`,
                          outlineOffset: 0,
                        }}
                      >
                        {owner && m?.emblemUrl ? <GuildEmblemImg key={m.emblemUrl} src={m.emblemUrl} className="h-full w-full object-contain" /> : null}
                      </span>
                    </div>
                  );
                })}
                {/* 날짜 배지 — 날이 바뀔 때 조용히 바뀐다(카드 없음). */}
                <div key={showingDay.kstDay} className="absolute left-2.5 top-2 z-30 drop-shadow-[0_1px_2px_rgba(0,0,0,.9)] motion-safe:animate-[fadeIn_.5s_ease-out]">
                  <div className="text-[14px] font-bold text-stone-50" style={SERIF}>
                    {fmtDay(showingDay.kstDay)}
                  </div>
                  <div className="font-mono text-[10px] text-stone-300">
                    {phase === 'idle' ? `지금의 대륙 · ${n}일째` : `${ordinalKo(idx + 1)} 번째 날 · ${idx + 1} / ${n}`}
                    {paused ? ' · 일시정지' : phase === 'loading' ? ' · 펼치는 중' : ''}
                  </div>
                </div>
                {legend.length > 0 ? (
                  <div className="absolute right-2 top-2 z-30 min-w-[104px] rounded-lg bg-black/50 px-2 py-1.5 text-[10px] text-stone-100 backdrop-blur-[2px]">
                    {legend.map(([g, c]) => (
                      <div key={g} className="flex items-center justify-between gap-2 tabular-nums">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: meta[g]?.color ?? '#71717a' }} />
                          <span className="truncate">{g}</span>
                        </span>
                        <b className="font-mono font-medium">{c}</b>
                      </div>
                    ))}
                  </div>
                ) : null}
                {phase === 'end' ? (
                  <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/55">
                    <div className={`max-w-[82%] rounded-2xl border px-5 py-5 text-center shadow-2xl ${PAPER.card}`}>
                      <div className="text-[16px] font-bold" style={SERIF}>여기까지가 오늘의 대륙입니다</div>
                      <div className={`mt-1 text-[11px] ${PAPER.muted}`}>{ordinalKo(n)} 번째 날 · 다음 기록은 자정에 열립니다</div>
                      <div className="mt-3 flex justify-center gap-2">
                        <button type="button" onClick={() => void startAt(0)} className="rounded-lg bg-[#8a4b23] px-3 py-2 text-[12px] font-bold text-white">⏮ 처음부터 다시</button>
                        <button type="button" onClick={() => { setPhase('idle'); setIdx(n - 1); setPlayed([]); }} className={`rounded-lg border px-3 py-2 text-[12px] font-bold ${PAPER.border} ${PAPER.hover}`}>지금의 대륙</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            {/* ── 스크러버 + 조작 ── */}
            <div className={`border-t px-3 pb-3 pt-2 ${PAPER.border} ${PAPER.card}`}>
              <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                <input
                  type="range"
                  min={0}
                  max={n - 1}
                  value={phase === 'idle' ? n - 1 : idx}
                  onChange={(e) => void startAt(Number(e.target.value))}
                  aria-label="날짜"
                  className="h-1.5 w-full cursor-pointer accent-[#8a4b23]"
                  list="history-days"
                />
                <datalist id="history-days">
                  {days.map((d, i) => (
                    <option key={d.kstDay} value={i} label={d.kstDay} />
                  ))}
                </datalist>
                <div className={`mt-0.5 flex justify-between font-mono text-[9.5px] ${PAPER.muted}`}>
                  <span>{shortDay(days[0]!.kstDay)}</span>
                  <span className="font-semibold text-[#2a251e]">{shortDay(showingDay.kstDay)}</span>
                  <span>{shortDay(days[n - 1]!.kstDay)}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Btn onClick={() => void startAt(0)} label="⏮ 처음" />
                  <Btn onClick={() => void startAt((phase === 'idle' ? n : idx) - 1)} label="◀ 전날" disabled={phase !== 'idle' && idx === 0} />
                  <button
                    type="button"
                    onClick={togglePause}
                    className="rounded-lg bg-[#8a4b23] px-3.5 py-1.5 text-[12px] font-extrabold text-white"
                  >
                    {phase === 'idle' ? '▶ 처음부터 보기' : phase === 'end' ? '▶ 다시 보기' : paused ? '▶ 재생' : '❚❚ 일시정지'}
                  </button>
                  <Btn onClick={() => void startAt(idx + 1)} label="다음 날 ▶" disabled={phase === 'idle' || idx >= n - 1} />
                  <span className="mx-1 h-4 w-px bg-[#e2d9c6]" />
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      aria-pressed={speed === s}
                      className={`rounded-lg border px-2 py-1.5 font-mono text-[11px] font-bold ${speed === s ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.hover}`}`}
                    >
                      ×{s}
                    </button>
                  ))}
                  <button type="button" onClick={() => void copyLink()} className={`ml-auto rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${PAPER.border} ${PAPER.hover}`}>
                    {copied ? '복사됨' : '🔗 이 시점 링크'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ── 두루마리(읽기 칸) — 지난 날은 위에 남고 오늘이 아래로 이어진다(피드백 3). ── */}
          <div className={`flex min-h-[280px] flex-col border-t md:border-l md:border-t-0 ${PAPER.border}`}>
            {phase === 'idle' ? (
              <div className="flex flex-1 flex-col p-4 md:p-6">
                <div className="text-[18px] font-bold leading-snug" style={SERIF}>대륙의 역사</div>
                <div className={`mt-1 font-mono text-[10.5px] ${PAPER.muted}`}>
                  {days[0]!.kstDay} 부터 {days[n - 1]!.kstDay} 까지 · {n}일의 기록
                </div>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed">
                  점령전이 있던 날마다 이야기꾼이 남긴 기록을, 첫날부터 오늘까지 지도 위에 이어서 재생합니다. 재생 중에는 지금 읽는 문장이 이어지고, 구역이 뒤집힐 때마다 지도 우상단 집계가 바뀝니다.
                </p>
                <div className={`mt-4 text-[11px] ${PAPER.muted}`}>최근 기록</div>
                <div className="mt-1 text-[14px] font-semibold leading-snug" style={SERIF}>
                  <Headline text={days[n - 1]!.headline || '기록'} />
                </div>
                <button type="button" onClick={() => void startAt(0)} className="mt-5 self-start rounded-lg bg-[#8a4b23] px-4 py-2 text-[13px] font-extrabold text-white">
                  ▶ 처음부터 보기
                </button>
              </div>
            ) : (
              <div ref={readerRef} className="max-h-[56vh] flex-1 overflow-y-auto p-4 md:max-h-[640px] md:p-6">
                {played.map((d, i) => (
                  <section key={d.kstDay} className={i === 0 ? '' : 'mt-6'}>
                    <DayDivider kstDay={d.kstDay} nth={days.findIndex((x) => x.kstDay === d.kstDay) + 1} headline={d.headline} dim />
                    <div className={`mt-2 text-[13px] leading-[1.85] ${PAPER.muted}`}>
                      <StaticChronicle text={d.text} zoneColor={zoneColor} />
                    </div>
                  </section>
                ))}
                <section className={played.length > 0 ? 'mt-6' : ''}>
                  <DayDivider kstDay={cur.kstDay} nth={idx + 1} headline={cur.headline} battles={dayData?.replay ? Object.keys(dayData.replay.events).length : null} />
                  <div className="mt-2 text-[13px] leading-[1.85]">
                    {phase === 'loading' ? (
                      <p className={`text-[12px] ${PAPER.muted}`}>기록을 펼치는 중…</p>
                    ) : phase === 'playing' && dayData ? (
                      dayData.replay ? (
                        <ChronicleReplayPanel
                          key={`${cur.kstDay}-${session}`}
                          text={dayData.text}
                          replay={dayData.replay}
                          zones={zones.map((z) => ({ id: z.id, name: z.name, mapX: z.mapX, mapY: z.mapY }))}
                          layer={layer}
                          zoneColor={zoneColor}
                          onOwnerFlip={(zoneId, guild) => setOwners((o) => ({ ...o, [zoneId]: guild }))}
                          onNeutralize={(zoneId) => setOwners((o) => ({ ...o, [zoneId]: null }))}
                          onDone={() => advance(idx)}
                          speed={speed}
                          pausedRef={pausedRef}
                        />
                      ) : (
                        <StaticChronicle text={dayData.text} zoneColor={zoneColor} />
                      )
                    ) : phase === 'end' ? (
                      <p className={`text-[12px] ${PAPER.muted}`}>마지막 기록까지 재생했습니다.</p>
                    ) : null}
                  </div>
                </section>
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
