'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EmblemChain, GuildInline } from '@/components/EmblemChain';
import { ChronicleReplayPanel } from '@/app/(game)/guild/map/ChronicleReplay';
import { REGION_META, type Region } from '@/lib/game/guild/region-meta';
import { PAPER, SERIF } from '@/app/wiki/theme';
import type {
  HistoryDay,
  HistoryDayData,
  HistoryEra,
  HistoryEvent,
  HistoryGuildMeta,
  HistoryIndex,
  HistoryScene,
} from '@/lib/game/history/types';
import { assetUrl } from '@/lib/asset-versions';
import { HistoryRace } from './HistoryRace';

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
/** 본문·헤드라인에는 길드 문양을 붙이지 않는다(2026-09-17 사용자 지시) — 색 굵은 이름만. */
const NO_EMBLEM = (): readonly string[] => [];

const TOKEN_RE = /\{([guz])\|([^}|]+)(?:\|[^}]*)?\}+/g;
/** 헤드라인·카드용 칩 렌더 — 재생 본문은 패널이 그린다. */
function Headline({
  text,
  className = '',
  guildColor,
  guildEmblem,
}: {
  text: string;
  className?: string;
  /** 길드명 색(없으면 기본 보라). */
  guildColor?: (name: string) => string | null;
  /** 길드 문양 후보 — 주면 이름 앞에 작은 문양. */
  guildEmblem?: (name: string) => readonly string[];
}) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    const kind = m[1]!;
    const name = m[2]!;
    const gc = kind === 'g' ? (guildColor?.(name) ?? null) : null;
    if (kind === 'g' && guildEmblem) {
      parts.push(
        <GuildInline
          key={i++}
          name={name}
          shown={name}
          color={gc}
          urls={guildEmblem(name)}
          className="px-0.5"
        />,
      );
    } else {
      parts.push(
        <span
          key={i++}
          className={
            kind === 'g'
              ? `inline-block px-0.5 font-bold ${gc ? '' : 'text-[#4b3a8a]'}`
              : 'inline-block px-0.5 font-medium'
          }
          style={gc ? { color: gc } : undefined}
        >
          {name}
        </span>,
      );
    }
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
  /** 등장 방식 — 문단(기본) | 타이핑(느린 세밀 재생). */
  const [reveal, setReveal] = useState<'paragraph' | 'type'>('paragraph');
  /** 무대 표시 크기(px) — 원본 390(사용자 확정 2026-09-17, 확대 안 함). 좁은 화면만 폭에 맞춰 줄인다. */
  const [stageSize, setStageSize] = useState(STAGE_PX);
  useEffect(() => {
    const calc = () => setStageSize(Math.max(280, Math.min(STAGE_PX, window.innerWidth - 32)));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const stageScale = stageSize / STAGE_PX;
  /** 그날의 장면 지역 — 날이 시작될 때 2.2초 동안 그 지역 타일이 밝아진다. */
  const [focusRegion, setFocusRegion] = useState<string | null>(null);
  /** 오른쪽 정보 열의 '이날의 장면' — 재생 중인 날의 장면(정지 땐 오늘). */
  const [curScene, setCurScene] = useState<HistoryScene | null>(null);
  const [idx, setIdx] = useState<number>(n - 1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1); // 게임과 같은 속도가 기본
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [owners, setOwners] = useState<Record<number, string | null>>(index.owners);
  const [meta, setMeta] = useState<Record<string, HistoryGuildMeta>>(index.guilds);
  /** 길드명 색 — 연대기 본문·헤드라인에서 지역색 대신 길드색을 강조(2026-09-17). */
  const guildColor = useCallback((name: string) => meta[name]?.color ?? null, [meta]);
  const emblemChain = useCallback(
    (g: HistoryGuildMeta | undefined) => emblemChainOf(index.emblemHistory, g),
    [index.emblemHistory],
  );
  /** 본문·헤드라인의 인라인 길드 타일용 문양 후보. */
  const guildEmblem = useCallback((name: string) => emblemChain(meta[name]), [meta, emblemChain]);
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
  const metaRef = useRef<Record<string, HistoryGuildMeta>>(index.guilds);
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
  const regionColor = useCallback(
    (region: string) => REGION_META[region as Region]?.color ?? '#a8a29e',
    [],
  );
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
      if (!continuous) setPhase('loading');
      const data = await fetchDay(k);
      if (token !== run.current) return;
      void fetchDay(k + 1);
      const replay = data?.replay ?? null;
      setCurScene(data?.scene ?? null);
      // 그날의 장면 지역을 잠깐 밝힌다.
      if (data?.scene?.region) {
        const region = data.scene.region;
        setFocusRegion(region);
        setTimeout(() => setFocusRegion((r) => (r === region ? null : r)), 2200);
      }
      if (replay) {
        // 전날 결과 == 오늘 시작 상태라면 그대로 둔다(같은 값으로 다시 세팅하면 transition이 끊겨 깜박인다). 건너뛰기·처음 시작만 스냅.
        setOwners((o) => (sameOwners(o, replay.beforeOwner) ? o : { ...replay.beforeOwner }));
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
    [n, fetchDay, speed, advance, runQuick],
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
    // 페이지 스크롤 기준(집중판) — 새 글자가 붙어 기록의 아래가 화면 밖으로 나가면 그만큼만 따라 내린다.
    const mo = new MutationObserver(() => {
      if (!stickRef.current) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 32)
        window.scrollBy({ top: r.bottom - window.innerHeight + 32 });
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

  const cur = days[idx]!;
  const showingDay = phase === 'idle' ? days[n - 1]! : cur;
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
  // 사건 눈금 — 날마다 가장 큰 사건 하나. 라벨 없이 눈금+툴팁, 1위 교체·석권·최대만 진한 눈금.
  const ticks = useMemo(() => {
    const out: { i: number; label: string; big: boolean }[] = [];
    for (let i = 0; i < days.length; i++) {
      const evs = story.events[days[i]!.kstDay];
      if (!evs?.length) continue;
      const e = [...evs].sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind])[0]!;
      out.push({
        i,
        label: evs.map((x) => x.label).join(' · '),
        big: e.kind === 'leader' || e.kind === 'sweep' || e.kind === 'peak',
      });
    }
    return out;
  }, [days, story.events]);
  const pct = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * 100);
  // 정지 화면 — 오늘(최신 공개일)의 기록 전문을 오른쪽에 깔아 재생 전에도 읽을 것이 있게 한다(2026-09-17 집중판).
  const [latest, setLatest] = useState<HistoryDayData | null>(null);
  useEffect(() => {
    if (phase !== 'idle' || n === 0) return;
    let alive = true;
    void fetchDay(n - 1).then((d) => {
      if (alive) setLatest(d);
    });
    return () => {
      alive = false;
    };
  }, [phase, fetchDay, n]);
  const statusText =
    (phase === 'idle'
      ? `지금의 대륙 · ${n}일째`
      : `${ordinalKo(idx + 1)} 번째 날 · ${idx + 1} / ${n}`) +
    (paused
      ? ' · 일시정지'
      : phase === 'loading'
        ? ' · 펼치는 중'
        : mode === 'quick' && phase === 'playing'
          ? ' · 빠른 흐름'
          : '');
  const isPlaying = phase === 'playing' && !paused;
  const ownedCount = Object.values(owners).filter(Boolean).length;
  /** 판도 한 줄 — 길드별 보유 수(많은 순). */
  const share = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of Object.values(owners)) if (g) c.set(g, (c.get(g) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [owners]);
  const eraStartIdx = useMemo(() => new Set(story.eras.map((e) => e.startIdx)), [story.eras]);
  const curEraIdx =
    phase === 'idle'
      ? story.eras.length - 1
      : story.eras.findIndex((e) => idx >= e.startIdx && idx <= e.endIdx);

  return (
    <main className="mx-auto w-full max-w-[1360px] px-4 pt-4 pb-24 md:h-[calc(100dvh-56px)] md:px-6 md:pt-5 md:pb-20">
      {/* 3분할(2026-09-17 상세 수정) — 세로 스크롤 없이 화면 높이에 맞춘다: 지도 | 글(열 안에서 스크롤) | 순위 바 레이스·장면·시대. 조작은 화면 하단 플로팅. */}
      <div className="flex flex-col gap-6 md:grid md:h-full md:grid-cols-[390px_minmax(0,1fr)] md:items-stretch md:gap-8 xl:grid-cols-[390px_minmax(0,1fr)_300px]">
        <aside className="md:flex md:h-full md:min-h-0 md:flex-col">
          {/* 시대 띠(스크러버) — 지도 위 */}
          <div>
            <div className="relative">
              <div
                className="flex h-[18px] overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]"
                role="list"
                aria-label="시대"
              >
                {story.eras.map((e, i) => {
                  const len = e.endIdx - e.startIdx + 1;
                  const future = phase !== 'idle' && e.startIdx > idx;
                  return (
                    <div
                      key={i}
                      role="listitem"
                      className="flex h-full items-center overflow-hidden px-1.5 text-[10px] font-bold whitespace-nowrap text-[#f7f2e8] transition-opacity duration-500"
                      style={{
                        width: `${(len / n) * 100}%`,
                        background: e.color ?? '#9a917f',
                        opacity: future ? 0.35 : 1,
                      }}
                    >
                      {len >= 4
                        ? `「${e.name}」의 시대 · ${len}일`
                        : len >= 2
                          ? `${e.name} ${len}`
                          : ''}
                    </div>
                  );
                })}
              </div>
              {/* 스크러버 — 띠 위에 투명하게 겹친 range. 클릭·드래그로 그날부터. */}
              <input
                type="range"
                min={0}
                max={n - 1}
                value={phase === 'idle' ? n - 1 : idx}
                onChange={(e) => void startAt(Number(e.target.value))}
                aria-label="날짜"
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <span
                aria-hidden
                className="pointer-events-none absolute -top-[3px] h-[24px] w-[3px] rounded-[2px] bg-[#8a4b23] shadow-[0_0_0_2px_#fdfaf3] transition-[left] duration-300"
                style={{ left: `calc(${pct(phase === 'idle' ? n - 1 : idx)}% - 1.5px)` }}
              />
            </div>
            {/* 사건 눈금 — 라벨 없이, 올리면 툴팁. 진한 눈금 = 1위 교체·석권·최대. */}
            <div className="relative mt-[3px] h-[6px]">
              {ticks.map((t) => (
                <button
                  key={t.i}
                  type="button"
                  title={`${days[t.i]!.kstDay} · ${t.label}`}
                  aria-label={`${days[t.i]!.kstDay} ${t.label}`}
                  onClick={() => void startAt(t.i)}
                  className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-b-[5px] border-x-transparent"
                  style={{
                    left: `${pct(t.i)}%`,
                    borderBottomColor: t.big ? '#8a4b23' : '#b8ae9a',
                  }}
                />
              ))}
            </div>
            <div className={`mt-1 flex justify-between text-[10px] tabular-nums ${PAPER.muted}`}>
              <span>{shortDay(days[0]!.kstDay)}</span>
              <span>{shortDay(days[n - 1]!.kstDay)}</span>
            </div>
          </div>
          <div className="mx-auto mt-2.5 w-full" style={{ maxWidth: STAGE_PX }}>
            <div
              className="relative overflow-hidden rounded-[3px]"
              style={{ width: stageSize, height: stageSize }}
            >
              <div
                className="absolute top-0 left-0 isolate overflow-hidden bg-zinc-950"
                style={{
                  width: STAGE_PX,
                  height: STAGE_PX,
                  transform: `scale(${stageScale})`,
                  transformOrigin: 'top left',
                }}
              >
                <div
                  ref={bindLayer}
                  aria-hidden
                  className={`pointer-events-none absolute inset-0 z-40 transition-opacity duration-500`}
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
                  className={`pointer-events-none absolute inset-0 z-[3] bg-[#14110d] opacity-0 transition-opacity duration-700`}
                />
                {/* 길(인접선) — 역사 화면에선 이동 경로가 아니라 배경이다: 게임의 비활성 톤(회색·얇게)으로 낮춘다(피드백: 길이 문양보다 눈에 띔). */}
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className={`pointer-events-none absolute inset-0 h-full w-full transition-opacity duration-500`}
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
                        opacity: c ? 1 : 0,
                        background: c
                          ? `radial-gradient(circle, color-mix(in srgb, ${c} 34%, transparent) 0%, color-mix(in srgb, ${c} 14%, transparent) 48%, transparent 70%)`
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
                  const size = 19;
                  return (
                    <div
                      key={z.id}
                      className="absolute -translate-x-1/2 -translate-y-1/2 transition-[left,top,opacity] duration-700 ease-[cubic-bezier(.4,0,.2,1)]"
                      style={{
                        left: `${z.mapX}%`,
                        top: `${z.mapY}%`,
                        zIndex: owner ? 10 : 6,
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
                          boxShadow:
                            focusRegion === z.region
                              ? `0 0 0 2px #fde047, 0 0 10px #fde047aa, 0 1px 2px rgba(0,0,0,.55)`
                              : owner
                                ? `0 0 0 1.5px ${gc}, 0 1px 2px rgba(0,0,0,.55)`
                                : `0 0 0 1px ${color}66`,
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
              </div>
            </div>
          </div>
          {/* 판도 한 줄 — 길드별 영토 비율. 점령 때마다 움직인다. */}
          <div className="mt-2.5">
            <div className={`mb-1 flex justify-between text-[11px] tabular-nums ${PAPER.muted}`}>
              <span className="truncate">
                {share.slice(0, 4).map(([g, c], i) => (
                  <span key={g} className="mr-2.5 whitespace-nowrap">
                    <i
                      className="mr-1 inline-block h-2 w-2 rounded-[2px] align-[-1px]"
                      style={{ background: meta[g]?.color ?? '#9a917f' }}
                    />
                    <b className="font-semibold text-[#2a251e]">{g}</b> {c}
                    {i < Math.min(3, share.length - 1) ? '' : ''}
                  </span>
                ))}
              </span>
              <span className="shrink-0">중립 {zones.length - ownedCount}</span>
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-[#e2d9c6]">
              {share.map(([g, c]) => (
                <div
                  key={g}
                  title={`${g} ${c}`}
                  className="h-full transition-[width] duration-700 ease-out"
                  style={{
                    width: `${(c / Math.max(1, zones.length)) * 100}%`,
                    background: meta[g]?.color ?? '#9a917f',
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mt-5 xl:hidden">
            <InfoPanel
              scene={phase === 'idle' ? (latest?.scene ?? null) : curScene}
              share={share}
              meta={meta}
              guildEmblem={guildEmblem}
              eras={story.eras}
              days={days}
              curEra={curEraIdx}
              onEra={(k) => (phase === 'idle' ? begin('battle', k) : void startAt(k))}
            />
          </div>
        </aside>

        {/* ── 기록(가운데) — 페이지를 따라 흐른다. 정지 땐 제목·버튼과 오늘의 기록. ── */}
        <section className="max-w-[66ch] min-w-0">
          <div
            className={`flex items-baseline justify-between gap-3 border-b pb-2 ${PAPER.border}`}
          >
            <div className="text-[15px] font-bold whitespace-nowrap" style={SERIF}>
              {fmtDay(showingDay.kstDay)}
            </div>
            <div className={`truncate text-[11px] tracking-[.03em] tabular-nums ${PAPER.muted}`}>
              {statusText}
            </div>
          </div>
          {phase === 'idle' ? (
            <div className="min-h-0 flex-1 overflow-y-auto pt-4 pr-2 md:max-w-[66ch]">
              <div className="text-[22px] leading-tight font-bold" style={SERIF}>
                대륙의 역사
              </div>
              <div className={`mt-1 text-[11.5px] tabular-nums ${PAPER.muted}`}>
                {days[0]!.kstDay} 부터 {days[n - 1]!.kstDay} 까지 · {n}일의 기록 · 시대{' '}
                {story.eras.length}
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => begin('quick', 0)}
                  className="inline-flex items-center gap-2 rounded-[9px] bg-[#8a4b23] px-4 py-2 text-[12.5px] font-bold text-white"
                >
                  <Icon name="ff" />
                  1분 만에 보기
                </button>
                <button
                  type="button"
                  onClick={() => begin('battle', 0)}
                  className={`inline-flex items-center gap-2 rounded-[9px] border px-4 py-2 text-[12.5px] font-bold ${PAPER.border} ${PAPER.hover}`}
                >
                  <Icon name="play" />
                  처음부터 자세히
                </button>
              </div>
              {latest ? (
                <div className="mt-6">
                  <ChapterHeading
                    era={story.eras[story.eras.length - 1] ?? null}
                    index={story.eras.length}
                    days={days}
                  />
                  <DayDivider
                    kstDay={latest.kstDay}
                    nth={n}
                    headline={latest.headline}
                    events={story.events[latest.kstDay] ?? []}
                    guildColor={guildColor}
                    guildEmblem={NO_EMBLEM}
                  />
                  <div className="ig-day mt-3">
                    <StaticChronicle
                      text={latest.text}
                      guildColor={guildColor}
                      guildEmblem={NO_EMBLEM}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              ref={readerRef}
              className="min-h-0 flex-1 overflow-y-auto pt-4 pr-2 md:max-w-[66ch]"
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
                      className={`grid grid-cols-[46px_1fr] items-baseline gap-2 rounded-md px-1 py-1 text-left ${r.captures < 0 ? 'bg-[#ece3d1]' : PAPER.hover}`}
                      title="이날을 전투 재생으로 보기"
                    >
                      <span className={`text-[10.5px] tabular-nums ${PAPER.muted}`}>
                        {r.kstDay.slice(5)}
                      </span>
                      <span className="text-[12.5px] leading-snug font-semibold" style={SERIF}>
                        {r.headline ? (
                          <Headline text={r.headline} guildColor={guildColor} />
                        ) : (
                          '기록'
                        )}
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
                    {eraStartIdx.has(q.nth - 1) ? (
                      <ChapterHeading
                        era={story.eras.find((e) => e.startIdx === q.nth - 1) ?? null}
                        index={story.eras.findIndex((e) => e.startIdx === q.nth - 1) + 1}
                        days={days}
                      />
                    ) : null}
                    <DayDivider
                      kstDay={q.kstDay}
                      nth={q.nth}
                      headline={q.headline}
                      dim={i < queue.length - 1}
                      events={story.events[q.kstDay] ?? []}
                      guildColor={guildColor}
                      guildEmblem={NO_EMBLEM}
                    />
                    <div
                      className={`ig-day mt-3 transition-opacity duration-1000 ${i < queue.length - 1 ? 'opacity-70' : ''}`}
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
                          guildColor={guildColor}
                          zoneStyle="plain"
                          userStyle="plain"
                          reveal={reveal}
                        />
                      ) : (
                        <StaticChronicle
                          text={q.data.text}
                          guildColor={guildColor}
                          guildEmblem={NO_EMBLEM}
                        />
                      )}
                    </div>
                  </section>
                ))
              )}
              {phase === 'end' ? (
                <section className="mt-8 text-center">
                  <div
                    className={`flex items-center gap-2 text-[10.5px] tracking-[.02em] ${PAPER.muted}`}
                  >
                    <span className="h-px flex-1 bg-[#ece5d6]" />
                    <span>{ordinalKo(n)} 번째 날까지</span>
                    <span className="h-px flex-1 bg-[#ece5d6]" />
                  </div>
                  <div className="mt-3 text-[17px] font-bold" style={SERIF}>
                    여기까지가 오늘의 대륙입니다
                  </div>
                  <div className={`mt-1 text-[11px] ${PAPER.muted}`}>
                    다음 기록은 자정에 열립니다 · 순위 보기에서 오늘의 판도를 볼 수 있습니다
                  </div>
                  <div className="mt-3 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={() => begin(mode, 0)}
                      className="inline-flex items-center gap-2 rounded-[9px] bg-[#8a4b23] px-3.5 py-2 text-[12px] font-bold text-white"
                    >
                      <Icon name="first" />
                      처음부터 다시
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
                      className={`rounded-[9px] border px-3.5 py-2 text-[12px] font-bold ${PAPER.border} ${PAPER.hover}`}
                    >
                      지금의 대륙
                    </button>
                  </div>
                </section>
              ) : null}
            </div>
          )}
        </section>

        {/* ── 정보 열(오른쪽, 넓은 화면) — 이날의 장면 · 순위 · 시대 목차. 글 열은 문장만 남긴다. ── */}
        <aside className="hidden xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-y-auto">
          <InfoPanel
            scene={phase === 'idle' ? (latest?.scene ?? null) : curScene}
            share={share}
            meta={meta}
            guildEmblem={guildEmblem}
            eras={story.eras}
            days={days}
            curEra={curEraIdx}
            onEra={(k) => (phase === 'idle' ? begin('battle', k) : void startAt(k))}
          />
        </aside>
      </div>

      {/* ── 플로팅 컨트롤러 — 화면 하단 가운데, 가로 한 줄 ── */}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
        <div
          className={`pointer-events-auto flex max-w-full flex-wrap items-center gap-1.5 rounded-full border bg-[#fdfaf3]/95 px-3 py-2 shadow-[0_8px_24px_-8px_rgba(40,30,10,.35)] backdrop-blur ${PAPER.border}`}
        >
          <IconBtn onClick={() => void startAt(0)} title="처음부터" icon="first" />
          <IconBtn
            onClick={() => void startAt((phase === 'idle' ? n : idx) - 1)}
            title="전날"
            icon="prev"
            disabled={phase !== 'idle' && idx === 0}
          />
          <IconBtn
            onClick={togglePause}
            title={
              phase === 'idle'
                ? '처음부터 재생'
                : phase === 'end'
                  ? '다시 재생'
                  : isPlaying
                    ? '일시정지'
                    : '재생'
            }
            icon={isPlaying ? 'pause' : 'play'}
            primary
          />
          <IconBtn
            onClick={() => void startAt(idx + 1)}
            title="다음 날"
            icon="next"
            disabled={phase === 'idle' || idx >= n - 1}
          />
          <button
            type="button"
            onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)}
            title="배속(누를 때마다 ×1 → ×2 → ×4)"
            className={`h-7 rounded-lg border px-2 text-[11px] font-bold tabular-nums ${speed === 1 ? `${PAPER.border} ${PAPER.hover}` : 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]'}`}
          >
            ×{speed}
          </button>
          <button
            type="button"
            onClick={() => setReveal((r) => (r === 'paragraph' ? 'type' : 'paragraph'))}
            aria-pressed={reveal === 'type'}
            title="글자 타이핑 재생(느림)"
            className={`h-7 rounded-lg border px-2 text-[11px] font-bold ${reveal === 'type' ? 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.border} ${PAPER.muted} ${PAPER.hover}`}`}
          >
            타이핑
          </button>
          <span
            className={`inline-flex h-7 overflow-hidden rounded-lg border ${PAPER.border}`}
            role="group"
            aria-label="재생 방식"
          >
            {(['battle', 'quick'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                aria-pressed={mode === m}
                className={`px-2.5 text-[11px] font-bold ${mode === m ? 'bg-[#2a251e] text-[#f5f0e6]' : `${PAPER.muted} ${PAPER.hover}`}`}
              >
                {m === 'battle' ? '전투' : '빠른'}
              </button>
            ))}
          </span>
          <span className={`ml-1 pr-1 text-[11px] tabular-nums ${PAPER.muted}`}>
            {phase === 'idle' ? `${n}일` : `${idx + 1} / ${n}`}
          </span>
        </div>
      </div>
    </main>
  );
}

/** 정보 열 — 이날의 장면 카드, 길드 순위(문양·구역 수·막대), 시대 목차(누르면 그 시대 첫날부터). */
function InfoPanel({
  scene,
  share,
  meta,
  guildEmblem,
  eras,
  days,
  curEra,
  onEra,
}: {
  scene: HistoryScene | null;
  share: [string, number][];
  meta: Record<string, HistoryGuildMeta>;
  guildEmblem: (name: string) => readonly string[];
  eras: HistoryEra[];
  days: HistoryDay[];
  curEra: number;
  onEra: (startIdx: number) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className={`mb-1.5 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>이날의 장면</div>
        {scene ? (
          <SceneCard scene={scene} guildEmblem={guildEmblem} compact />
        ) : (
          <div
            className={`rounded-[6px] border border-dashed px-3 py-6 text-center text-[11.5px] ${PAPER.border} ${PAPER.muted}`}
          >
            기록을 펼치면 나타납니다
          </div>
        )}
      </div>
      <div>
        <div className={`mb-1.5 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>순위</div>
        {share.length > 0 ? (
          <HistoryRace
            rows={share.map(([g, c]) => ({
              key: String(meta[g]?.id ?? g),
              name: g,
              count: c,
              color: meta[g]?.color ?? '#9a917f',
              emblem: guildEmblem(g)[0] ?? null,
            }))}
          />
        ) : (
          <div className={`text-[11.5px] ${PAPER.muted}`}>아직 세워진 깃발이 없습니다</div>
        )}
      </div>
      {eras.length > 0 ? (
        <div>
          <div className={`mb-1.5 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>시대</div>
          <div className={`divide-y border-y ${PAPER.border} divide-[#ece5d6]`}>
            {eras.map((e, i) => (
              <button
                key={i}
                type="button"
                onClick={() => onEra(e.startIdx)}
                title="이 시대 첫날부터 재생"
                className={`flex w-full items-center gap-2.5 px-1 py-2 text-left text-[12px] ${i === curEra ? 'bg-[#f6efe1]' : PAPER.hover}`}
              >
                <span className={`w-9 shrink-0 text-[10px] tabular-nums ${PAPER.muted}`}>
                  제{i + 1}장
                </span>
                <i
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: e.color ?? '#9a917f' }}
                />
                <span className="min-w-0 flex-1 truncate font-semibold" style={SERIF}>
                  「{e.name}」의 시대
                </span>
                <span className={`shrink-0 text-[10.5px] tabular-nums ${PAPER.muted}`}>
                  {shortDay(days[e.startIdx]!.kstDay)}~ · {e.endIdx - e.startIdx + 1}일
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** 챕터 제목 — 시대가 시작하는 날 앞에 한 번. 책의 장(章)처럼. */
function ChapterHeading({
  era,
  index,
  days,
}: {
  era: HistoryEra | null;
  index: number;
  days: HistoryDay[];
}) {
  if (!era) return null;
  const len = era.endIdx - era.startIdx + 1;
  return (
    <div className="mt-6 mb-5 text-center first:mt-0">
      <div className={`text-[10.5px] tracking-[.25em] ${PAPER.muted}`}>제{index}장</div>
      <div className="mt-1 text-[22px] leading-tight font-bold" style={SERIF}>
        「{era.name}」의 시대
      </div>
      <div className={`mt-1 text-[11px] tabular-nums ${PAPER.muted}`}>
        {shortDay(days[era.startIdx]!.kstDay)} ~{' '}
        {era.endIdx === days.length - 1 ? '' : shortDay(days[era.endIdx]!.kstDay)} · {len}일
      </div>
      <div className="mx-auto mt-3 h-px w-16 bg-[#b9a982]" />
    </div>
  );
}

/** 그날의 장면 — 가장 큰 사건 하나를 지역 그림 위에 카드로. */
function SceneCard({
  scene,
  guildEmblem,
  compact = false,
}: {
  scene: HistoryScene | null;
  guildEmblem: (name: string) => readonly string[];
  /** 정보 열용 — 위 여백 없이. */
  compact?: boolean;
}) {
  if (!scene) return null;
  const bg = scene.region ? assetUrl(`/sprites/guild/region/${scene.region}.png`) : null;
  return (
    <div
      className={`relative overflow-hidden rounded-[6px] border border-[#3a3128] bg-[#1b1712] text-[#f3ede2] ${compact ? '' : 'mt-3'}`}
    >
      {bg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={bg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          style={{ imageRendering: 'pixelated' }}
        />
      ) : null}
      <div className="absolute inset-0 bg-gradient-to-r from-[#1b1712] via-[#1b1712cc] to-[#1b171266]" />
      <div className="relative flex items-center gap-4 px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] tracking-[.2em] text-[#d9c39a]">
            이날의 장면{scene.regionLabel ? ` · ${scene.regionLabel}` : ''}
          </div>
          <div className="mt-0.5 truncate text-[16px] leading-snug font-bold" style={SERIF}>
            {scene.title}
          </div>
          <div className="mt-0.5 truncate text-[12px] text-[#e7dcc0]">{scene.note}</div>
          {scene.hero ? (
            <div className="mt-1 text-[11px] text-[#cfc6b3]">
              활약 — {scene.hero.nickname}({scene.hero.guild}) {scene.hero.kind} {scene.hero.count}
            </div>
          ) : null}
        </div>
        {scene.guilds.length > 0 ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {scene.guilds.map((g) => {
              const urls =
                guildEmblem(g.name).length > 0
                  ? guildEmblem(g.name)
                  : g.emblemUrl
                    ? [g.emblemUrl, ...(g.emblemAlsoTry ?? [])]
                    : [];
              return (
                <span
                  key={g.name}
                  title={g.name}
                  className="inline-block h-7 w-7 overflow-hidden rounded-[5px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${g.color ?? '#9a917f'} 40%, #fdfaf3)`,
                    boxShadow: `0 0 0 1.5px ${g.color ?? '#9a917f'}`,
                  }}
                >
                  <EmblemChain
                    key={urls[0] ?? 'none'}
                    urls={urls}
                    className="h-full w-full object-contain"
                  />
                </span>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** 날 구분선 — 두루마리 안에서 날이 바뀌는 자리. 지난 날은 흐리게. */
function DayDivider({
  kstDay,
  nth,
  headline,
  dim,
  events,
  guildColor,
  guildEmblem,
}: {
  kstDay: string;
  nth: number;
  headline: string;
  dim?: boolean;
  /** 그날 사건 칩(1위 교체·석권·개명·해산 등) — 구분선 끝에 작게. */
  events?: HistoryEvent[];
  guildColor?: (name: string) => string | null;
  guildEmblem?: (name: string) => readonly string[];
}) {
  return (
    <div className={`transition-opacity duration-1000 ${dim ? 'opacity-70' : ''}`}>
      <div
        className={`flex items-center gap-2.5 text-[10.5px] tracking-[.02em] tabular-nums ${PAPER.muted}`}
      >
        <span className="h-px flex-1 bg-[#ece5d6]" />
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          {ordinalKo(nth)} 번째 날 · {kstDay.slice(5).replace('-', '/')}
          {(events ?? []).slice(0, 3).map((e, i) => (
            <i
              key={i}
              title={e.label}
              className={`rounded-full border px-1.5 not-italic ${e.kind === 'leader' || e.kind === 'sweep' ? 'border-[#d9c39a] font-bold text-[#8a4b23]' : PAPER.border}`}
            >
              {e.short}
            </i>
          ))}
        </span>
        <span className="h-px flex-1 bg-[#ece5d6]" />
      </div>
      {headline ? (
        <div className="mt-2 text-[15px] leading-[1.45] font-bold" style={SERIF}>
          <Headline text={headline} guildColor={guildColor} guildEmblem={guildEmblem} />
        </div>
      ) : null}
    </div>
  );
}

/** 재생이 끝난 날의 정적 본문 — 마커를 칩으로(재생 패널과 같은 어휘, 종이 톤). */
function StaticChronicle({
  text,
  guildColor,
  guildEmblem,
}: {
  text: string;
  guildColor: (name: string) => string | null;
  guildEmblem: (name: string) => readonly string[];
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
            parts.push(
              <span key={k++} className="font-medium">
                {name}
              </span>,
            );
          } else if (kind === 'g') {
            parts.push(
              <GuildInline
                key={k++}
                name={name}
                shown={name}
                color={guildColor(name)}
                urls={guildEmblem(name)}
              />,
            );
          } else {
            parts.push(
              <span key={k++} className="font-medium">
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

const ICONS = {
  first: 'M1 1h2v10H1zM11 1v10L4 6z',
  prev: 'M9 1v10L2 6z',
  play: 'M3 1l8 5-8 5z',
  pause: 'M2 1h3v10H2zM7 1h3v10H7z',
  next: 'M3 1v10l7-5z',
  ff: 'M1 1l5 5-5 5zM6 1l5 5-5 5z',
} as const;
type IconName = keyof typeof ICONS;

/** 조작 아이콘 — 이모지는 글꼴마다 폭이 달라 버튼이 들쭉날쭉해서 SVG로(아바타 순서 편집과 같은 이유). */
function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 12 12" aria-hidden className="h-3 w-3 fill-current">
      <path d={ICONS[name]} />
    </svg>
  );
}

function IconBtn({
  onClick,
  title,
  icon,
  disabled,
  primary,
}: {
  onClick: () => void;
  title: string;
  icon: IconName;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`inline-flex h-7 shrink-0 items-center justify-center rounded-lg border ${
        primary
          ? 'w-9 border-[#8a4b23] bg-[#8a4b23] text-white'
          : `w-7 ${disabled ? 'border-[#e2d9c6] text-[#c9c0ad]' : `${PAPER.border} text-[#2a251e] ${PAPER.hover}`}`
      }`}
    >
      <Icon name={icon} />
    </button>
  );
}
