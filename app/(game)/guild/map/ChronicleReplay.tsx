'use client';

import { useEffect, useRef, useState } from 'react';

import type { ConquestReplay, ReplayEvent } from '@/lib/game/guild/conquest/replay';

import { parseChronicleSegments, type ChronicleSegment } from './chronicle-tokens';

/**
 * 세계지도 '오늘의 역사' 리플레이(2026-07-16 확정 연출) — 연대기 타이핑과 지도 연출 동기화.
 *  - {z|구역} 마커 완성 → 문장 진군(곡선, %키프레임 — 노드에 정확 착지) → 격돌 → 점령 플래시
 *  - 연속 나열({z|A}·{z|B}·{z|C})은 한 그룹으로 **동시 발표**(마지막 구역명에서 일괄 진군)
 *  - 재언급 변주: 이미 점령된 구역 재언급=단일 펄스, {g|길드} 언급=그 길드가 오늘 얻은 구역 일괄 펄스,
 *    '조각' 서술=최근 언급 길드 영토의 연결 조각을 조각 단위로 순차 펄스(인접 그래프)
 *  - 움직이는 문양은 배경 없음(문양 이미지만, 미보유 길드만 색 방패 폴백)
 *  - 탭=스킵, prefers-reduced-motion=정적
 */

export type ReplayZonePos = { id: number; name: string; mapX: number; mapY: number };

const CHAR_MS = 82; // 2026-07-16 감속 2차
const MARCH_MS = 2600;

const sleepUnless = (ms: number, skip: () => boolean) =>
  new Promise<void>((r) => (skip() ? r() : setTimeout(r, ms)));

/** 목표 지점에서 가장 가까운 지도 밖 가장자리(%) — 무영지 길드의 등장 지점. */
function edgeNear(t: { mapX: number; mapY: number }): { x: number; y: number } {
  const cands = [
    { x: -6, y: t.mapY }, { x: 106, y: t.mapY }, { x: t.mapX, y: -8 }, { x: t.mapX, y: 110 },
  ];
  let best = cands[0]!;
  let bd = Infinity;
  for (const c of cands) {
    const d = (c.x - t.mapX) ** 2 + (c.y - t.mapY) ** 2;
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

/** 연속 나열 그룹 경계 — 구역 마커 사이가 나열 접속(·,와/과/및/공백)뿐이면 같은 그룹. */
const LIST_GLUE_RE = /^[\s·,]*(?:과|와|및|이랑|랑)?[\s·,]*$/;

export function ChronicleReplayPanel({
  text,
  replay,
  zones,
  adjacency,
  layer,
  zoneColor,
  onOwnerFlip,
  onDone,
}: {
  text: string;
  replay: ConquestReplay;
  zones: ReplayZonePos[];
  adjacency: { a: number; b: number }[];
  layer: HTMLDivElement | null;
  zoneColor: (name: string) => string | null;
  onOwnerFlip: (zoneId: number, guild: string) => void;
  onDone: () => void;
}) {
  const paras = useRef(text.split(/\n{2,}/).map((p) => parseChronicleSegments(p.trim())));
  const [pos, setPos] = useState<{ p: number; s: number; c: number }>({ p: 0, s: 0, c: 0 });
  const [ended, setEnded] = useState(false);
  const skipRef = useRef(false);
  const doneRef = useRef(false);
  const firedRef = useRef(new Set<string>());
  // 소유 미러 — 부모 flip과 동일 궤적(길드 펄스·조각 계산용, 부모 상태 재조회 없이 자체 추적).
  const ownersRef = useRef<Record<number, string | null>>({ ...replay.beforeOwner });
  const lastGuildRef = useRef<string | null>(null);
  const guildPulseAtRef = useRef(new Map<string, number>());

  const zoneById = useRef(new Map(zones.map((z) => [z.id, z])));

  // ── 연속 나열 그룹 사전 계산 — 각 z세그(p,s) → groupKey, 그룹 마지막 z에서 일괄 실행 ──
  const groups = useRef<Map<string, { zones: string[]; lastKey: string }>>(new Map());
  useEffect(() => {
    const g = new Map<string, { zones: string[]; lastKey: string }>();
    for (let p = 0; p < paras.current.length; p++) {
      const segs = paras.current[p]!;
      let cur: { keys: string[]; zones: string[] } | null = null;
      const flush = () => {
        if (!cur) return;
        const groupId = cur.keys[0]!;
        for (const k of cur.keys) g.set(k, { zones: cur.zones, lastKey: cur.keys[cur.keys.length - 1]! });
        void groupId;
        cur = null;
      };
      for (let s = 0; s < segs.length; s++) {
        const seg = segs[s]!;
        if (seg.kind === 'z' && replay.events[seg.name]) {
          const key = `${p}:${s}`;
          if (cur) { cur.keys.push(key); cur.zones.push(seg.name); }
          else cur = { keys: [key], zones: [seg.name] };
        } else if (seg.kind === 'text' && cur && LIST_GLUE_RE.test(seg.text)) {
          // 나열 접속 — 그룹 유지
        } else {
          flush();
        }
      }
      flush();
    }
    groups.current = g;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 오버레이 연출 ──
  const guildOf = (name: string) => replay.guilds[name] ?? { color: null, emblemUrl: null };

  function spawnEmblem(guild: string, at: { x: number; y: number }): HTMLElement | null {
    if (!layer) return null;
    const g = guildOf(guild);
    const e = document.createElement('div');
    // 이동 문양은 배경 없음(2026-07-16 확정) — 문양 이미지만. 문양 미보유 길드만 색 방패 폴백.
    e.style.cssText =
      'position:absolute;width:26px;height:30px;margin:-15px 0 0 -13px;z-index:40;' +
      'display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.4);' +
      'transition:opacity 0.5s,transform 0.45s;' +
      `filter:drop-shadow(0 0 6px ${g.color ?? '#71717a'}cc);`;
    if (g.emblemUrl) {
      const img = document.createElement('img');
      img.src = g.emblemUrl;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';
      e.appendChild(img);
    } else {
      e.style.clipPath = 'polygon(50% 0,100% 18%,100% 62%,50% 100%,0 62%,0 18%)';
      e.style.background = g.color ?? '#71717a';
      e.textContent = guild.slice(0, 1);
      e.style.fontSize = '11px';
      e.style.fontWeight = '900';
      e.style.color = '#fff';
    }
    e.style.left = `${at.x}%`;
    e.style.top = `${at.y}%`;
    layer.appendChild(e);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      e.style.opacity = '1';
      e.style.transform = 'scale(1)';
    }));
    return e;
  }

  /** 진군 — 2차 베지어를 % 좌표로 샘플링한 left/top 키프레임(오프셋패스 앵커 오차로 인한
   *  '근처 도착 후 순간이동' 제거, 2026-07-16). 종료값 = 노드 좌표와 동일해 정확 착지. */
  function march(e: HTMLElement | null, from: { x: number; y: number }, to: { x: number; y: number }): Promise<void> {
    if (!e) return Promise.resolve();
    if (skipRef.current) {
      e.style.left = `${to.x}%`;
      e.style.top = `${to.y}%`;
      return Promise.resolve();
    }
    const mid = {
      x: (from.x + to.x) / 2 + (to.y - from.y) * 0.2,
      y: (from.y + to.y) / 2 - (to.x - from.x) * 0.2,
    };
    const N = 24;
    const frames = Array.from({ length: N + 1 }, (_, i) => {
      const t = i / N;
      const u = 1 - t;
      return {
        left: `${(u * u * from.x + 2 * u * t * mid.x + t * t * to.x).toFixed(3)}%`,
        top: `${(u * u * from.y + 2 * u * t * mid.y + t * t * to.y).toFixed(3)}%`,
      };
    });
    const anim = e.animate(frames, { duration: MARCH_MS, easing: 'cubic-bezier(0.4,0,0.35,1)', fill: 'forwards' });
    return anim.finished.catch(() => {}).then(() => {
      anim.cancel();
      e.style.left = `${to.x}%`;
      e.style.top = `${to.y}%`;
    });
  }

  function killEmblem(e: HTMLElement | null) {
    if (!e) return;
    e.style.opacity = '0';
    e.style.transform = 'scale(0.3) rotate(40deg)';
    setTimeout(() => e.remove(), 650);
  }
  function fadeEmblem(e: HTMLElement | null) {
    if (!e) return;
    e.style.opacity = '0';
    setTimeout(() => e.remove(), 650);
  }
  function sparkAt(pct: { x: number; y: number }) {
    if (!layer) return;
    const s = document.createElement('div');
    s.textContent = '⚔️';
    s.style.cssText = `position:absolute;z-index:50;font-size:18px;margin:-11px 0 0 -9px;left:${pct.x}%;top:${pct.y}%;pointer-events:none;`;
    layer.appendChild(s);
    s.animate(
      [
        { opacity: 0, transform: 'scale(0.4)' },
        { opacity: 1, transform: 'scale(1.35)', offset: 0.25 },
        { opacity: 0, transform: 'scale(0.7) translateY(-14px)' },
      ],
      { duration: 900, easing: 'ease-out', fill: 'forwards' },
    );
    setTimeout(() => s.remove(), 950);
  }
  /** 점령 플래시(강) / 재언급 펄스(약) — 길드색 링 확산. */
  function flashAt(pct: { x: number; y: number }, color: string, strong = true) {
    if (!layer || skipRef.current) return;
    const f = document.createElement('div');
    f.style.cssText =
      `position:absolute;z-index:35;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:7px;left:${pct.x}%;top:${pct.y}%;pointer-events:none;`;
    layer.appendChild(f);
    f.animate(
      [
        { boxShadow: `0 0 0 0 ${color}${strong ? 'd9' : '99'}`, background: `${color}${strong ? 'd9' : '55'}` },
        { boxShadow: `0 0 0 ${strong ? 26 : 15}px ${color}00`, background: `${color}00` },
      ],
      { duration: strong ? 1500 : 1000, easing: 'ease-out', fill: 'forwards' },
    );
    setTimeout(() => f.remove(), strong ? 1600 : 1100);
  }
  const pulseZone = (zoneId: number, color: string) => {
    const z = zoneById.current.get(zoneId);
    if (z) flashAt({ x: z.mapX, y: z.mapY }, color, false);
  };

  /** 그룹 일괄 실행 — 전 이벤트 동시 진군, 격돌 병렬, 점령 플래시는 살짝 스태거. */
  async function runZoneEvents(evs: ReplayEvent[]): Promise<void> {
    const all: { ev: ReplayEvent; marchers: { g: string; el: HTMLElement | null }[] }[] = [];
    for (const ev of evs) {
      const target = zoneById.current.get(ev.zoneId);
      if (!target || skipRef.current) {
        applyFlip(ev);
        continue;
      }
      const tPct = { x: target.mapX, y: target.mapY };
      const parties = ev.type === 'capture' ? [ev.winner, ...ev.rivals] : ev.rivals;
      const marchers: { g: string; el: HTMLElement | null }[] = [];
      for (const g of parties) {
        const originId = ev.origins[g] ?? null;
        const origin = originId != null ? zoneById.current.get(originId) : null;
        const fromPct = origin ? { x: origin.mapX, y: origin.mapY } : edgeNear(target);
        const el = spawnEmblem(g, fromPct);
        marchers.push({ g, el });
        void march(el, fromPct, tPct);
      }
      all.push({ ev, marchers });
    }
    if (all.length === 0) return;
    await sleepUnless(MARCH_MS + 150, () => skipRef.current);
    // 격돌(있는 이벤트만) — 병렬
    const clashers = all.filter((a) => a.ev.rivals.length > 0);
    if (clashers.length > 0 && !skipRef.current) {
      for (const c of clashers) {
        const z = zoneById.current.get(c.ev.zoneId)!;
        sparkAt({ x: z.mapX, y: z.mapY });
      }
      await sleepUnless(750, () => skipRef.current);
      for (const c of clashers) {
        const z = zoneById.current.get(c.ev.zoneId)!;
        sparkAt({ x: z.mapX, y: z.mapY });
      }
      await sleepUnless(750, () => skipRef.current);
    }
    // 점령/방어 결과 — 플래시 스태거(220ms)로 일괄 발표의 리듬
    for (const { ev, marchers } of all) {
      const losers = ev.rivals;
      for (const m of marchers) if (losers.includes(m.g)) killEmblem(m.el);
      const z = zoneById.current.get(ev.zoneId);
      applyFlip(ev);
      if (z) flashAt({ x: z.mapX, y: z.mapY }, guildOf(ev.winner).color ?? '#a8a29e');
      await sleepUnless(300, () => skipRef.current);
      for (const m of marchers) if (!losers.includes(m.g)) setTimeout(() => fadeEmblem(m.el), 450);
    }
    await sleepUnless(650, () => skipRef.current);
  }

  function applyFlip(ev: ReplayEvent) {
    if (ev.type === 'capture') {
      ownersRef.current[ev.zoneId] = ev.winner;
      onOwnerFlip(ev.zoneId, ev.winner);
    }
  }

  function flushRemaining() {
    for (const [name, ev] of Object.entries(replay.events)) {
      if (firedRef.current.has(name)) continue;
      firedRef.current.add(name);
      applyFlip(ev);
    }
    if (layer) layer.innerHTML = '';
  }

  /** {g|길드} 재언급 — 오늘 이 길드가 얻은(=이미 발표된) 구역 일괄 펄스(4s 스로틀). */
  function pulseGuildZones(guild: string) {
    const now = Date.now();
    const last = guildPulseAtRef.current.get(guild) ?? 0;
    if (now - last < 4000) return;
    const captured = Object.values(replay.events).filter(
      (ev) => ev.type === 'capture' && ev.winner === guild && firedRef.current.has(ev.zone),
    );
    if (captured.length === 0) return;
    guildPulseAtRef.current.set(guild, now);
    const color = guildOf(guild).color ?? '#a8a29e';
    captured.forEach((ev, i) => setTimeout(() => pulseZone(ev.zoneId, color), i * 130));
  }

  /** '조각' 서술 — 최근 언급 길드 영토의 연결 조각을 조각 단위 순차 펄스. */
  function pulseFragments(guild: string) {
    const owned = zones.filter((z) => ownersRef.current[z.id] === guild).map((z) => z.id);
    if (owned.length === 0) return;
    const set = new Set(owned);
    const nb = new Map<number, number[]>();
    for (const e of adjacency) {
      if (set.has(e.a) && set.has(e.b)) {
        nb.set(e.a, [...(nb.get(e.a) ?? []), e.b]);
        nb.set(e.b, [...(nb.get(e.b) ?? []), e.a]);
      }
    }
    const seen = new Set<number>();
    const comps: number[][] = [];
    for (const id of owned) {
      if (seen.has(id)) continue;
      const comp: number[] = [];
      const st = [id];
      while (st.length) {
        const cur = st.pop()!;
        if (seen.has(cur)) continue;
        seen.add(cur);
        comp.push(cur);
        for (const n of nb.get(cur) ?? []) if (!seen.has(n)) st.push(n);
      }
      comps.push(comp);
    }
    if (comps.length === 0) return;
    const color = guildOf(guild).color ?? '#a8a29e';
    comps.forEach((comp, ci) =>
      comp.forEach((zid) => setTimeout(() => pulseZone(zid, color), ci * 550)),
    );
  }

  // ── 타이핑 본체 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) skipRef.current = true;
      for (let p = 0; p < paras.current.length; p++) {
        const segs = paras.current[p]!;
        for (let s = 0; s < segs.length; s++) {
          const seg = segs[s]!;
          for (let c = 1; c <= seg.text.length; c++) {
            if (cancelled) return;
            setPos({ p, s, c });
            if (!skipRef.current) {
              await sleepUnless(seg.text[c - 1] === ' ' ? 28 : CHAR_MS, () => skipRef.current);
            }
          }
          if (seg.kind === 'g') {
            lastGuildRef.current = seg.name;
            if (!skipRef.current) pulseGuildZones(seg.name); // 재언급 변주
          } else if (seg.kind === 'z') {
            const ev = replay.events[seg.name];
            if (ev && !firedRef.current.has(seg.name)) {
              const key = `${p}:${s}`;
              const grp = groups.current.get(key);
              if (grp && grp.lastKey !== key) {
                // 그룹 중간 구역 — 마지막 구역명에서 일괄 발표
              } else {
                const names = grp ? grp.zones.filter((n) => !firedRef.current.has(n)) : [seg.name];
                for (const n of names) firedRef.current.add(n);
                await runZoneEvents(names.map((n) => replay.events[n]!).filter(Boolean));
              }
            } else if (ev && !skipRef.current) {
              // 이미 발표된 구역 재언급 — 단일 펄스
              pulseZone(ev.zoneId, guildOf(ev.winner).color ?? '#a8a29e');
            }
          } else if (seg.kind === 'text' && seg.text.includes('조각') && lastGuildRef.current && !skipRef.current) {
            pulseFragments(lastGuildRef.current);
          }
        }
      }
      if (cancelled) return;
      flushRemaining();
      setEnded(true);
      if (!doneRef.current) {
        doneRef.current = true;
        setTimeout(() => onDone(), 900);
      }
    })();
    return () => { cancelled = true; if (layer) layer.innerHTML = ''; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const skip = () => {
    if (skipRef.current) return;
    skipRef.current = true;
    setPos({ p: paras.current.length - 1, s: Number.MAX_SAFE_INTEGER, c: Number.MAX_SAFE_INTEGER });
    flushRemaining();
    setEnded(true);
    if (!doneRef.current) {
      doneRef.current = true;
      setTimeout(() => onDone(), 250);
    }
  };

  // 정적 ChronicleText와 동일 개행 — 정적판의 구역/길드는 <button>(inline-block: 이름을
  // 한 덩어리로 줄바꿈)이라, 재생판 span도 inline-block으로 맞춘다(2026-07-16: 재생/완료
  // 화면의 개행 기준이 달라지던 문제). 클릭은 재생 중 비활성이므로 button 미사용(중첩 금지).
  const renderSeg = (seg: ChronicleSegment, shown: string, key: number) => {
    if (seg.kind === 'g')
      return (
        <span key={key} className="inline-block align-baseline font-semibold text-slate-600 dark:text-slate-400">{shown}</span>
      );
    if (seg.kind === 'u')
      return (
        <span
          key={key}
          className={
            seg.code
              ? 'text-stone-500 underline decoration-dotted underline-offset-2 dark:text-stone-400'
              : 'text-stone-500 dark:text-stone-400'
          }
        >
          {shown}
        </span>
      );
    if (seg.kind === 'z') {
      const c = zoneColor(seg.name);
      return (
        <span
          key={key}
          className="mx-px inline-block rounded-[3px] px-1 align-baseline text-[11px] font-semibold"
          style={c ? { color: c, backgroundColor: `${c}1f`, boxShadow: `inset 0 0 0 1px ${c}55` } : undefined}
        >
          {shown}
        </span>
      );
    }
    return <span key={key}>{shown}</span>;
  };

  return (
    <button type="button" onClick={skip} className="block w-full cursor-pointer text-left" aria-label="역사 재생 건너뛰기">
      <div className="flex flex-col gap-2.5">
        {paras.current.map((segs, p) => {
          if (p > pos.p) return null;
          return (
            <p key={p} className="whitespace-pre-line text-[13px] leading-relaxed text-zinc-600 dark:text-zinc-300">
              {segs.map((seg, s) => {
                if (p < pos.p || s < pos.s) return renderSeg(seg, seg.text, s);
                if (s > pos.s) return null;
                return renderSeg(seg, seg.text.slice(0, pos.c), s);
              })}
              {p === pos.p && !ended ? (
                <span className="ml-px inline-block h-[13px] w-[7px] animate-pulse bg-amber-500 align-[-2px]" aria-hidden />
              ) : null}
            </p>
          );
        })}
        {!ended ? <p className="text-[9px] text-zinc-400 dark:text-zinc-600">탭하면 건너뛰기</p> : null}
      </div>
    </button>
  );
}
