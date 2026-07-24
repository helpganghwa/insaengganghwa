'use client';

import { useEffect, useRef, useState } from 'react';

import type { ConquestReplay, ReplayEvent } from '@/lib/game/guild/conquest/replay';

import { parseChronicleSegments, type ChronicleSegment } from './chronicle-tokens';

/**
 * 세계지도 '오늘의 역사' 리플레이(2026-07-16 확정 연출) — 연대기 타이핑과 지도 연출 동기화.
 *  - {z|구역} 마커 완성 → 문장 진군(곡선, %키프레임 — 노드에 정확 착지) → 격돌 → 점령 플래시
 *  - 연속 나열({z|A}·{z|B}·{z|C})은 한 그룹으로 **동시 발표**(마지막 구역명에서 일괄 진군)
 *  - 단, 교전 구역(경합/수비전)은 일괄 발표에서 분리해 뒤에 **한 곳씩 단독 재생** — 수비
 *    문양이 구역에 서서 맞서다 쓰러지는 연출 포함(2026-07-17: 성문 전투가 묻히던 피드백)
 *  - 재언급 변주(길드/조각 펄스)는 2026-07-16 롤백 — 전투 요소만 애니메이션(사용자 확정)
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
  layer,
  zoneColor,
  onOwnerFlip,
  onNeutralize,
  onDone,
}: {
  text: string;
  replay: ConquestReplay;
  zones: ReplayZonePos[];
  layer: HTMLDivElement | null;
  zoneColor: (name: string) => string | null;
  onOwnerFlip: (zoneId: number, guild: string) => void;
  onNeutralize: (zoneId: number) => void;
  onDone: () => void;
}) {
  const paras = useRef(text.split(/\n{2,}/).map((p) => parseChronicleSegments(p.trim())));
  const [pos, setPos] = useState<{ p: number; s: number; c: number }>({ p: 0, s: 0, c: 0 });
  const [ended, setEnded] = useState(false);
  const skipRef = useRef(false);
  const doneRef = useRef(false);
  const firedRef = useRef(new Set<string>());
  const neutralFiredRef = useRef(new Set<number>());
  const neutralTriggeredRef = useRef(false); // 중립화 캐스케이드 1회 발동 가드
  const neutralNamesRef = useRef(new Set((replay.neutralized ?? []).map((n) => n.zone)));
  const ownersRef = useRef<Record<number, string | null>>({ ...replay.beforeOwner });

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
  /** 방치 중립화 연출 — 구역 위 소유 길드 문양이 탈색·수축·기울며 부서져 사라진다(전투 아님).
   *  노드 문양은 onNeutralize로 즉시 중립 전환되고, 이 오버레이가 '무너져 내리는' 결을 얹는다. */
  function crumbleAt(guild: string, at: { x: number; y: number }) {
    if (!layer || skipRef.current) return;
    const g = guildOf(guild);
    const e = document.createElement('div');
    e.style.cssText =
      `position:absolute;width:17px;height:17px;margin:-8.5px 0 0 -8.5px;z-index:38;left:${at.x}%;top:${at.y}%;` +
      'pointer-events:none;border-radius:4px;overflow:hidden;';
    if (g.emblemUrl) {
      const img = document.createElement('img');
      img.src = g.emblemUrl;
      img.alt = '';
      img.style.cssText = 'width:100%;height:100%;object-fit:contain;image-rendering:pixelated;';
      e.appendChild(img);
    } else {
      e.style.background = g.color ?? '#71717a';
    }
    layer.appendChild(e);
    e.animate(
      [
        { opacity: 1, transform: 'scale(1) rotate(0deg) translateY(0)', filter: 'grayscale(0)' },
        { opacity: 0.85, transform: 'scale(1.08) rotate(-4deg)', filter: 'grayscale(0.5)', offset: 0.25 },
        { opacity: 0, transform: 'scale(0.2) rotate(-28deg) translateY(9px)', filter: 'grayscale(1)' },
      ],
      { duration: 720, easing: 'cubic-bezier(0.5,0,0.75,0)', fill: 'forwards' },
    );
    setTimeout(() => e.remove(), 740);
    // 중립 복귀를 알리는 옅은 회색 링(약).
    flashAt(at, '#71717a', false);
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

  /** 교전 여부 — 경합(공격 길드 2+) 또는 수비 병력이 맞선 함락/방어. */
  const hasClash = (ev: ReplayEvent) => ev.rivals.length > 0 || ev.defended;
  /** 구역에 서서 맞서는 수비 길드 — capture는 이전 주인(수비수 있었을 때), defense는 소유 길드. */
  const standingGuildOf = (ev: ReplayEvent) =>
    ev.type === 'defense' ? ev.winner : ev.defended ? ev.from : null;

  /** 그룹 일괄 실행 — 전 이벤트 동시 진군, 격돌 병렬, 점령 플래시는 살짝 스태거. */
  async function runZoneEvents(evs: ReplayEvent[]): Promise<void> {
    const all: {
      ev: ReplayEvent;
      marchers: { g: string; el: HTMLElement | null }[];
      standing: { g: string; el: HTMLElement | null } | null;
    }[] = [];
    for (const ev of evs) {
      const target = zoneById.current.get(ev.zoneId);
      if (!target || skipRef.current) {
        applyFlip(ev);
        continue;
      }
      const tPct = { x: target.mapX, y: target.mapY };
      const parties = ev.type === 'capture' ? [ev.winner, ...ev.rivals] : ev.rivals;
      // 수비 문양 — 구역 위에 서서 맞선다(진군 없음). 무혈 함락과 시각적으로 구분(2026-07-17).
      const standingGuild = standingGuildOf(ev);
      const standing = standingGuild ? { g: standingGuild, el: spawnEmblem(standingGuild, tPct) } : null;
      const marchers: { g: string; el: HTMLElement | null }[] = [];
      for (const g of parties) {
        const originId = ev.origins[g] ?? null;
        const origin = originId != null ? zoneById.current.get(originId) : null;
        const fromPct = origin ? { x: origin.mapX, y: origin.mapY } : edgeNear(target);
        const el = spawnEmblem(g, fromPct);
        marchers.push({ g, el });
        void march(el, fromPct, tPct);
      }
      all.push({ ev, marchers, standing });
    }
    if (all.length === 0) return;
    await sleepUnless(MARCH_MS + 150, () => skipRef.current);
    // 격돌(교전 이벤트만 — 경합 또는 수비전) — 병렬
    const clashers = all.filter((a) => hasClash(a.ev));
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
    for (const { ev, marchers, standing } of all) {
      const losers = ev.rivals;
      for (const m of marchers) if (losers.includes(m.g)) killEmblem(m.el);
      // 수비 문양: 함락(capture)이면 쓰러지고, 방어 성공(defense)이면 잠시 서 있다 사라진다.
      if (standing) {
        if (ev.type === 'capture') killEmblem(standing.el);
        else setTimeout(() => fadeEmblem(standing.el), 900);
      }
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

  /** 종료 연출 — 방치 중립화 구역의 문양을 하나씩 부수며 중립 전환(살짝 스태거 = 무너지는 캐스케이드). */
  async function runNeutralizations() {
    const list = replay.neutralized ?? [];
    if (list.length === 0) return;
    for (const n of list) {
      if (neutralFiredRef.current.has(n.zoneId)) continue;
      neutralFiredRef.current.add(n.zoneId);
      const z = zoneById.current.get(n.zoneId);
      onNeutralize(n.zoneId); // 노드 문양 즉시 중립 전환(node transition으로 페이드)
      ownersRef.current[n.zoneId] = null;
      if (z && !skipRef.current) {
        crumbleAt(n.guild, { x: z.mapX, y: z.mapY });
        await sleepUnless(90, () => skipRef.current); // 캐스케이드 간격
      }
    }
    await sleepUnless(500, () => skipRef.current);
  }

  function flushRemaining() {
    for (const [name, ev] of Object.entries(replay.events)) {
      if (firedRef.current.has(name)) continue;
      firedRef.current.add(name);
      applyFlip(ev);
    }
    // 방치 중립화 — 스킵/조기종료 시 애니 없이 즉시 중립 전환(연출은 runNeutralizations가 담당).
    for (const n of replay.neutralized ?? []) {
      if (neutralFiredRef.current.has(n.zoneId)) continue;
      neutralFiredRef.current.add(n.zoneId);
      ownersRef.current[n.zoneId] = null;
      onNeutralize(n.zoneId);
    }
    if (layer) layer.innerHTML = '';
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
          if (seg.kind === 'z') {
            const ev = replay.events[seg.name];
            if (ev && !firedRef.current.has(seg.name)) {
              const key = `${p}:${s}`;
              const grp = groups.current.get(key);
              if (grp && grp.lastKey !== key) {
                // 그룹 중간 구역 — 마지막 구역명에서 일괄 발표
              } else {
                const names = grp ? grp.zones.filter((n) => !firedRef.current.has(n)) : [seg.name];
                for (const n of names) firedRef.current.add(n);
                const evList = names.map((n) => replay.events[n]!).filter(Boolean);
                // 교전(경합/수비전) 구역은 일괄 발표에서 분리 — 무혈 점령들을 동시에 발표한 뒤
                // 전투는 한 곳씩 단독 재생해 격돌이 묻히지 않게 한다(2026-07-17 성문 피드백).
                const calm = evList.filter((e) => !hasClash(e));
                const battles = evList.filter(hasClash);
                if (calm.length > 0) await runZoneEvents(calm);
                for (const b of battles) await runZoneEvents([b]);
              }
            } else if (!ev && !neutralTriggeredRef.current && neutralNamesRef.current.has(seg.name)) {
              // 방치 중립화 문장의 첫 구역 마커 도달 → 문양 소멸 캐스케이드 즉시 발동(종료 대기 X).
              neutralTriggeredRef.current = true;
              await runNeutralizations();
            }
          }
        }
      }
      if (cancelled) return;
      await runNeutralizations(); // 종료 연출 — 방치 중립화 문양 소멸 캐스케이드
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
