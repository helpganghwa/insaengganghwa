'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { PAPER, SERIF } from '@/app/wiki/theme';
import type {
  HistoryDayData,
  HistoryEvent,
  HistoryGuildMeta,
  HistoryIndex,
} from '@/lib/game/history/types';

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
const EVENT_PRIORITY: Record<HistoryEvent['kind'], number> = {
  leader: 0,
  sweep: 1,
  peak: 2,
  vanish: 3,
  rename: 4,
  disband: 5,
  power1: 6,
};
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
const fmtDay = (d: string) =>
  `${Number(d.slice(0, 4))}년 ${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;

/** 목표 구역에서 가장 가까운 지도 밖 가장자리(%) — 출발 구역이 없는 길드의 등장 지점(재생 엔진과 같은 규칙). */
function sameOwners(a: Record<number, string | null>, b: Record<number, string | null>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if ((a[Number(k)] ?? null) !== (b[Number(k)] ?? null)) return false;
  return true;
}

function nearestEdge(t: { mapX: number; mapY: number }): { x: number; y: number } {
  const cands = [
    { x: -6, y: t.mapY },
    { x: 106, y: t.mapY },
    { x: t.mapX, y: -8 },
    { x: t.mapX, y: 110 },
  ];
  let best = cands[0]!;
  let bd = Infinity;
  for (const c of cands) {
    const d = (c.x - t.mapX) ** 2 + (c.y - t.mapY) ** 2;
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  return best;
}
/** 문양 없는 길드의 색 방패(재생 엔진의 shieldFallback과 같은 모양). */
/** 문양 후보 — 그날 스냅샷 URL부터 시작해 이력에서 그 뒤의 문양들(스냅샷이 이력에 없으면 이력 전체를 뒤에). 첫 파일이 사라졌을 때 다음 문양으로 넘어가기 위한 순서. */
function emblemChainOf(
  history: Record<number, string[]>,
  g: HistoryGuildMeta | undefined,
): string[] {
  if (!g) return [];
  const hist = g.id != null ? (history[g.id] ?? []) : [];
  if (!g.emblemUrl) return hist;
  const k = hist.indexOf(g.emblemUrl);
  return k >= 0 ? hist.slice(k) : [g.emblemUrl, ...hist];
}

/** 노드 문양 — 후보를 차례로 시도하고 전부 실패하면 아무것도 그리지 않는다(밑에 깔린 머리글자가 보인다). */
function EmblemChain({ urls, className }: { urls: string[]; className: string }) {
  const [k, setK] = useState(0);
  const src = urls[k];
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      aria-hidden
      loading="lazy"
      decoding="async"
      onError={() => setK((i) => i + 1)}
      className={className}
      style={{ imageRendering: 'pixelated' }}
    />
  );
}

function shieldQuick(e: HTMLElement, color: string, guild: string): void {
  e.style.clipPath = 'polygon(50% 0,100% 18%,100% 62%,50% 100%,0 62%,0 18%)';
  e.style.background = color;
  e.textContent = guild.slice(0, 1);
  e.style.fontSize = '11px';
  e.style.fontWeight = '900';
  e.style.color = '#fff';
}

export function HistoryPlayer({
  index,
  mapSrc,
  startDay,
}: {
  index: HistoryIndex;
  mapSrc: string;
  startDay: string | null;
}) {
  const { days, zones, edges, serverId, story } = index;
  const n = days.length;
  const [phase, setPhase] = useState<Phase>('idle');
  const [mode, setMode] = useState<Mode>('battle');
  /** 무대 보기 — 지도(구역 타일 제자리) | 순위(타일이 길드별 줄로 모여 막대를 이룸). 사용자가 누를 때만 바뀐다. */
  const [stageView, setStageView] = useState<'map' | 'rank'>('map');
  const [idx, setIdx] = useState<number>(n - 1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1); // 게임과 같은 속도가 기본
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [owners, setOwners] = useState<Record<number, string | null>>(index.owners);
  const [meta, setMeta] = useState<Record<string, HistoryGuildMeta>>(index.guilds);
  const emblemChain = useCallback(
    (g: HistoryGuildMeta | undefined) => emblemChainOf(index.emblemHistory, g),
    [index.emblemHistory],
  );
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bindLayer = useCallback((el: HTMLDivElement | null) => {
    layerRef.current = el;
    setLayer(el);
  }, []);
  // 이어 읽기 — 시작한 날들을 한 목록에 쌓고 끝난 날의 재생 패널도 그대로 마운트해 둔다(정적으로 바꿔 그리면 튄다).
  const [queue, setQueue] = useState<
    { kstDay: string; headline: string; nth: number; data: HistoryDayData; session: number }[]
  >([]);
  // 빠른 흐름 — 날짜·헤드라인·점령 수 한 줄씩.
  const [quickRows, setQuickRows] = useState<
    { kstDay: string; headline: string; nth: number; captures: number }[]
  >([]);
  // 순간 자막(1위 교체·지역 석권·과반·소멸) — 소유가 바뀔 때 계산.
  const [subtitle, setSubtitle] = useState<{ kind: string; text: string; at: number } | null>(null);
  const metaRef = useRef<Record<string, HistoryGuildMeta>>(index.guilds);
  const baselineRef = useRef<{
    leader: string | null;
    regions: Record<string, string | null>;
    counts: Record<string, number>;
  } | null>(null);
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
  const regionColor = useCallback(
    (region: string) => REGION_META[region as Region]?.color ?? '#a8a29e',
    [],
  );
  const regionLabel = useCallback(
    (region: string) => REGION_META[region as Region]?.label ?? region,
    [],
  );
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
      for (const [g, c] of Object.entries(counts))
        if (c > best) {
          best = c;
          leader = g;
        }
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
    if (now.leader && base.leader && now.leader !== base.leader)
      text = {
        kind: '1위 교체',
        text: `${base.leader} ${base.counts[base.leader] ?? 0} → ${now.leader} ${now.counts[now.leader] ?? 0}`,
      };
    if (!text)
      for (const [r, g] of Object.entries(now.regions))
        if (g && base.regions[r] !== g) {
          text = { kind: '지역 석권', text: `${g}, ${regionLabel(r)} 전역` };
          break;
        }
    const half = Math.ceil(zones.length / 2);
    if (!text)
      for (const [g, c] of Object.entries(now.counts))
        if (c >= half && (base.counts[g] ?? 0) < half) {
          text = { kind: '과반', text: `${g}, 대륙 과반 ${c}곳` };
          break;
        }
    if (!text)
      for (const [g, c] of Object.entries(base.counts))
        if (c > 0 && !(now.counts[g] ?? 0)) {
          text = { kind: '소멸', text: `${g}, 대륙에서 사라지다` };
          break;
        }
    if (text) {
      setSubtitle({ ...text, at: Date.now() });
      baselineRef.current = now;
    }
  }, [owners, phase, summarize, regionLabel, zones.length]);
  // 자막 자동 소거.
  useEffect(() => {
    if (!subtitle) return;
    const id = setTimeout(
      () => setSubtitle((s) => (s && s.at === subtitle.at ? null : s)),
      SUBTITLE_MS / speed,
    );
    return () => clearTimeout(id);
  }, [subtitle, speed]);

  const fetchDay = useCallback(
    async (k: number): Promise<HistoryDayData | null> => {
      const d = days[k];
      if (!d) return null;
      if (cache.current.has(d.kstDay)) return cache.current.get(d.kstDay)!;
      try {
        const r = await fetch(`/api/history/day?s=${serverId}&day=${d.kstDay}&v=2`, {
          cache: 'no-store',
        });
        const v = r.ok ? ((await r.json()) as HistoryDayData) : null;
        cache.current.set(d.kstDay, v);
        return v;
      } catch {
        return null;
      }
    },
    [days, serverId],
  );

  /** 빠른 흐름 연출 — 출발 구역(없으면 가장 가까운 지도 밖 가장자리)에서 목표로 문양이 흘러가 닿으면 소유가 바뀐다.
   *  번쩍임만으로는 무엇이 어디로 갔는지 읽히지 않았다(09-16 제보). */
  const marchQuick = useCallback(
    (
      ev: { zoneId: number; winner: string; origins: Record<string, number | null> },
      g: HistoryGuildMeta | undefined,
      ms: number,
      onArrive: () => void,
    ) => {
      const to = zoneById.get(ev.zoneId);
      const l = layerRef.current;
      if (!to || !l) {
        onArrive();
        return;
      }
      const originId = ev.origins[ev.winner] ?? null;
      const from = originId != null ? zoneById.get(originId) : null;
      const fromPct = from ? { x: from.mapX, y: from.mapY } : nearestEdge(to);
      const e = document.createElement('div');
      const color = g?.color ?? '#71717a';
      e.style.cssText = `position:absolute;width:22px;height:26px;margin:-13px 0 0 -11px;z-index:40;display:flex;align-items:center;justify-content:center;left:${fromPct.x}%;top:${fromPct.y}%;filter:drop-shadow(0 0 5px ${color}cc);opacity:0;`;
      const urls = emblemChain(g);
      if (urls.length > 0) {
        const img = document.createElement('img');
        let k = 0;
        img.src = urls[0]!;
        img.alt = '';
        img.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';
        // 파일이 사라진 문양이면 이력의 다음 문양으로, 전부 실패하면 머리글자 방패.
        img.onerror = () => {
          k += 1;
          if (k < urls.length) img.src = urls[k]!;
          else {
            img.remove();
            shieldQuick(e, color, ev.winner);
          }
        };
        e.appendChild(img);
      } else shieldQuick(e, color, ev.winner);
      l.appendChild(e);
      const mid = {
        x: (fromPct.x + to.mapX) / 2 + (to.mapY - fromPct.y) * 0.15,
        y: (fromPct.y + to.mapY) / 2 - (to.mapX - fromPct.x) * 0.15,
      };
      const N = 16;
      const frames = Array.from({ length: N + 1 }, (_, i) => {
        const t = i / N;
        const u = 1 - t;
        return {
          left: `${(u * u * fromPct.x + 2 * u * t * mid.x + t * t * to.mapX).toFixed(2)}%`,
          top: `${(u * u * fromPct.y + 2 * u * t * mid.y + t * t * to.mapY).toFixed(2)}%`,
          opacity: i === 0 ? 0.2 : 1,
        };
      });
      const anim = e.animate(frames, {
        duration: ms,
        easing: 'cubic-bezier(0.4,0,0.35,1)',
        fill: 'forwards',
      });
      anim.finished
        .catch(() => {})
        .then(() => {
          onArrive();
          // 착지 — 부드러운 링 한 번, 문양은 잠시 머물다 사라진다.
          const f = document.createElement('div');
          f.style.cssText = `position:absolute;z-index:35;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:7px;left:${to.mapX}%;top:${to.mapY}%;pointer-events:none;`;
          l.appendChild(f);
          f.animate(
            [
              { boxShadow: `0 0 0 0 ${color}99`, background: `${color}66` },
              { boxShadow: `0 0 0 16px ${color}00`, background: `${color}00` },
            ],
            { duration: 1200, easing: 'ease-out', fill: 'forwards' },
          );
          setTimeout(() => f.remove(), 1250);
          e.animate(
            [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(0.6)' },
            ],
            { duration: 500, delay: 250, fill: 'forwards' },
          );
          setTimeout(() => e.remove(), 800);
        });
    },
    [zoneById, emblemChain],
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

  /** 빠른 흐름 — 그날 점령을 출발지에서 목표로 흘려보낸다. 점령이 많은 날은 그만큼 길어진다(최소 2.5초, 한 건당 0.32초). */
  const runQuick = useCallback(
    async (k: number, token: number, data: HistoryDayData) => {
      const replay = data.replay;
      const captures = replay
        ? Object.values(replay.events).filter((e) => e.type === 'capture')
        : [];
      const dayMs = Math.max(QUICK_DAY_MS, 320 * captures.length + 900) / speed;
      const stagger = captures.length > 0 ? (dayMs - 900 / speed) / captures.length : dayMs;
      const marchMs = Math.min(1100 / speed, Math.max(500 / speed, stagger * 2.4));
      const wait = async (ms: number) => {
        await new Promise((r) => setTimeout(r, ms));
        while (pausedRef.current && token === run.current)
          await new Promise((r) => setTimeout(r, 120));
      };
      let pending = 0;
      for (const ev of captures) {
        if (token !== run.current) return;
        pending++;
        const snap = replay?.guilds[ev.winner];
        const known = metaRef.current[ev.winner];
        marchQuick(
          ev,
          snap || known
            ? {
                color: snap?.color ?? known?.color ?? '#71717a',
                emblemUrl: snap?.emblemUrl ?? known?.emblemUrl ?? null,
                id: snap?.guildId ?? known?.id ?? null,
              }
            : undefined,
          marchMs,
          () => {
            pending--;
            if (token === run.current) setOwners((o) => ({ ...o, [ev.zoneId]: ev.winner }));
          },
        );
        await wait(stagger);
      }
      // 멈춤 없이 잇는다 — 마지막 문양이 닿는 시점에 다음 날의 첫 문양이 출발하도록 이동 시간만큼만 기다린다(여운 없음).
      await wait(captures.length > 0 ? Math.max(0, marchMs - stagger) : 900 / speed);
      void pending;
      if (token !== run.current) return;
      setQuickRows((q) =>
        q.some((r) => r.kstDay === data.kstDay)
          ? q
          : [
              ...q,
              {
                kstDay: data.kstDay,
                headline: data.headline,
                nth: k + 1,
                captures: captures.length,
              },
            ],
      );
      advance(k);
    },
    [speed, marchQuick, advance],
  );

  /** k번째 날부터 재생 — 이어 재생(continuous)이면 위에 쌓인 기록을 유지. */
  const startAt = useCallback(
    async (k: number, continuous = false) => {
      if (k < 0 || k >= n) return;
      const token = ++run.current;
      pausedRef.current = false;
      setPaused(false);
      if (!continuous) {
        // 새로 시작할 때만 지도를 비운다 — 이어 재생 중엔 전날의 마지막 문양·착지 링이 자연스럽게 사라지도록 둔다(날짜 경계의 '끊김' 원인).
        layerRef.current?.replaceChildren();
        setQueue([]);
        setQuickRows([]);
      }
      stickRef.current = true;
      setIdx(k);
      if (!continuous) setSubtitle(null); // 이어 재생 중엔 자막을 유지(시간 만료로만 사라짐) — 날짜 경계 깜박임 방지
      if (!continuous) setPhase('loading');
      const data = await fetchDay(k);
      if (token !== run.current) return;
      void fetchDay(k + 1);
      const replay = data?.replay ?? null;
      if (replay) {
        // 전날 결과 == 오늘 시작 상태라면 그대로 둔다(같은 값으로 다시 세팅하면 transition이 끊겨 깜박인다). 건너뛰기·처음 시작만 스냅.
        setOwners((o) => (sameOwners(o, replay.beforeOwner) ? o : { ...replay.beforeOwner }));
        baselineRef.current = summarize(replay.beforeOwner);
        const snap = Object.entries(replay.guilds).map(
          ([g, v]) => [g, { color: v.color, emblemUrl: v.emblemUrl, id: v.guildId }] as const,
        );
        setMeta((m) => ({ ...m, ...Object.fromEntries(snap) }));
      }
      setPhase('playing');
      if (!data) {
        setTimeout(() => {
          if (token === run.current) advance(k);
        }, 300);
        return;
      }
      if (modeRef.current === 'quick') {
        void runQuick(k, token, data);
        return;
      }
      setQueue((q) => [
        ...q,
        { kstDay: data.kstDay, headline: data.headline, nth: k + 1, data, session: token },
      ]);
      if (!replay)
        setTimeout(() => {
          if (token === run.current) advance(k);
        }, STATIC_DAY_MS / speed);
    },
    [n, fetchDay, speed, advance, runQuick, summarize],
  );
  useEffect(() => {
    startAtRef.current = startAt;
  }, [startAt]);
  useEffect(() => {
    metaRef.current = meta;
  }, [meta]);

  // 자동 스크롤 — 글자가 찍힐 때마다 바닥을 따라간다(위로 올리면 멈춤, 바닥 근처로 내리면 재개).
  useEffect(() => {
    const el = readerRef.current;
    if (!el || phase === 'idle') return;
    const mo = new MutationObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    const onScroll = () => {
      stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      mo.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
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
    if (phase === 'idle' || phase === 'end') {
      begin(mode, 0);
      return;
    }
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
  /**
   * 순위 배치(2026-09-16) — 지금 소유 상태로 길드별 줄을 만든다(구역 많은 순, 동률은 이름순). 각 구역 타일은 자기 길드
   * 줄의 j번째 칸으로 미끄러져 '타일로 된 막대'가 되고, 소유가 바뀌면 다른 줄로 건너간다. 좌표는 무대 %(폭이 줄어도 비율 유지).
   */
  const rank = useMemo(() => {
    const byGuild = new Map<string, number[]>();
    for (const z of zones) {
      const g = owners[z.id];
      if (!g) continue;
      const list = byGuild.get(g);
      if (list) list.push(z.id);
      else byGuild.set(g, [z.id]);
    }
    const rows = [...byGuild.entries()].sort(
      (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0], 'ko'),
    );
    const rowH = Math.min(8.5, 86 / Math.max(rows.length, 1));
    const top0 = 7;
    const labelW = 31;
    const pos = new Map<number, { left: number; top: number }>();
    const labels = rows.map(([guild, ids], k) => {
      const top = top0 + k * rowH;
      const step = Math.min(3.9, (100 - labelW - 3) / Math.max(ids.length, 1));
      [...ids]
        .sort((a, b) => a - b)
        .forEach((id, j) => pos.set(id, { left: labelW + 1.8 + j * step, top }));
      return { guild, count: ids.length, top };
    });
    return { pos, labels };
  }, [owners, zones]);
  const cur = days[idx]!;
  const showingDay = phase === 'idle' ? days[n - 1]! : cur;
  const dayEvents = phase === 'idle' ? [] : (story.events[cur.kstDay] ?? []);
  const edgeLines = useMemo(
    () =>
      edges
        .map((e) => {
          const a = zoneById.get(e.a);
          const b = zoneById.get(e.b);
          return a && b
            ? { key: `${e.a}-${e.b}`, x1: a.mapX, y1: a.mapY, x2: b.mapX, y2: b.mapY }
            : null;
        })
        .filter((x): x is NonNullable<typeof x> => !!x),
    [edges, zoneById],
  );
  // 시대 띠·사건 눈금
  // 눈금: 날마다 가장 큰 사건 하나. 라벨은 1위 교체·석권·최대/과반만(나머지는 눈금+툴팁), 위아래 줄을 번갈아 겹침을 피한다.
  const ticks = useMemo(() => {
    const out: { i: number; short: string; label: string; labeled: boolean; row: number }[] = [];
    let lastLabeled = -99;
    let lastRow = 1;
    for (let i = 0; i < days.length; i++) {
      const evs = story.events[days[i]!.kstDay];
      if (!evs?.length) continue;
      const e = [...evs].sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind])[0]!;
      const labeled = e.kind === 'leader' || e.kind === 'sweep' || e.kind === 'peak';
      let row = 0;
      if (labeled) {
        row = i - lastLabeled <= 3 ? 1 - lastRow : 0; // 사흘 안에 이웃 라벨이 있으면 반대 줄
        lastLabeled = i;
        lastRow = row;
      }
      out.push({ i, short: e.short, label: evs.map((x) => x.label).join(' · '), labeled, row });
    }
    return out;
  }, [days, story.events]);
  const curEra = story.eras.findIndex((e) => idx >= e.startIdx && idx <= e.endIdx);
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);

  return (
    <main className="mx-auto w-full max-w-[1180px] px-0 py-0 md:px-6 md:py-6">
      {/* overflow-hidden은 md에서만 — 모바일에서 카드가 overflow를 가지면 고정 묶음이 카드 기준으로 붙어 56px 밀려 두루마리를 가린다(로컬 검증). */}
      <div className={`border-y md:overflow-hidden md:rounded-2xl md:border ${PAPER.card}`}>
        {/* 배치 — 모바일: [지도·현황·조작](상단 고정) → 두루마리 → 차트. PC: 왼쪽 열 [지도·현황·조작·차트], 오른쪽 두루마리.
            같은 DOM으로 두 배치를 내려면 모바일 고정 묶음을 md에서 contents로 풀고 그리드 칸을 자식에 직접 준다. */}
        <div className="flex flex-col md:grid md:grid-cols-[390px_minmax(0,1fr)] md:grid-rows-[auto_auto_auto_auto_1fr]">
          <div className="sticky top-14 z-20 order-1 md:contents">
            <div
              className="mx-auto w-full bg-[#0c0a09] md:col-start-1 md:row-start-1"
              style={{ maxWidth: STAGE_PX }}
            >
              <div className="relative isolate aspect-square w-full overflow-hidden bg-zinc-950">
                <div
                  ref={bindLayer}
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 z-40 transition-opacity duration-500 ${stageView === 'rank' ? 'opacity-0' : ''}`}
                />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={mapSrc}
                  alt="대륙 지도"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{ imageRendering: 'pixelated' }}
                />
                {/* 순위 보기 — 지도를 어둡게 내려 막대·이름이 읽히게 한다. */}
                <div
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 z-[3] bg-[#14110d] transition-opacity duration-700 ${stageView === 'rank' ? 'opacity-80' : 'opacity-0'}`}
                />
                {/* 길(인접선) — 역사 화면에선 이동 경로가 아니라 배경이다: 게임의 비활성 톤(회색·얇게)으로 낮춘다(피드백: 길이 문양보다 눈에 띔). */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500 ${stageView === 'rank' ? 'opacity-0' : ''}`}
                >
                  {edgeLines.map((l) => (
                    <line
                      key={`h${l.key}`}
                      x1={l.x1}
                      y1={l.y1}
                      x2={l.x2}
                      y2={l.y2}
                      stroke="#000000"
                      strokeOpacity={0.25}
                      strokeWidth={0.8}
                      strokeLinecap="round"
                    />
                  ))}
                  {edgeLines.map((l) => (
                    <line
                      key={`m${l.key}`}
                      x1={l.x1}
                      y1={l.y1}
                      x2={l.x2}
                      y2={l.y2}
                      stroke="#e7dcc0"
                      strokeOpacity={0.35}
                      strokeWidth={0.45}
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
                {/* 영토 빛 — 소유 길드 색의 부드러운 원이 노드 밑에 깔려 지도가 '누구 땅'인지 색면으로 읽힌다. 소유가 바뀌면 700ms에 걸쳐 색이 흐른다. */}
                {zones.map((z) => {
                  const owner = owners[z.id] ?? null;
                  const c = owner
                    ? `color-mix(in srgb, ${meta[owner]?.color ?? '#9a917f'} 70%, white)`
                    : null;
                  return (
                    <div
                      key={`g${z.id}`}
                      aria-hidden
                      className="pointer-events-none absolute h-[52px] w-[52px] -translate-x-1/2 -translate-y-1/2 rounded-full transition-[opacity,background] duration-700"
                      style={{
                        left: `${z.mapX}%`,
                        top: `${z.mapY}%`,
                        zIndex: 4,
                        opacity: c && stageView === 'map' ? 1 : 0,
                        background: c
                          ? `radial-gradient(circle, color-mix(in srgb, ${c} 55%, transparent) 0%, color-mix(in srgb, ${c} 25%, transparent) 48%, transparent 70%)`
                          : 'transparent',
                      }}
                    />
                  );
                })}
                {zones.map((z) => {
                  const owner = owners[z.id] ?? null;
                  const m = owner ? meta[owner] : undefined;
                  const gc = m?.color ?? '#9a917f';
                  const color = regionColor(z.region);
                  const rp = stageView === 'rank' ? rank.pos.get(z.id) : undefined;
                  const size = stageView === 'rank' ? 14 : 19;
                  return (
                    <div
                      key={z.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top,opacity] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
                      style={{
                        left: `${rp ? rp.left : z.mapX}%`,
                        top: `${rp ? rp.top : z.mapY}%`,
                        zIndex: owner ? 10 : 6,
                        opacity: stageView === 'rank' && !rp ? 0 : 1,
                      }}
                      title={`${z.name}${owner ? ` · ${owner}` : ''}`}
                    >
                      <span
                        className="relative flex items-center justify-center overflow-hidden rounded-[5px] transition-[width,height,background-color] duration-500"
                        style={{
                          width: size,
                          height: size,
                          // 문양(대개 어두운 외곽선)이 읽히도록 타일은 길드색을 밝게 섞은 바탕, 테두리는 길드색 원색.
                          backgroundColor: owner
                            ? `color-mix(in srgb, ${gc} 40%, #fdfaf3)`
                            : 'rgba(10,12,20,0.55)',
                          boxShadow: owner
                            ? `0 0 0 2px ${gc}, 0 0 7px color-mix(in srgb, ${gc} 70%, white), 0 1px 2px #000`
                            : `0 0 0 1px ${color}77`,
                        }}
                      >
                        {owner ? (
                          <>
                            {/* 문양이 없거나(옛 회차) 파일이 사라진 URL이면 길드 첫 글자 — 빈 타일로 두지 않는다. */}
                            <span
                              className="absolute inset-0 flex items-center justify-center text-[10px] leading-none font-black"
                              style={{ color: gc, textShadow: '0 0 2px #fff' }}
                            >
                              {owner.slice(0, 1)}
                            </span>
                            <EmblemChain
                              key={m?.emblemUrl ?? 'none'}
                              urls={emblemChain(m)}
                              className="relative h-full w-full object-contain"
                            />
                          </>
                        ) : null}
                      </span>
                    </div>
                  );
                })}
                {/* 순위 줄 라벨 — 문양·이름·구역 수. 줄 순서가 바뀌면 top이 미끄러진다. */}
                {rank.labels.map((r) => {
                  const m = meta[r.guild];
                  const gc = m?.color ?? '#9a917f';
                  return (
                    <div
                      key={`r${r.guild}`}
                      className="pointer-events-none absolute flex -translate-y-1/2 items-center gap-1 transition-[top,opacity] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
                      style={{
                        left: '2%',
                        top: `${r.top}%`,
                        width: '29%',
                        zIndex: 12,
                        opacity: stageView === 'rank' ? 1 : 0,
                      }}
                    >
                      <span
                        className="relative flex h-[14px] w-[14px] shrink-0 items-center justify-center overflow-hidden rounded-[4px]"
                        style={{
                          backgroundColor: `color-mix(in srgb, ${gc} 40%, #fdfaf3)`,
                          boxShadow: `0 0 0 1.5px ${gc}`,
                        }}
                      >
                        <span
                          className="absolute inset-0 flex items-center justify-center text-[8px] leading-none font-black"
                          style={{ color: gc, textShadow: '0 0 2px #fff' }}
                        >
                          {r.guild.slice(0, 1)}
                        </span>
                        <EmblemChain
                          key={m?.emblemUrl ?? 'none'}
                          urls={emblemChain(m)}
                          className="relative h-full w-full object-contain"
                        />
                      </span>
                      <span
                        className="min-w-0 truncate text-[11px] leading-none font-bold text-[#f3ede2]"
                        style={{ textShadow: '0 1px 2px #000' }}
                      >
                        {r.guild}
                      </span>
                      <span
                        className="shrink-0 font-mono text-[10px] leading-none text-[#e7dcc0]"
                        style={{ textShadow: '0 1px 2px #000' }}
                      >
                        {r.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 현황 줄: 날짜 · 집계 · 순간 자막 · 이날의 사건 ── */}
            <div
              className={`border-t px-3 pt-2 pb-2 md:col-start-1 md:row-start-2 ${PAPER.border} ${PAPER.card}`}
            >
              <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                <div className="flex items-baseline justify-between gap-2">
                  <div className="text-[14px] font-bold" style={SERIF}>
                    {fmtDay(showingDay.kstDay)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-flex overflow-hidden rounded-md border text-[10px] font-bold ${PAPER.border}`}
                      role="group"
                      aria-label="무대 보기"
                    >
                      {(['map', 'rank'] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={stageView === v}
                          onClick={() => setStageView(v)}
                          className={`px-2 py-0.5 ${stageView === v ? 'bg-[#2a251e] text-[#fdfaf3]' : PAPER.muted}`}
                        >
                          {v === 'map' ? '지도' : '순위'}
                        </button>
                      ))}
                    </span>
                    <div className={`font-mono text-[10px] ${PAPER.muted}`}>
                      {phase === 'idle'
                        ? `지금의 대륙 · ${n}일째`
                        : `${ordinalKo(idx + 1)} 번째 날 · ${idx + 1} / ${n}`}
                      {paused
                        ? ' · 일시정지'
                        : phase === 'loading'
                          ? ' · 펼치는 중'
                          : mode === 'quick' && phase === 'playing'
                            ? ' · 빠른 흐름'
                            : ''}
                    </div>
                  </div>
                </div>
                {/* 헤드라인 줄 — 두 모드 모두 항상 한 줄(높이 고정). 재생 전엔 최근 기록. */}
                <div
                  className="mt-0.5 h-[20px] truncate text-[12.5px] leading-[20px] font-semibold"
                  style={SERIF}
                >
                  <Headline text={showingDay.headline || '기록'} />
                </div>
                {legend.length > 0 ? (
                  <div className="mt-1 flex h-[18px] flex-nowrap gap-x-3 overflow-hidden text-[11px] tabular-nums">
                    {legend.map(([g, c]) => (
                      <span key={g} className="inline-flex items-center gap-1.5">
                        <i
                          className="inline-block h-2 w-2 rounded-full ring-1 ring-black/20"
                          style={{ background: meta[g]?.color ?? '#9a917f' }}
                        />
                        <span className="font-semibold">{g}</span>
                        <b className={`font-mono font-medium ${PAPER.muted}`}>{c}</b>
                      </span>
                    ))}
                  </div>
                ) : null}
                {/* 자막·사건 칩은 자리를 항상 확보한다 — 높이가 들쭉날쭉하면 아래 조작 줄이 날마다 튀어 흐름이 끊겨 보인다(피드백). */}
                {phase !== 'idle' ? (
                  <>
                    <div className="mt-1.5 flex h-[30px] items-center">
                      {subtitle ? (
                        <div
                          key={subtitle.at}
                          className="flex h-full w-full items-center gap-2 rounded-lg border border-[#f0c987] bg-[#fff3d6] px-2.5 text-[11.5px] text-[#2a251e] motion-safe:animate-[fadeIn_.4s_ease-out]"
                        >
                          <span className="rounded-full bg-[#8a4b23] px-2 py-px font-mono text-[9.5px] font-bold text-white">
                            {subtitle.kind}
                          </span>
                          <span className="min-w-0 truncate">{subtitle.text}</span>
                        </div>
                      ) : (
                        <div
                          className={`h-full w-full rounded-lg border border-dashed ${PAPER.border} ${phase === 'playing' ? 'opacity-40' : 'opacity-0'}`}
                          aria-hidden
                        />
                      )}
                    </div>
                    <div className="mt-1 flex h-[20px] flex-nowrap gap-1 overflow-hidden">
                      {dayEvents.slice(0, 3).map((e, i) => (
                        <span
                          key={i}
                          title={e.label}
                          className={`shrink-0 rounded-full border px-2 text-[10px] leading-[18px] ${e.kind === 'leader' || e.kind === 'sweep' ? 'border-[#8a4b23] font-bold text-[#8a4b23]' : `${PAPER.border} ${PAPER.muted}`}`}
                        >
                          {e.label}
                        </span>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            </div>

            {/* ── 시대 띠 + 스크러버 + 조작(한 줄) ── */}
            <div
              className={`border-t px-3 pt-1.5 pb-2 md:col-start-1 md:row-start-3 ${PAPER.border} ${PAPER.card}`}
            >
              <div className="mx-auto" style={{ maxWidth: STAGE_PX }}>
                {story.eras.length > 0 ? (
                  <>
                    <div
                      className="flex h-2.5 overflow-hidden rounded-[5px] border border-[#e2d9c6]"
                      role="list"
                      aria-label="시대"
                    >
                      {story.eras.map((e, i) => (
                        <button
                          key={i}
                          type="button"
                          title={`「${e.name}」의 시대 · ${days[e.startIdx]!.kstDay} ~ ${days[e.endIdx]!.kstDay}`}
                          onClick={() => void startAt(e.startIdx)}
                          className="h-full border-r border-[#f5f0e6] last:border-r-0"
                          style={{
                            width: `${((e.endIdx - e.startIdx + 1) / n) * 100}%`,
                            background: e.color ?? '#9a917f',
                            opacity: i === curEra || phase === 'idle' ? 1 : 0.45,
                          }}
                        />
                      ))}
                    </div>
                    <div className="relative mt-0.5 h-3 md:h-6">
                      {ticks.map((t) => (
                        <button
                          key={t.i}
                          type="button"
                          title={`${days[t.i]!.kstDay} · ${t.label}`}
                          onClick={() => void startAt(t.i)}
                          className="absolute top-0 -translate-x-1/2"
                          style={{ left: `${pct(t.i)}%` }}
                        >
                          <span
                            className={`mx-auto block w-px ${t.labeled ? 'h-2 bg-[#8a4b23]' : 'h-1.5 bg-[#b8ae9a]'}`}
                          />
                          {t.labeled ? (
                            <span
                              className={`hidden font-mono text-[8px] leading-none whitespace-nowrap text-[#8a4b23] md:block ${t.row === 1 ? 'mt-2' : ''}`}
                            >
                              {t.short}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 hidden gap-1 overflow-x-auto pb-0.5 md:flex">
                      {story.eras.map((e, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => void startAt(e.startIdx)}
                          className={`shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] ${i === curEra && phase !== 'idle' ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.hover}`}`}
                        >
                          「{e.name}」의 시대 · {e.endIdx - e.startIdx + 1}일
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <input
                  type="range"
                  min={0}
                  max={n - 1}
                  value={phase === 'idle' ? n - 1 : idx}
                  onChange={(e) => void startAt(Number(e.target.value))}
                  aria-label="날짜"
                  className="mt-1 h-1.5 w-full cursor-pointer accent-[#8a4b23]"
                />
                <div
                  className={`mt-0.5 flex justify-between font-mono text-[9.5px] ${PAPER.muted}`}
                >
                  <span>{shortDay(days[0]!.kstDay)}</span>
                  <span className="font-semibold text-[#2a251e]">
                    {shortDay(showingDay.kstDay)}
                  </span>
                  <span>{shortDay(days[n - 1]!.kstDay)}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-1">
                  <Btn onClick={() => void startAt(0)} label="⏮" title="처음부터" />
                  <Btn
                    onClick={() => void startAt((phase === 'idle' ? n : idx) - 1)}
                    label="◀"
                    title="전날"
                    disabled={phase !== 'idle' && idx === 0}
                  />
                  <button
                    type="button"
                    onClick={togglePause}
                    className="min-w-[88px] rounded-lg bg-[#8a4b23] px-3 py-1.5 text-[12px] font-extrabold text-white"
                  >
                    {phase === 'idle'
                      ? '▶ 처음부터'
                      : phase === 'end'
                        ? '▶ 다시'
                        : paused
                          ? '▶ 재생'
                          : '❚❚ 일시정지'}
                  </button>
                  <Btn
                    onClick={() => void startAt(idx + 1)}
                    label="▶"
                    title="다음 날"
                    disabled={phase === 'idle' || idx >= n - 1}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)
                    }
                    title="배속(누를 때마다 ×1 → ×2 → ×4)"
                    className={`rounded-lg border px-2 py-1.5 font-mono text-[11px] font-bold ${speed === 1 ? `${PAPER.border} ${PAPER.hover}` : 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]'}`}
                  >
                    ×{speed}
                  </button>
                  <span
                    className={`ml-auto inline-flex overflow-hidden rounded-lg border ${PAPER.border}`}
                    role="group"
                    aria-label="재생 방식"
                  >
                    {(['battle', 'quick'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        aria-pressed={mode === m}
                        className={`px-2 py-1.5 text-[11px] font-bold ${mode === m ? 'bg-[#2a251e] text-[#f5f0e6]' : PAPER.hover}`}
                      >
                        {m === 'battle' ? '전투' : '빠른'}
                      </button>
                    ))}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── 두루마리 — 모바일은 고정 묶음 아래(order-2), PC는 오른쪽 열 전체 ── */}
          <div
            className={`order-2 flex min-h-[220px] flex-col border-t md:col-start-2 md:row-span-5 md:row-start-1 md:border-t-0 md:border-l ${PAPER.border}`}
          >
            {phase === 'idle' ? (
              <div className="flex flex-1 flex-col p-4 md:p-6">
                <div className="text-[18px] leading-snug font-bold" style={SERIF}>
                  대륙의 역사
                </div>
                <div className={`mt-1 font-mono text-[10.5px] ${PAPER.muted}`}>
                  {days[0]!.kstDay} 부터 {days[n - 1]!.kstDay} 까지 · {n}일의 기록 · 시대{' '}
                  {story.eras.length}
                </div>
                <p className="mt-3 max-w-[60ch] text-[13px] leading-relaxed">
                  점령전이 있던 날마다 이야기꾼이 남긴 기록을 첫날부터 오늘까지 지도 위에 이어서
                  재생합니다. 1위가 바뀌는 날을 경계로 시대가 나뉘고, 구역이 뒤집힐 때마다 판도
                  차트가 자랍니다.
                </p>
                {story.eras.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {story.eras.map((e, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => begin('battle', e.startIdx)}
                        className={`flex w-full items-center justify-between rounded-lg border px-3 py-1.5 text-left text-[12.5px] ${PAPER.border} ${PAPER.hover}`}
                      >
                        <span className="flex items-center gap-2">
                          <i
                            className="inline-block h-2.5 w-2.5 rounded-sm"
                            style={{ background: e.color ?? '#9a917f' }}
                          />
                          <span className="font-semibold" style={SERIF}>
                            「{e.name}」의 시대
                          </span>
                        </span>
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>
                          {days[e.startIdx]!.kstDay.slice(5)} ~ {days[e.endIdx]!.kstDay.slice(5)} ·{' '}
                          {e.endIdx - e.startIdx + 1}일
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => begin('quick', 0)}
                    className="rounded-lg bg-[#8a4b23] px-4 py-2 text-[13px] font-extrabold text-white"
                  >
                    ⏩ 1분 만에 보기
                  </button>
                  <button
                    type="button"
                    onClick={() => begin('battle', 0)}
                    className={`rounded-lg border px-4 py-2 text-[13px] font-extrabold ${PAPER.border} ${PAPER.hover}`}
                  >
                    ▶ 처음부터 자세히
                  </button>
                </div>
              </div>
            ) : (
              <div
                ref={readerRef}
                className="max-h-[max(220px,calc(100dvh-600px))] flex-1 overflow-y-auto p-4 md:max-h-[calc(100dvh-7.5rem)] md:p-6"
              >
                {queue.length === 0 && quickRows.length === 0 && phase === 'loading' ? (
                  <p className={`text-[12px] ${PAPER.muted}`}>기록을 펼치는 중…</p>
                ) : null}
                {mode === 'quick' ? (
                  <div className="flex flex-col gap-1">
                    {[
                      ...quickRows,
                      ...(phase === 'playing'
                        ? [
                            {
                              kstDay: cur.kstDay,
                              headline: cur.headline,
                              nth: idx + 1,
                              captures: -1,
                            },
                          ]
                        : []),
                    ].map((r) => (
                      <button
                        key={r.kstDay}
                        type="button"
                        onClick={() => begin('battle', r.nth - 1)}
                        className={`grid grid-cols-[46px_1fr_auto] items-baseline gap-2 rounded-md px-1 py-1 text-left ${r.captures < 0 ? 'bg-[#ece3d1]' : PAPER.hover}`}
                        title="이날을 전투 재생으로 보기"
                      >
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>
                          {r.kstDay.slice(5)}
                        </span>
                        <span className="text-[12.5px] leading-snug font-semibold" style={SERIF}>
                          {r.headline ? <Headline text={r.headline} /> : '기록'}
                        </span>
                        <span className={`font-mono text-[10px] ${PAPER.muted}`}>
                          {r.captures >= 0 ? `점령 ${r.captures}` : '…'}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : (
                  queue.map((q, i) => (
                    <section
                      key={`${q.kstDay}-${q.session}`}
                      className={`${i === 0 ? '' : 'mt-5'} ${i === queue.length - 1 && i > 0 ? 'motion-safe:animate-[fadeIn_.6s_ease-out]' : ''}`}
                    >
                      <DayDivider
                        kstDay={q.kstDay}
                        nth={q.nth}
                        headline={q.headline}
                        battles={q.data.replay ? Object.keys(q.data.replay.events).length : null}
                        dim={i < queue.length - 1}
                      />
                      <div
                        className={`mt-2 text-[13px] leading-[1.85] transition-opacity duration-1000 ${i < queue.length - 1 ? 'opacity-70' : ''}`}
                      >
                        {q.data.replay ? (
                          <ChronicleReplayPanel
                            text={q.data.text}
                            replay={q.data.replay}
                            zones={zones.map((z) => ({
                              id: z.id,
                              name: z.name,
                              mapX: z.mapX,
                              mapY: z.mapY,
                            }))}
                            layer={layer}
                            zoneColor={zoneColor}
                            onOwnerFlip={(zoneId, guild) =>
                              setOwners((o) => ({ ...o, [zoneId]: guild }))
                            }
                            onNeutralize={(zoneId) => setOwners((o) => ({ ...o, [zoneId]: null }))}
                            onDone={() => {
                              if (q.session === run.current) advance(q.nth - 1);
                            }}
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
                    <div className={`flex items-center gap-2 font-mono text-[10px] ${PAPER.muted}`}>
                      <span className="h-px flex-1 bg-[#e2d9c6]" />
                      <span>{ordinalKo(n)} 번째 날까지</span>
                      <span className="h-px flex-1 bg-[#e2d9c6]" />
                    </div>
                    <div className="mt-3 text-[16px] font-bold" style={SERIF}>
                      여기까지가 오늘의 대륙입니다
                    </div>
                    <div className={`mt-1 text-[11px] ${PAPER.muted}`}>
                      다음 기록은 자정에 열립니다 · 판도 차트에 전체 흐름이 펼쳐졌습니다
                    </div>
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => begin(mode, 0)}
                        className="rounded-lg bg-[#8a4b23] px-3 py-2 text-[12px] font-bold text-white"
                      >
                        ⏮ 처음부터 다시
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPhase('idle');
                          setIdx(n - 1);
                          setQueue([]);
                          setQuickRows([]);
                          setOwners(index.owners);
                        }}
                        className={`rounded-lg border px-3 py-2 text-[12px] font-bold ${PAPER.border} ${PAPER.hover}`}
                      >
                        지금의 대륙
                      </button>
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
function DayDivider({
  kstDay,
  nth,
  headline,
  battles,
  dim,
}: {
  kstDay: string;
  nth: number;
  headline: string;
  battles?: number | null;
  dim?: boolean;
}) {
  return (
    <div className={`transition-opacity duration-1000 ${dim ? 'opacity-70' : ''}`}>
      <div className={`flex items-center gap-2 font-mono text-[10px] ${PAPER.muted}`}>
        <span className="h-px flex-1 bg-[#e2d9c6]" />
        <span>
          {ordinalKo(nth)} 번째 날 · {kstDay}
          {battles ? ` · 전투 ${battles}` : ''}
        </span>
        <span className="h-px flex-1 bg-[#e2d9c6]" />
      </div>
      {headline ? (
        <div className="mt-1.5 text-[14px] leading-snug font-bold" style={SERIF}>
          <Headline text={headline} />
        </div>
      ) : null}
    </div>
  );
}

/** 재생이 끝난 날의 정적 본문 — 마커를 칩으로(재생 패널과 같은 어휘, 종이 톤). */
function StaticChronicle({
  text,
  zoneColor,
}: {
  text: string;
  zoneColor: (name: string) => string | null;
}) {
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
              <span
                key={k++}
                className="mx-px inline-block rounded-[3px] px-1 align-baseline text-[11px] font-semibold"
                style={{
                  backgroundColor: c ? `${c}33` : '#e2d9c6',
                  color: c ?? '#2a251e',
                  boxShadow: c ? `inset 0 0 0 1px ${c}55` : undefined,
                }}
              >
                {name}
              </span>,
            );
          } else if (kind === 'g') {
            parts.push(
              <span key={k++} className="inline-block align-baseline font-semibold text-[#4b3a8a]">
                {name}
              </span>,
            );
          } else {
            parts.push(
              <span
                key={k++}
                className="text-[#8a4b23] underline decoration-dotted underline-offset-2"
              >
                {name}
              </span>,
            );
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

function Btn({
  onClick,
  label,
  disabled,
  title,
}: {
  onClick: () => void;
  label: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold ${disabled ? 'border-[#e2d9c6] text-[#b8ae9a]' : `${PAPER.border} ${PAPER.hover}`}`}
    >
      {label}
    </button>
  );
}
