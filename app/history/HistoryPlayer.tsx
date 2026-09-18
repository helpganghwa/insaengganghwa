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
} from '@/lib/game/history/types';
import { HistoryRace } from './HistoryRace';

/**
 * 대륙의 역사 — 시대(章) 중심 재생(2026-09-18, 시안 4 A안 '장 재생').
 *  - 기본 단위는 시대. 장 제목·요약이 뜨고, 지도는 날마다 그날 리플레이를 **본문 없이**(ChronicleReplayPanel reveal='map')
 *    돌려 문양의 진군·격돌·점령을 그대로 보여 준다(2026-09-18 사용자: 빠르든 느리든 이동과 전투가 보여야 한다). 리플레이가
 *    없는 날은 소유표(ownersByDay)로 색만 바꾸고 DAY_MS 머문다. 날마다 글 칸에 날짜·헤드라인 한 줄이 쌓이고, 시대가 끝나면
 *    맺음 한 줄 뒤 다음 장으로 이어진다.
 *  - 어느 줄이든 '자세히'를 누르면 그날의 연대기 재생(/api/history/day + ChronicleReplayPanel)으로 바뀌고, 끝나면
 *    '다음 날도 자세히'·'시대 흐름으로'를 고른다(자동 복귀는 2026-09-18 사용자 지시로 삭제).
 *  - 첫 진입은 지금의 대륙 + 장 목차. 소유 상태는 길드 이름으로 들고 다니며(리플레이 스냅샷과 같은 축), 시대 흐름에서는
 *    guildsById의 현재 이름을 쓴다.
 */
type Phase = 'idle' | 'era' | 'detail' | 'end';
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
/** 시대 흐름 — 리플레이가 없는 날(전투 없이 기록만)에 머무는 시간. 리플레이가 있는 날은 연출이 끝날 때까지. */
const DAY_MS = 1600;
/** 시대가 끝난 뒤 맺음을 읽을 시간. */
const EPILOGUE_MS = 2400;
/** 장이 열릴 때 요약 타이핑 속도(ms/글자) — 읽을 시간을 준다(2026-09-18 사용자 지시). 배속으로 나뉜다. */
const SUMMARY_CHAR_MS = 34;
/** 시대 흐름의 지도 재생 배속(사용자 배속에 곱함) — 흐름은 빠르게, 자세히는 게임 속도로(2026-09-18 사용자: 빠르게 이동·전투가 보이면 된다). */
const FLOW_SPEED = 2.5;
const STATIC_DAY_MS = 5000; // 리플레이 스크립트가 없는 날(전투 없이 기록만)
/** 게임 세계지도와 같은 무대 폭(루트 viewport 390 기준 정사각). */
const STAGE_PX = 390;
/** 본문·헤드라인에는 길드 문양을 붙이지 않는다(2026-09-17 사용자 지시) — 색 굵은 이름만. */
const NO_EMBLEM = (): readonly string[] => [];

const TOKEN_RE = /\{([guz])\|([^}|]+)(?:\|[^}]*)?\}+/g;

function Headline({
  text,
  className = '',
  guildColor,
  guildEmblem,
}: {
  text: string;
  className?: string;
  guildColor?: (name: string) => string | null;
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
          data-guild={kind === 'g' ? name : undefined}
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

/**
 * 타이핑 헤드라인 — 마커 문장을 글자 단위로 드러낸다. 누르면 끝까지. 일시정지를 존중한다.
 * 길드 마커는 통째로 색 굵은 이름으로 나오되 글자 수만큼만 드러난다.
 */
function TypedHeadline({
  text,
  guildColor,
  charMs,
  pausedRef,
  onDone,
}: {
  text: string;
  guildColor: (name: string) => string | null;
  charMs: number;
  pausedRef: React.RefObject<boolean>;
  onDone: () => void;
}) {
  const segs = useMemo(() => {
    const out: { kind: 'text' | 'g'; s: string }[] = [];
    let last = 0;
    for (const m of text.matchAll(TOKEN_RE)) {
      if (m.index! > last) out.push({ kind: 'text', s: text.slice(last, m.index) });
      out.push({ kind: m[1] === 'g' ? 'g' : 'text', s: m[2]! });
      last = m.index! + m[0].length;
    }
    if (last < text.length) out.push({ kind: 'text', s: text.slice(last) });
    return out;
  }, [text]);
  const total = useMemo(() => segs.reduce((a, s) => a + s.s.length, 0), [segs]);
  const [shown, setShown] = useState(0);
  /** 지금까지 드러난 글자 수 — 배속이 바뀌어 효과가 다시 걸려도 처음부터 다시 치지 않게 이어 간다. */
  const shownRef = useRef(0);
  const doneRef = useRef(false);
  const skipRef = useRef(false);
  useEffect(() => {
    let alive = true;
    const tick = () => {
      if (!alive) return;
      if (skipRef.current) {
        shownRef.current = total;
        setShown(total);
        return;
      }
      if (pausedRef.current) {
        setTimeout(tick, 120);
        return;
      }
      if (shownRef.current >= total) return;
      shownRef.current += 1;
      setShown(shownRef.current);
      if (shownRef.current < total) setTimeout(tick, Math.max(8, charMs));
    };
    const id = setTimeout(tick, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [total, charMs, pausedRef]);
  useEffect(() => {
    if (shown >= total && !doneRef.current) {
      doneRef.current = true;
      const id = setTimeout(onDone, 700);
      return () => clearTimeout(id);
    }
  }, [shown, total, onDone]);
  // 세그먼트별로 드러난 글자 수를 먼저 계산한다(렌더 중 변수 변경 금지 — React 컴파일러 규칙).
  const parts = useMemo(() => {
    let left = shown;
    return segs.map((sg) => {
      const part = left > 0 ? sg.s.slice(0, left) : '';
      left -= sg.s.length;
      return part;
    });
  }, [segs, shown]);
  return (
    <span
      onClick={() => {
        skipRef.current = true;
        setShown(total);
      }}
      title="누르면 끝까지"
      className="cursor-pointer"
    >
      {segs.map((sg, i) => {
        const part = parts[i] ?? '';
        if (!part) return null;
        if (sg.kind === 'g') {
          const gc = guildColor(sg.s);
          return (
            <span
              key={i}
              data-guild={sg.s}
              className={`inline-block px-0.5 font-bold ${gc ? '' : 'text-[#4b3a8a]'}`}
              style={gc ? { color: gc } : undefined}
            >
              {part}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
      {shown < total ? (
        <span
          className="ml-px inline-block h-[13px] w-[6px] animate-pulse bg-[#8a4b23] align-[-2px]"
          aria-hidden
        />
      ) : null}
    </span>
  );
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
const shortDay = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const monthDay = (d: string) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

/**
 * 시대 기간 표기 — 끝난 장은 '8/24 ~ 9/12 · 20일', 진행 중인 장은 '9/15부터 · 3일째'. short면 목차용으로 끝 날짜를 뺀다.
 * 종전 '9/15 ~ · 3일'처럼 빈 끝 날짜가 어색했다(2026-09-18 검수).
 */
function eraSpan(e: HistoryEra, days: HistoryDay[], short = false): string {
  const len = e.endIdx - e.startIdx + 1;
  const from = shortDay(days[e.startIdx]!.kstDay);
  if (e.endIdx === days.length - 1) return `${from}부터 · ${len}일째`;
  return short ? `${from}~ · ${len}일` : `${from} ~ ${shortDay(days[e.endIdx]!.kstDay)} · ${len}일`;
}

function sameOwners(a: Record<number, string | null>, b: Record<number, string | null>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  for (const k of ka) if ((a[Number(k)] ?? null) !== (b[Number(k)] ?? null)) return false;
  return true;
}

/** 문양 후보 — 그날 스냅샷 URL부터 시작해 이력에서 그 뒤의 문양들. 첫 파일이 사라졌을 때 다음 문양으로 넘어가기 위한 순서. */
/** 장 목록 순서 — 최근 장이 위(2026-09-18 사용자 지시). 원래 순번 i를 함께 넘겨 '제N장'은 시간 순서 그대로. */
function newestFirst(eras: HistoryEra[]): (readonly [HistoryEra, number])[] {
  return eras.map((e, i) => [e, i] as const).reverse();
}

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

export function HistoryPlayer({
  index,
  mapSrc,
  startDay,
}: {
  index: HistoryIndex;
  mapSrc: string;
  startDay: string | null;
}) {
  const { days, zones, edges, serverId, story, ownersByDay, guildsById, nameAliases } = index;
  const n = days.length;
  const eras = story.eras;
  const [phase, setPhase] = useState<Phase>('idle');
  const [stageSize, setStageSize] = useState(STAGE_PX);
  useEffect(() => {
    const calc = () => setStageSize(Math.max(280, Math.min(STAGE_PX, window.innerWidth - 32)));
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);
  const stageScale = stageSize / STAGE_PX;
  const [idx, setIdx] = useState<number>(n - 1);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const speedRef = useRef(1);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  const [owners, setOwners] = useState<Record<number, string | null>>(index.owners);
  // 길드 표시값 — 현재 소유 길드(index.guilds) + 역사에 등장한 전 길드(guildsById, 시대 흐름의 이름 축).
  const [meta, setMeta] = useState<Record<string, HistoryGuildMeta>>(() => {
    const m: Record<string, HistoryGuildMeta> = {};
    for (const [nm, id] of Object.entries(nameAliases)) {
      const g = guildsById[id];
      if (g) m[nm] = { color: g.color, emblemUrl: g.emblemUrl, id };
    }
    for (const [id, g] of Object.entries(guildsById))
      m[g.name] = { color: g.color, emblemUrl: g.emblemUrl, id: Number(id) };
    return { ...m, ...index.guilds };
  });
  const guildColor = useCallback((name: string) => meta[name]?.color ?? null, [meta]);
  const emblemChain = useCallback(
    (g: HistoryGuildMeta | undefined) => emblemChainOf(index.emblemHistory, g),
    [index.emblemHistory],
  );
  const guildEmblem = useCallback((name: string) => emblemChain(meta[name]), [meta, emblemChain]);
  /**
   * 호버한 길드 — 판도 막대·이름, 지도 길드 표식, 글 속 길드 이름(2026-09-18). 지도에서 그 길드 구역만 밝히고 나머지는 흐리게.
   * key는 길드 id(개명 전 이름도 같은 길드로 — 글은 그 시절 이름, 지도는 그날 이름이라 이름 비교는 어긋난다). name은 호버한 표기.
   */
  const [focus, setFocus] = useState<{ key: string; name: string } | null>(null);
  /** 길드 식별 키 — 판도 차트 행 키와 같은 형식(id 문자열, id를 모르면 이름). */
  const guildKey = useCallback(
    (name: string) => String(index.nameAliases[name] ?? meta[name]?.id ?? name),
    [index.nameAliases, meta],
  );
  const focusByName = useCallback(
    (name: string | null) =>
      setFocus((f) => {
        if (!name) return f ? null : f;
        const key = guildKey(name);
        return f && f.key === key ? f : { key, name };
      }),
    [guildKey],
  );
  const focusKey = focus?.key ?? null;
  const isFocused = (name: string | null) =>
    !!name && focusKey !== null && guildKey(name) === focusKey;
  const [layer, setLayer] = useState<HTMLDivElement | null>(null);
  const layerRef = useRef<HTMLDivElement | null>(null);
  const bindLayer = useCallback((el: HTMLDivElement | null) => {
    layerRef.current = el;
    setLayer(el);
  }, []);
  /** 시대 흐름에서 쌓인 날들(오름차순). 장 제목은 그 시대의 첫 줄 앞에. */
  const [lines, setLines] = useState<number[]>([]);
  /** 시대 흐름의 지도 재생 — 그날 리플레이를 본문 없이 지도에만(패널은 아무것도 그리지 않는다). */
  const [mapPlay, setMapPlay] = useState<{
    dayIdx: number;
    data: HistoryDayData;
    session: number;
  } | null>(null);
  const mapDoneRef = useRef<(() => void) | null>(null);
  /** 장이 열리는 순간의 요약 타이핑 — 끝나야 첫날 지도가 시작된다. */
  const [typing, setTyping] = useState<{ eraIdx: number; session: number } | null>(null);
  const typingDoneRef = useRef<(() => void) | null>(null);
  /** 하루 자세히 — 그날 데이터와 세션 토큰. */
  const [detail, setDetail] = useState<{
    dayIdx: number;
    data: HistoryDayData | null;
    session: number;
    failed?: boolean;
  } | null>(null);
  const [detailDone, setDetailDone] = useState(false);
  /** 소유가 바뀐 타일의 링 — 값이 바뀌면 다시 그려져 애니메이션이 한 번 더 돈다. */
  const [pulse, setPulse] = useState<Record<number, number>>({});
  const readerRef = useRef<HTMLDivElement | null>(null);
  const stickRef = useRef(true);
  const cache = useRef(new Map<string, HistoryDayData | null>());
  const run = useRef(0);
  const flowRef = useRef<(k: number) => void>(() => {});
  /** 현재 소유(렌더 밖에서 diff용) — setState 갱신 함수 안에서 다른 setState를 부르지 않기 위해. */
  const ownersRef = useRef(index.owners);
  useEffect(() => {
    ownersRef.current = owners;
  }, [owners]);

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
  const eraOf = useCallback(
    (k: number) => eras.findIndex((e) => k >= e.startIdx && k <= e.endIdx),
    [eras],
  );
  /** 그날의 이름 — 개명 이력(namesFrom)에서 그날 이전 마지막 구간, 없으면 현재 이름. 시대 흐름이 「전설」 시절을 전설로 부르게. */
  const nameAt = useCallback(
    (gid: number, k: number): string | null => {
      const g = guildsById[gid];
      if (!g) return null;
      let nm = g.namesFrom.length > 0 && g.namesFrom[0]![0] > k ? g.namesFrom[0]![1] : g.name;
      for (const [from, name] of g.namesFrom) if (from <= k) nm = name;
      return nm;
    },
    [guildsById],
  );
  /** 그날 종료 소유(길드 이름 축). */
  const ownersOn = useCallback(
    (k: number): Record<number, string | null> => {
      const row = ownersByDay[k] ?? [];
      const o: Record<number, string | null> = {};
      zones.forEach((z, i) => {
        const gid = row[i] ?? 0;
        o[z.id] = gid ? nameAt(gid, k) : null;
      });
      return o;
    },
    [ownersByDay, zones, nameAt],
  );

  // 실패는 캐시하지 않고 한 번 더 시도한다 — 한 번 비었던 응답이 영영 '펼치는 중'으로 남던 문제(2026-09-18 스테이징 제보).
  const fetchDay = useCallback(
    async (k: number): Promise<HistoryDayData | null> => {
      const d = days[k];
      if (!d) return null;
      const hit = cache.current.get(d.kstDay);
      if (hit) return hit;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const r = await fetch(`/api/history/day?s=${serverId}&day=${d.kstDay}&v=3`, {
            cache: 'no-store',
          });
          if (r.ok) {
            const v = (await r.json()) as HistoryDayData;
            cache.current.set(d.kstDay, v);
            return v;
          }
          console.error('[history] day fetch', d.kstDay, r.status);
        } catch (e) {
          console.error('[history] day fetch', d.kstDay, (e as Error).message);
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
      return null;
    },
    [days, serverId],
  );

  /** 일시정지를 존중하는 대기 — 세션이 바뀌면 곧바로 끝난다. */
  const wait = useCallback(async (ms: number, token: number) => {
    const until = Date.now() + ms;
    while (Date.now() < until || pausedRef.current) {
      if (token !== run.current) return;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, []);

  /** 소유표의 그날을 지도에 적용 — 바뀐 타일만 링. */
  const applyDay = useCallback(
    (k: number) => {
      const next = ownersOn(k);
      const prev = ownersRef.current;
      const changed: number[] = [];
      for (const z of zones) if ((prev[z.id] ?? null) !== (next[z.id] ?? null)) changed.push(z.id);
      if (changed.length === 0) return;
      setPulse((p) => {
        const q = { ...p };
        for (const id of changed) q[id] = (q[id] ?? 0) + 1;
        return q;
      });
      ownersRef.current = next;
      setOwners(next);
    },
    [ownersOn, zones],
  );

  /** k번째 날부터 시대 흐름 — 그 앞의 줄은 남기고 뒤는 지운다. 시대가 끝나면 맺음을 읽고 다음 장으로. */
  const flowFrom = useCallback(
    (k: number) => {
      if (k < 0) k = 0;
      if (k >= n) {
        setPhase('end');
        setOwners(index.owners);
        return;
      }
      const token = ++run.current;
      pausedRef.current = false;
      setPaused(false);
      setDetail(null);
      setDetailDone(false);
      mapDoneRef.current?.();
      mapDoneRef.current = null;
      setMapPlay(null);
      typingDoneRef.current?.();
      typingDoneRef.current = null;
      setTyping(null);
      layerRef.current?.replaceChildren();
      stickRef.current = true;
      setPhase('era');
      // 쌓인 줄 — 들어가는 장의 앞선 날들만(앞뒤로 건너뛰어도 그 장의 흐름이 끊기지 않게, 다른 장의 줄은 비운다).
      {
        const e0 = eras[eraOf(k)];
        const from = e0 ? e0.startIdx : k;
        setLines(Array.from({ length: Math.max(0, k - from) }, (_, j) => from + j));
      }
      // 들어가는 날 직전 상태로 지도를 맞춘다 — 장 요약을 읽는 동안 이전 위치의 지도·판도가 남아 있지 않게.
      {
        const start: Record<number, string | null> =
          k > 0 ? ownersOn(k - 1) : Object.fromEntries(zones.map((z) => [z.id, null]));
        ownersRef.current = start;
        setOwners(start);
      }
      void (async () => {
        for (let i = k; i < n; i++) {
          if (token !== run.current) return;
          setIdx(i);
          const ei = eraOf(i);
          const era = eras[ei];
          // 장이 열리는 날 — 요약을 타이핑으로 읽히고(읽을 시간), 끝난 뒤 첫날을 시작한다.
          if (era && i === era.startIdx) {
            setLines((ls) => ls.filter((d) => d < i));
            await new Promise<void>((resolve) => {
              typingDoneRef.current = resolve;
              setTyping({ eraIdx: ei, session: token });
            });
            if (token !== run.current) return;
            typingDoneRef.current = null;
            setTyping(null);
          }
          setLines((ls) => (ls.includes(i) ? ls : [...ls.filter((d) => d < i), i]));
          const data = await fetchDay(i);
          if (token !== run.current) return;
          void fetchDay(i + 1);
          const replay = data?.replay ?? null;
          if (data && replay) {
            // 그날 시작 상태로 맞추고(전날 끝과 같으면 그대로), 그날 스냅샷 이름·색을 얹은 뒤 지도 재생이 끝날 때까지 기다린다.
            setOwners((o) => (sameOwners(o, replay.beforeOwner) ? o : { ...replay.beforeOwner }));
            const snap = Object.entries(replay.guilds).map(
              ([g, v]) => [g, { color: v.color, emblemUrl: v.emblemUrl, id: v.guildId }] as const,
            );
            setMeta((m) => ({ ...m, ...Object.fromEntries(snap) }));
            await new Promise<void>((resolve) => {
              mapDoneRef.current = resolve;
              setMapPlay({ dayIdx: i, data, session: token });
            });
            if (token !== run.current) return;
            mapDoneRef.current = null;
            setMapPlay(null);
          } else {
            applyDay(i);
            await wait(DAY_MS / speedRef.current, token);
          }
          const e = eras[eraOf(i)];
          const eraEnds = e ? i === e.endIdx && i < n - 1 : false;
          if (eraEnds) await wait(EPILOGUE_MS / speedRef.current, token);
        }
        if (token !== run.current) return;
        setPhase('end');
      })();
    },
    [n, index.owners, applyDay, wait, eras, eraOf, fetchDay, ownersOn, zones],
  );
  useEffect(() => {
    flowRef.current = flowFrom;
  }, [flowFrom]);

  /** 하루 자세히 — 그날 연대기를 리플레이로. 끝나면 선택지, 가만두면 흐름으로 복귀. */
  const openDetail = useCallback(
    (k: number) => {
      if (k < 0 || k >= n) return;
      const token = ++run.current;
      pausedRef.current = false;
      setPaused(false);
      setDetailDone(false);
      mapDoneRef.current?.();
      mapDoneRef.current = null;
      setMapPlay(null);
      typingDoneRef.current?.();
      typingDoneRef.current = null;
      setTyping(null);
      layerRef.current?.replaceChildren();
      stickRef.current = true;
      setIdx(k);
      setPhase('detail');
      setDetail({ dayIdx: k, data: null, session: token });
      void (async () => {
        const data = await fetchDay(k);
        if (token !== run.current) return;
        void fetchDay(k + 1);
        const replay = data?.replay ?? null;
        if (replay) {
          setOwners((o) => (sameOwners(o, replay.beforeOwner) ? o : { ...replay.beforeOwner }));
          const snap = Object.entries(replay.guilds).map(
            ([g, v]) => [g, { color: v.color, emblemUrl: v.emblemUrl, id: v.guildId }] as const,
          );
          setMeta((m) => ({ ...m, ...Object.fromEntries(snap) }));
        } else applyDay(k);
        setDetail({ dayIdx: k, data, session: token, failed: !data });
        if (!data) return;
        if (!replay) {
          await wait(STATIC_DAY_MS / speedRef.current, token);
          if (token === run.current) setDetailDone(true);
        }
      })();
    },
    [n, fetchDay, applyDay, wait],
  );
  // 자동 스크롤 — 자세히(글자가 찍히는 동안)는 바닥을 따라가고, 시대 흐름은 지금 날의 줄을 가운데에 둔다.
  // 사용자가 위로 올리면 멈추고, 바닥 근처로 내리면 다시 따라간다.
  useEffect(() => {
    const el = readerRef.current;
    if (!el || phase !== 'detail') return;
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
  useEffect(() => {
    if (phase !== 'era' || !stickRef.current) return;
    const el = document.getElementById('ig-now');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [phase, idx, lines]);
  useEffect(() => {
    const el = readerRef.current;
    if (!el || phase !== 'era') return;
    // 흐름 중 손으로 크게 올리면 따라가기를 멈추고, 지금 줄 근처로 돌아오면 재개한다.
    const onScroll = () => {
      const now = document.getElementById('ig-now');
      if (!now) return;
      const r = now.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      stickRef.current = r.top > box.top - 40 && r.bottom < box.bottom + 40;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [phase]);

  // ?day= 딥링크 — 첫 렌더 뒤 그날부터 시대 흐름.
  useEffect(() => {
    if (!startDay) return;
    const k = days.findIndex((d) => d.kstDay === startDay);
    if (k < 0) return;
    const id = setTimeout(() => flowRef.current(k), 0);
    return () => clearTimeout(id);
  }, [startDay, days]);

  const togglePause = useCallback(() => {
    if (phase === 'idle' || phase === 'end') {
      flowFrom(0);
      return;
    }
    pausedRef.current = !pausedRef.current;
    setPaused(pausedRef.current);
  }, [phase, flowFrom]);
  /** 전날·다음 날 — 자세히 보는 중이면 그 날들도 자세히, 아니면 시대 흐름으로. 정지 화면의 '전날'은 마지막 날부터. */
  const stepDay = useCallback(
    (delta: -1 | 1) => {
      if (phase === 'detail') openDetail(Math.min(n - 1, Math.max(0, idx + delta)));
      else flowFrom((phase === 'idle' ? n : idx) + delta);
    },
    [phase, idx, n, openDetail, flowFrom],
  );
  // 키보드(2026-09-18, E) — 스페이스 재생·일시정지, ←/→ 전날·다음 날, Esc 자세히에서 흐름으로.
  // 버튼·링크에 포커스가 있으면 스페이스는 그 버튼의 몫이다(두 번 토글되지 않게).
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      const tg = ev.target instanceof HTMLElement ? ev.target : null;
      if (
        tg &&
        (tg.tagName === 'INPUT' ||
          tg.tagName === 'TEXTAREA' ||
          tg.tagName === 'SELECT' ||
          tg.isContentEditable)
      )
        return;
      const onControl =
        !!tg &&
        (tg.tagName === 'BUTTON' || tg.tagName === 'A' || tg.getAttribute('role') === 'button');
      if (ev.code === 'Space') {
        if (onControl) return;
        ev.preventDefault();
        togglePause();
      } else if (ev.key === 'ArrowLeft' && phase !== 'idle') {
        ev.preventDefault();
        stepDay(-1);
      } else if (ev.key === 'ArrowRight' && phase !== 'idle') {
        ev.preventDefault();
        stepDay(1);
      } else if (ev.key === 'Escape' && phase === 'detail') {
        ev.preventDefault();
        flowRef.current(idx + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, idx, togglePause, stepDay]);
  const goToIdle = () => {
    run.current += 1;
    mapDoneRef.current?.();
    mapDoneRef.current = null;
    setMapPlay(null);
    typingDoneRef.current?.();
    typingDoneRef.current = null;
    setTyping(null);
    layerRef.current?.replaceChildren();
    setPhase('idle');
    setIdx(n - 1);
    setLines([]);
    setDetail(null);
    setOwners(index.owners);
  };

  const cur = days[idx]!;
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
  const isPlaying = (phase === 'era' || phase === 'detail') && !paused;
  const ownedCount = Object.values(owners).filter(Boolean).length;
  /** 판도 한 줄 — 길드별 보유 수(많은 순). */
  const share = useMemo(() => {
    const c = new Map<string, number>();
    for (const g of Object.values(owners)) if (g) c.set(g, (c.get(g) ?? 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1]);
  }, [owners]);
  /** 지도 왼쪽 위 표시 — 지금 지도에서 그 길드가 쓰는 이름(개명 후면 새 이름)·보유 수. 지도에 없으면 호버한 이름·0곳. */
  const focusChip = (() => {
    if (!focus) return null;
    const hit = share.filter(([g]) => guildKey(g) === focus.key);
    const name = hit[0]?.[0] ?? focus.name;
    return {
      name,
      count: hit.reduce((s, [, c]) => s + c, 0),
      color: meta[name]?.color ?? meta[focus.name]?.color ?? '#9a917f',
    };
  })();
  const curEraIdx = phase === 'idle' || phase === 'end' ? eras.length - 1 : eraOf(idx);
  const curEra = eras[curEraIdx] ?? null;
  const statusText =
    phase === 'idle'
      ? `${eras.length}장 · ${n}일`
      : phase === 'end'
        ? `${ordinalKo(n)} 번째 날까지`
        : `${curEra ? `제${curEraIdx + 1}장 · ` : ''}${idx + 1} / ${n}${paused ? ' · 일시정지' : ''}`;
  // 가운데 칸 머리 — 지금 무엇을 보고 있는지(장 제목·날짜는 본문이 크게 보여 주므로 여기서 반복하지 않는다).
  const midTitle = phase === 'idle' ? '목차' : phase === 'detail' ? '하루 자세히' : '시대 흐름';

  /** 시대 흐름 글 칸 — 쌓인 줄을 시대별로 묶고, 지금 시대의 남은 날은 흐리게 미리 보여 준다. */
  const flowBlocks = useMemo(() => {
    const blocks: { eraIdx: number; days: number[]; future: number[]; ended: boolean }[] = [];
    for (const d of lines) {
      const ei = eraOf(d);
      const last = blocks[blocks.length - 1];
      if (last && last.eraIdx === ei) last.days.push(d);
      else blocks.push({ eraIdx: ei, days: [d], future: [], ended: false });
    }
    // 장이 열리며 요약을 타이핑하는 중 — 아직 줄이 없어도 그 장의 제목·요약은 보여야 한다.
    if (typing && !blocks.some((b) => b.eraIdx === typing.eraIdx))
      blocks.push({ eraIdx: typing.eraIdx, days: [], future: [], ended: false });
    const last = blocks[blocks.length - 1];
    if (last) {
      const e = eras[last.eraIdx];
      if (e) {
        const lastDay = last.days[last.days.length - 1] ?? e.startIdx - 1;
        last.ended =
          last.days.length > 0 && lastDay === e.endIdx && (e.endIdx < n - 1 || phase === 'end');
        if (!last.ended) for (let i = lastDay + 1; i <= e.endIdx; i++) last.future.push(i);
      }
    }
    for (const b of blocks.slice(0, -1)) b.ended = true;
    return blocks;
  }, [lines, eraOf, eras, n, phase, typing]);

  return (
    <>
      {/* 모바일(2026-09-18): 재생은 PC 전용 — 지도·글·판도를 한 화면에 두는 구성이라 좁은 화면에선 읽을 수 없다. 대신 안내와 장 목차·요약. */}
      <MobileFallback days={days} eras={eras} share={share} meta={meta} guildColor={guildColor} />
      <div className="hidden md:contents">
        <main className="mx-auto w-full max-w-[1400px] px-3 pt-3 pb-28 md:h-full md:min-h-0 md:px-5 md:pt-4 md:pb-24">
          {/* 큰 틀 하나를 3등분 — 지도 | 글 | 순위·시대. 각 칸이 자기 안에서 스크롤하고 페이지는 스크롤하지 않는다. 조작·시대 띠는 하단 플로팅. */}
          <div
            className={`flex flex-col rounded-2xl border md:grid md:h-full md:min-h-0 md:grid-cols-[430px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] md:divide-x md:divide-[#e2d9c6] md:overflow-hidden xl:grid-cols-[430px_minmax(0,1fr)_300px] ${PAPER.border} ${PAPER.card}`}
          >
            <aside className="min-h-0 md:flex md:h-full md:flex-col">
              <ColumnHeader
                title="대륙 지도"
                meta={
                  phase === 'era' || phase === 'detail'
                    ? `${monthDay(cur.kstDay)} · ${idx + 1}일째`
                    : `${monthDay(days[n - 1]!.kstDay)} 기준`
                }
              />
              <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 pt-4 pb-6">
                <div className="mx-auto w-full" style={{ maxWidth: STAGE_PX }}>
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
                        className="pointer-events-none absolute inset-0 z-40"
                      />
                      {mapPlay?.data.replay ? (
                        <ChronicleReplayPanel
                          key={`map-${mapPlay.dayIdx}-${mapPlay.session}`}
                          text={mapPlay.data.text}
                          replay={mapPlay.data.replay}
                          zones={zones.map((z) => ({
                            id: z.id,
                            name: z.name,
                            mapX: z.mapX,
                            mapY: z.mapY,
                          }))}
                          layer={layer}
                          zoneColor={zoneColor}
                          onOwnerFlip={(zoneId, guild) => {
                            if (mapPlay.session === run.current)
                              setOwners((o) => ({ ...o, [zoneId]: guild }));
                          }}
                          onNeutralize={(zoneId) => {
                            if (mapPlay.session === run.current)
                              setOwners((o) => ({ ...o, [zoneId]: null }));
                          }}
                          onDone={() => {
                            if (mapPlay.session === run.current) mapDoneRef.current?.();
                          }}
                          speed={speed * FLOW_SPEED}
                          pausedRef={pausedRef}
                          reveal="map"
                        />
                      ) : null}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={mapSrc}
                        alt="대륙 지도"
                        draggable={false}
                        className="absolute inset-0 h-full w-full object-cover"
                        style={{ imageRendering: 'pixelated' }}
                      />
                      {/* 길(인접선) — 배경 톤. */}
                      <svg
                        viewBox="0 0 100 100"
                        preserveAspectRatio="none"
                        className="pointer-events-none absolute inset-0 h-full w-full"
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
                      {/* 영토 빛 — 소유 길드 색의 부드러운 원. 소유가 바뀌면 700ms에 걸쳐 색이 흐른다. */}
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
                              opacity: c ? (focusKey && !isFocused(owner) ? 0.12 : 1) : 0,
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
                        const ring = pulse[z.id];
                        const focused = isFocused(owner);
                        return (
                          <div
                            key={z.id}
                            onPointerEnter={() => {
                              if (owner) focusByName(owner);
                            }}
                            onPointerLeave={() => focusByName(null)}
                            className="absolute -translate-x-1/2 -translate-y-1/2 transition-[opacity,scale] duration-200"
                            style={{
                              left: `${z.mapX}%`,
                              top: `${z.mapY}%`,
                              zIndex: focused ? 20 : owner ? 10 : 6,
                              opacity: focusKey && !focused ? 0.28 : 1,
                              scale: focused ? 1.3 : 1,
                            }}
                            title={`${z.name}${owner ? ` · ${owner}` : ''}`}
                          >
                            {ring ? (
                              <span
                                key={ring}
                                aria-hidden
                                className="pointer-events-none absolute inset-0 rounded-[6px] motion-safe:animate-[igRing_1.2s_ease-out_1]"
                                style={{ ['--ring' as string]: `${gc}aa` }}
                              />
                            ) : null}
                            <span
                              className="relative flex items-center justify-center overflow-hidden rounded-[5px] transition-[width,height,background-color] duration-500"
                              style={{
                                width: size,
                                height: size,
                                backgroundColor: owner
                                  ? `color-mix(in srgb, ${gc} 40%, #fdfaf3)`
                                  : 'rgba(10,12,20,0.55)',
                                boxShadow: focused
                                  ? `0 0 0 2px ${gc}, 0 0 10px 2px ${gc}, 0 1px 2px rgba(0,0,0,.55)`
                                  : owner
                                    ? `0 0 0 1.5px ${gc}, 0 1px 2px rgba(0,0,0,.55)`
                                    : `0 0 0 1px ${color}66`,
                              }}
                            >
                              {owner ? (
                                <>
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
                    {focusChip ? (
                      <div
                        aria-live="polite"
                        className="pointer-events-none absolute top-2 left-2 z-50 flex items-center gap-1.5 rounded-[6px] bg-[#fdfaf3]/95 px-2 py-1 text-[11.5px] font-bold text-[#2a251e] shadow-[0_2px_8px_rgba(0,0,0,.35)]"
                        style={SERIF}
                      >
                        <i
                          className="h-2.5 w-2.5 rounded-[2px]"
                          style={{ background: focusChip.color }}
                        />
                        {focusChip.name}
                        <span className={`font-normal tabular-nums ${PAPER.muted}`}>
                          {focusChip.count}곳
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
                {/* 판도 띠 — 길드별 영토 비율(이름·수는 오른쪽 판도 칸이 맡는다). */}
                <div className="mx-auto mt-3 w-full" style={{ maxWidth: STAGE_PX }}>
                  <div className="flex h-2 overflow-hidden rounded-full bg-[#e2d9c6]">
                    {share.map(([g, c]) => (
                      <div
                        key={g}
                        title={`${g} ${c}`}
                        className="h-full transition-[width,opacity] duration-700 ease-out"
                        style={{
                          width: `${(c / Math.max(1, zones.length)) * 100}%`,
                          background: meta[g]?.color ?? '#9a917f',
                          opacity: focusKey && !isFocused(g) ? 0.3 : 1,
                        }}
                      />
                    ))}
                  </div>
                </div>
                {/* 넓은 화면: 지도 아래는 장 목차(지도를 보며 장을 고른다). 중간 폭: 판도·목차를 모두 여기에. */}
                <div className="mx-auto mt-6 hidden w-full xl:block" style={{ maxWidth: STAGE_PX }}>
                  <EraToc eras={eras} days={days} curEra={curEraIdx} onEra={(k) => flowFrom(k)} />
                </div>
                <div className="mt-6 xl:hidden">
                  <div className={`mb-2 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>판도</div>
                  <RacePanel
                    share={share}
                    meta={meta}
                    guildEmblem={guildEmblem}
                    onFocus={focusByName}
                    focusKey={focusKey}
                    keyOf={guildKey}
                  />
                  <div className="mt-6">
                    <EraToc eras={eras} days={days} curEra={curEraIdx} onEra={(k) => flowFrom(k)} />
                  </div>
                </div>
              </div>
            </aside>

            {/* ── 글(가운데) — 정지: 목차, 흐름: 장·줄, 자세히: 그날 연대기. ── */}
            {/* 글 속 길드 이름(data-guild)에 올리면 지도에서 그 길드를 밝힌다 — 이름마다 핸들러를 달지 않고 칸에서 한 번에. */}
            <section
              className="min-h-0 md:flex md:h-full md:flex-col"
              onPointerOver={(ev) => {
                if (ev.pointerType !== 'mouse' || !(ev.target instanceof Element)) return;
                focusByName(ev.target.closest('[data-guild]')?.getAttribute('data-guild') ?? null);
              }}
              onPointerLeave={() => focusByName(null)}
            >
              <ColumnHeader title={midTitle} meta={statusText} />

              {phase === 'idle' ? (
                <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
                  <div className="max-w-[64ch]">
                    <div className="text-[22px] leading-tight font-bold" style={SERIF}>
                      대륙의 역사
                    </div>
                    <div className={`mt-1 text-[11px] tabular-nums ${PAPER.muted}`}>
                      {monthDay(days[0]!.kstDay)}부터 {monthDay(days[n - 1]!.kstDay)}까지 · {n}일의
                      기록
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => flowFrom(0)}
                        className="inline-flex items-center gap-2 rounded-[9px] bg-[#8a4b23] px-4 py-2 text-[12.5px] font-bold text-white"
                      >
                        <Icon name="play" />
                        처음부터 시대별로
                      </button>
                    </div>
                    {/* 장 목차 — 제N장 · 「길드」의 시대 · 기간 · 요약. 누르면 그 장부터. 최근 장이 위(09-18 사용자 지시, 장 번호는 시간순). */}
                    <div className="mt-7 flex flex-col gap-4">
                      {newestFirst(eras).map(([e, i]) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => flowFrom(e.startIdx)}
                          className={`-mx-3 rounded-[10px] px-3 py-3 text-left ${PAPER.hover}`}
                          title="이 장부터 재생"
                        >
                          <div
                            className={`flex items-center gap-2 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}
                          >
                            <span>제{i + 1}장</span>
                            <i
                              className="h-2.5 w-2.5 rounded-[2px]"
                              style={{ background: e.color ?? '#9a917f' }}
                            />
                            <span className="tracking-normal tabular-nums">{eraSpan(e, days)}</span>
                          </div>
                          <div className="mt-1 text-[22px] leading-tight font-bold" style={SERIF}>
                            「{e.name}」의 시대
                          </div>
                          <div className="mt-2 text-[13.5px] leading-[1.8]">
                            <Headline text={e.summary} guildColor={guildColor} />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div ref={readerRef} className="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
                  <div className="max-w-[64ch]">
                    {phase === 'detail' && detail ? (
                      <div>
                        <div
                          className={`mb-3 flex items-center justify-between gap-2 rounded-[8px] border border-dashed px-3 py-2 text-[12.5px] ${PAPER.border}`}
                        >
                          <span>
                            <b style={SERIF}>{monthDay(detail.data?.kstDay ?? cur.kstDay)}</b>{' '}
                            자세히 보는 중
                            {curEra ? ` · 제${curEraIdx + 1}장 「${curEra.name}」의 시대` : ''}
                          </span>
                          <button
                            type="button"
                            onClick={() => flowFrom(detail.dayIdx + 1)}
                            className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold text-[#8a4b23] ${PAPER.border} ${PAPER.hover}`}
                          >
                            ← 시대 흐름으로
                          </button>
                        </div>
                        {detail.data?.headline ? (
                          <div className="mb-3 text-[15px] leading-[1.45] font-bold" style={SERIF}>
                            <Headline text={detail.data.headline} guildColor={guildColor} />
                          </div>
                        ) : null}
                        {!detail.data ? (
                          detail.failed ? (
                            <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                              <span className={PAPER.muted}>
                                이날의 기록을 불러오지 못했습니다.
                              </span>
                              <button
                                type="button"
                                onClick={() => openDetail(detail.dayIdx)}
                                className={`rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold text-[#8a4b23] ${PAPER.border} ${PAPER.hover}`}
                              >
                                다시 시도
                              </button>
                            </div>
                          ) : (
                            <p className={`text-[12px] ${PAPER.muted}`}>기록을 펼치는 중…</p>
                          )
                        ) : (
                          <div className="ig-day" key={`${detail.dayIdx}-${detail.session}`}>
                            {detail.data.replay ? (
                              <ChronicleReplayPanel
                                text={detail.data.text}
                                replay={detail.data.replay}
                                zones={zones.map((z) => ({
                                  id: z.id,
                                  name: z.name,
                                  mapX: z.mapX,
                                  mapY: z.mapY,
                                }))}
                                layer={layer}
                                zoneColor={zoneColor}
                                onOwnerFlip={(zoneId, guild) => {
                                  if (detail.session === run.current)
                                    setOwners((o) => ({ ...o, [zoneId]: guild }));
                                }}
                                onNeutralize={(zoneId) => {
                                  if (detail.session === run.current)
                                    setOwners((o) => ({ ...o, [zoneId]: null }));
                                }}
                                onDone={() => {
                                  if (detail.session === run.current) setDetailDone(true);
                                }}
                                speed={speed}
                                pausedRef={pausedRef}
                                guildColor={guildColor}
                                zoneStyle="plain"
                                userStyle="plain"
                                reveal="type"
                              />
                            ) : (
                              <StaticChronicle
                                text={detail.data.text}
                                guildColor={guildColor}
                                guildEmblem={NO_EMBLEM}
                              />
                            )}
                          </div>
                        )}
                        {detailDone ? (
                          <div className="mt-5 flex flex-wrap items-center gap-2 motion-safe:animate-[fadeIn_.5s_ease-out]">
                            {detail.dayIdx + 1 < n ? (
                              <button
                                type="button"
                                onClick={() => openDetail(detail.dayIdx + 1)}
                                className="rounded-full bg-[#8a4b23] px-3 py-1 text-[11px] font-bold text-white"
                              >
                                다음 날도 자세히 ▶
                              </button>
                            ) : null}
                            <button
                              type="button"
                              onClick={() => flowFrom(detail.dayIdx + 1)}
                              className={`rounded-full border px-3 py-1 text-[11px] font-bold text-[#8a4b23] ${PAPER.border} ${PAPER.hover}`}
                            >
                              시대 흐름으로 돌아가기
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <>
                        {flowBlocks.map((b, bi) => {
                          const e = eras[b.eraIdx];
                          if (!e) return null;
                          const isLast = bi === flowBlocks.length - 1;
                          return (
                            <section key={b.eraIdx} className={bi === 0 ? '' : 'mt-8'}>
                              <ChapterHeading era={e} index={b.eraIdx + 1} days={days} />
                              <p
                                className={`text-[13.5px] leading-[1.8] ${isLast ? '' : 'opacity-70'}`}
                              >
                                {typing && typing.eraIdx === b.eraIdx ? (
                                  <TypedHeadline
                                    key={typing.session}
                                    text={e.summary}
                                    guildColor={guildColor}
                                    charMs={SUMMARY_CHAR_MS / speed}
                                    pausedRef={pausedRef}
                                    onDone={() => {
                                      if (typing.session === run.current) typingDoneRef.current?.();
                                    }}
                                  />
                                ) : (
                                  <Headline text={e.summary} guildColor={guildColor} />
                                )}
                              </p>
                              <div className="mt-3.5">
                                {b.days.map((d, di) => (
                                  <DayLine
                                    key={d}
                                    day={days[d]!}
                                    events={story.events[days[d]!.kstDay] ?? []}
                                    guildColor={guildColor}
                                    state={
                                      isLast && di === b.days.length - 1 && phase === 'era'
                                        ? 'now'
                                        : 'past'
                                    }
                                    onDetail={() => openDetail(d)}
                                    onJump={() => flowFrom(d)}
                                  />
                                ))}
                                {b.future.map((d) => (
                                  <DayLine
                                    key={d}
                                    day={days[d]!}
                                    events={story.events[days[d]!.kstDay] ?? []}
                                    guildColor={guildColor}
                                    state="future"
                                    onJump={() => flowFrom(d)}
                                  />
                                ))}
                              </div>
                              {b.ended && e.closing ? (
                                <div className="mt-3 border-l-[3px] border-[#8a4b23] bg-[#ece3d1]/60 px-3 py-2 text-[12.5px] motion-safe:animate-[fadeIn_.6s_ease-out]">
                                  <Headline text={e.closing} guildColor={guildColor} />
                                </div>
                              ) : null}
                            </section>
                          );
                        })}
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
                              다음 기록은 자정에 열립니다
                            </div>
                            <div className="mt-3 flex justify-center gap-2">
                              <button
                                type="button"
                                onClick={() => flowFrom(0)}
                                className="inline-flex items-center gap-2 rounded-[9px] bg-[#8a4b23] px-3.5 py-2 text-[12px] font-bold text-white"
                              >
                                <Icon name="first" />
                                처음부터 다시
                              </button>
                              <button
                                type="button"
                                onClick={goToIdle}
                                className={`rounded-[9px] border px-3.5 py-2 text-[12px] font-bold ${PAPER.border} ${PAPER.hover}`}
                              >
                                지금의 대륙
                              </button>
                            </div>
                          </section>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              )}
            </section>

            {/* ── 판도(오른쪽, 넓은 화면) — 길드별 영토 바 레이스. 장 목차는 지도 아래로. ── */}
            <aside className="hidden min-h-0 xl:flex xl:h-full xl:flex-col">
              <ColumnHeader
                title="판도"
                meta={`${share.length}개 길드 · 중립 ${zones.length - ownedCount}`}
              />
              <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-6">
                <RacePanel
                  share={share}
                  meta={meta}
                  guildEmblem={guildEmblem}
                  onFocus={focusByName}
                  focusKey={focusKey}
                  keyOf={guildKey}
                  tall
                />
              </div>
            </aside>
          </div>

          {/* ── 플로팅 컨트롤러 — 재생 조작 · 배속 · 시대 띠(스크러버) · N / 전체. 장 이동은 오른쪽 시대 목차·시대 띠가 맡는다(09-18 버튼 삭제). ── */}
          <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
            <div
              className={`pointer-events-auto flex w-full max-w-[1120px] flex-wrap items-center gap-2 rounded-xl border bg-[#fdfaf3]/95 px-3 py-2 shadow-[0_8px_24px_-8px_rgba(40,30,10,.35)] backdrop-blur ${PAPER.border}`}
            >
              <IconBtn onClick={() => flowFrom(0)} title="처음부터" icon="first" />
              <IconBtn
                onClick={() => stepDay(-1)}
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
                onClick={() => stepDay(1)}
                title="다음 날"
                icon="next"
                disabled={phase === 'idle' || idx >= n - 1}
              />
              <button
                type="button"
                onClick={() =>
                  setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length] ?? 1)
                }
                title="배속(누를 때마다 ×1 → ×2 → ×4)"
                className={`h-7 rounded-lg border px-2 text-[11px] font-bold tabular-nums ${speed === 1 ? `${PAPER.border} ${PAPER.hover}` : 'border-[#2a251e] bg-[#2a251e] text-[#f5f0e6]'}`}
              >
                ×{speed}
              </button>
              <EraScrubber
                days={days}
                eras={eras}
                ticks={ticks}
                events={story.events}
                pos={phase === 'idle' ? n - 1 : idx}
                dimAfter={phase === 'era' || phase === 'detail' ? idx : null}
                onSeek={flowFrom}
                guildColor={guildColor}
              />
              <span className={`pr-1 text-[11px] tabular-nums ${PAPER.muted}`}>
                {phase === 'idle' ? `${n}일` : `${idx + 1} / ${n}`}
              </span>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}

/**
 * 모바일 대체 화면 — 역사 재생은 넓은 화면(지도 390 + 글 + 판도)을 전제로 해, 폰에서는 PC로 열어 달라고 안내하고
 * 읽을 수 있는 것(장 목차·시대 요약·지금의 판도)만 보여 준다. 카카오톡 공유로 폰에서 여는 사람이 빈 화면을 보지 않게.
 */
function MobileFallback({
  days,
  eras,
  share,
  meta,
  guildColor,
}: {
  days: HistoryDay[];
  eras: HistoryEra[];
  share: [string, number][];
  meta: Record<string, HistoryGuildMeta>;
  guildColor: (name: string) => string | null;
}) {
  const [copied, setCopied] = useState(false);
  const n = days.length;
  return (
    <main className="mx-auto w-full max-w-[560px] px-4 pt-5 pb-12 md:hidden">
      <div className="text-[22px] leading-tight font-bold" style={SERIF}>
        대륙의 역사
      </div>
      <div className={`mt-1 text-[11px] tabular-nums ${PAPER.muted}`}>
        {monthDay(days[0]!.kstDay)}부터 {monthDay(days[n - 1]!.kstDay)}까지 · {n}일의 기록
      </div>
      <div className={`mt-4 rounded-[10px] border px-4 py-3 ${PAPER.border} ${PAPER.card}`}>
        <div className="text-[13.5px] font-bold">지도 재생은 PC에서 볼 수 있어요</div>
        <p className={`mt-1 text-[12.5px] leading-[1.7] ${PAPER.muted}`}>
          PC에서 이 주소를 열어 주세요. 아래에서는 시대별 이야기를 읽을 수 있습니다.
        </p>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(window.location.href);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              setCopied(false);
            }
          }}
          className="mt-2.5 rounded-[8px] bg-[#8a4b23] px-3 py-1.5 text-[12px] font-bold text-white"
        >
          {copied ? '주소를 복사했어요' : '주소 복사'}
        </button>
      </div>
      {share.length > 0 ? (
        <section className="mt-6">
          <div className={`mb-2 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>지금의 판도</div>
          <div className="flex flex-col gap-1.5">
            {share.slice(0, 6).map(([g, c]) => (
              <div key={g} className="flex items-center gap-2 text-[12.5px]">
                <i
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ background: meta[g]?.color ?? '#9a917f' }}
                />
                <span className="min-w-0 flex-1 truncate font-semibold">{g}</span>
                <span className={`tabular-nums ${PAPER.muted}`}>{c}곳</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <section className="mt-7 flex flex-col gap-6">
        {/* 최근 시대가 위로(2026-09-18 사용자 지시) — 장 번호는 시간 순서 그대로 둔다. */}
        {newestFirst(eras).map(([e, i]) => (
          <article key={i}>
            <ChapterHeading era={e} index={i + 1} days={days} />
            <p className="text-[13.5px] leading-[1.8]">
              <Headline text={e.summary} guildColor={guildColor} />
            </p>
            {e.closing ? (
              <p className={`mt-2 text-[12.5px] leading-[1.7] ${PAPER.muted}`}>
                <Headline text={e.closing} guildColor={guildColor} />
              </p>
            ) : null}
          </article>
        ))}
      </section>
    </main>
  );
}

/**
 * 하단 시대 띠(스크러버) — 장 색 띠 위에 지금 날 노브, 아래 사건 눈금.
 * 호버 툴팁(2026-09-18 사용자 요청): 포인터 아래 날의 장·날짜·헤드라인·사건을 띄운다. 호버 상태를 이 안에 두어
 * 움직일 때 재생 화면 전체가 다시 그려지지 않게 한다.
 * 날 i는 띠의 [i/n, (i+1)/n] 칸을 차지하고 노브·눈금은 칸 가운데 — 장 색 칸과 호버·클릭한 날이 어긋나지 않는다.
 * 클릭·끌기는 이 칸 계산으로 직접 처리하고, 투명 range는 키보드 조작용으로만 남긴다(pointer-events 없음).
 */
function EraScrubber({
  days,
  eras,
  ticks,
  events,
  pos,
  dimAfter,
  onSeek,
  guildColor,
}: {
  days: HistoryDay[];
  eras: HistoryEra[];
  ticks: { i: number; label: string; big: boolean }[];
  events: Record<string, HistoryEvent[]>;
  pos: number;
  dimAfter: number | null;
  onSeek: (i: number) => void;
  guildColor: (name: string) => string | null;
}) {
  const n = days.length;
  const barRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ on: boolean; last: number }>({ on: false, last: -1 });
  const [hover, setHover] = useState<number | null>(null);
  const center = (i: number) => (n <= 0 ? 0 : ((i + 0.5) / n) * 100);
  const dayAt = (clientX: number) => {
    const r = barRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return 0;
    const ratio = Math.min(Math.max((clientX - r.left) / r.width, 0), 0.9999);
    return Math.floor(ratio * n);
  };
  const eraOf = (i: number) => eras.findIndex((e) => e.startIdx <= i && i <= e.endIdx);
  const tip =
    hover === null
      ? null
      : (() => {
          const k = eraOf(hover);
          const era = k >= 0 ? eras[k]! : null;
          const day = days[hover]!;
          const evs = [...(events[day.kstDay] ?? [])]
            .sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind])
            .slice(0, 3);
          return { k, era, day, evs };
        })();
  return (
    <div className="min-w-[260px] flex-1 px-2">
      <div
        ref={barRef}
        className="relative cursor-pointer rounded-[5px] has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-[#8a4b23]/40"
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {
            // 캡처가 안 되는 포인터면 끌기만 빠진다(누른 날로 이동은 그대로).
          }
          const i = dayAt(e.clientX);
          dragRef.current = { on: true, last: i };
          setHover(i);
          onSeek(i);
        }}
        onPointerMove={(e) => {
          const i = dayAt(e.clientX);
          if (i !== hover) setHover(i);
          const d = dragRef.current;
          if (d.on && i !== d.last) {
            d.last = i;
            onSeek(i);
          }
        }}
        onPointerUp={() => {
          dragRef.current.on = false;
        }}
        onPointerCancel={() => {
          dragRef.current.on = false;
          setHover(null);
        }}
        onPointerLeave={() => {
          if (!dragRef.current.on) setHover(null);
        }}
      >
        <div
          className="flex h-[18px] overflow-hidden rounded-[5px] shadow-[inset_0_0_0_1px_rgba(0,0,0,.08)]"
          role="list"
          aria-label="시대"
        >
          {eras.map((e, i) => {
            const len = e.endIdx - e.startIdx + 1;
            const future = dimAfter !== null && e.startIdx > dimAfter;
            return (
              <div
                key={i}
                role="listitem"
                className="flex h-full items-center overflow-hidden px-1.5 text-[10px] font-bold whitespace-nowrap text-[#f7f2e8] transition-opacity duration-500"
                style={{
                  width: `${(len / n) * 100}%`,
                  background: e.color ?? '#9a917f',
                  opacity: future ? 0.35 : hover !== null && eraOf(hover) !== i ? 0.55 : 1,
                }}
              >
                {len >= 4 ? `「${e.name}」의 시대 · ${len}일` : len >= 2 ? `${e.name} ${len}` : ''}
              </div>
            );
          })}
        </div>
        <input
          type="range"
          min={0}
          max={n - 1}
          value={pos}
          onChange={(e) => onSeek(Number(e.target.value))}
          aria-label="날짜"
          className="pointer-events-none absolute inset-0 h-full w-full opacity-0"
        />
        {hover !== null && hover !== pos ? (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-full w-[2px] -translate-x-1/2 bg-[#fdfaf3]/85"
            style={{ left: `${center(hover)}%` }}
          />
        ) : null}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-[3px] h-[24px] w-[3px] rounded-[2px] bg-[#8a4b23] shadow-[0_0_0_2px_#fdfaf3] transition-[left] duration-300"
          style={{ left: `calc(${center(pos)}% - 1.5px)` }}
        />
        {tip ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-[calc(100%+5px)] z-20 h-2 w-2 -translate-x-1/2 rotate-45 border-r border-b border-[#d8ceb9] bg-[#fdfaf3]"
              style={{ left: `${center(hover!)}%` }}
            />
            <div
              role="tooltip"
              className="pointer-events-none absolute bottom-[calc(100%+9px)] z-10 w-[264px] -translate-x-1/2 rounded-[9px] border border-[#d8ceb9] bg-[#fdfaf3] px-3 py-2.5 text-left shadow-[0_8px_22px_rgba(42,37,30,.16)]"
              style={{ left: `clamp(132px, ${center(hover!)}%, calc(100% - 132px))` }}
            >
              {tip.era ? (
                <div className={`flex items-center gap-1.5 text-[10.5px] ${PAPER.muted}`}>
                  <i
                    className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: tip.era.color ?? '#9a917f' }}
                  />
                  <span className="truncate">
                    제{tip.k + 1}장 「{tip.era.name}」의 시대
                  </span>
                </div>
              ) : null}
              <div className="mt-1 text-[13px] font-bold tabular-nums" style={SERIF}>
                {monthDay(tip.day.kstDay)}
              </div>
              {tip.day.headline ? (
                <div className="mt-0.5 line-clamp-2 text-[12px] leading-[1.5]" style={SERIF}>
                  <Headline text={tip.day.headline} guildColor={guildColor} />
                </div>
              ) : null}
              {tip.evs.length > 0 ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {tip.evs.map((ev, j) => (
                    <span
                      key={j}
                      className={`rounded-[4px] px-1.5 py-px text-[9.5px] font-bold ${
                        ev.kind === 'leader' || ev.kind === 'sweep'
                          ? 'bg-[#8a4b23] text-[#fdfaf3]'
                          : `bg-[#ece3d1] ${PAPER.muted}`
                      }`}
                    >
                      {ev.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
      <div className="relative mt-[3px] h-[6px]">
        {ticks.map((t) => (
          <button
            key={t.i}
            type="button"
            aria-label={`${days[t.i]!.kstDay} ${t.label}`}
            onClick={() => onSeek(t.i)}
            onPointerEnter={() => setHover(t.i)}
            onPointerLeave={() => setHover(null)}
            className="absolute top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-b-[5px] border-x-transparent"
            style={{
              left: `${center(t.i)}%`,
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
  );
}

/** 칸 머리 — 세 칸이 같은 높이·선·글자로 시작한다(2026-09-18 레이아웃 정리). */
function ColumnHeader({ title, meta }: { title: string; meta?: string }) {
  return (
    <div
      className={`flex h-11 shrink-0 items-center justify-between gap-3 border-b px-5 ${PAPER.border}`}
    >
      <div className="truncate text-[13.5px] font-bold" style={SERIF}>
        {title}
      </div>
      {meta ? (
        <div className={`shrink-0 truncate text-[11px] tabular-nums ${PAPER.muted}`}>{meta}</div>
      ) : null}
    </div>
  );
}

/** 판도 — 길드별 영토 바 레이스. */
function RacePanel({
  share,
  meta,
  guildEmblem,
  onFocus,
  focusKey = null,
  keyOf,
  tall = false,
}: {
  share: [string, number][];
  meta: Record<string, HistoryGuildMeta>;
  guildEmblem: (name: string) => readonly string[];
  onFocus?: (name: string | null) => void;
  focusKey?: string | null;
  /** 행 키 — 호버 강조 키(guildKey)와 같은 함수여야 밖에서 고른 길드 막대를 찾는다. */
  keyOf: (name: string) => string;
  tall?: boolean;
}) {
  if (share.length === 0)
    return <div className={`text-[12px] ${PAPER.muted}`}>아직 세워진 깃발이 없습니다</div>;
  return (
    <HistoryRace
      height={tall ? 300 : 240}
      onFocus={onFocus}
      focusKey={focusKey}
      rows={share.map(([g, c]) => ({
        key: keyOf(g),
        name: g,
        count: c,
        color: meta[g]?.color ?? '#9a917f',
        emblems: guildEmblem(g),
      }))}
    />
  );
}

/** 장 목차 — 누르면 그 장 처음부터. 지금 장은 밝게. 최근 장이 위. */
function EraToc({
  eras,
  days,
  curEra,
  onEra,
}: {
  eras: HistoryEra[];
  days: HistoryDay[];
  curEra: number;
  onEra: (startIdx: number) => void;
}) {
  if (eras.length === 0) return null;
  return (
    <div>
      <div className={`mb-2 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>장 목차</div>
      <div className={`divide-y border-y ${PAPER.border} divide-[#ece5d6]`}>
        {newestFirst(eras).map(([e, i]) => (
          <button
            key={i}
            type="button"
            onClick={() => onEra(e.startIdx)}
            title="이 장 처음부터"
            className={`flex w-full items-center gap-2.5 px-2 py-2.5 text-left text-[12.5px] ${i === curEra ? 'bg-[#f6efe1]' : PAPER.hover}`}
          >
            <span className={`w-10 shrink-0 text-[10.5px] tabular-nums ${PAPER.muted}`}>
              제{i + 1}장
            </span>
            <i
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ background: e.color ?? '#9a917f' }}
            />
            <span className="min-w-0 flex-1 truncate font-semibold" style={SERIF}>
              「{e.name}」의 시대
            </span>
            <span className={`shrink-0 text-[11px] tabular-nums ${PAPER.muted}`}>
              {eraSpan(e, days)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** 장 머리 — 목차 항목과 같은 모양(눈썹: 제N장 · 색 · 기간, 제목 22px). 본문과 같은 왼쪽 축. */
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
  return (
    <div className="mb-3">
      <div className={`flex items-center gap-2 text-[10.5px] tracking-[.2em] ${PAPER.muted}`}>
        <span>제{index}장</span>
        <i className="h-2.5 w-2.5 rounded-[2px]" style={{ background: era.color ?? '#9a917f' }} />
        <span className="tracking-normal tabular-nums">{eraSpan(era, days)}</span>
      </div>
      <div className="mt-1 text-[22px] leading-tight font-bold" style={SERIF}>
        「{era.name}」의 시대
      </div>
    </div>
  );
}

/** 시대 흐름의 하루 줄 — 날짜 · 헤드라인 · 사건 칩 · 자세히. now=지금 지도가 보여 주는 날, past=지난 날, future=아직 안 온 날. */
function DayLine({
  day,
  events,
  guildColor,
  state,
  onDetail,
  onJump,
}: {
  day: HistoryDay;
  events: HistoryEvent[];
  guildColor: (name: string) => string | null;
  state: 'now' | 'past' | 'future';
  onDetail?: () => void;
  /** 줄(날짜·헤드라인)을 누르면 그날로 이동(2026-09-18 사용자 지시). */
  onJump?: () => void;
}) {
  const chips = [...events]
    .sort((a, b) => EVENT_PRIORITY[a.kind] - EVENT_PRIORITY[b.kind])
    .slice(0, 2);
  return (
    // 줄 전체(여백 포함)를 누르면 그날로 — 안쪽 버튼은 키보드용, 자세히는 전파를 막는다.
    <div
      id={state === 'now' ? 'ig-now' : undefined}
      onClick={onJump}
      className={`grid cursor-pointer grid-cols-[1fr_auto] items-baseline gap-2.5 rounded-[7px] px-1.5 py-1.5 text-[12.5px] transition-opacity ${
        state === 'now'
          ? 'bg-[#ece3d1] motion-safe:animate-[fadeIn_.5s_ease-out]'
          : state === 'future'
            ? 'opacity-35 hover:bg-[#f3ecdd] hover:opacity-100'
            : 'opacity-60 hover:bg-[#f3ecdd] hover:opacity-100'
      }`}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onJump?.();
        }}
        title={`${monthDay(day.kstDay)}로 이동`}
        className="grid cursor-pointer grid-cols-[42px_1fr] items-baseline gap-2.5 text-left"
      >
        <span className={`text-[10.5px] tabular-nums ${PAPER.muted}`}>{shortDay(day.kstDay)}</span>
        <span className="leading-[1.45] font-bold" style={SERIF}>
          {day.headline ? (
            <Headline text={day.headline} guildColor={guildColor} />
          ) : (
            <span className={`font-normal ${PAPER.muted}`}>기록</span>
          )}
          {chips.map((e, i) => (
            <i
              key={i}
              title={e.label}
              className={`ml-1.5 rounded-[4px] px-1.5 align-[1px] text-[9.5px] font-bold not-italic ${
                e.kind === 'leader' || e.kind === 'sweep'
                  ? 'bg-[#8a4b23] text-[#fdfaf3]'
                  : `bg-[#ece3d1] ${PAPER.muted}`
              }`}
              style={{ fontFamily: 'inherit' }}
            >
              {e.short}
            </i>
          ))}
        </span>
      </button>
      {state === 'future' ? (
        <span />
      ) : (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDetail?.();
          }}
          className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[10.5px] font-bold whitespace-nowrap ${
            state === 'now'
              ? 'border-[#8a4b23] bg-[#8a4b23] text-[#fdfaf3]'
              : `${PAPER.border} text-[#8a4b23] ${PAPER.hover}`
          }`}
          title="이날의 연대기를 자세히 재생"
        >
          자세히{state === 'now' ? ' ▶' : ''}
        </button>
      )}
    </div>
  );
}

/** 리플레이 스크립트가 없는 날의 정적 본문 — 마커를 색 이름으로. */
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
          if (kind === 'g')
            parts.push(
              <GuildInline
                key={k++}
                name={name}
                shown={name}
                color={guildColor(name)}
                urls={guildEmblem(name)}
              />,
            );
          else
            parts.push(
              <span key={k++} className="font-medium">
                {name}
              </span>,
            );
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
} as const;
type IconName = keyof typeof ICONS;

/** 조작 아이콘 — 이모지는 글꼴마다 폭이 달라 버튼이 들쭉날쭉해서 SVG로. */
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
