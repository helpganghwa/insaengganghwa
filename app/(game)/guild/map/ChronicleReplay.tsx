'use client';

import { useEffect, useRef, useState } from 'react';

import type { ConquestReplay, ReplayEvent } from '@/lib/game/guild/conquest/replay';

import { parseChronicleSegments, type ChronicleSegment } from './chronicle-tokens';

/**
 * 세계지도 '오늘의 역사' 리플레이(2026-07-16 확정 연출, 데모 v2 기반) —
 * 연대기 텍스트를 타이핑으로 흘리고, {z|구역} 마커가 완성되는 순간 지도 오버레이에서
 * 그 구역의 전투 이벤트를 재생한다(문장 진군 → 격돌 → 길드색 점령 플래시).
 *  - 무영지 길드 문장은 공격 지점 근처 지도 밖에서 등장, 영지 보유 길드는 최근접 보유 구역에서 출정
 *  - 진군은 곡선 모션패스(2.2s) — 타이핑이 그 구역명을 읽는 동안 도착
 *  - 격돌(경합·방어)은 ⚔️ 스파크 + 패자 문장 소멸, 점령은 onOwnerFlip(부모가 구역 색/문양 전환)
 *  - 텍스트 영역 탭 = 스킵(전문 표시 + 최종 소유 상태로 즉시 정리)
 * 오버레이 DOM은 이 컴포넌트가 직접 관리(React 트리 밖) — 부모는 빈 layer div만 제공.
 */

export type ReplayZonePos = { id: number; name: string; mapX: number; mapY: number };

const CHAR_MS = 70; // 감속 확정(2026-07-16) — 지도를 보면서 읽을 수 있는 속도
const MARCH_MS = 2200;

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

export function ChronicleReplayPanel({
  text,
  replay,
  zones,
  layer,
  zoneColor,
  onOwnerFlip,
  onDone,
}: {
  text: string;
  replay: ConquestReplay;
  zones: ReplayZonePos[];
  layer: HTMLDivElement | null;
  zoneColor: (name: string) => string | null;
  onOwnerFlip: (zoneId: number, guild: string) => void;
  onDone: () => void;
}) {
  // 문단별 세그먼트(공용 파서 — 정적 렌더와 동일 표기)
  const paras = useRef(text.split(/\n{2,}/).map((p) => parseChronicleSegments(p.trim())));
  // 진행 상태 — (문단, 세그먼트, 문자수). 문자 단위 setState지만 각 렌더가 얇아 부담 없음.
  const [pos, setPos] = useState<{ p: number; s: number; c: number }>({ p: 0, s: 0, c: 0 });
  const [ended, setEnded] = useState(false);
  const skipRef = useRef(false);
  const doneRef = useRef(false);
  const firedRef = useRef(new Set<string>());

  const zoneById = useRef(new Map(zones.map((z) => [z.id, z])));

  // ── 오버레이 연출(임페러티브 — React 밖) ──
  const px = (pct: { x: number; y: number }) => {
    const w = layer?.clientWidth ?? 0;
    const h = layer?.clientHeight ?? 0;
    return { x: (pct.x / 100) * w, y: (pct.y / 100) * h };
  };
  const guildOf = (name: string) => replay.guilds[name] ?? { color: null, emblemUrl: null };

  function spawnEmblem(guild: string, at: { x: number; y: number }): HTMLElement | null {
    if (!layer) return null;
    const g = guildOf(guild);
    const e = document.createElement('div');
    e.style.cssText =
      'position:absolute;width:24px;height:28px;margin:-14px 0 0 -12px;z-index:40;' +
      'display:flex;align-items:center;justify-content:center;opacity:0;transform:scale(0.4);' +
      'transition:opacity 0.5s,transform 0.45s;' +
      'clip-path:polygon(50% 0,100% 18%,100% 62%,50% 100%,0 62%,0 18%);' +
      `background:${g.color ?? '#71717a'};box-shadow:0 0 12px ${g.color ?? '#71717a'}99;`;
    if (g.emblemUrl) {
      const img = document.createElement('img');
      img.src = g.emblemUrl;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';
      e.appendChild(img);
    } else {
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

  function march(e: HTMLElement | null, fromPct: { x: number; y: number }, toPct: { x: number; y: number }): Promise<void> {
    if (!e || !layer || skipRef.current) return Promise.resolve();
    const from = px(fromPct);
    const to = px(toPct);
    const mid = {
      x: (from.x + to.x) / 2 + (to.y - from.y) * 0.2,
      y: (from.y + to.y) / 2 - (to.x - from.x) * 0.2,
    };
    e.style.left = '0px';
    e.style.top = '0px';
    e.style.offsetPath = `path('M ${from.x} ${from.y} Q ${mid.x} ${mid.y} ${to.x} ${to.y}')`;
    e.style.offsetRotate = '0deg';
    const anim = e.animate(
      [{ offsetDistance: '0%' }, { offsetDistance: '100%' }],
      { duration: MARCH_MS, easing: 'cubic-bezier(0.4,0,0.35,1)', fill: 'forwards' },
    );
    return anim.finished.catch(() => {}).then(() => {
      e.style.offsetPath = '';
      e.style.left = `${toPct.x}%`;
      e.style.top = `${toPct.y}%`;
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
  /** 점령 플래시 — 길드색 링 확산(소유 전환 자체는 부모의 onOwnerFlip이 처리). */
  function flashAt(pct: { x: number; y: number }, color: string) {
    if (!layer) return;
    const f = document.createElement('div');
    f.style.cssText =
      `position:absolute;z-index:35;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:7px;left:${pct.x}%;top:${pct.y}%;pointer-events:none;`;
    layer.appendChild(f);
    f.animate(
      [
        { boxShadow: `0 0 0 0 ${color}d9`, background: `${color}d9` },
        { boxShadow: `0 0 0 26px ${color}00`, background: `${color}00` },
      ],
      { duration: 1500, easing: 'ease-out', fill: 'forwards' },
    );
    setTimeout(() => f.remove(), 1600);
  }

  async function runZoneEvent(ev: ReplayEvent): Promise<void> {
    const target = zoneById.current.get(ev.zoneId);
    if (!target || skipRef.current) {
      if (ev.type === 'capture') onOwnerFlip(ev.zoneId, ev.winner);
      return;
    }
    const tPct = { x: target.mapX, y: target.mapY };
    // 출정 — 승자·경합자 문장 동시 진군(무영지 = 지도 밖 등장)
    const marchers: { g: string; el: HTMLElement | null }[] = [];
    const parties = ev.type === 'capture' ? [ev.winner, ...ev.rivals] : ev.rivals;
    for (const g of parties) {
      const originId = ev.origins[g] ?? null;
      const origin = originId != null ? zoneById.current.get(originId) : null;
      const fromPct = origin ? { x: origin.mapX, y: origin.mapY } : edgeNear(target);
      const el = spawnEmblem(g, fromPct);
      marchers.push({ g, el });
      void march(el, fromPct, tPct);
    }
    await sleepUnless(MARCH_MS + 150, () => skipRef.current);
    // 격돌 — 경합/방어(패자 문장 소멸)
    const losers = ev.type === 'capture' ? ev.rivals : ev.rivals; // capture: rivals 패배 / defense: 공격자 전원 패배
    if (losers.length > 0 && !skipRef.current) {
      sparkAt(tPct);
      await sleepUnless(650, () => skipRef.current);
      sparkAt(tPct);
      await sleepUnless(650, () => skipRef.current);
    }
    for (const m of marchers) {
      if (losers.includes(m.g)) killEmblem(m.el);
    }
    // 점령 — 부모 소유 전환 + 길드색 플래시. 방어는 소유 유지(플래시만 소유색).
    const winColor = guildOf(ev.winner).color ?? '#a8a29e';
    if (ev.type === 'capture') onOwnerFlip(ev.zoneId, ev.winner);
    if (!skipRef.current) flashAt(tPct, winColor);
    await sleepUnless(700, () => skipRef.current);
    for (const m of marchers) {
      if (!losers.includes(m.g)) fadeEmblem(m.el);
    }
  }

  function flushRemaining() {
    for (const [name, ev] of Object.entries(replay.events)) {
      if (firedRef.current.has(name)) continue;
      firedRef.current.add(name);
      if (ev.type === 'capture') onOwnerFlip(ev.zoneId, ev.winner);
    }
    if (layer) layer.innerHTML = '';
  }

  // ── 타이핑 본체 ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // prefers-reduced-motion — 연출 없이 즉시 전문 + 최종 상태(접근성).
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
          // 구역 마커 완성 → 지도 이벤트(타이핑은 연출이 끝날 때까지 잠시 호흡)
          if (seg.kind === 'z' && replay.events[seg.name] && !firedRef.current.has(seg.name)) {
            firedRef.current.add(seg.name);
            await runZoneEvent(replay.events[seg.name]!);
          }
        }
      }
      if (cancelled) return;
      flushRemaining();
      setEnded(true);
      if (!doneRef.current) {
        doneRef.current = true;
        // 여운 잠깐 두고 정적 렌더로 복귀
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

  // ── 렌더 — 진행 위치까지의 세그먼트(스타일은 정적 ChronicleText와 동일 문법, 클릭 없음) ──
  const renderSeg = (seg: ChronicleSegment, shown: string, key: number) => {
    if (seg.kind === 'g')
      return (
        <span key={key} className="font-semibold text-slate-600 dark:text-slate-400">{shown}</span>
      );
    if (seg.kind === 'u')
      return (
        <span key={key} className="text-stone-500 dark:text-stone-400">{shown}</span>
      );
    if (seg.kind === 'z') {
      const c = zoneColor(seg.name);
      return (
        <span
          key={key}
          className="mx-px rounded-[3px] px-1 align-baseline text-[11px] font-semibold"
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
